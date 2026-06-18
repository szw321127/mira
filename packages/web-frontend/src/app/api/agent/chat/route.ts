export const runtime = "nodejs";

const BACKEND_AGENT_BASE_URL =
  process.env.BACKEND_AGENT_BASE_URL ?? "http://localhost:3001";

const BACKEND_UNAVAILABLE_MESSAGE =
  "无法连接 Mira 后端服务。请先启动 backend，或在 packages/web-frontend/.env.local 设置 BACKEND_AGENT_BASE_URL；不要把模型密钥配置成 NEXT_PUBLIC_。";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${BACKEND_AGENT_BASE_URL}/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") ?? "application/json",
      },
      body: await request.text(),
    });

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
  } catch (error) {
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
}
