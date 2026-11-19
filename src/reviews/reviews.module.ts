import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './review.entity';
import { ReviewLike } from './entities/review-like.entity';
import { ReviewReport } from './entities/review-report.entity';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { AdminController } from './admin.controller';
import { CarsModule } from '../cars/cars.module';
import { UploadsModule } from '../uploads/uploads.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, ReviewLike, ReviewReport]),
    CarsModule,
    UploadsModule,
    UsersModule,
  ],
  providers: [ReviewsService],
  controllers: [ReviewsController, AdminController],
})
export class ReviewsModule {}
