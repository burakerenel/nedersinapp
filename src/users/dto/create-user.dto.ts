import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsBoolean,
  Equals,
  Matches,
  MaxLength,
} from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';

export const PASSWORD_RULE = /(?=.*[A-Z])(?=.*[0-9])/;
export const PASSWORD_RULE_MESSAGE =
  'en az bir büyük harf ve bir rakam içermeli';

export class CreateUserDto {
  @ApiProperty({ example: 'Ahmet' })
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'zorunlu' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  firstName: string;

  @ApiProperty({ example: 'Yılmaz' })
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'zorunlu' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  lastName: string;

  @ApiProperty({ example: 'ahmet@example.com' })
  @IsEmail({}, { message: 'geçerli bir e-posta adresi olmalı' })
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123', minLength: 8 })
  @IsString({ message: 'metin olmalı' })
  @MinLength(8, { message: 'en az 8 karakter olmalı' })
  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  password: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsString({ message: 'metin olmalı' })
  @Match('password', { message: 'şifre ile eşleşmiyor' })
  passwordConfirmation: string;

  @ApiProperty({
    example: true,
    description: 'Terms and conditions must be accepted',
  })
  @IsBoolean({ message: 'true ya da false olmalı' })
  @Equals(true, { message: 'kabul edilmeli' })
  termsAccepted: boolean;
}
