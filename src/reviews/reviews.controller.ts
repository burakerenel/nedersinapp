import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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

  @Get('sub-model/:carSubModelId')
  @ApiOperation({ summary: 'List all reviews for a car sub-model' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Car sub-model not found' })
  findBySubModel(@Param('carSubModelId', ParseUUIDPipe) carSubModelId: string) {
    return this.reviewsService.findBySubModel(carSubModelId);
  }
}
