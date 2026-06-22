import { proxyBackendRequest } from "../../../shared/backend-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `conversations/${encodeURIComponent(id)}/messages`,
  );
}
