import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a review for a car sub-model' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 404, description: 'Car sub-model not found' })
  create(@CurrentUser() user: User, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.id, dto);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent reviews for the home feed (public)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findRecent(@Query('limit') limit?: string) {
    return this.reviewsService.findRecent(limit ? parseInt(limit, 10) : 10);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current user's reviews" })
  findMine(@CurrentUser() user: User) {
    return this.reviewsService.findByUser(user.id);
  }

  @Get('sub-model/:carSubModelId')
  @ApiOperation({ summary: 'List all reviews for a car sub-model' })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'highest', 'mostLiked'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Car sub-model not found' })
  findBySubModel(
    @Param('carSubModelId', ParseUUIDPipe) carSubModelId: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewsService.findBySubModel(
      carSubModelId,
      sort,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Delete(':reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own review' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'You can only delete your own reviews' })
  async deleteReview(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    await this.reviewsService.deleteReview(user.id, reviewId);
    return { message: 'Review deleted successfully' };
  }

  @Post(':reviewId/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle like on a review' })
  @ApiResponse({ status: 200 })
  toggleLike(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    return this.reviewsService.toggleLike(user.id, reviewId);
  }
}
