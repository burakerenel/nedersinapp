import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'OldP@ss123' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewP@ss456', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*[0-9])/, {
    message: 'password must contain at least one uppercase letter and one number',
  })
  newPassword: string;

  @ApiProperty({ example: 'NewP@ss456' })
  @IsString()
  @Match('newPassword', { message: 'newPasswordConfirmation must match newPassword' })
  newPasswordConfirmation: string;
}
