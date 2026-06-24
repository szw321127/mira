import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(process.cwd(), "../..");

describe("request body limits", () => {
  it("allows 20MB source image uploads after data URL base64 expansion", async () => {
    const limitsPath = join(
      repositoryRoot,
      "packages/backend/src/config/request-body-limit.ts"
    );
    const mainPath = join(repositoryRoot, "packages/backend/src/main.ts");

    expect(existsSync(limitsPath)).toBe(true);
    if (!existsSync(limitsPath)) return;

    const limits = await import("./request-body-limit.js");
    const sourceBytes = limits.SOURCE_IMAGE_UPLOAD_BYTES as number;
    const bodyLimitBytes = limits.REQUEST_BODY_LIMIT_BYTES as number;
    const encodedSourceBytes = Math.ceil(sourceBytes / 3) * 4;
    const dataUrlJsonOverheadBytes =
      Buffer.byteLength(JSON.stringify({ dataUrl: "data:image/png;base64," })) -
      Buffer.byteLength("data:image/png;base64,");

    expect(sourceBytes).toBe(20 * 1024 * 1024);
    expect(bodyLimitBytes).toBeGreaterThan(
      encodedSourceBytes + dataUrlJsonOverheadBytes
    );

    const mainSource = readFileSync(mainPath, "utf8");
    expect(mainSource).toContain("bodyParser: false");
    expect(mainSource).toContain("configureRequestBodyLimit(app)");
  });
});
