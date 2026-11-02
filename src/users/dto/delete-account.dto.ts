import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiPropertyOptional({
    example: 'P@ssw0rd123',
    description:
      'Şifresi olan hesaplarda zorunlu. Sadece sosyal girişle açılmış (şifresiz) hesapta gönderilmez.',
  })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  password?: string;
}
