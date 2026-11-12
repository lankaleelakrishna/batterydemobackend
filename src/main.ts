// Must be the first import: loads .env before any module reads process.env.
import './config/load-env';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadAppEnv } from './config/env';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const env = loadAppEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app, env);
  app.enableShutdownHooks();

  await app.listen(env.port, '0.0.0.0');
  new Logger('Bootstrap').log(`VOLTEX API listening on port ${env.port} (${env.nodeEnv})`);
}

bootstrap().catch((err) => {
  // Configuration errors are printed plainly and the process exits non-zero.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
