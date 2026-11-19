import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { Review, ReviewStatus } from './review.entity';
import { ReviewLike } from './entities/review-like.entity';
import { ReviewReport } from './entities/review-report.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ReportReviewDto } from './dto/report-review.dto';
import {
  ListAdminReviewsDto,
  ListReportsDto,
  SetReviewStatusDto,
} from './dto/admin.dto';
import { CarsService } from '../cars/cars.service';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ApiException } from '../common/exceptions/api.exception';
import { PaginatedResult, parsePage } from '../common/pagination';
import { buildSearchText, normalizeTurkish } from '../common/utils/turkish';
import { findDisallowedContent } from '../common/content-filter';
import { UploadsService } from '../uploads/uploads.service';
import { BlocksService } from '../users/blocks.service';
import {
  DELETED_USER_FIRST_NAME,
  DELETED_USER_LAST_NAME,
} from '../users/user.entity';
import {
  LEGACY_DISLIKE_MAX_RATING,
  LEGACY_LIKE_MIN_RATING,
  splitTopics,
} from './topics';

const LIKES_COUNT_SQL =
  '(SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id)';

/** Bu kadar açık şikayet alan yorum inceleme için otomatik gizlenir (#24). */
export const AUTO_HIDE_REPORT_COUNT = 3;

