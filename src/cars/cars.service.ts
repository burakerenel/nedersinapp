import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository, SelectQueryBuilder } from 'typeorm';
import { Brand } from './entities/brand.entity';
import { CarModel } from './entities/car-model.entity';
import { CarSubModel } from './entities/car-sub-model.entity';
import { Review } from '../reviews/review.entity';
import { ApiException } from '../common/exceptions/api.exception';
import { PaginatedResult, parsePage } from '../common/pagination';
import { SearchCarsDto } from './dto/search-cars.dto';
import { CreateSubModelDto } from './dto/create-sub-model.dto';
import { parseSubModelName } from './sub-model-parser';
import { CATEGORY_KEYS, CategoryKey } from '../reviews/dto/create-review.dto';

export interface SubModelStats {
  reviewCount: number;
  averageRating: number | null;
  issueCount: number;
}

export interface IssueDto {
  id: string;
  title: string;
  description: string;
  reportCount: number;
  severity: 'high' | 'medium' | 'low';
}

const ISSUE_DESCRIPTIONS: Record<string, string> = {
  Motor: 'Motor performansı ile ilgili bildirilen sorunlar',
  Konfor: 'İç mekan konforu ile ilgili şikayetler',
  Yakıt: 'Yakıt tüketimi ile ilgili şikayetler',
  Şanzıman: 'Şanzıman sorunları',
  Klima: 'Klima ve iklimlendirme sorunları',
  Servis: 'Servis ve bakım sorunları',
  Güvenlik: 'Güvenlik sistemleri ile ilgili şikayetler',
  'Fiyat/Değer': 'Fiyat/değer dengesi şikayetleri',
};

/** Yorum azken ana sayfa chip'leri için elle sıralama. */
const FALLBACK_BRAND_ORDER = [
  'Fiat',
  'Renault',
  'Volkswagen',
  'Toyota',
  'Hyundai',
  'Ford',
  'Opel',
  'Peugeot',
];

/** Kronik sorun sayılmak için konunun en az bu kadar 1-3 puanlı yorumda geçmesi gerekir. */
export const MIN_ISSUE_REPORTS = 2;

/** Kronik sorun: 1-3 puanlı yorumlarda geçen konu. Önem derecesi orana göre. */
export function issueSeverity(
  reportCount: number,
  totalReviews: number,
): IssueDto['severity'] {
  const share = totalReviews > 0 ? reportCount / totalReviews : 0;
  if (reportCount >= 3 && share >= 0.2) return 'high';
  if (reportCount >= 2 && share >= 0.1) return 'medium';
  return 'low';
}

