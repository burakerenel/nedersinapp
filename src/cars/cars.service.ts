import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './entities/brand.entity';
import { CarModel } from './entities/car-model.entity';
import { CarSubModel } from './entities/car-sub-model.entity';

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
    @InjectRepository(CarModel)
    private readonly carModelRepo: Repository<CarModel>,
    @InjectRepository(CarSubModel)
    private readonly subModelRepo: Repository<CarSubModel>,
  ) {}

  async findAllBrands(): Promise<Brand[]> {
    return this.brandRepo.find();
  }

  async findBrandById(id: string): Promise<Brand> {
    const brand = await this.brandRepo.findOne({
      where: { id },
      relations: ['models'],
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async findModelById(brandId: string, modelId: string): Promise<CarModel> {
    const model = await this.carModelRepo.findOne({
      where: { id: modelId, brand: { id: brandId } },
      relations: ['brand', 'subModels'],
    });
    if (!model) throw new NotFoundException('Car model not found');
    return model;
  }

  async findSubModelsByModelId(brandId: string, modelId: string): Promise<CarSubModel[]> {
    return this.subModelRepo.find({
      where: { model: { id: modelId, brand: { id: brandId } } },
      relations: ['model', 'model.brand'],
    });
  }

  async findSubModelById(brandId: string, modelId: string, subModelId: string): Promise<CarSubModel> {
    const sub = await this.subModelRepo.findOne({
      where: { id: subModelId, model: { id: modelId, brand: { id: brandId } } },
      relations: ['model', 'model.brand'],
    });
    if (!sub) throw new NotFoundException('Car sub-model not found');
    return sub;
  }
}
