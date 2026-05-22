import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Brand } from './brand.entity';
import { CarSubModel } from './car-sub-model.entity';

@Entity('car_models')
export class CarModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'brand_id' })
  brandId: string;

  @ManyToOne(() => Brand, (brand) => brand.models, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @OneToMany(() => CarSubModel, (sub) => sub.model, { cascade: true })
  subModels: CarSubModel[];
}
