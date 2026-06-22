import { proxyBackendRequest } from "../shared/backend-proxy";

export async function proxyAdminRequest(request: Request, adminPath: string) {
  return proxyBackendRequest(request, `admin/${adminPath}`);
}
