import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ReviewImage } from './review-image.entity';
import { ApiException } from '../common/exceptions/api.exception';
import { StorageService } from './storage.service';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_REVIEW = 2;
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/heic-sequence': 'heic',
};
const EXT_FALLBACK: Record<string, string> = {
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.png': 'png',
  '.heic': 'heic',
  '.heif': 'heic',
};

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Yorum fotoğrafları. Depo: DigitalOcean Spaces (SPACES_* env) ya da yerel disk
 * (bkz. StorageService). `storageKey` = "review-images/<id>.<ext>".
 */
@Injectable()
export class UploadsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ReviewImage)
    private readonly imageRepo: Repository<ReviewImage>,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.cleanupOrphans(), 60 * 60 * 1000);
    void this.cleanupOrphans();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private resolveExt(file: UploadedFile): string | null {
    const byMime = ALLOWED[file.mimetype?.toLowerCase()];
    if (byMime) return byMime;
    // Bazı istemciler HEIC'i application/octet-stream olarak gönderir
    const ext = path.extname(file.originalname || '').toLowerCase();
    return EXT_FALLBACK[ext] ?? null;
  }

  async storeReviewImage(
    userId: string,
    file: UploadedFile | undefined,
    baseUrl: string,
  ): Promise<{ id: string; url: string }> {
    if (!file) {
      throw ApiException.validation('Dosya zorunlu', { file: 'zorunlu' });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ApiException(413, 'FileTooLarge', 'Dosya 5 MB sınırını aşıyor');
    }
    const ext = this.resolveExt(file);
    if (!ext) {
      throw new ApiException(
        415,
        'UnsupportedFileType',
        'Sadece JPG, PNG ve HEIC dosyaları yüklenebilir',
      );
    }

    const id = randomUUID();
    const storageKey = `review-images/${id}.${ext}`;
    const mimeType = ALLOWED[file.mimetype?.toLowerCase()]
      ? file.mimetype
      : `image/${ext}`;
    const url = await this.storage.put(
      storageKey,
      file.buffer,
      mimeType,
      baseUrl,
    );

    const image = await this.imageRepo.save(
      this.imageRepo.create({
        id,
        userId,
        reviewId: null,
        storageKey,
        url,
        mimeType,
        size: file.size,
      }),
    );
    return { id: image.id, url: image.url };
  }

  /**
   * Fotoğrafları yoruma bağlar. Id'ler kullanıcıya ait ve ya boşta ya da
   * aynı yoruma bağlı olmalı. PATCH'te listede olmayan eski fotoğraflar
   * yorumdan ayrılır (24 saat sonra temizlenir).
   */
  async attachToReview(
    userId: string,
    reviewId: string,
    imageIds: string[] | undefined,
    options: { replace: boolean },
  ): Promise<void> {
    if (imageIds === undefined) return;
    const ids = Array.from(new Set(imageIds));
    if (ids.length > MAX_IMAGES_PER_REVIEW) {
      throw ApiException.validation(
        'Bir yoruma en fazla 2 fotoğraf eklenebilir',
        {
          imageIds: 'en fazla 2 fotoğraf eklenebilir',
        },
      );
    }

    const images = ids.length
      ? await this.imageRepo.find({ where: { id: In(ids), userId } })
      : [];
    if (images.length !== ids.length) {
      throw ApiException.validation(
        'Fotoğraf bulunamadı ya da size ait değil',
        {
          imageIds: 'geçersiz fotoğraf kimliği',
        },
      );
    }
    for (const img of images) {
      if (img.reviewId && img.reviewId !== reviewId) {
        throw ApiException.validation('Fotoğraf başka bir yoruma bağlı', {
          imageIds: 'fotoğraf başka bir yoruma bağlı',
        });
      }
    }

    if (options.replace) {
      await this.imageRepo
        .createQueryBuilder()
        .update(ReviewImage)
        .set({ reviewId: null })
        .where('review_id = :reviewId', { reviewId })
        .andWhere(ids.length ? 'id NOT IN (:...ids)' : '1=1', { ids })
        .execute();
    }
    if (ids.length) {
      await this.imageRepo.update({ id: In(ids) }, { reviewId });
    }
  }

  async validateImageIds(
    userId: string,
    imageIds: string[] | undefined,
    reviewId?: string,
  ) {
    if (!imageIds) return;
    const ids = Array.from(new Set(imageIds));
    if (ids.length > MAX_IMAGES_PER_REVIEW) {
      throw ApiException.validation(
        'Bir yoruma en fazla 2 fotoğraf eklenebilir',
        {
          imageIds: 'en fazla 2 fotoğraf eklenebilir',
        },
      );
    }
    if (!ids.length) return;
    const images = await this.imageRepo.find({
      where: { id: In(ids), userId },
    });
    if (images.length !== ids.length) {
      throw ApiException.validation(
        'Fotoğraf bulunamadı ya da size ait değil',
        {
          imageIds: 'geçersiz fotoğraf kimliği',
        },
      );
    }
    if (images.some((i) => i.reviewId && i.reviewId !== reviewId)) {
      throw ApiException.validation('Fotoğraf başka bir yoruma bağlı', {
        imageIds: 'fotoğraf başka bir yoruma bağlı',
      });
    }
  }

  async urlsForReviews(reviewIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!reviewIds.length) return map;
    const images = await this.imageRepo.find({
      where: { reviewId: In(reviewIds) },
      order: { createdAt: 'ASC' },
    });
    for (const img of images) {
      if (!img.reviewId) continue;
      const list = map.get(img.reviewId) ?? [];
      list.push(img.url);
      map.set(img.reviewId, list);
    }
    return map;
  }

  /** 24 saat içinde yoruma bağlanmamış fotoğrafları siler. */
  async cleanupOrphans(): Promise<number> {
    try {
      const orphans = await this.imageRepo.find({
        where: {
          reviewId: IsNull(),
          createdAt: LessThan(new Date(Date.now() - ORPHAN_TTL_MS)),
        },
        take: 500,
      });
      for (const img of orphans) {
        await this.storage.delete(img.storageKey);
      }
      if (orphans.length) {
        await this.imageRepo.delete({ id: In(orphans.map((o) => o.id)) });
        this.logger.log(`${orphans.length} sahipsiz fotoğraf temizlendi`);
      }
      return orphans.length;
    } catch (err) {
      this.logger.warn(`Fotoğraf temizliği başarısız: ${String(err)}`);
      return 0;
    }
  }
}
