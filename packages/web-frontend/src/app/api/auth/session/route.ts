import { proxyBackendRequest } from "../../shared/backend-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyBackendRequest(request, "auth/session");
}
