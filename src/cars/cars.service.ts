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
    return this.brandRepo.find({ relations: ['models', 'models.subModels'] });
  }

  async findBrandById(id: string): Promise<Brand> {
    const brand = await this.brandRepo.findOne({
      where: { id },
      relations: ['models', 'models.subModels'],
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async findAllModels(): Promise<CarModel[]> {
    return this.carModelRepo.find({ relations: ['brand', 'subModels'] });
  }

  async findModelById(id: string): Promise<CarModel> {
    const model = await this.carModelRepo.findOne({
      where: { id },
      relations: ['brand', 'subModels'],
    });
    if (!model) throw new NotFoundException('Car model not found');
    return model;
  }

  async findAllSubModels(): Promise<CarSubModel[]> {
    return this.subModelRepo.find({ relations: ['model', 'model.brand'] });
  }

  async findSubModelById(id: string): Promise<CarSubModel> {
    const sub = await this.subModelRepo.findOne({
      where: { id },
      relations: ['model', 'model.brand'],
    });
    if (!sub) throw new NotFoundException('Car sub-model not found');
    return sub;
  }
}
