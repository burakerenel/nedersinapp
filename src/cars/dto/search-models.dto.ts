import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BODY_TYPES, FUEL_TYPES } from '../entities/car-sub-model.entity';

/** `GET /cars/models/search` — model (kuşak) düzeyinde arama (#32). */
export class SearchModelsDto {
  @ApiPropertyOptional({ description: 'Marka ya da model adı' })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'geçerli bir marka kimliği olmalı' })
  brandId?: string;

  @ApiPropertyOptional({
    enum: BODY_TYPES,
    description: 'En az bir alt modeli bu kasa tipinde olan modeller',
  })
  @IsOptional()
  @IsIn(BODY_TYPES, { message: 'izin verilen değerlerden biri olmalı' })
  bodyType?: string;

  @ApiPropertyOptional({
    enum: FUEL_TYPES,
    description: 'En az bir alt modeli bu yakıt tipinde olan modeller',
  })
  @IsOptional()
  @IsIn(FUEL_TYPES, { message: 'izin verilen değerlerden biri olmalı' })
  fuelType?: string;

  @ApiPropertyOptional({ enum: ['reviewCount', 'rating'] })
  @IsOptional()
  @IsIn(['reviewCount', 'rating'], {
    message: 'reviewCount ya da rating olmalı',
  })
  sort?: 'reviewCount' | 'rating';

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
