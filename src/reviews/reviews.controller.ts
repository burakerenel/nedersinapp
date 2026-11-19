import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ReportReviewDto } from './dto/report-review.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a review for a car sub-model (one per user per sub-model)',
  })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({
    status: 400,
    description: 'ContentNotAllowed / ValidationError',
  })
  @ApiResponse({ status: 404, description: 'CarNotFound' })
  @ApiResponse({ status: 409, description: 'ReviewAlreadyExists' })
  create(@CurrentUser() user: User, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.id, dto);
  }

  @Get('recent')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recent reviews for the home feed (public; token optional)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findRecent(@CurrentUser() user: User | null, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 10;
    return this.reviewsService.findRecent(
      Number.isFinite(n) ? n : 10,
      user?.id ?? null,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Current user's reviews (hidden ones included, see `status`)",
  })
  findMine(@CurrentUser() user: User) {
    return this.reviewsService.findByUser(user.id);
  }

  @Get('model/:modelId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Reviews of a model across all its sub-models (public; token optional). Same filters as sub-model; each item carries `carSubModel`',
  })
  @ApiResponse({ status: 200, type: [ReviewResponseDto] })
  @ApiResponse({ status: 404, description: 'NotFound' })
  findByModel(
    @CurrentUser() user: User | null,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Query() query: ListReviewsDto,
  ) {
    return this.reviewsService.findByModel(modelId, query, user?.id ?? null);
  }

  @Get('sub-model/:carSubModelId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Reviews of a sub-model (public; token optional). Filters: sort, q, topic, ratings, page, limit; paginated with meta',
  })
  @ApiResponse({ status: 200, type: [ReviewResponseDto] })
  @ApiResponse({ status: 404, description: 'CarNotFound' })
  findBySubModel(
    @CurrentUser() user: User | null,
    @Param('carSubModelId', ParseUUIDPipe) carSubModelId: string,
    @Query() query: ListReviewsDto,
  ) {
    return this.reviewsService.findBySubModel(
      carSubModelId,
      query,
      user?.id ?? null,
    );
  }

  @Patch(':reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit own review (all fields optional)' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({
    status: 400,
    description: 'ContentNotAllowed / ValidationError',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'ReviewNotFound' })
  update(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(user.id, reviewId, dto);
  }

  @Delete(':reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own review' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async deleteReview(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    await this.reviewsService.deleteReview(user.id, reviewId);
    return { message: 'Yorum silindi' };
  }

  @Post(':reviewId/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Report a review (one per user per review; 3 open reports auto-hide the review for moderation)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403, description: 'CannotReportOwnReview' })
  @ApiResponse({ status: 404, description: 'ReviewNotFound' })
  @ApiResponse({ status: 409, description: 'ReportAlreadyExists' })
  report(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviewsService.report(user.id, reviewId, dto);
  }

  @Post(':reviewId/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle like on a review (not on your own)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'CannotLikeOwnReview' })
  toggleLike(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    return this.reviewsService.toggleLike(user.id, reviewId);
  }
}
