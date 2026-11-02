import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VALID_TOPICS } from './create-review.dto';

export const REVIEW_SORTS = [
  'newest',
  'highest',
  'lowest',
  'mostLiked',
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export class ListReviewsDto {
  @ApiPropertyOptional({ enum: REVIEW_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(REVIEW_SORTS, {
    message: `şu değerlerden biri olmalı: ${REVIEW_SORTS.join(', ')}`,
  })
  sort?: ReviewSort;

  @ApiPropertyOptional({
    description:
      'Başlık, metin ve konularda arama (2-100 karakter; daha kısa yok sayılır)',
  })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  q?: string;

  @ApiPropertyOptional({ enum: VALID_TOPICS })
  @IsOptional()
  @IsIn(VALID_TOPICS, {
    message: `şu değerlerden biri olmalı: ${VALID_TOPICS.join(', ')}`,
  })
  topic?: string;

  @ApiPropertyOptional({
    example: '1,2',
    description: 'Virgülle ayrılmış puanlar (1-5)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number)
      : Array.isArray(value)
        ? value.map(Number)
        : value,
  )
  @IsArray({ message: 'liste olmalı' })
  @IsInt({ each: true, message: 'tam sayı olmalı' })
  @Min(1, { each: true, message: '1 ile 5 arasında olmalı' })
  @Max(5, { each: true, message: '1 ile 5 arasında olmalı' })
  ratings?: number[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: 'en az 1 olmalı' })
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: 'en az 1 olmalı' })
  @Max(50, { message: 'en fazla 50 olabilir' })
  limit?: number;
}
