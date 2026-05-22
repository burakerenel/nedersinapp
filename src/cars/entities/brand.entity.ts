import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { CarModel } from './car-model.entity';

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  logo: string;

  @OneToMany(() => CarModel, (model) => model.brand, { cascade: true })
  models: CarModel[];
}
