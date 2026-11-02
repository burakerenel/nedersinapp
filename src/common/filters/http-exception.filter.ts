import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Status koduna göre varsayılan hata kodu ve Türkçe mesaj. */
const DEFAULTS: Record<number, { code: string; message: string }> = {
  400: { code: 'BadRequest', message: 'Geçersiz istek' },
  401: {
    code: 'Unauthorized',
    message: 'Oturum geçersiz, lütfen tekrar giriş yapın',
  },
  403: { code: 'Forbidden', message: 'Bu işlem için yetkiniz yok' },
  404: { code: 'NotFound', message: 'Kayıt bulunamadı' },
  405: { code: 'MethodNotAllowed', message: 'Bu istek yöntemi desteklenmiyor' },
  409: { code: 'Conflict', message: 'Bu kayıt zaten mevcut' },
  413: { code: 'PayloadTooLarge', message: 'Gönderilen veri çok büyük' },
  415: { code: 'UnsupportedMediaType', message: 'Desteklenmeyen dosya türü' },
  422: { code: 'UnprocessableEntity', message: 'İstek işlenemedi' },
  429: {
    code: 'TooManyRequests',
    message: 'Çok fazla istek gönderildi, lütfen biraz bekleyin',
  },
  500: {
    code: 'InternalError',
    message: 'Sunucu hatası, lütfen daha sonra tekrar deneyin',
  },
  503: { code: 'ServiceUnavailable', message: 'Servis şu an kullanılamıyor' },
};

/**
 * Nest'in kendi ürettiği İngilizce mesajlar (örn. "Unauthorized",
 * "Cannot GET /x", "Validation failed (uuid is expected)"). Bunlar
 * kullanıcıya gösterilemez; status'a göre Türkçe varsayılan kullanılır.
 */
function isFrameworkMessage(message: string, status: number): boolean {
  const generic = [
    'Bad Request',
    'Unauthorized',
    'Forbidden',
    'Not Found',
    'Conflict',
    'Internal Server Error',
    'Payload Too Large',
    'Unsupported Media Type',
    'Too Many Requests',
    'Service Unavailable',
  ];
  if (generic.includes(message)) return true;
  if (/^Cannot [A-Z]+ \//.test(message)) return true;
  if (/^Validation failed/.test(message)) return true;
  if (status === 404 && /not found$/i.test(message)) return true;
  return false;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string | undefined;
    let message: string | undefined;
    let errors: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const raw = exception.getResponse();

      if (typeof raw === 'string') {
        message = raw;
      } else if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        if (typeof r.code === 'string') code = r.code;
        if (typeof r.message === 'string') message = r.message;
        else if (Array.isArray(r.message)) message = String(r.message[0] ?? '');
        if (r.errors && typeof r.errors === 'object') {
          errors = r.errors as Record<string, string>;
        }
      }

      // Multer: dosya boyutu / dosya sayısı hataları
      if (status === 413 || message === 'File too large') {
        status = 413;
        code = code ?? 'FileTooLarge';
        message = 'Dosya 5 MB sınırını aşıyor';
      }
    } else if (
      exception &&
      typeof exception === 'object' &&
      (exception as { code?: string }).code === 'LIMIT_FILE_SIZE'
    ) {
      status = 413;
      code = 'FileTooLarge';
      message = 'Dosya 5 MB sınırını aşıyor';
    }

    const fallback = DEFAULTS[status] ?? DEFAULTS[500];
    if (!code) code = fallback.code;
    if (!message || isFrameworkMessage(message, status)) {
      message = fallback.message;
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return res.status(status).json({
        status: 'error',
        message: fallback.message,
        data: { code: fallback.code },
      });
    }

    const data: Record<string, unknown> = { code };
    if (errors && Object.keys(errors).length > 0) data.errors = errors;

    return res.status(status).json({ status: 'fail', message, data });
  }
}
