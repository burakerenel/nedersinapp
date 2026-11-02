import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorBody {
  code: string;
  message: string;
  errors?: Record<string, string>;
}

/**
 * Tek tip hata: `{ status: "fail", message, data: { code, errors? } }`
 * (bkz. GlobalExceptionFilter). Servislerde Nest'in hazır exception'ları
 * yerine bunu kullan; `message` Türkçe ve kullanıcıya gösterilebilir olmalı.
 */
export class ApiException extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly errors?: Record<string, string>,
  ) {
    super({ code, message, errors } satisfies ApiErrorBody, status);
  }

  static badRequest(message: string, code = 'BadRequest') {
    return new ApiException(HttpStatus.BAD_REQUEST, code, message);
  }

  static validation(message: string, errors: Record<string, string>) {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'ValidationError',
      message,
      errors,
    );
  }

  static unauthorized(
    message = 'Oturum geçersiz, lütfen tekrar giriş yapın',
    code = 'Unauthorized',
  ) {
    return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
  }

  static forbidden(message = 'Bu işlem için yetkiniz yok', code = 'Forbidden') {
    return new ApiException(HttpStatus.FORBIDDEN, code, message);
  }

  static notFound(message = 'Kayıt bulunamadı', code = 'NotFound') {
    return new ApiException(HttpStatus.NOT_FOUND, code, message);
  }

  static conflict(message: string, code = 'Conflict') {
    return new ApiException(HttpStatus.CONFLICT, code, message);
  }
}
