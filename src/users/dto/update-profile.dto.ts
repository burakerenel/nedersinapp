import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Gökçen Merve' })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'boş olamaz' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Avşar' })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'boş olamaz' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  lastName?: string;
}
