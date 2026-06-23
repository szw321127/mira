import {
  BACKEND_AGENT_BASE_URL,
  backendUnavailableResponse,
} from "../../../shared/backend-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

type DownloadResponse = {
  url?: unknown;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { assetId } = await params;
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);

  let response: Response;
  try {
    response = await fetch(
      `${BACKEND_AGENT_BASE_URL}/image-assets/${encodeURIComponent(
        assetId,
      )}/download`,
      {
        headers,
        method: "GET",
      },
    );
  } catch (error) {
    return backendUnavailableResponse(error);
  }

  const body = (await response.json().catch(() => ({}))) as DownloadResponse;
  if (!response.ok) {
    return Response.json(body, { status: response.status });
  }
  if (typeof body.url !== "string" || !body.url) {
    return Response.json({ message: "图片预览链接创建失败" }, { status: 502 });
  }

  return Response.redirect(body.url, 302);
}
