import { proxyBackendRequest } from "../../../../../shared/backend-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
    taskId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { id, taskId } = await params;
  return proxyBackendRequest(
    request,
    `image-workspaces/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/cancel`,
  );
}
