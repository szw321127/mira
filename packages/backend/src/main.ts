import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3001);

  configureApp(app);

  await app.listen(port);
}
void bootstrap();
