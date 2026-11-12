import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Logs method, path, status and duration. Query strings, headers and bodies
 * are not logged, so tokens, passwords and addresses never reach the logs.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1_000_000;
      const path = req.originalUrl.split('?')[0];
      this.logger.log(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  }
}
