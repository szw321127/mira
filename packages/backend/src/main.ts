import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadBackendEnv } from "./config/env.js";

const DEFAULT_PORT = 3001;

loadBackendEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

  app.enableCors({
    origin: frontendOrigin,
    credentials: true
  });

  const port = Number(process.env.BACKEND_PORT ?? DEFAULT_PORT);
  await app.listen(port);
}

await bootstrap();
