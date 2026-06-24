import { proxyImageDownloadPreview } from "../../../../preview-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    assetId: string;
    versionId: string;
  }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { assetId, versionId } = await params;
  return proxyImageDownloadPreview(
    request,
    `image-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(
      versionId,
    )}/download`,
  );
}
