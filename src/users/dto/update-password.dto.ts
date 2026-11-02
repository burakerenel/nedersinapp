import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';
import { PASSWORD_RULE, PASSWORD_RULE_MESSAGE } from './create-user.dto';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'OldP@ss123' })
  @IsString({ message: 'metin olmalı' })
  currentPassword: string;

  @ApiProperty({ example: 'NewP@ss456', minLength: 8 })
  @IsString({ message: 'metin olmalı' })
  @MinLength(8, { message: 'en az 8 karakter olmalı' })
  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  newPassword: string;

  @ApiProperty({ example: 'NewP@ss456' })
  @IsString({ message: 'metin olmalı' })
  @Match('newPassword', { message: 'yeni şifre ile eşleşmiyor' })
  newPasswordConfirmation: string;
}
