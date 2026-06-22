import {
  BACKEND_AGENT_BASE_URL,
  backendUnavailableResponse,
} from "../../shared/backend-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");

  headers.set("Content-Type", contentType ?? "application/json");
  if (cookie) headers.set("Cookie", cookie);

  const body = await request.text();
  let response: Response;
  try {
    response = await fetch(`${BACKEND_AGENT_BASE_URL}/agent/chat`, {
      method: "POST",
      headers,
      body,
    });
  } catch (error) {
    return backendUnavailableResponse(error);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Cache-Control":
        response.headers.get("cache-control") ?? "no-cache, no-transform",
      "Content-Type":
        response.headers.get("content-type") ??
        "application/x-ndjson; charset=utf-8",
    },
  });
}
