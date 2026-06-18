import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@rednote/agent"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
