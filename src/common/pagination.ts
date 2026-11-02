export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/**
 * Handler'dan bu sınıf dönülürse ResponseInterceptor cevabı
 * `{ status, message, data: [...], meta: {...} }` olarak sarar.
 */
export class PaginatedResult<T> {
  constructor(
    public readonly data: T[],
    public readonly meta: PaginationMeta,
  ) {}

  static of<T>(data: T[], page: number, limit: number, total: number) {
    return new PaginatedResult(data, {
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  }
}

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

export function parsePage(
  page?: string | number,
  limit?: string | number,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): PageParams {
  const defaultLimit = opts.defaultLimit ?? 20;
  const maxLimit = opts.maxLimit ?? 50;
  let p = typeof page === 'string' ? parseInt(page, 10) : (page ?? 1);
  let l =
    typeof limit === 'string' ? parseInt(limit, 10) : (limit ?? defaultLimit);
  if (!Number.isFinite(p) || p < 1) p = 1;
  if (!Number.isFinite(l) || l < 1) l = defaultLimit;
  if (l > maxLimit) l = maxLimit;
  return { page: p, limit: l, offset: (p - 1) * l };
}
