import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateReviewDto } from './create-review.dto';

/** `POST /reviews` ile aynı alanlar, hepsi opsiyonel; `carSubModelId` değiştirilemez. */
export class UpdateReviewDto extends PartialType(
  OmitType(CreateReviewDto, ['carSubModelId'] as const),
) {}
