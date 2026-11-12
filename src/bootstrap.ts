import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppEnv } from './config/env';
import { ApiExceptionFilter } from './common/errors-filter';
import { UPLOAD_DIR } from './common/uploads';

/**
 * Applies the security and validation setup shared by the server and the
 * end-to-end tests, so tests exercise exactly what runs in production.
 */
export function configureApp(app: INestApplication, env: Pick<AppEnv, 'corsOrigins'>) {
  const expressApp = app as NestExpressApplication;
  expressApp.disable('x-powered-by');
  expressApp.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Explicit allowlist only. Credentials are not used (tokens travel in the Authorization header).
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  expressApp.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/' });
  return app;
}
