import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from './favorite.entity';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { CarsService, subModelFields } from '../cars/cars.service';
import { ApiException } from '../common/exceptions/api.exception';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    private readonly carsService: CarsService,
  ) {}

  async create(userId: string, dto: CreateFavoriteDto) {
    await this.carsService.findSubModelByIdOnly(dto.carSubModelId);

    const existing = await this.favoriteRepo.findOne({
      where: { userId, carSubModelId: dto.carSubModelId },
    });
    if (existing) {
      throw ApiException.conflict(
        'Bu araç zaten garajınızda',
        'FavoriteAlreadyExists',
      );
    }

    const favorite = this.favoriteRepo.create({
      userId,
      carSubModelId: dto.carSubModelId,
    });
    const saved = await this.favoriteRepo.save(favorite);
    const [item] = await this.decorate([saved]);
    return item;
  }

  async findByUser(userId: string) {
    const favorites = await this.favoriteRepo.find({
      where: { userId },
      relations: [
        'carSubModel',
        'carSubModel.model',
        'carSubModel.model.brand',
      ],
      order: { createdAt: 'DESC' },
    });
    return this.decorate(favorites);
  }

  private async decorate(favorites: Favorite[]) {
    const loaded = await Promise.all(
      favorites.map(async (f) =>
        f.carSubModel?.model?.brand
          ? f
          : {
              ...f,
              carSubModel: await this.carsService.findSubModelByIdOnly(
                f.carSubModelId,
              ),
            },
      ),
    );
    const stats = await this.carsService.statsFor(
      loaded.map((f) => f.carSubModelId),
    );
    return loaded.map((f) => ({
      id: f.id,
      userId: f.userId,
      carSubModelId: f.carSubModelId,
      createdAt: f.createdAt,
      carSubModel: {
        ...subModelFields(f.carSubModel),
        model: {
          id: f.carSubModel.model.id,
          name: f.carSubModel.model.name,
          brand: {
            id: f.carSubModel.model.brand.id,
            name: f.carSubModel.model.brand.name,
            logo: f.carSubModel.model.brand.logo ?? null,
          },
        },
        ...stats.get(f.carSubModelId)!,
      },
    }));
  }

  async delete(userId: string, favoriteId: string): Promise<void> {
    const favorite = await this.favoriteRepo.findOne({
      where: { id: favoriteId, userId },
    });
    if (!favorite)
      throw ApiException.notFound('Favori bulunamadı', 'FavoriteNotFound');
    await this.favoriteRepo.remove(favorite);
  }
}
