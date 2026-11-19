import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
} from './create-user.dto';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'OldP@ss123' })
  @IsString({ message: 'metin olmalı' })
  currentPassword: string;

  @ApiProperty({ example: 'NewP@ss456', minLength: PASSWORD_MIN_LENGTH })
  @IsString({ message: 'metin olmalı' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE })
  newPassword: string;

  @ApiProperty({ example: 'NewP@ss456' })
  @IsString({ message: 'metin olmalı' })
  @Match('newPassword', { message: 'yeni şifre ile eşleşmiyor' })
  newPasswordConfirmation: string;
}
