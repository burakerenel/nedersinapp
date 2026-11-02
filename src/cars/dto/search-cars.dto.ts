import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BODY_TYPES, FUEL_TYPES } from '../entities/car-sub-model.entity';

export class SearchCarsDto {
  @ApiPropertyOptional({ description: 'Marka, model ya da alt model adı' })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  q?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1900, { message: '1900 ve sonrası olmalı' })
  @Max(2100, { message: '2100 ve öncesi olmalı' })
  yearFrom?: number;

  @ApiPropertyOptional({ example: 2024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1900, { message: '1900 ve sonrası olmalı' })
  @Max(2100, { message: '2100 ve öncesi olmalı' })
  yearTo?: number;

  @ApiPropertyOptional({ enum: BODY_TYPES })
  @IsOptional()
  @IsIn(BODY_TYPES, { message: 'izin verilen değerlerden biri olmalı' })
  bodyType?: string;

  @ApiPropertyOptional({ enum: FUEL_TYPES })
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
