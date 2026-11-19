import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsBoolean,
  Equals,
  MaxLength,
} from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';

/** Parola kuralı (iş listesi #27): en az 6 karakter; büyük harf / rakam zorunlu değil. */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MIN_LENGTH_MESSAGE = `en az ${PASSWORD_MIN_LENGTH} karakter olmalı`;

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

  @ApiProperty({ example: 'parola1', minLength: PASSWORD_MIN_LENGTH })
  @IsString({ message: 'metin olmalı' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE })
  password: string;

  @ApiProperty({ example: 'parola1' })
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
