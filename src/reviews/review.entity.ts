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

  @Column({ type: 'simple-array', nullable: true })
  topics: string[];

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
