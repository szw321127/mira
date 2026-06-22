import { proxyAdminRequest } from "../../../proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return proxyAdminRequest(request, `users/${encodeURIComponent(id)}/status`);
}
