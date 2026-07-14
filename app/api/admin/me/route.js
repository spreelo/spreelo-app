import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  return Response.json({
    ok: true,
    isAdmin: true,
    canManage: true,
    user: {
      id: context.user.id,
      email: context.user.email || null,
    },
  });
}
