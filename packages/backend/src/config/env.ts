import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const repoEnvPath = resolve(configDir, "../../../../.env");
const backendEnvPath = resolve(configDir, "../../.env");

export function loadBackendEnv() {
  config({ path: repoEnvPath, quiet: true });
  config({ path: backendEnvPath, override: true, quiet: true });
}
