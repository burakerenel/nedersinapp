import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CarModel } from './car-model.entity';

@Entity('car_sub_models')
export class CarSubModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'engine_cc' })
  engineCC: number;

  @Column()
  year: number;

  @Column({ name: 'model_id' })
  modelId: string;

  @ManyToOne(() => CarModel, (model) => model.subModels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'model_id' })
  model: CarModel;
}
