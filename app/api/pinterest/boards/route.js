import { NextResponse } from "next/server";
import {
  createPinterestBoard,
  createPinterestPin,
  createSupabaseAdminClient,
  fetchPinterestBoards,
  getHealthyPinterestAccessToken,
  getPinterestApiEnvironment,
  isPinterestAuthError,
} from "../../../../lib/pinterestOAuth";

function bearer(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function authenticatedUser({ supabaseAdmin, request }) {
  const token = bearer(request);
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

async function getConnection({ supabaseAdmin, connectionId, userId }) {
  const { data, error } = await supabaseAdmin
    .from("social_connections")
    .select("id, user_id, brand_profile_id, platform, page_id, page_name, page_access_token, token_expires_at, refresh_token, refresh_token_expires_at, permissions, status")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("platform", "pinterest")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getBrand({ supabaseAdmin, brandProfileId, userId }) {
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id, business_name")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadBoardsWithAutomaticRefresh({ supabaseAdmin, connection }) {
  let healthy = await getHealthyPinterestAccessToken({ supabaseAdmin, connection });

  try {
    const boards = await fetchPinterestBoards(healthy.accessToken);
    await supabaseAdmin
      .from("social_connections")
      .update({
        last_connection_check_at: new Date().toISOString(),
        last_connection_error: null,
      })
      .eq("id", connection.id);
    return { boards, connection: healthy.connection, accessToken: healthy.accessToken };
  } catch (error) {
    if (!isPinterestAuthError(error)) throw error;

    healthy = await getHealthyPinterestAccessToken({
      supabaseAdmin,
      connection: healthy.connection,
      forceRefresh: true,
    });
    const boards = await fetchPinterestBoards(healthy.accessToken);
    return { boards, connection: healthy.connection, accessToken: healthy.accessToken };
  }
}

async function activatePinterestBoard({
  supabaseAdmin,
  userId,
  connectionId,
  connection,
  selected,
}) {
  const nowIso = new Date().toISOString();

  // Only retire a previously working board after the replacement has been
  // validated against the currently selected Pinterest API environment.
  const { error: disconnectOldError } = await supabaseAdmin
    .from("social_connections")
    .update({ status: "disconnected", updated_at: nowIso })
    .eq("user_id", userId)
    .eq("brand_profile_id", connection.brand_profile_id)
    .eq("platform", "pinterest")
    .eq("status", "connected")
    .neq("id", connectionId);
  if (disconnectOldError) throw disconnectOldError;

  const { data: existingBoardConnection, error: existingBoardError } = await supabaseAdmin
    .from("social_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "pinterest")
    .eq("page_id", String(selected.id))
    .maybeSingle();
  if (existingBoardError) throw existingBoardError;

  const activePayload = {
    brand_profile_id: connection.brand_profile_id,
    page_id: String(selected.id),
    page_name: selected.name || "Pinterest board",
    page_access_token: connection.page_access_token,
    token_expires_at: connection.token_expires_at,
    refresh_token: connection.refresh_token,
    refresh_token_expires_at: connection.refresh_token_expires_at,
    permissions: connection.permissions || [],
    status: "connected",
    last_connection_check_at: nowIso,
    last_connection_error: null,
    reauth_required_at: null,
    updated_at: nowIso,
  };

  if (existingBoardConnection?.id && existingBoardConnection.id !== connectionId) {
    const { error: moveError } = await supabaseAdmin
      .from("social_connections")
      .update(activePayload)
      .eq("id", existingBoardConnection.id)
      .eq("user_id", userId);
    if (moveError) throw moveError;

    const { error: deletePendingError } = await supabaseAdmin
      .from("social_connections")
      .delete()
      .eq("id", connectionId)
      .eq("user_id", userId)
      .eq("platform", "pinterest");
    if (deletePendingError) throw deletePendingError;
  } else {
    const { error } = await supabaseAdmin
      .from("social_connections")
      .update(activePayload)
      .eq("id", connectionId)
      .eq("user_id", userId)
      .eq("platform", "pinterest");
    if (error) throw error;
  }

  return {
    id: String(selected.id),
    name: selected.name || "Pinterest board",
  };
}

export async function GET(request) {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const user = await authenticatedUser({ supabaseAdmin, request });
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const connectionId = String(new URL(request.url).searchParams.get("connection_id") || "").trim();
    if (!connectionId) return NextResponse.json({ error: "Missing connection_id" }, { status: 400 });

    const connection = await getConnection({ supabaseAdmin, connectionId, userId: user.id });
    if (!connection?.page_access_token) return NextResponse.json({ error: "Pinterest connection not found" }, { status: 404 });

    const [{ boards }, brand] = await Promise.all([
      loadBoardsWithAutomaticRefresh({ supabaseAdmin, connection }),
      getBrand({ supabaseAdmin, brandProfileId: connection.brand_profile_id, userId: user.id }),
    ]);

    return NextResponse.json({
      boards: boards.map((board) => ({
        id: String(board.id),
        name: board.name || "Pinterest board",
        description: board.description || "",
        privacy: board.privacy || "PUBLIC",
      })),
      brand,
      api_environment: getPinterestApiEnvironment(),
    });
  } catch (error) {
    console.error("Pinterest board list failed", error);
    return NextResponse.json({ error: error.message || "Could not load Pinterest boards" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const user = await authenticatedUser({ supabaseAdmin, request });
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const connectionId = String(body?.connection_id || "").trim();
    const boardId = String(body?.board_id || "").trim();
    const action = String(body?.action || "select_board").trim();
    if (!connectionId) return NextResponse.json({ error: "Missing Pinterest connection" }, { status: 400 });

    let connection = await getConnection({ supabaseAdmin, connectionId, userId: user.id });
    if (!connection?.page_access_token) return NextResponse.json({ error: "Pinterest connection not found" }, { status: 404 });

    const [loaded, brand] = await Promise.all([
      loadBoardsWithAutomaticRefresh({ supabaseAdmin, connection }),
      getBrand({ supabaseAdmin, brandProfileId: connection.brand_profile_id, userId: user.id }),
    ]);
    connection = loaded.connection;

    if (action === "create_sandbox_board") {
      if (getPinterestApiEnvironment() !== "sandbox") {
        return NextResponse.json({ error: "Sandbox board creation is only available in Pinterest Sandbox" }, { status: 400 });
      }

      const preferredName = "Spreelo Test";
      let selected = loaded.boards.find(
        (board) => String(board?.name || "").trim().toLowerCase() === preferredName.toLowerCase()
      );

      if (!selected) {
        selected = await createPinterestBoard(loaded.accessToken, {
          name: preferredName,
          description: brand?.business_name
            ? `Test board for ${brand.business_name}, created by Spreelo in Pinterest Sandbox.`
            : "Testanslagstavla skapad av Spreelo i Pinterest Sandbox.",
          privacy: "PUBLIC",
        });
      }

      const testImageUrl = new URL(
        "/backgrounds/spreelo-social-hero-desktop-v143-42.png",
        request.url
      ).toString();

      const testPin = await createPinterestPin(loaded.accessToken, {
        board_id: String(selected.id),
        title: "Spreelo Sandbox-test",
        description: "Test Pin created by Spreelo to verify Pinterest publishing in Sandbox.",
        media_source: {
          source_type: "image_url",
          url: testImageUrl,
        },
      });

      const board = await activatePinterestBoard({
        supabaseAdmin,
        userId: user.id,
        connectionId,
        connection,
        selected,
      });

      console.info("Pinterest Sandbox board ready", {
        connectionId,
        brandProfileId: connection.brand_profile_id,
        boardId: board.id,
        boardName: board.name,
        testPinId: String(testPin.id),
      });

      return NextResponse.json({
        ok: true,
        board,
        test_pin: { id: String(testPin.id) },
        connected: true,
        api_environment: "sandbox",
      });
    }

    if (!boardId) return NextResponse.json({ error: "Missing Pinterest board selection" }, { status: 400 });

    const selected = loaded.boards.find((board) => String(board.id) === boardId);
    if (!selected) return NextResponse.json({ error: "Selected Pinterest board is not available" }, { status: 404 });

    const board = await activatePinterestBoard({
      supabaseAdmin,
      userId: user.id,
      connectionId,
      connection,
      selected,
    });

    return NextResponse.json({
      ok: true,
      board,
      connected: true,
      api_environment: getPinterestApiEnvironment(),
    });
  } catch (error) {
    console.error("Pinterest board selection failed", error);
    return NextResponse.json({ error: error.message || "Could not connect Pinterest board" }, { status: 500 });
  }
}
