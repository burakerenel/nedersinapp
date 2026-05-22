import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();

      // 4xx → "fail"  |  5xx → "error"
      const isClientError = statusCode < 500;

      if (isClientError) {
        // ValidationPipe throws { message: string[], error: string, statusCode }
        // Other HttpExceptions throw a string or { message: string }
        let data: unknown;
        if (typeof raw === 'string') {
          data = { message: raw };
        } else if (typeof raw === 'object' && raw !== null) {
          const r = raw as Record<string, unknown>;
          // ValidationPipe: r.message is string[]
          if (Array.isArray(r.message)) {
            data = { errors: r.message };
          } else {
            data = { message: r.message ?? raw };
          }
        } else {
          data = raw;
        }

        return res.status(statusCode).json({
          status: 'fail',
          message: null,
          data,
        });
      }

      // 5xx
      return res.status(statusCode).json({
        status: 'error',
        message: typeof raw === 'string' ? raw : (raw as Record<string, unknown>)?.message ?? 'Internal server error',
        data: null,
      });
    }

    // Unexpected (non-HTTP) exceptions
    console.error('[Unhandled exception]', req.method, req.url, exception);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error',
      data: null,
    });
  }
}
