import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Single error envelope for every response:
 * { statusCode, code, message, details?, path, timestamp }
 * Stack traces and database messages are never returned to clients.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = defaultCode(status);
      } else {
        const b = body as Record<string, unknown>;
        code = typeof b.code === 'string' ? b.code : defaultCode(status);
        if (Array.isArray(b.message)) {
          code = 'VALIDATION_FAILED';
          message = 'Some fields are invalid.';
          details = { fields: b.message };
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        if (b.details !== undefined) details = b.details;
      }
    } else {
      this.logger.error(`Unhandled error on ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      code,
      message,
      path: req.url.split('?')[0],
      timestamp: new Date().toISOString(),
    };
    if (details !== undefined) payload.details = details;
    res.status(status).json(payload);
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}
