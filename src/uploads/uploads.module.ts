import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewImage } from './review-image.entity';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewImage])],
  providers: [UploadsService, StorageService],
  controllers: [UploadsController],
  exports: [UploadsService],
})
export class UploadsModule {}
