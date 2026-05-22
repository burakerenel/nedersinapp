import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { CarsService } from '../cars/cars.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    private readonly carsService: CarsService,
  ) {}

  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    await this.carsService.findSubModelByIdOnly(dto.carSubModelId);
    const review = this.reviewRepo.create({ userId, ...dto });
    return this.reviewRepo.save(review);
  }

  async findBySubModel(carSubModelId: string): Promise<Review[]> {
    await this.carsService.findSubModelByIdOnly(carSubModelId);
    return this.reviewRepo.find({
      where: { carSubModelId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }
}
