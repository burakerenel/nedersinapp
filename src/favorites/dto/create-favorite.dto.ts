import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateFavoriteDto {
  @ApiProperty({ example: 'uuid-of-car-sub-model' })
  @IsUUID('all', { message: 'geçerli bir araç kimliği olmalı' })
  carSubModelId: string;
}
