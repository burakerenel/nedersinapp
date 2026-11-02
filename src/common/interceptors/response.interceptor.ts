import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { PaginatedResult, PaginationMeta } from '../pagination';

function isPaginatedShape(v: unknown): v is PaginatedResult<unknown> {
  if (!v || typeof v !== 'object') return false;
  const o = v as { data?: unknown; meta?: { total?: unknown; page?: unknown } };
  return (
    Array.isArray(o.data) &&
    !!o.meta &&
    typeof o.meta === 'object' &&
    typeof o.meta.total === 'number' &&
    typeof o.meta.page === 'number'
  );
}

export interface ApiResponse<T = unknown> {
  status: 'success';
  message: string | null;
  data: T | null;
  meta?: PaginationMeta;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // ClassSerializerInterceptor (içte) sınıf örneğini düz objeye çevirmiş olabilir;
        // o yüzden hem instanceof hem şekil kontrolü yapılır.
        if (data instanceof PaginatedResult || isPaginatedShape(data)) {
          return {
            status: 'success' as const,
            message: null,
            data: data.data as unknown as T,
            meta: data.meta,
          };
        }
        return {
          status: 'success' as const,
          message: null,
          data: data ?? null,
        };
      }),
    );
  }
}
