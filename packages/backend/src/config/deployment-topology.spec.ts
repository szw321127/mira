import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(process.cwd(), "../..");

describe("production deployment topology", () => {
  it("keeps the image API and image worker as explicit compose services", () => {
    const compose = readRepositoryFile("docker-compose.yml");

    expect(compose).toMatch(/\n  backend:\n/);
    expect(compose).toMatch(/\n  worker:\n/);
    expect(compose).toMatch(
      /worker:[\s\S]*image: \$\{REGISTRY:-registry\.cn-hangzhou\.aliyuncs\.com\}\/\$\{IMAGE_OWNER:-szw321127\}\/rednote_backend:\$\{IMAGE_TAG:-latest\}/
    );
    expect(compose).toMatch(
      /worker:[\s\S]*command: \["node", "dist\/image-worker-runner\.js"\]/
    );
    expect(compose).not.toMatch(
      /worker:[\s\S]*node node_modules\/prisma\/build\/index\.js migrate deploy/
    );
  });

  it("deploy workflow starts the worker service and pulls its backend image", () => {
    const workflow = readRepositoryFile(".github/workflows/deploy.yml");

    expect(workflow).toMatch(/\n\s+worker:\n/);
    expect(workflow).toMatch(
      /worker:[\s\S]*command: \["node", "dist\/image-worker-runner\.js"\]/
    );
    expect(workflow).toMatch(/docker compose pull backend worker frontend/);
    expect(workflow).toMatch(
      /docker compose up -d --remove-orphans backend worker frontend caddy/
    );
  });

  it("runs smoke checks after Caddy reload and before image cleanup", () => {
    const workflow = readRepositoryFile(".github/workflows/deploy.yml");
    const reloadIndex = workflow.indexOf(
      "docker compose exec -T caddy caddy reload"
    );
    const smokeIndex = workflow.indexOf("run_smoke_checks");
    const pruneIndex = workflow.indexOf("docker image prune -f");

    expect(smokeIndex).toBeGreaterThan(reloadIndex);
    expect(pruneIndex).toBeGreaterThan(smokeIndex);
    expect(workflow).toContain("docker compose exec -T backend node -e");
    expect(workflow).toContain("http://localhost:3000/health");
    expect(workflow).toContain("https://${{ secrets.APP_DOMAIN }}/admin");
    expect(workflow).toContain(
      "https://${{ secrets.APP_DOMAIN }}/image-workspace"
    );
    expect(workflow).toContain("grep -E \"(Mira|管理员|登录|邮箱|图像)\"");
  });

  it("builds a dedicated backend worker runner entrypoint", () => {
    const runnerPath = join(
      repositoryRoot,
      "packages/backend/src/image-worker-runner.ts"
    );

    expect(existsSync(runnerPath)).toBe(true);
    const runner = readFileSync(runnerPath, "utf8");
    expect(runner).toMatch(/createApplicationContext\(AppModule/);
    expect(runner).toMatch(/ImageWorkerService/);
    expect(runner).toMatch(/processNext\(\)/);
  });
});

function readRepositoryFile(path: string) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}
