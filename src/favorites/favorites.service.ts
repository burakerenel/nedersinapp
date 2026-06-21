import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from './favorite.entity';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { CarsService } from '../cars/cars.service';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    private readonly carsService: CarsService,
  ) {}

  async create(userId: string, dto: CreateFavoriteDto): Promise<Favorite> {
    await this.carsService.findSubModelByIdOnly(dto.carSubModelId);

    const existing = await this.favoriteRepo.findOne({
      where: { userId, carSubModelId: dto.carSubModelId },
    });
    if (existing) throw new ConflictException('Already in favorites');

    const favorite = this.favoriteRepo.create({ userId, carSubModelId: dto.carSubModelId });
    return this.favoriteRepo.save(favorite);
  }

  async findByUser(userId: string): Promise<Favorite[]> {
    return this.favoriteRepo.find({
      where: { userId },
      relations: ['carSubModel', 'carSubModel.model', 'carSubModel.model.brand'],
      order: { createdAt: 'DESC' },
    });
  }

  async delete(userId: string, favoriteId: string): Promise<void> {
    const favorite = await this.favoriteRepo.findOne({
      where: { id: favoriteId, userId },
    });
    if (!favorite) throw new NotFoundException('Favorite not found');
    await this.favoriteRepo.remove(favorite);
  }
}
