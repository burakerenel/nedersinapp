import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'kullanici@example.com' })
  @IsEmail({}, { message: 'geçerli bir e-posta adresi olmalı' })
  email: string;
}
