import { proxyBackendRequest } from "../shared/backend-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyBackendRequest(request, "image-workspaces");
}

export async function POST(request: Request) {
  return proxyBackendRequest(request, "image-workspaces");
}
