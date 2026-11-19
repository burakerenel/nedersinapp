import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { CarSubModel } from '../cars/entities/car-sub-model.entity';
import { ReviewLike } from './entities/review-like.entity';
import { ReviewImage } from '../uploads/review-image.entity';
import { CategoryRatings, UsageDuration } from './dto/create-review.dto';

export const REVIEW_STATUSES = ['visible', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Gizleme nedeni: otomatik (3 ayrı şikayet) ya da yönetim kararı. */
export const HIDDEN_REASONS = ['auto_reports', 'manual'] as const;
export type HiddenReason = (typeof HIDDEN_REASONS)[number];

@Entity('reviews')
@Index(['userId', 'carSubModelId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  title: string | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  rating: number;

  @Column({ nullable: true, type: 'int' })
  kilometer: number | null;

  /** Tüm konular (liked + disliked birleşimi; eski kayıtlarda tek liste). Arama ve `topic` filtresi bunu kullanır. */
  @Column({ type: 'simple-array', nullable: true })
  topics: string[];

  /** Sevilen konular (iş listesi #31). */
  @Column({ name: 'liked_topics', type: 'simple-array', nullable: true })
  likedTopics: string[] | null;

  /** Sevilmeyen konular; kronik sorunlar yalnızca bundan üretilir. */
  @Column({ name: 'disliked_topics', type: 'simple-array', nullable: true })
  dislikedTopics: string[] | null;

  /** `hidden` yorum herkese açık listelerde ve istatistiklerde yer almaz (iş listesi #24). */
  @Index()
  @Column({ type: 'varchar', length: 10, default: 'visible' })
  status: ReviewStatus;

  @Column({
    name: 'hidden_reason',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  hiddenReason: HiddenReason | null;

  @Column({ name: 'hidden_at', type: 'timestamp', nullable: true })
  hiddenAt: Date | null;

  /** 6 kategori puanı: comfort, interior, performance, value, exterior, reliability (1-5). */
  @Column({ name: 'category_ratings', type: 'jsonb', nullable: true })
  categoryRatings: CategoryRatings | null;

  @Column({ type: 'boolean', nullable: true })
  recommends: boolean | null;

  @Column({
    name: 'usage_duration',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  usageDuration: UsageDuration | null;

  /** Başlık + metin + konular, küçük harf ve Türkçe karakterleri sadeleştirilmiş (arama). */
  @Column({ name: 'search_text', type: 'text', nullable: true })
  searchText: string | null;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ name: 'car_sub_model_id' })
  carSubModelId: string;

  @ManyToOne(() => CarSubModel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'car_sub_model_id' })
  carSubModel: CarSubModel;

  @OneToMany(() => ReviewLike, (like) => like.review)
  likes: ReviewLike[];

  @OneToMany(() => ReviewImage, (img) => img.review)
  images: ReviewImage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
