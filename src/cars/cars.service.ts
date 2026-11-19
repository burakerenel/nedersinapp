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
import { SearchModelsDto } from './dto/search-models.dto';
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

/** Kronik sorun sayılmak için konunun en az bu kadar yorumda "sevilmeyen" olarak geçmesi gerekir. */
export const MIN_ISSUE_REPORTS = 2;

/** Sadece görünür yorumlar istatistiğe girer (#24). */
const VISIBLE = `r.status = 'visible'`;

/**
 * İstatistik kapsamı: alt model (r.car_sub_model_id) ya da model (alt modeller
 * üzerinden s.model_id). Aynı SQL iki düzeyde de çalışır (#32).
 */
type Scope = 'sub' | 'model';
const SCOPE = {
  sub: { join: '', key: 'r.car_sub_model_id' },
  model: {
    join: 'JOIN car_sub_models s ON s.id = r.car_sub_model_id',
    key: 's.model_id',
  },
} as const;

/** Kronik sorun: sevilmeyen konu olarak işaretlenen (dislikedTopics) konu. Önem derecesi orana göre. */
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
    return this.statsByScope('sub', ids);
  }

  /** Model (kuşak) düzeyi: modelin tüm alt modelleri birlikte. */
  async statsForModels(ids: string[]): Promise<Map<string, SubModelStats>> {
    return this.statsByScope('model', ids);
  }

  private async statsByScope(
    scope: Scope,
    ids: string[],
  ): Promise<Map<string, SubModelStats>> {
    const map = new Map<string, SubModelStats>();
    if (ids.length === 0) return map;
    for (const id of ids)
      map.set(id, { reviewCount: 0, averageRating: null, issueCount: 0 });
    const { join, key } = SCOPE[scope];

    const base = await this.raw<{
      id: string;
      review_count: number;
      avg_rating: string | null;
    }>(
      `SELECT ${key} AS id, COUNT(*)::int AS review_count, AVG(r.rating) AS avg_rating
         FROM reviews r ${join}
        WHERE ${key} = ANY($1::uuid[]) AND ${VISIBLE}
        GROUP BY ${key}`,
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
         FROM (SELECT ${key} AS id, trim(t.topic) AS topic
                 FROM reviews r ${join}
                 CROSS JOIN LATERAL unnest(string_to_array(r.disliked_topics, ',')) AS t(topic)
                WHERE ${key} = ANY($1::uuid[])
                  AND ${VISIBLE}
                  AND COALESCE(r.disliked_topics, '') <> ''
                  AND trim(t.topic) <> ''
                GROUP BY ${key}, trim(t.topic)
               HAVING COUNT(*) >= ${MIN_ISSUE_REPORTS}) x
        GROUP BY x.id`,
      [ids],
    );
    for (const row of issues as { id: string; issue_count: number }[]) {
      map.get(row.id)!.issueCount = row.issue_count;
    }
    return map;
  }

  /** Sevilmeyen konu olarak en az MIN_ISSUE_REPORTS yorumda geçen konular. */
  private async issuesRaw(
    scope: Scope,
    id: string,
  ): Promise<{ topic: string; reportCount: number }[]> {
    const { join, key } = SCOPE[scope];
    const rows = await this.raw<{ topic: string; report_count: number }>(
      `SELECT trim(t.topic) AS topic, COUNT(*)::int AS report_count
         FROM reviews r ${join}
         CROSS JOIN LATERAL unnest(string_to_array(r.disliked_topics, ',')) AS t(topic)
        WHERE ${key} = $1
          AND ${VISIBLE}
          AND COALESCE(r.disliked_topics, '') <> ''
          AND trim(t.topic) <> ''
        GROUP BY trim(t.topic)
       HAVING COUNT(*) >= ${MIN_ISSUE_REPORTS}
        ORDER BY report_count DESC, topic ASC`,
      [id],
    );
    return (rows as { topic: string; report_count: number }[]).map((r) => ({
      topic: r.topic,
      reportCount: r.report_count,
    }));
  }

  private async topicCountsRaw(
    scope: Scope,
    id: string,
    column: 'topics' | 'liked_topics' | 'disliked_topics',
  ): Promise<Record<string, number>> {
    const { join, key } = SCOPE[scope];
    const rows = await this.raw<{ topic: string; c: number }>(
      `SELECT trim(t.topic) AS topic, COUNT(*)::int AS c
         FROM reviews r ${join}
         CROSS JOIN LATERAL unnest(string_to_array(r.${column}, ',')) AS t(topic)
        WHERE ${key} = $1 AND ${VISIBLE}
          AND COALESCE(r.${column}, '') <> '' AND trim(t.topic) <> ''
        GROUP BY trim(t.topic) ORDER BY c DESC, topic ASC`,
      [id],
    );
    const out: Record<string, number> = {};
    for (const row of rows) out[row.topic] = row.c;
    return out;
  }

  /** Detay ve model sayfası için ortak toplu istatistikler. */
  private async detailAggregates(scope: Scope, id: string) {
    const { join, key } = SCOPE[scope];
    const [
      stats,
      issues,
      cat,
      topicCounts,
      likedTopicCounts,
      dislikedTopicCounts,
      ratingRows,
    ] = await Promise.all([
      this.statsByScope(scope, [id]),
      this.issuesRaw(scope, id),
      this.raw<Record<string, string | number | null>>(
        `SELECT
             ${CATEGORY_KEYS.map((k) => `AVG((r.category_ratings->>'${k}')::numeric) AS "${k}"`).join(', ')},
             COUNT(r.category_ratings)::int AS cat_count,
             COUNT(r.recommends)::int AS rec_count,
             SUM(CASE WHEN r.recommends THEN 1 ELSE 0 END)::int AS rec_yes
           FROM reviews r ${join} WHERE ${key} = $1 AND ${VISIBLE}`,
        [id],
      ),
      this.topicCountsRaw(scope, id, 'topics'),
      this.topicCountsRaw(scope, id, 'liked_topics'),
      this.topicCountsRaw(scope, id, 'disliked_topics'),
      this.raw<{ rating: number; c: number }>(
        `SELECT r.rating, COUNT(*)::int AS c FROM reviews r ${join}
            WHERE ${key} = $1 AND ${VISIBLE} AND r.rating BETWEEN 1 AND 5
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

    const ratingCounts: Record<string, number> = {};
    for (const row of ratingRows) ratingCounts[String(row.rating)] = row.c;

    const hasChronicIssue = issues.some(
      (i) => issueSeverity(i.reportCount, s.reviewCount) === 'high',
    );

    return {
      reviewCount: s.reviewCount,
      averageRating: s.averageRating,
      issueCount: issues.length,
      hasChronicIssue,
      categoryAverages,
      recommendPercent,
      topicCounts,
      likedTopicCounts,
      dislikedTopicCounts,
      ratingCounts,
    };
  }

  private issuesToDto(
    prefix: string,
    issues: { topic: string; reportCount: number }[],
    total: number,
  ): IssueDto[] {
    return issues.map((i) => ({
      id: `${prefix}-${i.topic}`,
      title: i.topic,
      description: ISSUE_DESCRIPTIONS[i.topic] ?? i.topic,
      reportCount: i.reportCount,
      severity: issueSeverity(i.reportCount, total),
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
          WHERE ${VISIBLE}
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

    const stats = await this.statsForModels(brand.models.map((m) => m.id));

    return {
      ...brand,
      models: brand.models.map((m) => ({
        ...m,
        ...stats.get(m.id)!,
      })),
    };
  }

  // ---------- modeller / alt modeller ----------

  /** Varlık kontrolü (yorum listesi için). */
  async findModelByIdOnly(modelId: string): Promise<CarModel> {
    const model = await this.carModelRepo.findOne({
      where: { id: modelId },
      relations: ['brand'],
    });
    if (!model) throw ApiException.notFound('Model bulunamadı', 'CarNotFound');
    return model;
  }

  /**
   * Model (kuşak) sayfası: alt modeller tekil istatistikleriyle + modelin
   * tüm alt modelleri üzerinden toplu puan, sorun ve dağılımlar (#32).
   */
  async findModelById(modelId: string) {
    const model = await this.carModelRepo.findOne({
      where: { id: modelId },
      relations: ['brand', 'subModels'],
    });
    if (!model) throw ApiException.notFound('Model bulunamadı', 'CarNotFound');

    const [stats, aggregates] = await Promise.all([
      this.statsFor(model.subModels.map((s) => s.id)),
      this.detailAggregates('model', modelId),
    ]);
    const subModels = model.subModels
      .sort(
        (a, b) =>
          (b.yearFrom ?? b.year) - (a.yearFrom ?? a.year) ||
          a.name.localeCompare(b.name),
      )
      .map((sub) => ({ ...subModelFields(sub), ...stats.get(sub.id)! }));

    return {
      ...model,
      subModelCount: subModels.length,
      ...aggregates,
      subModels,
    };
  }

  async findIssuesByModel(modelId: string): Promise<IssueDto[]> {
    await this.findModelByIdOnly(modelId);
    const [issues, stats] = await Promise.all([
      this.issuesRaw('model', modelId),
      this.statsForModels([modelId]),
    ]);
    return this.issuesToDto(modelId, issues, stats.get(modelId)!.reviewCount);
  }

  /** Model düzeyinde arama: her model bir kart, istatistikler alt modellerin toplamı (#32). */
  async searchModels(dto: SearchModelsDto) {
    const { page, limit, offset } = parsePage(dto.page, dto.limit, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const qb = this.carModelRepo
      .createQueryBuilder('model')
      .innerJoinAndSelect('model.brand', 'brand');

    const q = dto.q?.trim();
    if (q) {
      q.split(/\s+/).forEach((term, i) => {
        const key = `term${i}`;
        qb.andWhere(
          `(brand.name ILIKE :${key} OR model.name ILIKE :${key} OR (brand.name || ' ' || model.name) ILIKE :${key})`,
          { [key]: `%${term}%` },
        );
      });
    }
    if (dto.brandId)
      qb.andWhere('model.brandId = :brandId', { brandId: dto.brandId });
    if (dto.bodyType || dto.fuelType) {
      // En az bir alt modeli filtreye uyan modeller
      const parts: string[] = ['s.model_id = model.id'];
      const params: Record<string, string> = {};
      if (dto.bodyType) {
        parts.push('s.body_type = :bodyType');
        params.bodyType = dto.bodyType;
      }
      if (dto.fuelType) {
        parts.push('s.fuel_type = :fuelType');
        params.fuelType = dto.fuelType;
      }
      qb.andWhere(
        `EXISTS (SELECT 1 FROM car_sub_models s WHERE ${parts.join(' AND ')})`,
        params,
      );
    }

    const total = await qb.getCount();

    qb.leftJoin(
      (sq) =>
        sq
          .select('s.model_id', 'model_id')
          .addSelect('COUNT(r.id)', 'review_count')
          .addSelect('AVG(r.rating)', 'avg_rating')
          .from(Review, 'r')
          .innerJoin(CarSubModel, 's', 's.id = r.car_sub_model_id')
          .where(VISIBLE)
          .groupBy('s.model_id'),
      'rs',
      'rs.model_id = model.id',
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
      .offset(offset)
      .limit(limit);

    const models = await qb.getMany();
    const ids = models.map((m) => m.id);
    const [stats, subCounts] = await Promise.all([
      this.statsForModels(ids),
      ids.length
        ? this.raw<{ model_id: string; c: number }>(
            `SELECT model_id, COUNT(*)::int AS c FROM car_sub_models
              WHERE model_id = ANY($1::uuid[]) GROUP BY model_id`,
            [ids],
          )
        : Promise.resolve([]),
    ]);
    const subCountMap = new Map(subCounts.map((r) => [r.model_id, r.c]));

    const data = models.map((m) => ({
      id: m.id,
      name: m.name,
      brand: { id: m.brand.id, name: m.brand.name, logo: m.brand.logo ?? null },
      subModelCount: subCountMap.get(m.id) ?? 0,
      ...stats.get(m.id)!,
    }));
    return PaginatedResult.of(data, page, limit, total);
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
    const aggregates = await this.detailAggregates('sub', id);
    return {
      ...sub,
      ...subModelFields(sub),
      ...aggregates,
    };
  }

  async findIssuesBySubModel(subModelId: string): Promise<IssueDto[]> {
    await this.findSubModelByIdOnly(subModelId);
    const [issues, stats] = await Promise.all([
      this.issuesRaw('sub', subModelId),
      this.statsFor([subModelId]),
    ]);
    return this.issuesToDto(
      subModelId,
      issues,
      stats.get(subModelId)!.reviewCount,
    );
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
          .where(VISIBLE)
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
    const reviewCountSql = `(SELECT COUNT(*) FROM reviews r WHERE r.car_sub_model_id = sub.id AND ${VISIBLE})`;
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
