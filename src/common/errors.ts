import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain error with a stable machine-readable code. The frontend switches on
 * `code` to show specific messages, so codes must not be renamed casually.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(HttpStatus.NOT_FOUND, code, message);
  }

  static conflict(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(HttpStatus.CONFLICT, code, message, details);
  }

  static unprocessable(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static unavailable(code: string, message: string) {
    return new AppError(HttpStatus.SERVICE_UNAVAILABLE, code, message);
  }
}
