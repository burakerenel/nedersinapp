import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { ApiException } from '../exceptions/api.exception';

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/**
 * Dahili araçlar (yorum pipeline'ı vb.) için sabit token koruması.
 * `INTERNAL_API_TOKEN` env'i ile karşılaştırılır; env tanımlı değilse
 * endpoint tamamen kapalıdır.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_TOKEN;
    if (!expected) {
      throw ApiException.forbidden(
        'Dahili API kapalı (INTERNAL_API_TOKEN tanımlı değil)',
        'InternalApiDisabled',
      );
    }
    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.headers[INTERNAL_TOKEN_HEADER];
    const given = Array.isArray(raw) ? raw[0] : raw;
    if (!given || !safeEqual(given, expected)) {
      throw ApiException.unauthorized(
        'Geçersiz dahili token',
        'InvalidInternalToken',
      );
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