@Injectable()
export class ReviewsService implements OnModuleInit {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(ReviewLike)
    private readonly likeRepo: Repository<ReviewLike>,
    @InjectRepository(ReviewReport)
    private readonly reportRepo: Repository<ReviewReport>,
    private readonly carsService: CarsService,
    private readonly uploadsService: UploadsService,
    private readonly blocksService: BlocksService,
  ) {}

  /** Tek seferlik bakım: eski kendi-yorumunu-beğenmeler, arama indeksi, searchText ve konu dolgusu. */
  async onModuleInit() {
    try {
      const res: unknown = await this.likeRepo.query(
        `DELETE FROM review_likes rl USING reviews r
          WHERE rl.review_id = r.id AND rl.user_id = r.user_id`,
      );
      const removed = Array.isArray(res) ? Number(res[1] ?? 0) : 0;
      if (removed > 0)
        this.logger.log(`${removed} kendi yorumuna verilmiş beğeni silindi`);
    } catch (err) {
      this.logger.warn(`Self-like temizliği başarısız: ${String(err)}`);
    }

    try {
      await this.reviewRepo.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await this.reviewRepo.query(
        'CREATE INDEX IF NOT EXISTS idx_reviews_search_text_trgm ON reviews USING gin (search_text gin_trgm_ops)',
      );
    } catch (err) {
      this.logger.warn(
        `pg_trgm indeksi oluşturulamadı (LIKE yine çalışır): ${String(err)}`,
      );
    }

    try {
      // Ham SQL: updated_at'e dokunmadan (TypeORM update() UpdateDateColumn'u günceller)
      const missing = await this.reviewRepo.find({
        where: { searchText: IsNull() },
        select: ['id', 'title', 'content', 'topics'],
      });
      for (const r of missing) {
        await this.reviewRepo.query(
          'UPDATE reviews SET search_text = $1 WHERE id = $2',
          [buildSearchText(r), r.id],
        );
      }
      if (missing.length) {
        this.logger.log(`${missing.length} yorum için searchText dolduruldu`);
      }
    } catch (err) {
      this.logger.warn(`searchText dolgusu başarısız: ${String(err)}`);
    }

    // #31: eski tek `topics` listesini puana göre liked/disliked'a dağıt.
    // Sadece iki yeni kolon da NULL olan satırlar (bir kez çalışır).
    try {
      const res: unknown = await this.reviewRepo.query(
        `UPDATE reviews
            SET liked_topics    = CASE WHEN rating >= $1 THEN COALESCE(topics, '') ELSE '' END,
                disliked_topics = CASE WHEN rating <= $2 THEN COALESCE(topics, '') ELSE '' END
          WHERE liked_topics IS NULL AND disliked_topics IS NULL`,
        [LEGACY_LIKE_MIN_RATING, LEGACY_DISLIKE_MAX_RATING],
      );
      const n = Array.isArray(res) ? Number(res[1] ?? 0) : 0;
      if (n > 0)
        this.logger.log(`${n} yorumda topics → liked/disliked dağıtıldı`);
    } catch (err) {
      this.logger.warn(`Konu dolgusu başarısız: ${String(err)}`);
    }
  }

  // ---------- yazma ----------

  private assertContentAllowed(
    title: string | null | undefined,
    content: string | null | undefined,
  ) {
    const hit = findDisallowedContent(title, content);
    if (hit) {
      throw ApiException.badRequest(
        'Yorumunuz uygunsuz ifade içeriyor, lütfen düzenleyip tekrar deneyin',
        'ContentNotAllowed',
      );
    }
  }

  async create(
    userId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    await this.carsService.findSubModelByIdOnly(dto.carSubModelId);
    this.assertContentAllowed(dto.title, dto.content);

    const existing = await this.reviewRepo.findOne({
      where: { userId, carSubModelId: dto.carSubModelId },
    });
    if (existing) {
      throw ApiException.conflict(
        'Bu araç için zaten bir yorumunuz var, dilerseniz düzenleyebilirsiniz',
        'ReviewAlreadyExists',
      );
    }

    await this.uploadsService.validateImageIds(userId, dto.imageIds);

    const { imageIds, topics, likedTopics, dislikedTopics, ...fields } = dto;
    const split = splitTopics(
      { topics, likedTopics, dislikedTopics },
      dto.rating,
    );
    const review = this.reviewRepo.create({
      userId,
      ...fields,
      title: fields.title ?? null,
      kilometer: fields.kilometer ?? null,
      ...split,
      usageDuration: fields.usageDuration ?? null,
      status: 'visible',
      searchText: buildSearchText({ ...fields, topics: split.topics }),
    });
    const saved = await this.reviewRepo.save(review);
    await this.uploadsService.attachToReview(userId, saved.id, imageIds, {
      replace: false,
    });

    return this.findOne(saved.id, userId);
  }

  async update(
    userId: string,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review)
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');
    if (review.userId !== userId) {
      throw ApiException.forbidden(
        'Sadece kendi yorumunuzu düzenleyebilirsiniz',
      );
    }
    this.assertContentAllowed(
      dto.title !== undefined ? dto.title : review.title,
      dto.content !== undefined ? dto.content : review.content,
    );

    await this.uploadsService.validateImageIds(userId, dto.imageIds, reviewId);

    if (dto.content !== undefined) review.content = dto.content;
    if (dto.title !== undefined) review.title = dto.title;
    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.kilometer !== undefined) review.kilometer = dto.kilometer;
    if (dto.categoryRatings !== undefined)
      review.categoryRatings = dto.categoryRatings;
    if (dto.recommends !== undefined) review.recommends = dto.recommends;
    if (dto.usageDuration !== undefined)
      review.usageDuration = dto.usageDuration;

    const topicFieldsGiven =
      dto.topics !== undefined ||
      dto.likedTopics !== undefined ||
      dto.dislikedTopics !== undefined;
    if (topicFieldsGiven) {
      const hasNew =
        dto.likedTopics !== undefined || dto.dislikedTopics !== undefined;
      const split = splitTopics(
        hasNew
          ? {
              likedTopics: dto.likedTopics ?? review.likedTopics ?? [],
              dislikedTopics: dto.dislikedTopics ?? review.dislikedTopics ?? [],
            }
          : { topics: dto.topics },
        review.rating,
      );
      review.topics = split.topics;
      review.likedTopics = split.likedTopics;
      review.dislikedTopics = split.dislikedTopics;
    }

    review.searchText = buildSearchText(review);
    review.updatedAt = new Date();

    await this.reviewRepo.save(review);
    await this.uploadsService.attachToReview(userId, reviewId, dto.imageIds, {
      replace: true,
    });

    return this.findOne(reviewId, userId);
  }

  async deleteReview(userId: string, reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review)
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');
    if (review.userId !== userId) {
      throw ApiException.forbidden('Sadece kendi yorumunuzu silebilirsiniz');
    }
    await this.reviewRepo.remove(review);
  }

  async toggleLike(
    userId: string,
    reviewId: string,
  ): Promise<{ liked: boolean; likesCount: number }> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review || review.status !== 'visible')
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');
    if (review.userId === userId) {
      throw ApiException.forbidden(
        'Kendi yorumunu beğenemezsin',
        'CannotLikeOwnReview',
      );
    }

    const existing = await this.likeRepo.findOne({
      where: { userId, reviewId },
    });
    if (existing) {
      await this.likeRepo.remove(existing);
    } else {
      await this.likeRepo.save(this.likeRepo.create({ userId, reviewId }));
    }

    const likesCount = await this.likeRepo.count({ where: { reviewId } });
    return { liked: !existing, likesCount };
  }

  // ---------- şikayet (#22) ----------

  async report(
    userId: string,
    reviewId: string,
    dto: ReportReviewDto,
  ): Promise<{
    id: string;
    reviewId: string;
    reason: string;
    createdAt: Date;
  }> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review || review.status !== 'visible')
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');
    if (review.userId === userId) {
      throw ApiException.forbidden(
        'Kendi yorumunuzu şikayet edemezsiniz',
        'CannotReportOwnReview',
      );
    }
    const existing = await this.reportRepo.findOne({
      where: { reviewId, reporterId: userId },
    });
    if (existing) {
      throw ApiException.conflict(
        'Bu yorumu zaten şikayet ettiniz',
        'ReportAlreadyExists',
      );
    }

    const saved = await this.reportRepo.save(
      this.reportRepo.create({
        reviewId,
        reporterId: userId,
        reason: dto.reason,
        note: dto.note ?? null,
        status: 'open',
      }),
    );

    // 3 ayrı açık şikayet → inceleme için otomatik gizle
    const openCount = await this.reportRepo.count({
      where: { reviewId, status: 'open' },
    });
    if (openCount >= AUTO_HIDE_REPORT_COUNT && review.status === 'visible') {
      await this.reviewRepo.query(
        `UPDATE reviews SET status = 'hidden', hidden_reason = 'auto_reports', hidden_at = NOW()
          WHERE id = $1 AND status = 'visible'`,
        [reviewId],
      );
      this.logger.log(
        `Yorum ${reviewId} ${openCount} şikayet sonrası otomatik gizlendi`,
      );
    }

    return {
      id: saved.id,
      reviewId,
      reason: saved.reason,
      createdAt: saved.createdAt,
    };
  }

  // ---------- yönetim (#24) ----------

  async adminListReports(query: ListReportsDto) {
    const { page, limit, offset } = parsePage(query.page, query.limit, {
      maxLimit: 100,
    });
    const qb = this.reportRepo
      .createQueryBuilder('rep')
      .leftJoinAndSelect('rep.reporter', 'reporter')
      .leftJoinAndSelect('rep.review', 'r')
      .leftJoinAndSelect('r.user', 'author')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .orderBy('rep.createdAt', 'DESC');
    const status = query.status ?? 'open';
    if (status !== 'all') qb.where('rep.status = :status', { status });

    const [rows, total] = await qb
      .offset(offset)
      .limit(limit)
      .getManyAndCount();
    const reviewIds = Array.from(new Set(rows.map((r) => r.reviewId)));
    const counts = await this.openReportCounts(reviewIds);

    const data = rows.map((rep) => ({
      id: rep.id,
      reason: rep.reason,
      note: rep.note,
      status: rep.status,
      createdAt: rep.createdAt,
      resolvedAt: rep.resolvedAt,
      reporter: rep.reporter
        ? {
            id: rep.reporter.id,
            firstName: rep.reporter.firstName,
            lastName: rep.reporter.lastName,
            email: rep.reporter.email,
          }
        : null,
      review: rep.review
        ? {
            ...this.adminReviewSummary(rep.review),
            openReportCount: counts.get(rep.reviewId) ?? 0,
          }
        : null,
    }));
    return PaginatedResult.of(data, page, limit, total);
  }

  async adminListReviews(query: ListAdminReviewsDto) {
    const { page, limit, offset } = parsePage(query.page, query.limit, {
      maxLimit: 100,
    });
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .orderBy('r.createdAt', 'DESC');
    const status = query.status ?? 'hidden';
    if (status === 'reported') {
      qb.where(
        `EXISTS (SELECT 1 FROM review_reports rp WHERE rp.review_id = r.id AND rp.status = 'open')`,
      );
    } else if (status !== 'all') {
      qb.where('r.status = :status', { status });
    }
    const [rows, total] = await qb
      .offset(offset)
      .limit(limit)
      .getManyAndCount();
    const counts = await this.openReportCounts(rows.map((r) => r.id));
    const data = rows.map((r) => ({
      ...this.adminReviewSummary(r),
      openReportCount: counts.get(r.id) ?? 0,
    }));
    return PaginatedResult.of(data, page, limit, total);
  }

  /** Durumu değiştirir; yorumun açık şikayetleri çözüldü olarak işaretlenir. */
  async adminSetStatus(reviewId: string, dto: SetReviewStatusDto) {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review)
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');

    const hidden = dto.status === 'hidden';
    await this.reviewRepo.query(
      `UPDATE reviews
          SET status = $2::varchar,
              hidden_reason = CASE WHEN $2::varchar = 'hidden' THEN 'manual' ELSE NULL END,
              hidden_at = CASE WHEN $2::varchar = 'hidden' THEN NOW() ELSE NULL END
        WHERE id = $1`,
      [reviewId, dto.status],
    );
    await this.reportRepo.update(
      { reviewId, status: 'open' },
      { status: 'resolved', resolvedAt: new Date() },
    );
    this.logger.log(
      `Yorum ${reviewId} yönetim tarafından ${hidden ? 'gizlendi' : 'görünür yapıldı'}`,
    );
    return this.findOne(reviewId, null, { includeHidden: true });
  }

  async adminDelete(reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review)
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');
    await this.reviewRepo.remove(review);
  }

  private async openReportCounts(
    reviewIds: string[],
  ): Promise<Map<string, number>> {
    if (!reviewIds.length) return new Map();
    const rows = await this.reportRepo
      .createQueryBuilder('rp')
      .select('rp.review_id', 'review_id')
      .addSelect('COUNT(*)::int', 'c')
      .where('rp.review_id IN (:...ids)', { ids: reviewIds })
      .andWhere(`rp.status = 'open'`)
      .groupBy('rp.review_id')
      .getRawMany<{ review_id: string; c: number }>();
    return new Map(rows.map((r) => [r.review_id, Number(r.c)]));
  }

  private adminReviewSummary(r: Review) {
    const deleted = !!r.user?.deletedAt;
    return {
      id: r.id,
      title: r.title ?? null,
      content: r.content,
      rating: r.rating,
      status: r.status,
      hiddenReason: r.hiddenReason ?? null,
      hiddenAt: r.hiddenAt ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: {
        id: deleted ? null : r.userId,
        firstName: deleted
          ? DELETED_USER_FIRST_NAME
          : (r.user?.firstName ?? DELETED_USER_FIRST_NAME),
        lastName: deleted
          ? DELETED_USER_LAST_NAME
          : (r.user?.lastName ?? DELETED_USER_LAST_NAME),
        email: deleted ? null : (r.user?.email ?? null),
      },
      carSubModel: r.carSubModel
        ? {
            id: r.carSubModel.id,
            name: r.carSubModel.name,
            model: r.carSubModel.model?.name ?? null,
            brand: r.carSubModel.model?.brand?.name ?? null,
          }
        : null,
    };
  }

  // ---------- okuma ----------

  async findOne(
    reviewId: string,
    viewerId: string | null,
    opts: { includeHidden?: boolean } = {},
  ): Promise<ReviewResponseDto> {
    const review = await this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .where('r.id = :reviewId', { reviewId })
      .getOne();
    if (!review)
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');
    const isOwner = viewerId !== null && review.userId === viewerId;
    if (review.status !== 'visible' && !isOwner && !opts.includeHidden)
      throw ApiException.notFound('Yorum bulunamadı', 'ReviewNotFound');
    const [dto] = await this.hydrate([review], viewerId, {
      withCarSubModel: true,
    });
    return dto;
  }

  /** Herkese açık listelerde: sadece görünür yorumlar, engellenen yazarlar hariç. */
  private async applyPublicVisibility(
    qb: SelectQueryBuilder<Review>,
    viewerId: string | null,
  ) {
    qb.andWhere(`r.status = 'visible'`);
    const blocked = await this.blocksService.blockedIdsFor(viewerId);
    if (blocked.length) {
      qb.andWhere('r.userId NOT IN (:...blocked)', { blocked });
    }
  }

  private applyListFilters(
    qb: SelectQueryBuilder<Review>,
    query: ListReviewsDto,
  ) {
    const q = query.q?.trim();
    if (q && q.length >= 2) {
      const normalized = normalizeTurkish(q).replace(
        /[%_\\]/g,
        (m) => `\\${m}`,
      );
      qb.andWhere('r.searchText LIKE :q', { q: `%${normalized}%` });
    }
    if (query.topic) {
      // `topics` liked + disliked birleşimidir (eski kayıtlarda tek liste): iki alanda da arar.
      qb.andWhere(`(',' || COALESCE(r.topics, '') || ',') LIKE :topic`, {
        topic: `%,${query.topic},%`,
      });
    }
    if (query.ratings && query.ratings.length > 0) {
      qb.andWhere('r.rating IN (:...ratings)', { ratings: query.ratings });
    }
  }

  private applySort(
    qb: SelectQueryBuilder<Review>,
    sort: ListReviewsDto['sort'],
  ) {
    switch (sort) {
      case 'highest':
        qb.orderBy('r.rating', 'DESC').addOrderBy('r.createdAt', 'DESC');
        break;
      case 'lowest':
        qb.orderBy('r.rating', 'ASC').addOrderBy('r.createdAt', 'DESC');
        break;
      case 'mostLiked':
        // Beğenisi olmayanlar da döner, sona gelir (inner join yok).
        qb.addSelect(LIKES_COUNT_SQL, 'likes_count')
          .orderBy('likes_count', 'DESC')
          .addOrderBy('r.createdAt', 'DESC');
        break;
      default:
        qb.orderBy('r.createdAt', 'DESC');
    }
  }

  async findBySubModel(
    carSubModelId: string,
    query: ListReviewsDto,
    viewerId: string | null,
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    await this.carsService.findSubModelByIdOnly(carSubModelId);
    const { page, limit, offset } = parsePage(query.page, query.limit);

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .where('r.carSubModelId = :carSubModelId', { carSubModelId });
    await this.applyPublicVisibility(qb, viewerId);
    this.applyListFilters(qb, query);

    const total = await qb.getCount();
    this.applySort(qb, query.sort);

    const reviews = await qb.offset(offset).limit(limit).getMany();
    const data = await this.hydrate(reviews, viewerId, {
      withCarSubModel: false,
    });
    return PaginatedResult.of(data, page, limit, total);
  }

  /** Model (kuşak) düzeyinde yorumlar: modelin tüm alt modelleri (#32). */
  async findByModel(
    modelId: string,
    query: ListReviewsDto,
    viewerId: string | null,
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    await this.carsService.findModelByIdOnly(modelId);
    const { page, limit, offset } = parsePage(query.page, query.limit);

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .innerJoinAndSelect('r.carSubModel', 'carSubModel')
      .innerJoinAndSelect('carSubModel.model', 'model')
      .innerJoinAndSelect('model.brand', 'brand')
      .where('carSubModel.modelId = :modelId', { modelId });
    await this.applyPublicVisibility(qb, viewerId);
    this.applyListFilters(qb, query);

    const total = await qb.getCount();
    this.applySort(qb, query.sort);

    const reviews = await qb.offset(offset).limit(limit).getMany();
    const data = await this.hydrate(reviews, viewerId, {
      withCarSubModel: true,
    });
    return PaginatedResult.of(data, page, limit, total);
  }

  async findRecent(
    limit = 10,
    viewerId: string | null,
  ): Promise<ReviewResponseDto[]> {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .where('1 = 1');
    await this.applyPublicVisibility(qb, viewerId);
    const reviews = await qb
      .orderBy('r.createdAt', 'DESC')
      .limit(Math.min(Math.max(limit, 1), 50))
      .getMany();
    return this.hydrate(reviews, viewerId, { withCarSubModel: true });
  }

  /** Kendi yorumları: gizli olanlar da döner (`status` ile). */
  async findByUser(userId: string): Promise<ReviewResponseDto[]> {
    const reviews = await this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .where('r.userId = :userId', { userId })
      .orderBy('r.createdAt', 'DESC')
      .getMany();
    return this.hydrate(reviews, userId, { withCarSubModel: true });
  }

  /** Beğeni sayısı, isLikedByMe, fotoğraflar ve kullanıcı bilgisini tek seferde ekler. */
  private async hydrate(
    reviews: Review[],
    viewerId: string | null,
    opts: { withCarSubModel: boolean },
  ): Promise<ReviewResponseDto[]> {
    if (reviews.length === 0) return [];
    const ids = reviews.map((r) => r.id);

    const [likeRows, likedRows, images] = await Promise.all([
      this.likeRepo
        .createQueryBuilder('rl')
        .select('rl.review_id', 'review_id')
        .addSelect('COUNT(*)::int', 'c')
        .where('rl.review_id IN (:...ids)', { ids })
        .groupBy('rl.review_id')
        .getRawMany<{ review_id: string; c: number }>(),
      viewerId
        ? this.likeRepo.find({
            where: { userId: viewerId, reviewId: In(ids) },
            select: ['reviewId'],
          })
        : Promise.resolve([] as ReviewLike[]),
      this.uploadsService.imagesForReviews(ids),
    ]);
    const likes = new Map(likeRows.map((l) => [l.review_id, Number(l.c)]));
    const liked = new Set(likedRows.map((l) => l.reviewId));

    return reviews.map((r) => {
      const deleted = !!r.user?.deletedAt;
      const imgs = images.get(r.id) ?? [];
      const status: ReviewStatus = r.status ?? 'visible';
      const dto: ReviewResponseDto = {
        id: r.id,
        content: r.content,
        title: r.title ?? null,
        rating: r.rating,
        kilometer: r.kilometer ?? null,
        topics: r.topics ?? [],
        likedTopics: r.likedTopics ?? [],
        dislikedTopics: r.dislikedTopics ?? [],
        categoryRatings: r.categoryRatings ?? null,
        recommends: r.recommends ?? null,
        usageDuration: r.usageDuration ?? null,
        images: imgs.map((i) => i.url),
        imageIds: imgs.map((i) => i.id),
        status,
        hiddenReason: status === 'hidden' ? (r.hiddenReason ?? null) : null,
        likesCount: likes.get(r.id) ?? 0,
        isLikedByMe: liked.has(r.id),
        isMine: viewerId !== null && r.userId === viewerId,
        carSubModelId: r.carSubModelId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: {
          id: deleted ? null : r.userId,
          firstName: deleted
            ? DELETED_USER_FIRST_NAME
            : (r.user?.firstName ?? DELETED_USER_FIRST_NAME),
          lastName: deleted
            ? DELETED_USER_LAST_NAME
            : (r.user?.lastName ?? DELETED_USER_LAST_NAME),
        },
      };
      if (opts.withCarSubModel && r.carSubModel) {
        const s = r.carSubModel;
        dto.carSubModel = {
          id: s.id,
          name: s.name,
          trimName: s.trimName ?? null,
          generation: s.generation ?? null,
          yearFrom: s.yearFrom ?? null,
          yearTo: s.yearTo ?? null,
          model: {
            id: s.model.id,
            name: s.model.name,
            brand: { id: s.model.brand.id, name: s.model.brand.name },
          },
        };
      }
      return dto;
    });
  }
}
