export const BACKEND_AGENT_BASE_URL =
  process.env.BACKEND_AGENT_BASE_URL ?? "http://localhost:3001";

const BACKEND_UNAVAILABLE_MESSAGE =
  "无法连接 Mira 后端服务。请先启动 backend，或在 packages/web-frontend/.env.local 设置 BACKEND_AGENT_BASE_URL；不要把模型密钥配置成 NEXT_PUBLIC_。";

export async function proxyBackendRequest(
  request: Request,
  backendPath: string,
) {
  const target = `${BACKEND_AGENT_BASE_URL}/${backendPath}${new URL(request.url).search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");

  if (contentType) headers.set("Content-Type", contentType);
  if (cookie) headers.set("Cookie", cookie);

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
    });
  } catch (error) {
    return backendUnavailableResponse(error);
  }

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");

  for (const cookie of readSetCookieHeaders(response.headers)) {
    responseHeaders.append("Set-Cookie", cookie);
  }
  if (responseContentType) {
    responseHeaders.set("Content-Type", responseContentType);
  }
  if (cacheControl) responseHeaders.set("Cache-Control", cacheControl);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export function backendUnavailableResponse(error: unknown) {
  return Response.json(
    {
      message:
        error instanceof Error
          ? `${BACKEND_UNAVAILABLE_MESSAGE} (${error.message})`
          : BACKEND_UNAVAILABLE_MESSAGE,
    },
    { status: 503 },
  );
}

function readSetCookieHeaders(headers: Headers) {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = withGetSetCookie.getSetCookie?.();
  if (cookies?.length) return cookies;

  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}
