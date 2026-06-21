import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Review } from '../review.entity';

@Entity('review_likes')
@Unique(['userId', 'reviewId'])
export class ReviewLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'review_id' })
  reviewId: string;

  @ManyToOne(() => Review, (r) => r.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
