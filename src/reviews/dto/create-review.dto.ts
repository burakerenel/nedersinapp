import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const VALID_TOPICS = [
  'Motor',
  'Konfor',
  'Yakıt',
  'Şanzıman',
  'Klima',
  'Servis',
  'Güvenlik',
  'Fiyat/Değer',
] as const;
export type Topic = (typeof VALID_TOPICS)[number];

export const CATEGORY_KEYS = [
  'comfort',
  'interior',
  'performance',
  'value',
  'exterior',
  'reliability',
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type CategoryRatings = Record<CategoryKey, number>;

export const USAGE_DURATIONS = ['0-3m', '3-12m', '1-3y', '3y+'] as const;
export type UsageDuration = (typeof USAGE_DURATIONS)[number];

const RATING_MESSAGE = '1 ile 5 arasında olmalı';

export class CategoryRatingsDto implements CategoryRatings {
  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  comfort: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  interior: number;

  @ApiProperty({ example: 3, minimum: 1, maximum: 5 })
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  performance: number;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  value: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  exterior: number;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  reliability: number;
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class CreateReviewDto {
  @ApiProperty({ example: 'uuid-of-car-sub-model' })
  @IsUUID('all', { message: 'geçerli bir araç kimliği olmalı' })
  carSubModelId: string;

  @ApiProperty({
    example: 'Bu araç çok iyi, yakıt tüketimi düşük ve konforu üst düzey.',
    minLength: 20,
    maxLength: 5000,
  })
  @Transform(trim)
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'zorunlu' })
  @MinLength(20, { message: 'en az 20 karakter olmalı' })
  @MaxLength(5000, { message: 'en fazla 5000 karakter olabilir' })
  content: string;

  @ApiPropertyOptional({
    example: 'Yakıt dostu ve konforlu bir araç',
    nullable: true,
  })
  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString({ message: 'metin olmalı' })
  @MaxLength(255, { message: 'en fazla 255 karakter olabilir' })
  title?: string | null;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  rating: number;

  @ApiPropertyOptional({
    example: 45000,
    minimum: 0,
    maximum: 1_000_000,
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(0, { message: '0 ile 1.000.000 arasında olmalı' })
  @Max(1_000_000, { message: '0 ile 1.000.000 arasında olmalı' })
  kilometer?: number | null;

  @ApiPropertyOptional({
    example: ['Motor', 'Konfor'],
    enum: VALID_TOPICS,
    isArray: true,
  })
  @IsOptional()
  @IsArray({ message: 'liste olmalı' })
  @ArrayMaxSize(VALID_TOPICS.length, { message: 'çok fazla konu seçildi' })
  @IsIn(VALID_TOPICS, {
    each: true,
    message: `şu değerlerden biri olmalı: ${VALID_TOPICS.join(', ')}`,
  })
  topics?: Topic[];

  @ApiProperty({ type: CategoryRatingsDto })
  @IsDefined({ message: 'zorunlu' })
  @IsNotEmptyObject({}, { message: 'zorunlu' })
  @ValidateNested()
  @Type(() => CategoryRatingsDto)
  categoryRatings: CategoryRatingsDto;

  @ApiProperty({ example: true })
  @IsDefined({ message: 'zorunlu' })
  @IsBoolean({ message: 'true ya da false olmalı' })
  recommends: boolean;

  @ApiPropertyOptional({
    enum: USAGE_DURATIONS,
    example: '1-3y',
    nullable: true,
  })
  @IsOptional()
  @IsIn(USAGE_DURATIONS, {
    message: `şu değerlerden biri olmalı: ${USAGE_DURATIONS.join(', ')}`,
  })
  usageDuration?: UsageDuration | null;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 2,
    description:
      "POST /uploads/review-images ile yüklenen fotoğraf id'leri (en fazla 2)",
  })
  @IsOptional()
  @IsArray({ message: 'liste olmalı' })
  @ArrayMaxSize(2, { message: 'en fazla 2 fotoğraf eklenebilir' })
  @IsUUID('all', { each: true, message: 'geçerli bir fotoğraf kimliği olmalı' })
  imageIds?: string[];
}
