import { proxyAdminRequest } from "../proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyAdminRequest(request, "logout");
}
