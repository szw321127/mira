import { proxyImageDownloadPreview } from "../../preview-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { assetId } = await params;
  return proxyImageDownloadPreview(
    request,
    `image-assets/${encodeURIComponent(assetId)}/download`,
  );
}
