import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsBoolean,
  Equals,
  Matches,
} from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';

export class CreateUserDto {
  @ApiProperty({ example: 'Ahmet' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Yılmaz' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'ahmet@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*[0-9])/, {
    message:
      'password must contain at least one uppercase letter and one number',
  })
  password: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsString()
  @Match('password', { message: 'passwordConfirmation must match password' })
  passwordConfirmation: string;

  @ApiProperty({
    example: true,
    description: 'Terms and conditions must be accepted',
  })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and conditions' })
  termsAccepted: boolean;
}
