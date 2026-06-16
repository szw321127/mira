import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function findPython() {
  for (const command of ["python3", "python"]) {
    const result = spawnSync(command, ["--version"], { encoding: "utf8" });

    if (result.status === 0) return command;
  }

  throw new Error("Python is required. Install Python 3 and retry.");
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

const python = findPython();
const env = {
  ...process.env,
  PYTHONPATH: [packageRoot, process.env.PYTHONPATH].filter(Boolean).join(
    process.platform === "win32" ? ";" : ":",
  ),
};
const result = spawnSync(python, normalizeArgs(process.argv.slice(2)), {
  cwd: packageRoot,
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
