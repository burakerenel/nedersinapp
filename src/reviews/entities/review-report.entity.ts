import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Review } from '../review.entity';

export const REPORT_REASONS = [
  'spam',
  'abuse',
  'false_info',
  'personal_data',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'resolved'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Yorum şikayeti (iş listesi #22). Aynı kullanıcı aynı yorumu bir kez şikayet edebilir. */
@Entity('review_reports')
@Unique(['reviewId', 'reporterId'])
export class ReviewReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'review_id', type: 'uuid' })
  reviewId: string;

  @ManyToOne(() => Review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({ type: 'varchar', length: 20 })
  reason: ReportReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Index()
  @Column({ type: 'varchar', length: 10, default: 'open' })
  status: ReportStatus;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
