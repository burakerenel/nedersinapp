import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Dosya deposu. DigitalOcean Spaces (S3 uyumlu) ayarlıysa oraya, değilse
 * yerel diske (UPLOADS_DIR, /uploads/ altından statik servis) yazar.
 *
 * Spaces env:
 *   SPACES_BUCKET      zorunlu (örn. nedersin-uploads)
 *   SPACES_KEY         Spaces access key
 *   SPACES_SECRET      Spaces secret key
 *   SPACES_REGION      fra1 (varsayılan)
 *   SPACES_ENDPOINT    https://fra1.digitaloceanspaces.com (varsayılan region'dan türetilir)
 *   SPACES_PUBLIC_URL  CDN adresi, örn. https://nedersin-uploads.fra1.cdn.digitaloceanspaces.com
 *                      (boşsa https://<bucket>.<region>.digitaloceanspaces.com)
 *   SPACES_PREFIX      anahtar ön eki, örn. "test" → test/review-images/... (opsiyonel)
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket = process.env.SPACES_BUCKET || '';
  private readonly publicBase: string;
  private readonly prefix = (process.env.SPACES_PREFIX || '').replace(
    /^\/+|\/+$/g,
    '',
  );
  readonly localRoot = path.resolve(process.env.UPLOADS_DIR || 'uploads');

  constructor() {
    const region = process.env.SPACES_REGION || 'fra1';
    const key = process.env.SPACES_KEY;
    const secret = process.env.SPACES_SECRET;

    if (this.bucket && key && secret) {
      const endpoint =
        process.env.SPACES_ENDPOINT ||
        `https://${region}.digitaloceanspaces.com`;
      this.s3 = new S3Client({
        endpoint,
        region,
        forcePathStyle: false,
        credentials: { accessKeyId: key, secretAccessKey: secret },
      });
      this.publicBase = (
        process.env.SPACES_PUBLIC_URL ||
        `https://${this.bucket}.${region}.digitaloceanspaces.com`
      ).replace(/\/+$/, '');
      this.logger.log(
        `Depo: DigitalOcean Spaces (${this.bucket} @ ${endpoint})`,
      );
    } else {
      this.s3 = null;
      this.publicBase = '';
      this.logger.warn(
        `SPACES_* tanımlı değil; dosyalar yerel diske yazılacak (${this.localRoot})`,
      );
    }
  }

  get kind(): 'spaces' | 'local' {
    return this.s3 ? 'spaces' : 'local';
  }

  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  /**
   * Dosyayı yazar ve herkese açık URL'ini döner.
   * `localBaseUrl` yalnızca yerel depoda kullanılır (PUBLIC_BASE_URL ya da istek adresi).
   */
  async put(
    key: string,
    body: Buffer,
    contentType: string,
    localBaseUrl: string,
  ): Promise<string> {
    if (this.s3) {
      const Key = this.fullKey(key);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key,
          Body: body,
          ContentType: contentType,
          ACL: 'public-read',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return `${this.publicBase}/${Key}`;
    }

    const file = path.join(this.localRoot, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return `${localBaseUrl.replace(/\/+$/, '')}/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      if (this.s3) {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: this.fullKey(key),
          }),
        );
      } else {
        await fs.rm(path.join(this.localRoot, key), { force: true });
      }
    } catch (err) {
      this.logger.warn(`Dosya silinemedi (${key}): ${String(err)}`);
    }
  }
}
