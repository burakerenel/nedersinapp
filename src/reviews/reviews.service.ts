import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './review.entity';
import { ReviewLike } from './entities/review-like.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { CarsService } from '../cars/cars.service';
import {
  MyReviewResponseDto,
  RecentReviewResponseDto,
  ReviewResponseDto,
} from './dto/review-response.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(ReviewLike)
    private readonly likeRepo: Repository<ReviewLike>,
    private readonly carsService: CarsService,
  ) {}

  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    await this.carsService.findSubModelByIdOnly(dto.carSubModelId);
    const review = this.reviewRepo.create({ userId, ...dto });
    return this.reviewRepo.save(review);
  }

  async findBySubModel(
    carSubModelId: string,
    sort = 'newest',
    page = 1,
    limit = 20,
  ): Promise<ReviewResponseDto[]> {
    await this.carsService.findSubModelByIdOnly(carSubModelId);

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .loadRelationCountAndMap('r.likesCount', 'r.likes')
      .where('r.carSubModelId = :carSubModelId', { carSubModelId })
      .skip((page - 1) * limit)
      .take(limit);

    if (sort === 'highest') {
      qb.orderBy('r.rating', 'DESC').addOrderBy('r.createdAt', 'DESC');
    } else if (sort === 'mostLiked') {
      qb.orderBy(
        '(SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id)',
        'DESC',
      ).addOrderBy('r.createdAt', 'DESC');
    } else {
      qb.orderBy('r.createdAt', 'DESC');
    }

    const reviews = await qb.getMany();
    return reviews.map((r) => this.toReviewResponseDto(r));
  }

  async findRecent(limit = 10): Promise<RecentReviewResponseDto[]> {
    const reviews = await this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .orderBy('r.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return reviews.map((r) => ({
      id: r.id,
      content: r.content,
      title: r.title ?? null,
      rating: r.rating,
      createdAt: r.createdAt,
      user: { id: r.user.id, firstName: r.user.firstName, lastName: r.user.lastName },
      carSubModel: {
        id: r.carSubModel.id,
        name: r.carSubModel.name,
        model: {
          name: r.carSubModel.model.name,
          brand: { name: r.carSubModel.model.brand.name },
        },
      },
    }));
  }

  async findByUser(userId: string): Promise<MyReviewResponseDto[]> {
    const reviews = await this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .loadRelationCountAndMap('r.likesCount', 'r.likes')
      .where('r.userId = :userId', { userId })
      .orderBy('r.createdAt', 'DESC')
      .getMany();

    return reviews.map((r) => ({
      id: r.id,
      content: r.content,
      title: r.title ?? null,
      rating: r.rating,
      kilometer: r.kilometer ?? null,
      topics: r.topics ?? [],
      likesCount: (r as Review & { likesCount: number }).likesCount ?? 0,
      createdAt: r.createdAt,
      carSubModel: {
        id: r.carSubModel.id,
        name: r.carSubModel.name,
        model: {
          name: r.carSubModel.model.name,
          brand: { name: r.carSubModel.model.brand.name },
        },
      },
    }));
  }

  async deleteReview(userId: string, reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }
    await this.reviewRepo.remove(review);
  }

  async toggleLike(
    userId: string,
    reviewId: string,
  ): Promise<{ liked: boolean; likesCount: number }> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const existing = await this.likeRepo.findOne({ where: { userId, reviewId } });
    if (existing) {
      await this.likeRepo.remove(existing);
    } else {
      await this.likeRepo.save(this.likeRepo.create({ userId, reviewId }));
    }

    const likesCount = await this.likeRepo.count({ where: { reviewId } });
    return { liked: !existing, likesCount };
  }

  private toReviewResponseDto(r: Review): ReviewResponseDto {
    return {
      id: r.id,
      content: r.content,
      title: r.title ?? null,
      rating: r.rating,
      kilometer: r.kilometer ?? null,
      topics: r.topics ?? [],
      likesCount: (r as Review & { likesCount: number }).likesCount ?? 0,
      carSubModelId: r.carSubModelId,
      createdAt: r.createdAt,
      user: {
        id: r.user.id,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
      },
    };
  }
}
