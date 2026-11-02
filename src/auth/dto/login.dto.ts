import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ahmet@example.com' })
  @IsEmail({}, { message: 'geçerli bir e-posta adresi olmalı' })
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsString({ message: 'metin olmalı' })
  @MinLength(1, { message: 'zorunlu' })
  password: string;
}
