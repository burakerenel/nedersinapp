import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { CarSubModel } from '../cars/entities/car-sub-model.entity';
import { ReviewLike } from './entities/review-like.entity';

@Entity('reviews')
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

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'car_sub_model_id' })
  carSubModelId: string;

  @ManyToOne(() => CarSubModel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'car_sub_model_id' })
  carSubModel: CarSubModel;

  @OneToMany(() => ReviewLike, (like) => like.review)
  likes: ReviewLike[];

  likesCount?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
