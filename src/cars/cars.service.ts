import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './entities/brand.entity';
import { CarModel } from './entities/car-model.entity';
import { CarSubModel } from './entities/car-sub-model.entity';
import { Review } from '../reviews/review.entity';

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
    @InjectRepository(CarModel)
    private readonly carModelRepo: Repository<CarModel>,
    @InjectRepository(CarSubModel)
    private readonly subModelRepo: Repository<CarSubModel>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  async findAllBrands(): Promise<Brand[]> {
    return this.brandRepo.find();
  }

  async findBrandById(id: string): Promise<any> {
    const brand = await this.brandRepo.findOne({
      where: { id },
      relations: ['models'],
    });
    if (!brand) throw new NotFoundException('Brand not found');

    const models = await Promise.all(
      brand.models.map(async (model) => {
        const reviewCount = await this.reviewRepo
          .createQueryBuilder('r')
          .innerJoin('r.carSubModel', 'sub')
          .where('sub.modelId = :modelId', { modelId: model.id })
          .getCount();
        return { ...model, reviewCount };
      }),
    );

    return { ...brand, models };
  }

  async findModelById(modelId: string): Promise<any> {
    const model = await this.carModelRepo.findOne({
      where: { id: modelId },
      relations: ['brand', 'subModels'],
    });
    if (!model) throw new NotFoundException('Car model not found');

    const subModels = await Promise.all(
      model.subModels.map(async (sub) => {
        const reviewCount = await this.reviewRepo.count({
          where: { carSubModelId: sub.id },
        });
        return { ...sub, reviewCount };
      }),
    );

    return { ...model, subModels };
  }

  async findSubModelsByModelId(brandId: string, modelId: string): Promise<CarSubModel[]> {
    return this.subModelRepo.find({
      where: { model: { id: modelId, brand: { id: brandId } } },
      relations: ['model', 'model.brand'],
    });
  }

  async findSubModelById(
    brandId: string,
    modelId: string,
    subModelId: string,
  ): Promise<CarSubModel> {
    const sub = await this.subModelRepo.findOne({
      where: { id: subModelId, model: { id: modelId, brand: { id: brandId } } },
      relations: ['model', 'model.brand'],
    });
    if (!sub) throw new NotFoundException('Car sub-model not found');
    return sub;
  }

  async findSubModelByIdOnly(id: string): Promise<any> {
    const sub = await this.subModelRepo.findOne({
      where: { id },
      relations: ['model', 'model.brand'],
    });
    if (!sub) throw new NotFoundException('Car sub-model not found');

    const [reviewCount, avgResult] = await Promise.all([
      this.reviewRepo.count({ where: { carSubModelId: id } }),
      this.reviewRepo
        .createQueryBuilder('r')
        .select('AVG(r.rating)', 'avg')
        .where('r.carSubModelId = :id', { id })
        .getRawOne<{ avg: string | null }>(),
    ]);

    const averageRating = avgResult?.avg
      ? Math.round(parseFloat(avgResult.avg) * 10) / 10
      : 0;

    return { ...sub, reviewCount, averageRating };
  }

  async search(q: string, limit = 20): Promise<any[]> {
    if (!q?.trim()) return [];

    const terms = q.trim().split(/\s+/);
    let qb = this.subModelRepo
      .createQueryBuilder('sub')
      .innerJoinAndSelect('sub.model', 'model')
      .innerJoinAndSelect('model.brand', 'brand')
      .take(limit);

    terms.forEach((term, i) => {
      const key = `term${i}`;
      const condition = `(brand.name ILIKE :${key} OR model.name ILIKE :${key} OR sub.name ILIKE :${key})`;
      qb = i === 0
        ? qb.where(condition, { [key]: `%${term}%` })
        : qb.andWhere(condition, { [key]: `%${term}%` });
    });

    const subModels = await qb.getMany();

    return Promise.all(
      subModels.map(async (sub) => {
        const [reviewCount, avgResult] = await Promise.all([
          this.reviewRepo.count({ where: { carSubModelId: sub.id } }),
          this.reviewRepo
            .createQueryBuilder('r')
            .select('AVG(r.rating)', 'avg')
            .where('r.carSubModelId = :id', { id: sub.id })
            .getRawOne<{ avg: string | null }>(),
        ]);
        const averageRating = avgResult?.avg
          ? Math.round(parseFloat(avgResult.avg) * 10) / 10
          : 0;
        return {
          id: sub.id,
          name: sub.name,
          engineCC: sub.engineCC,
          year: sub.year,
          model: { id: sub.model.id, name: sub.model.name },
          brand: { id: sub.model.brand.id, name: sub.model.brand.name },
          reviewCount,
          averageRating,
        };
      }),
    );
  }

  async findPopular(limit = 10): Promise<any[]> {
    const subModels = await this.subModelRepo
      .createQueryBuilder('sub')
      .innerJoinAndSelect('sub.model', 'model')
      .innerJoinAndSelect('model.brand', 'brand')
      .orderBy(
        '(SELECT COUNT(*) FROM reviews r WHERE r.car_sub_model_id = sub.id)',
        'DESC',
      )
      .take(limit)
      .getMany();

    return Promise.all(
      subModels.map(async (sub) => {
        const [reviewCount, avgResult] = await Promise.all([
          this.reviewRepo.count({ where: { carSubModelId: sub.id } }),
          this.reviewRepo
            .createQueryBuilder('r')
            .select('AVG(r.rating)', 'avg')
            .where('r.carSubModelId = :id', { id: sub.id })
            .getRawOne<{ avg: string | null }>(),
        ]);
        const averageRating = avgResult?.avg
          ? Math.round(parseFloat(avgResult.avg) * 10) / 10
          : 0;
        return {
          subModelId: sub.id,
          name: sub.name,
          model: sub.model.name,
          brand: sub.model.brand.name,
          year: sub.year,
          reviewCount,
          averageRating,
        };
      }),
    );
  }

  async findIssuesBySubModel(subModelId: string): Promise<any[]> {
    await this.findSubModelByIdOnly(subModelId);

    const rows = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.topics', 'topics')
      .where('r.carSubModelId = :subModelId', { subModelId })
      .andWhere('r.topics IS NOT NULL')
      .andWhere("r.topics != ''")
      .getRawMany<{ topics: string }>();

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.topics) {
        for (const topic of row.topics.split(',').map((t) => t.trim()).filter(Boolean)) {
          counts.set(topic, (counts.get(topic) ?? 0) + 1);
        }
      }
    }

    const descriptions: Record<string, string> = {
      Motor: 'Motor performansı ile ilgili bildirilen sorunlar',
      Konfor: 'İç mekan konforu ile ilgili şikayetler',
      Yakıt: 'Yakıt tüketimi ile ilgili şikayetler',
      Şanzıman: 'Şanzıman sorunları',
      Klima: 'Klima ve iklimlendirme sorunları',
      Servis: 'Servis ve bakım sorunları',
      Güvenlik: 'Güvenlik sistemleri ile ilgili şikayetler',
      'Fiyat/Değer': 'Fiyat/değer dengesi şikayetleri',
    };

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic, reportCount]) => ({
        id: `${subModelId}-${topic}`,
        title: topic,
        description: descriptions[topic] ?? topic,
        reportCount,
        severity: reportCount >= 20 ? 'high' : reportCount >= 5 ? 'medium' : 'low',
      }));
  }
}
