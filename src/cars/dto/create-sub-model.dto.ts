import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BODY_TYPES,
  FUEL_TYPES,
  TRANSMISSIONS,
} from '../entities/car-sub-model.entity';
import type {
  BodyType,
  FuelType,
  Transmission,
} from '../entities/car-sub-model.entity';

/**
 * Dahili: marka → model → alt model zincirini bulur ya da oluşturur.
 * Swagger'da görünmez; `x-internal-token` başlığı ister.
 */
export class CreateSubModelDto {
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'zorunlu' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  brand: string;

  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'zorunlu' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  model: string;

  /** Tam alt model adı. Verilmezse trimName/generation/yıllardan üretilir. */
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(200, { message: 'en fazla 200 karakter olabilir' })
  name?: string;

  /** "1.6 TDI", "2.0 Dizel" gibi donanım/motor adı. */
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(120, { message: 'en fazla 120 karakter olabilir' })
  trimName?: string;

  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(80, { message: 'en fazla 80 karakter olabilir' })
  generation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1900, { message: '1900 ve sonrası olmalı' })
  @Max(2100, { message: '2100 ve öncesi olmalı' })
  yearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1900, { message: '1900 ve sonrası olmalı' })
  @Max(2100, { message: '2100 ve öncesi olmalı' })
  yearTo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(1, { message: 'en az 1 olmalı' })
  @Max(3000, { message: 'en fazla 3000 olabilir' })
  horsePower?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tam sayı olmalı' })
  @Min(0, { message: 'negatif olamaz' })
  @Max(20000, { message: 'en fazla 20000 olabilir' })
  engineCC?: number;

  @IsOptional()
  @IsIn(FUEL_TYPES, { message: 'izin verilen değerlerden biri olmalı' })
  fuelType?: FuelType;

  @IsOptional()
  @IsIn(TRANSMISSIONS, { message: 'izin verilen değerlerden biri olmalı' })
  transmission?: Transmission;

  @IsOptional()
  @IsIn(BODY_TYPES, { message: 'izin verilen değerlerden biri olmalı' })
  bodyType?: BodyType;
}
