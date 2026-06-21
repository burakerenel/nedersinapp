import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './entities/brand.entity';
import { CarModel } from './entities/car-model.entity';
import { CarSubModel } from './entities/car-sub-model.entity';
import { Review } from '../reviews/review.entity';
import { CarsService } from './cars.service';
import { CarsController } from './cars.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Brand, CarModel, CarSubModel, Review])],
  providers: [CarsService],
  controllers: [CarsController],
  exports: [CarsService],
})
export class CarsModule {}
