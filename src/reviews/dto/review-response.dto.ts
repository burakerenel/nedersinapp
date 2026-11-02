import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryRatings, UsageDuration } from './create-review.dto';

export class ReviewUserDto {
  @ApiProperty() id: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
}

export class ReviewCarSubModelDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) trimName: string | null;
  @ApiPropertyOptional({ nullable: true }) generation: string | null;
  @ApiPropertyOptional({ nullable: true }) yearFrom: number | null;
  @ApiPropertyOptional({ nullable: true }) yearTo: number | null;
  @ApiProperty() model: {
    id: string;
    name: string;
    brand: { id: string; name: string };
  };
}

/** Tüm yorum listelerinde (sub-model / recent / me) ortak yorum objesi. */
export class ReviewResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() content: string;
  @ApiPropertyOptional({ nullable: true }) title: string | null;
  @ApiProperty() rating: number;
  @ApiPropertyOptional({ nullable: true }) kilometer: number | null;
  @ApiProperty({ type: [String] }) topics: string[];
  @ApiPropertyOptional({ nullable: true })
  categoryRatings: CategoryRatings | null;
  @ApiPropertyOptional({ nullable: true }) recommends: boolean | null;
  @ApiPropertyOptional({ nullable: true }) usageDuration: UsageDuration | null;
  @ApiProperty({ type: [String] }) images: string[];
  @ApiProperty() likesCount: number;
  @ApiProperty() isLikedByMe: boolean;
  @ApiProperty() isMine: boolean;
  @ApiProperty() carSubModelId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: ReviewUserDto }) user: ReviewUserDto;
  @ApiPropertyOptional({ type: ReviewCarSubModelDto })
  carSubModel?: ReviewCarSubModelDto;
}
