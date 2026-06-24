import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadBackendEnv } from "./config/env.js";
import { configureRequestBodyLimit } from "./config/request-body-limit.js";
import { resolveServerPort } from "./config/server-port.js";

loadBackendEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureRequestBodyLimit(app);
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

  app.enableCors({
    origin: frontendOrigin,
    credentials: true
  });

  const port = resolveServerPort();
  await app.listen(port);
}

await bootstrap();
