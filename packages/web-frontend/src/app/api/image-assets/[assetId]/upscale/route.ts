import { proxyBackendRequest } from "../../../shared/backend-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { assetId } = await params;
  return proxyBackendRequest(
    request,
    `image-assets/${encodeURIComponent(assetId)}/upscale`,
  );
}
