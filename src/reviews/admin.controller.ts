import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { ReviewsService } from './reviews.service';
import {
  ListAdminReviewsDto,
  ListReportsDto,
  SetReviewStatusDto,
} from './dto/admin.dto';

/**
 * Yönetim uçları (iş listesi #24): şikayetleri görme, yorum gizleme/gösterme/silme.
 * `x-internal-token` başlığı `INTERNAL_API_TOKEN` env ile eşleşmeli.
 */
@ApiTags('admin')
@ApiSecurity('internal')
@Controller('admin')
@UseGuards(InternalTokenGuard)
export class AdminController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('reports')
  @ApiOperation({
    summary: 'Review reports (default: open), newest first; paginated',
  })
  @ApiResponse({ status: 200 })
  listReports(@Query() query: ListReportsDto) {
    return this.reviewsService.adminListReports(query);
  }

  @Get('reviews')
  @ApiOperation({
    summary:
      'Reviews for moderation (status=hidden|visible|reported|all, default hidden); paginated',
  })
  @ApiResponse({ status: 200 })
  listReviews(@Query() query: ListAdminReviewsDto) {
    return this.reviewsService.adminListReviews(query);
  }

  @Patch('reviews/:reviewId/status')
  @ApiOperation({
    summary: 'Hide or re-show a review; open reports on it are marked resolved',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'ReviewNotFound' })
  setStatus(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: SetReviewStatusDto,
  ) {
    return this.reviewsService.adminSetStatus(reviewId, dto);
  }

  @Delete('reviews/:reviewId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a review permanently' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'ReviewNotFound' })
  async remove(@Param('reviewId', ParseUUIDPipe) reviewId: string) {
    await this.reviewsService.adminDelete(reviewId);
    return { message: 'Yorum silindi' };
  }
}
