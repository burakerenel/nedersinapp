import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const VALID_TOPICS = ['Motor', 'Konfor', 'Yakıt', 'Şanzıman', 'Klima', 'Servis', 'Güvenlik', 'Fiyat/Değer'];

export class CreateReviewDto {
  @ApiProperty({ example: 'uuid-of-car-sub-model' })
  @IsUUID()
  carSubModelId: string;

  @ApiProperty({ example: 'Bu araç çok iyi, yakıt tüketimi düşük ve konforu üst düzey.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ example: 'Yakıt dostu ve konforlu bir araç' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 45000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  kilometer?: number;

  @ApiPropertyOptional({ example: ['Motor', 'Konfor'], enum: VALID_TOPICS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(VALID_TOPICS, { each: true })
  topics?: string[];
}
