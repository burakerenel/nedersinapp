import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REPORT_REASONS } from '../entities/review-report.entity';
import type { ReportReason } from '../entities/review-report.entity';

export class ReportReviewDto {
  @ApiProperty({ enum: REPORT_REASONS, example: 'abuse' })
  @IsIn(REPORT_REASONS, {
    message: `şu değerlerden biri olmalı: ${REPORT_REASONS.join(', ')}`,
  })
  reason: ReportReason;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString({ message: 'metin olmalı' })
  @MaxLength(500, { message: 'en fazla 500 karakter olabilir' })
  note?: string | null;
}
