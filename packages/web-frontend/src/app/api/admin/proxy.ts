const BACKEND_AGENT_BASE_URL =
  process.env.BACKEND_AGENT_BASE_URL ?? "http://localhost:3001";

export async function proxyAdminRequest(request: Request, adminPath: string) {
  const target = `${BACKEND_AGENT_BASE_URL}/admin/${adminPath}${new URL(request.url).search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");

  if (contentType) headers.set("Content-Type", contentType);
  if (cookie) headers.set("Cookie", cookie);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : await request.text(),
  });

  const responseHeaders = new Headers();
  const setCookie = response.headers.get("set-cookie");
  const responseContentType = response.headers.get("content-type");

  if (setCookie) responseHeaders.set("set-cookie", setCookie);
  if (responseContentType) {
    responseHeaders.set("Content-Type", responseContentType);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
