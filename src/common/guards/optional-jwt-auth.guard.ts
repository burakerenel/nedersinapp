import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ApiException } from '../exceptions/api.exception';

/**
 * Public endpoint'ler için: token yoksa anonim devam eder (req.user = null),
 * token varsa doğrulanır; geçersiz/süresi dolmuş token 401 döner.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ): TUser | null {
    if (user) return user;
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers.authorization) {
      throw err instanceof Error && err instanceof ApiException
        ? err
        : ApiException.unauthorized();
    }
    return null;
  }
}
