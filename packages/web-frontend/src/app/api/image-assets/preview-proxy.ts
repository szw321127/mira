import {
  BACKEND_AGENT_BASE_URL,
  backendUnavailableResponse,
} from "../shared/backend-proxy";

type DownloadResponse = {
  url?: unknown;
};

export async function proxyImageDownloadPreview(
  request: Request,
  backendDownloadPath: string,
) {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);

  let downloadResponse: Response;
  try {
    downloadResponse = await fetch(
      `${BACKEND_AGENT_BASE_URL}/${backendDownloadPath}`,
      {
        headers,
        method: "GET",
      },
    );
  } catch (error) {
    return backendUnavailableResponse(error);
  }

  const downloadBody = (await downloadResponse
    .json()
    .catch(() => ({}))) as DownloadResponse;
  if (!downloadResponse.ok) {
    return Response.json(downloadBody, { status: downloadResponse.status });
  }
  if (typeof downloadBody.url !== "string" || !downloadBody.url) {
    return Response.json({ message: "图片预览链接创建失败" }, { status: 502 });
  }

  const token = readPreviewToken(downloadBody.url);
  if (!token) {
    return Response.json({ message: "图片预览链接无效" }, { status: 502 });
  }

  let previewResponse: Response;
  try {
    previewResponse = await fetch(
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

  if (!previewResponse.ok) {
    const body = await previewResponse.json().catch(() => ({
      message: "图片预览链接无效",
    }));
    return Response.json(body, { status: previewResponse.status });
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "content-type",
    previewResponse.headers.get("content-type") ?? "application/octet-stream",
  );
  const cacheControl = previewResponse.headers.get("cache-control");
  if (cacheControl) responseHeaders.set("cache-control", cacheControl);

  return new Response(await previewResponse.arrayBuffer(), {
    headers: responseHeaders,
    status: previewResponse.status,
  });
}

function readPreviewToken(downloadUrl: string) {
  try {
    return new URL(downloadUrl).searchParams.get("token")?.trim() || null;
  } catch {
    return null;
  }
}
