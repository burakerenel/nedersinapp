import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Review } from '../reviews/review.entity';

@Entity('review_images')
export class ReviewImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Yoruma bağlanmadıysa null; 24 saat sonra temizlenir. */
  @Index()
  @Column({ name: 'review_id', type: 'uuid', nullable: true })
  reviewId: string | null;

  @ManyToOne(() => Review, (r) => r.images, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'review_id' })
  review: Review | null;

  /** Diskteki dosya adı (uploads/review-images/<id>.<ext>). */
  @Column({ name: 'storage_key' })
  storageKey: string;

  @Column()
  url: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ type: 'int' })
  size: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
