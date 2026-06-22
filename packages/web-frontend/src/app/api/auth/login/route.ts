import { proxyBackendRequest } from "../../shared/backend-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyBackendRequest(request, "auth/login");
}