function round1(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

/** Alt model dönen tüm endpoint'lerde ortak alanlar. */
export function subModelFields(sub: CarSubModel) {
  return {
    id: sub.id,
    name: sub.name,
    trimName: sub.trimName ?? null,
    generation: sub.generation ?? null,
    horsePower: sub.horsePower ?? null,
    yearFrom: sub.yearFrom ?? null,
    yearTo: sub.yearTo ?? null,
    fuelType: sub.fuelType ?? null,
    transmission: sub.transmission ?? null,
    bodyType: sub.bodyType ?? null,
    engineCC: sub.engineCC,
    year: sub.year,
    modelId: sub.modelId,
  };
}

/** "Egea (356) · 1.3 Multijet II (95 bg) 2016 - 2019" biçiminde ad üretir. */
function composeSubModelName(
  modelName: string,
  dto: CreateSubModelDto,
): string {
  const gen = dto.generation?.trim();
  const head = gen ? `${modelName} (${gen})` : modelName;
  const trim = dto.trimName?.trim() || 'Genel';
  const hp = dto.horsePower ? ` (${dto.horsePower} bg)` : '';
  let years = '';
  if (dto.yearFrom) {
    years = dto.yearTo
      ? ` ${dto.yearFrom} - ${dto.yearTo}`
      : ` ${dto.yearFrom}`;
  }
  return `${head} · ${trim}${hp}${years}`;
}

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

  // ---------- istatistik yardımcıları ----------

  /** Tipli ham SQL (Repository.query `any` döner). */
  private async raw<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const rows: unknown = await this.reviewRepo.query(sql, params);
    return rows as T[];
  }

  /** Birden fazla alt model için tek sorguda yorum sayısı, ortalama ve sorun sayısı. */
  async statsFor(ids: string[]): Promise<Map<string, SubModelStats>> {
    const map = new Map<string, SubModelStats>();
    if (ids.length === 0) return map;
    for (const id of ids)
      map.set(id, { reviewCount: 0, averageRating: null, issueCount: 0 });

    const base = await this.raw<{
      id: string;
      review_count: number;
      avg_rating: string | null;
    }>(
      `SELECT r.car_sub_model_id AS id, COUNT(*)::int AS review_count, AVG(r.rating) AS avg_rating
         FROM reviews r
        WHERE r.car_sub_model_id = ANY($1::uuid[])
        GROUP BY r.car_sub_model_id`,
      [ids],
    );
    for (const row of base as {
      id: string;
      review_count: number;
      avg_rating: string | null;
    }[]) {
      const s = map.get(row.id)!;
      s.reviewCount = row.review_count;
      s.averageRating = row.review_count > 0 ? round1(row.avg_rating) : null;
    }

    const issues = await this.raw<{ id: string; issue_count: number }>(
      `SELECT x.id, COUNT(*)::int AS issue_count
         FROM (SELECT r.car_sub_model_id AS id, trim(t.topic) AS topic
                 FROM reviews r
                 CROSS JOIN LATERAL unnest(string_to_array(r.topics, ',')) AS t(topic)
                WHERE r.car_sub_model_id = ANY($1::uuid[])
                  AND r.rating <= 3
                  AND COALESCE(r.topics, '') <> ''
                  AND trim(t.topic) <> ''
                GROUP BY r.car_sub_model_id, trim(t.topic)
               HAVING COUNT(*) >= ${MIN_ISSUE_REPORTS}) x
        GROUP BY x.id`,
      [ids],
    );
    for (const row of issues as { id: string; issue_count: number }[]) {
      map.get(row.id)!.issueCount = row.issue_count;
    }
    return map;
  }

  private async issuesRaw(
    subModelId: string,
  ): Promise<{ topic: string; reportCount: number }[]> {
    const rows = await this.raw<{ topic: string; report_count: number }>(
      `SELECT trim(t.topic) AS topic, COUNT(*)::int AS report_count
         FROM reviews r
         CROSS JOIN LATERAL unnest(string_to_array(r.topics, ',')) AS t(topic)
        WHERE r.car_sub_model_id = $1
          AND r.rating <= 3
          AND COALESCE(r.topics, '') <> ''
          AND trim(t.topic) <> ''
        GROUP BY trim(t.topic)
       HAVING COUNT(*) >= ${MIN_ISSUE_REPORTS}
        ORDER BY report_count DESC, topic ASC`,
      [subModelId],
    );
    return (rows as { topic: string; report_count: number }[]).map((r) => ({
      topic: r.topic,
      reportCount: r.report_count,
    }));
  }

  // ---------- markalar ----------

  async findAllBrands(): Promise<Brand[]> {
    return this.brandRepo.find({ order: { name: 'ASC' } });
  }

  async findPopularBrands(limit = 8) {
    const rows = await this.raw<{
      id: string;
      name: string;
      logo: string | null;
      review_count: number;
    }>(
      `WITH rc AS (
         SELECT m.brand_id, COUNT(*)::int AS c
           FROM reviews r
           JOIN car_sub_models s ON s.id = r.car_sub_model_id
           JOIN car_models m ON m.id = s.model_id
          GROUP BY m.brand_id)
       SELECT b.id, b.name, b.logo, COALESCE(rc.c, 0)::int AS review_count
         FROM brands b LEFT JOIN rc ON rc.brand_id = b.id`,
    );

    const fallbackIndex = (name: string) => {
      const i = FALLBACK_BRAND_ORDER.findIndex(
        (n) => n.toLowerCase() === name.toLowerCase(),
      );
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };

    return rows
      .sort((a, b) => {
        if (b.review_count !== a.review_count)
          return b.review_count - a.review_count;
        const fa = fallbackIndex(a.name);
        const fb = fallbackIndex(b.name);
        if (fa !== fb) return fa - fb;
        return a.name.localeCompare(b.name, 'tr');
      })
      .slice(0, limit)
      .map((b) => ({
        id: b.id,
        name: b.name,
        logo: b.logo,
        reviewCount: b.review_count,
      }));
  }

  async findBrandById(id: string) {
    const brand = await this.brandRepo.findOne({
      where: { id },
      relations: ['models'],
      order: { models: { name: 'ASC' } },
    });
    if (!brand) throw ApiException.notFound('Marka bulunamadı');

    const counts = await this.raw<{ model_id: string; c: number }>(
      `SELECT s.model_id AS model_id, COUNT(*)::int AS c
         FROM reviews r JOIN car_sub_models s ON s.id = r.car_sub_model_id
         JOIN car_models m ON m.id = s.model_id
        WHERE m.brand_id = $1
        GROUP BY s.model_id`,
      [id],
    );
    const byModel = new Map(counts.map((c) => [c.model_id, c.c]));

    return {
      ...brand,
      models: brand.models.map((m) => ({
        ...m,
        reviewCount: byModel.get(m.id) ?? 0,
      })),
    };
  }

  // ---------- modeller / alt modeller ----------

  async findModelById(modelId: string) {
    const model = await this.carModelRepo.findOne({
      where: { id: modelId },
      relations: ['brand', 'subModels'],
    });
    if (!model) throw ApiException.notFound('Model bulunamadı');

    const stats = await this.statsFor(model.subModels.map((s) => s.id));
    const subModels = model.subModels
      .sort(
        (a, b) =>
          (b.yearFrom ?? b.year) - (a.yearFrom ?? a.year) ||
          a.name.localeCompare(b.name),
      )
      .map((sub) => ({ ...subModelFields(sub), ...stats.get(sub.id)! }));

    return { ...model, subModels };
  }

  /** Varlık kontrolü (diğer servisler kullanır). */
  async findSubModelByIdOnly(id: string): Promise<CarSubModel> {
    const sub = await this.subModelRepo.findOne({
      where: { id },
      relations: ['model', 'model.brand'],
    });
    if (!sub) throw ApiException.notFound('Araç bulunamadı', 'CarNotFound');
    return sub;
  }

  async findSubModelDetail(id: string) {
    const sub = await this.findSubModelByIdOnly(id);

    const [stats, issues, cat, topicRows, ratingRows] = await Promise.all([
      this.statsFor([id]),
      this.issuesRaw(id),
      this.raw<Record<string, string | number | null>>(
        `SELECT
           ${CATEGORY_KEYS.map((k) => `AVG((r.category_ratings->>'${k}')::numeric) AS "${k}"`).join(', ')},
           COUNT(r.category_ratings)::int AS cat_count,
           COUNT(r.recommends)::int AS rec_count,
           SUM(CASE WHEN r.recommends THEN 1 ELSE 0 END)::int AS rec_yes
         FROM reviews r WHERE r.car_sub_model_id = $1`,
        [id],
      ),
      this.raw<{ topic: string; c: number }>(
        `SELECT trim(t.topic) AS topic, COUNT(*)::int AS c
           FROM reviews r CROSS JOIN LATERAL unnest(string_to_array(r.topics, ',')) AS t(topic)
          WHERE r.car_sub_model_id = $1 AND COALESCE(r.topics,'') <> '' AND trim(t.topic) <> ''
          GROUP BY trim(t.topic) ORDER BY c DESC, topic ASC`,
        [id],
      ),
      this.raw<{ rating: number; c: number }>(
        `SELECT r.rating, COUNT(*)::int AS c FROM reviews r
          WHERE r.car_sub_model_id = $1 AND r.rating BETWEEN 1 AND 5
          GROUP BY r.rating ORDER BY r.rating`,
        [id],
      ),
    ]);

    const s = stats.get(id)!;
    const catRow = cat[0] ?? {};
    const catCount = Number(catRow.cat_count ?? 0);
    const recCount = Number(catRow.rec_count ?? 0);

    const categoryAverages =
      catCount > 0
        ? (Object.fromEntries(
            CATEGORY_KEYS.map((k) => [k, round1(catRow[k] as string | null)]),
          ) as Record<CategoryKey, number | null>)
        : null;
    const recommendPercent =
      recCount > 0
        ? Math.round((100 * Number(catRow.rec_yes ?? 0)) / recCount)
        : null;

    const topicCounts: Record<string, number> = {};
    for (const row of topicRows) topicCounts[row.topic] = row.c;
    const ratingCounts: Record<string, number> = {};
    for (const row of ratingRows) ratingCounts[String(row.rating)] = row.c;

    const hasChronicIssue = issues.some(
      (i) => issueSeverity(i.reportCount, s.reviewCount) === 'high',
    );

    return {
      ...sub,
      ...subModelFields(sub),
      reviewCount: s.reviewCount,
      averageRating: s.averageRating,
      issueCount: issues.length,
      hasChronicIssue,
      categoryAverages,
      recommendPercent,
      topicCounts,
      ratingCounts,
    };
  }

  async findIssuesBySubModel(subModelId: string): Promise<IssueDto[]> {
    await this.findSubModelByIdOnly(subModelId);
    const [issues, total] = await Promise.all([
      this.issuesRaw(subModelId),
      this.reviewRepo.count({ where: { carSubModelId: subModelId } }),
    ]);
    return issues.map((i) => ({
      id: `${subModelId}-${i.topic}`,
      title: i.topic,
      description: ISSUE_DESCRIPTIONS[i.topic] ?? i.topic,
      reportCount: i.reportCount,
      severity: issueSeverity(i.reportCount, total),
    }));
  }

  // ---------- dahili: bul ya da oluştur ----------

  /**
   * Marka → model → alt model zincirini isme göre (büyük/küçük harf duyarsız)
   * bulur, yoksa oluşturur. Alt model adı verilmezse trim/generation/yıl
   * bilgisinden arabam.com biçiminde üretilir; yakıt/şanzıman/kasa verilmemişse
   * addan tahmin edilir.
   */
  async createSubModel(dto: CreateSubModelDto) {
    const brandName = dto.brand.trim();
    const modelName = dto.model.trim();
    if (
      dto.yearFrom !== undefined &&
      dto.yearTo !== undefined &&
      dto.yearTo < dto.yearFrom
    ) {
      throw ApiException.validation('Yıl aralığı geçersiz', {
        yearTo: 'yearFrom değerinden küçük olamaz',
      });
    }

    let brandCreated = false;
    let brand = await this.brandRepo.findOne({
      where: { name: ILike(brandName) },
    });
    if (!brand) {
      brand = await this.brandRepo.save(
        this.brandRepo.create({ name: brandName }),
      );
      brandCreated = true;
    }

    let modelCreated = false;
    let model = await this.carModelRepo.findOne({
      where: { brandId: brand.id, name: ILike(modelName) },
    });
    if (!model) {
      model = await this.carModelRepo.save(
        this.carModelRepo.create({ name: modelName, brandId: brand.id }),
      );
      modelCreated = true;
    }

    const name = (dto.name ?? composeSubModelName(model.name, dto)).trim();
    let subCreated = false;
    let sub = await this.subModelRepo.findOne({
      where: { modelId: model.id, name: ILike(name) },
    });
    if (!sub) {
      const parsed = parseSubModelName(name, model.name);
      sub = await this.subModelRepo.save(
        this.subModelRepo.create({
          name,
          modelId: model.id,
          engineCC: dto.engineCC ?? 0,
          year: dto.yearFrom ?? 0,
          trimName: dto.trimName?.trim() ?? parsed.trimName,
          generation: dto.generation?.trim() ?? parsed.generation,
          horsePower: dto.horsePower ?? parsed.horsePower,
          yearFrom: dto.yearFrom ?? parsed.yearFrom,
          yearTo: dto.yearTo ?? parsed.yearTo,
          fuelType: dto.fuelType ?? parsed.fuelType,
          transmission: dto.transmission ?? parsed.transmission,
          bodyType: dto.bodyType ?? parsed.bodyType,
        }),
      );
      subCreated = true;
    }

    return {
      brand: { id: brand.id, name: brand.name, created: brandCreated },
      model: { id: model.id, name: model.name, created: modelCreated },
      subModel: { ...subModelFields(sub), created: subCreated },
    };
  }

  // ---------- arama ----------

  private baseSubModelQuery(): SelectQueryBuilder<CarSubModel> {
    return this.subModelRepo
      .createQueryBuilder('sub')
      .innerJoinAndSelect('sub.model', 'model')
      .innerJoinAndSelect('model.brand', 'brand');
  }

  async search(dto: SearchCarsDto) {
    const { page, limit, offset } = parsePage(dto.page, dto.limit, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const qb = this.baseSubModelQuery();

    const q = dto.q?.trim();
    if (q) {
      q.split(/\s+/).forEach((term, i) => {
        const key = `term${i}`;
        qb.andWhere(
          `(brand.name ILIKE :${key} OR model.name ILIKE :${key} OR sub.name ILIKE :${key})`,
          { [key]: `%${term}%` },
        );
      });
    }
    if (dto.bodyType)
      qb.andWhere('sub.bodyType = :bodyType', { bodyType: dto.bodyType });
    if (dto.fuelType)
      qb.andWhere('sub.fuelType = :fuelType', { fuelType: dto.fuelType });
    // Üretim aralığı filtreyle kesişen alt modeller. Yılı bilinmeyen kayıtlar
    // (year = 0, yearFrom/yearTo NULL; arabam.com kaynağında yıl yok) dışlanmaz.
    if (dto.yearFrom) {
      qb.andWhere(
        'COALESCE(sub.yearTo, sub.yearFrom, NULLIF(sub.year, 0), 9999) >= :yf',
        { yf: dto.yearFrom },
      );
    }
    if (dto.yearTo) {
      qb.andWhere('COALESCE(sub.yearFrom, NULLIF(sub.year, 0), 0) <= :yt', {
        yt: dto.yearTo,
      });
    }

    const total = await qb.getCount();

    // Yorum istatistikleri: 57 bin satırda korelasyonlu alt sorgu yerine
    // önceden gruplanmış küçük tabloya LEFT JOIN (yorumu olan alt model azdır).
    qb.leftJoin(
      (sq) =>
        sq
          .select('r.car_sub_model_id', 'sub_id')
          .addSelect('COUNT(*)', 'review_count')
          .addSelect('AVG(r.rating)', 'avg_rating')
          .from(Review, 'r')
          .groupBy('r.car_sub_model_id'),
      'rs',
      'rs.sub_id = sub.id',
    )
      .addSelect('COALESCE(rs.review_count, 0)', 'review_count')
      .addSelect('rs.avg_rating', 'avg_rating');

    if (dto.sort === 'rating') {
      qb.orderBy('avg_rating', 'DESC', 'NULLS LAST').addOrderBy(
        'review_count',
        'DESC',
      );
    } else {
      qb.orderBy('review_count', 'DESC');
    }
    qb.addOrderBy('brand.name', 'ASC')
      .addOrderBy('model.name', 'ASC')
      .addOrderBy('sub.yearFrom', 'DESC', 'NULLS LAST')
      .addOrderBy('sub.name', 'ASC')
      .offset(offset)
      .limit(limit);

    const subModels = await qb.getMany();
    const stats = await this.statsFor(subModels.map((s) => s.id));

    const data = subModels.map((sub) => ({
      ...subModelFields(sub),
      model: { id: sub.model.id, name: sub.model.name },
      brand: {
        id: sub.model.brand.id,
        name: sub.model.brand.name,
        logo: sub.model.brand.logo ?? null,
      },
      ...stats.get(sub.id)!,
    }));

    return PaginatedResult.of(data, page, limit, total);
  }

  async findPopular(limit = 10) {
    const reviewCountSql =
      '(SELECT COUNT(*) FROM reviews r WHERE r.car_sub_model_id = sub.id)';
    const subModels = await this.baseSubModelQuery()
      .addSelect(reviewCountSql, 'review_count')
      .where(`${reviewCountSql} > 0`)
      .orderBy('review_count', 'DESC')
      .addOrderBy('sub.name', 'ASC')
      .limit(limit)
      .getMany();

    const stats = await this.statsFor(subModels.map((s) => s.id));

    return subModels.map((sub) => ({
      subModelId: sub.id,
      ...subModelFields(sub),
      model: sub.model.name,
      brand: sub.model.brand.name,
      brandId: sub.model.brand.id,
      ...stats.get(sub.id)!,
    }));
  }
}
