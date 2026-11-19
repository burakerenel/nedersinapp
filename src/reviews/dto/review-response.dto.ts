import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryRatings, UsageDuration } from './create-review.dto';
import type { HiddenReason, ReviewStatus } from '../review.entity';

export class ReviewUserDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Engelleme için kullanıcı id; silinmiş hesapta null',
  })
  id: string | null;
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
  @ApiProperty({
    type: [String],
    description:
      'likedTopics + dislikedTopics birleşimi (eski kayıtlarda tek liste)',
  })
  topics: string[];
  @ApiProperty({ type: [String] }) likedTopics: string[];
  @ApiProperty({ type: [String] }) dislikedTopics: string[];
  @ApiPropertyOptional({ nullable: true })
  categoryRatings: CategoryRatings | null;
  @ApiPropertyOptional({ nullable: true }) recommends: boolean | null;
  @ApiPropertyOptional({ nullable: true }) usageDuration: UsageDuration | null;
  @ApiProperty({ type: [String] }) images: string[];
  @ApiProperty({
    type: [String],
    description:
      "images ile aynı sırada fotoğraf id'leri (PATCH imageIds için)",
  })
  imageIds: string[];
  @ApiProperty({ enum: ['visible', 'hidden'] }) status: ReviewStatus;
  @ApiPropertyOptional({
    nullable: true,
    enum: ['auto_reports', 'manual'],
    description: 'Sadece gizli yorumda; yazara ve yönetime görünür',
  })
  hiddenReason: HiddenReason | null;
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
