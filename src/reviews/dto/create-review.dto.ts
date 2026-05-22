import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 'uuid-of-car-sub-model' })
  @IsUUID()
  carSubModelId: string;

  @ApiProperty({ example: 'Bu araç çok iyi, yakıt tüketimi düşük.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
