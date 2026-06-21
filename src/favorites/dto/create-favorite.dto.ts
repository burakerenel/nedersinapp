import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateFavoriteDto {
  @ApiProperty({ example: 'uuid-of-car-sub-model' })
  @IsUUID()
  carSubModelId: string;
}
