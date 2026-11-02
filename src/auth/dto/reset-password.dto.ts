import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
} from '../../users/dto/create-user.dto';

export class ResetPasswordDto {
  @ApiProperty({ example: 'kullanici@example.com' })
  @IsEmail({}, { message: 'geçerli bir e-posta adresi olmalı' })
  email: string;

  @ApiProperty({ example: '482913', description: '6 haneli kod' })
  @IsString({ message: 'metin olmalı' })
  @Matches(/^\d{6}$/, { message: '6 haneli olmalı' })
  code: string;

  @ApiProperty({ example: 'NewP@ss456', minLength: 8 })
  @IsString({ message: 'metin olmalı' })
  @MinLength(8, { message: 'en az 8 karakter olmalı' })
  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  newPassword: string;
}
