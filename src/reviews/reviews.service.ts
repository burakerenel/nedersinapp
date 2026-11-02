import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Review } from './review.entity';
import { ReviewLike } from './entities/review-like.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { CarsService } from '../cars/cars.service';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ApiException } from '../common/exceptions/api.exception';
import { PaginatedResult, parsePage } from '../common/pagination';
import { buildSearchText, normalizeTurkish } from '../common/utils/turkish';
import { UploadsService } from '../uploads/uploads.service';
import {
  DELETED_USER_FIRST_NAME,
  DELETED_USER_LAST_NAME,
} from '../users/user.entity';

const LIKES_COUNT_SQL =
  '(SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id)';

@Injectable()
export class ReviewsService implements OnModuleInit {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(ReviewLike)
    private readonly likeRepo: Repository<ReviewLike>,
    private readonly carsService: CarsService,
    private readonly uploadsService: UploadsService,
  ) {}

  /** Tek seferlik bakım: eski kendi-yorumunu-beğenmeler, arama indeksi, searchText dolgusu. */
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
  }

  // ---------- yazma ----------

  async create(
    userId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    await this.carsService.findSubModelByIdOnly(dto.carSubModelId);

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

    const { imageIds, ...fields } = dto;
    const review = this.reviewRepo.create({
      userId,
      ...fields,
      title: fields.title ?? null,
      kilometer: fields.kilometer ?? null,
      topics: fields.topics ?? [],
      usageDuration: fields.usageDuration ?? null,
      searchText: buildSearchText(fields),
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

    await this.uploadsService.validateImageIds(userId, dto.imageIds, reviewId);

    if (dto.content !== undefined) review.content = dto.content;
    if (dto.title !== undefined) review.title = dto.title;
    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.kilometer !== undefined) review.kilometer = dto.kilometer;
    if (dto.topics !== undefined) review.topics = dto.topics;
    if (dto.categoryRatings !== undefined)
      review.categoryRatings = dto.categoryRatings;
    if (dto.recommends !== undefined) review.recommends = dto.recommends;
    if (dto.usageDuration !== undefined)
      review.usageDuration = dto.usageDuration;
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
    if (!review)
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

  // ---------- okuma ----------

  async findOne(
    reviewId: string,
    viewerId: string | null,
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
    const [dto] = await this.hydrate([review], viewerId, {
      withCarSubModel: true,
    });
    return dto;
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

    const q = query.q?.trim();
    if (q && q.length >= 2) {
      const normalized = normalizeTurkish(q).replace(
        /[%_\\]/g,
        (m) => `\\${m}`,
      );
      qb.andWhere('r.searchText LIKE :q', { q: `%${normalized}%` });
    }
    if (query.topic) {
      qb.andWhere(`(',' || COALESCE(r.topics, '') || ',') LIKE :topic`, {
        topic: `%,${query.topic},%`,
      });
    }
    if (query.ratings && query.ratings.length > 0) {
      qb.andWhere('r.rating IN (:...ratings)', { ratings: query.ratings });
    }

    const total = await qb.getCount();

    switch (query.sort) {
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

    const reviews = await qb.offset(offset).limit(limit).getMany();
    const data = await this.hydrate(reviews, viewerId, {
      withCarSubModel: false,
    });
    return PaginatedResult.of(data, page, limit, total);
  }

  async findRecent(
    limit = 10,
    viewerId: string | null,
  ): Promise<ReviewResponseDto[]> {
    const reviews = await this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.carSubModel', 'carSubModel')
      .leftJoinAndSelect('carSubModel.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .orderBy('r.createdAt', 'DESC')
      .limit(Math.min(Math.max(limit, 1), 50))
      .getMany();
    return this.hydrate(reviews, viewerId, { withCarSubModel: true });
  }

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
      this.uploadsService.urlsForReviews(ids),
    ]);
    const likes = new Map(likeRows.map((l) => [l.review_id, Number(l.c)]));
    const liked = new Set(likedRows.map((l) => l.reviewId));

    return reviews.map((r) => {
      const deleted = !!r.user?.deletedAt;
      const dto: ReviewResponseDto = {
        id: r.id,
        content: r.content,
        title: r.title ?? null,
        rating: r.rating,
        kilometer: r.kilometer ?? null,
        topics: r.topics ?? [],
        categoryRatings: r.categoryRatings ?? null,
        recommends: r.recommends ?? null,
        usageDuration: r.usageDuration ?? null,
        images: images.get(r.id) ?? [],
        likesCount: likes.get(r.id) ?? 0,
        isLikedByMe: liked.has(r.id),
        isMine: viewerId !== null && r.userId === viewerId,
        carSubModelId: r.carSubModelId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: {
          id: r.userId,
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
