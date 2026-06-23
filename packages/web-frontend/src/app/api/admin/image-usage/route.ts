import { proxyAdminRequest } from "../proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyAdminRequest(request, "image-usage");
}
