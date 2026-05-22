import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { CarSubModel } from '../cars/entities/car-sub-model.entity';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
