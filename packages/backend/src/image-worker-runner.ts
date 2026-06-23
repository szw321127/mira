import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadBackendEnv } from "./config/env.js";
import { ImageWorkerService } from "./image-workspaces/image-worker.service.js";

loadBackendEnv();

const logger = new Logger("ImageWorkerRunner");
const idleDelayMs = resolveIdleDelayMs(process.env.IMAGE_WORKER_IDLE_MS);

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const worker = app.get(ImageWorkerService);
  let stopping = false;

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      stopping = true;
      logger.log(`Received ${signal}; stopping image worker after current loop.`);
    });
  }

  logger.log(`Image worker started with ${idleDelayMs}ms idle delay.`);

  try {
    while (!stopping) {
      const processed = await worker.processNext();
      if (!processed) {
        await delay(idleDelayMs);
      }
    }
  } finally {
    await app.close();
    logger.log("Image worker stopped.");
  }
}

function resolveIdleDelayMs(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 100) return 1000;
  return Math.min(parsed, 30_000);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await bootstrap();
