import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { REVIEW_STATUSES } from '../review.entity';
import type { ReviewStatus } from '../review.entity';

export class SetReviewStatusDto {
  @ApiProperty({ enum: REVIEW_STATUSES, example: 'hidden' })
  @IsIn(REVIEW_STATUSES, {
    message: `şu değerlerden biri olmalı: ${REVIEW_STATUSES.join(', ')}`,
  })
  status: ReviewStatus;
}

const REPORT_FILTERS = ['open', 'resolved', 'all'] as const;
export type ReportFilter = (typeof REPORT_FILTERS)[number];

export class ListReportsDto {
  @ApiPropertyOptional({ enum: REPORT_FILTERS, default: 'open' })
  @IsOptional()
  @IsIn(REPORT_FILTERS, {
    message: `şu değerlerden biri olmalı: ${REPORT_FILTERS.join(', ')}`,
  })
  status?: ReportFilter;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: 'en az 1 olmalı' })
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: 'en az 1 olmalı' })
  @Max(100, { message: 'en fazla 100 olabilir' })
  limit?: number;
}

const ADMIN_REVIEW_FILTERS = ['hidden', 'visible', 'reported', 'all'] as const;
export type AdminReviewFilter = (typeof ADMIN_REVIEW_FILTERS)[number];

export class ListAdminReviewsDto {
  @ApiPropertyOptional({
    enum: ADMIN_REVIEW_FILTERS,
    default: 'hidden',
    description: 'reported = en az bir açık şikayeti olanlar',
  })
  @IsOptional()
  @IsIn(ADMIN_REVIEW_FILTERS, {
    message: `şu değerlerden biri olmalı: ${ADMIN_REVIEW_FILTERS.join(', ')}`,
  })
  status?: AdminReviewFilter;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: 'en az 1 olmalı' })
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: 'en az 1 olmalı' })
  @Max(100, { message: 'en fazla 100 olabilir' })
  limit?: number;
}
