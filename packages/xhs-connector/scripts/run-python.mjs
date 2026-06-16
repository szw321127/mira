import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const venvRoot = join(packageRoot, ".venv");
const venvPython =
  process.platform === "win32"
    ? join(venvRoot, "Scripts", "python.exe")
    : join(venvRoot, "bin", "python");
const requirementsPath = join(packageRoot, "requirements.txt");
const requirementsHashPath = join(venvRoot, ".requirements.sha256");

function findPython() {
  for (const command of ["python3", "python"]) {
    const result = spawnSync(command, ["--version"], { encoding: "utf8" });

    if (result.status === 0) return command;
  }

  throw new Error("Python is required. Install Python 3 and retry.");
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureVirtualenv(systemPython) {
  if (!existsSync(venvPython)) {
    console.log("[xhs-connector] Creating Python virtualenv...");
    runChecked(systemPython, ["-m", "venv", venvRoot]);
  }

  const requirementsHash = createHash("sha256")
    .update(readFileSync(requirementsPath))
    .digest("hex");
  const installedHash = existsSync(requirementsHashPath)
    ? readFileSync(requirementsHashPath, "utf8").trim()
    : "";

  if (requirementsHash === installedHash) return;

  console.log("[xhs-connector] Installing Python dependencies...");
  runChecked(venvPython, ["-m", "pip", "install", "-r", requirementsPath]);
  writeFileSync(requirementsHashPath, `${requirementsHash}\n`);
}

function normalizeArgs(args) {
  const normalized = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--port-env") {
      const envName = args[index + 1];
      index += 1;

      if (args[index + 1] === "--default-port") {
        const defaultPort = args[index + 2];
        normalized.push(process.env[envName] || defaultPort);
        index += 2;
      } else {
        normalized.push(process.env[envName] || "");
      }

      continue;
    }

    if (args[index] === "--default-port") {
      index += 1;
      continue;
    }

    normalized.push(args[index]);
  }

  return normalized;
}

const systemPython = findPython();
ensureVirtualenv(systemPython);
const env = {
  ...process.env,
  PYTHONPATH: [packageRoot, process.env.PYTHONPATH].filter(Boolean).join(
    process.platform === "win32" ? ";" : ":",
  ),
};
const result = spawnSync(venvPython, normalizeArgs(process.argv.slice(2)), {
  cwd: packageRoot,
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
