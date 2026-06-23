import {
  BACKEND_AGENT_BASE_URL,
  backendUnavailableResponse,
} from "../../shared/backend-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ message: "图片预览链接无效" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      `${BACKEND_AGENT_BASE_URL}/image-assets/preview?token=${encodeURIComponent(
        token,
      )}`,
      {
        method: "GET",
      },
    );
  } catch (error) {
    return backendUnavailableResponse(error);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      message: "图片预览链接无效",
    }));
    return Response.json(body, { status: response.status });
  }

  const headers = new Headers();
  headers.set(
    "content-type",
    response.headers.get("content-type") ?? "application/octet-stream",
  );
  const cacheControl = response.headers.get("cache-control");
  if (cacheControl) headers.set("cache-control", cacheControl);

  return new Response(await response.arrayBuffer(), {
    headers,
    status: response.status,
  });
}
