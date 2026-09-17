import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) {
    if (context.status === 403 && context.user) {
      return Response.json({
        ok: true,
        isAdmin: false,
        canManage: false,
        canManageTeam: false,
        user: {
          id: context.user.id,
          email: context.user.email || null,
        },
      });
    }

    return adminContextError(context);
  }

  return Response.json({
    ok: true,
    isAdmin: true,
    canManage: true,
    canManageTeam: context.canManageTeam === true,
    isPrimaryAdmin: context.isPrimaryAdmin === true,
    adminSource: context.adminSource || "configured",
    user: {
      id: context.user.id,
      email: context.user.email || null,
    },
  });
}
