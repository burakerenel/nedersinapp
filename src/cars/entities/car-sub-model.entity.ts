import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CarModel } from './car-model.entity';

export const FUEL_TYPES = [
  'gasoline',
  'diesel',
  'lpg',
  'hybrid',
  'electric',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ['manual', 'automatic', 'semi-automatic'] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const BODY_TYPES = [
  'sedan',
  'hatchback',
  'suv',
  'station-wagon',
  'coupe',
  'cabrio',
  'mpv',
  'pickup',
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

@Entity('car_sub_models')
export class CarSubModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tam ad: "Egea (356) · 1.3 Multijet II (95 bg) 2016 - 2019" (değişmez). */
  @Column()
  name: string;

  @Column({ name: 'engine_cc' })
  engineCC: number;

  @Column()
  year: number;

  // --- name'den ayrıştırılan alanlar (scripts/backfill-sub-models.ts) ---

  /** "1.3 Multijet II" — model adı ve yıl içermez. */
  @Column({ name: 'trim_name', type: 'varchar', nullable: true })
  trimName: string | null;

  /** "356", "B8, facelift 2019" */
  @Column({ type: 'varchar', nullable: true })
  generation: string | null;

  @Column({ name: 'horse_power', type: 'int', nullable: true })
  horsePower: number | null;

  @Index()
  @Column({ name: 'year_from', type: 'int', nullable: true })
  yearFrom: number | null;

  /** Devam eden üretimde null. */
  @Index()
  @Column({ name: 'year_to', type: 'int', nullable: true })
  yearTo: number | null;

  @Index()
  @Column({ name: 'fuel_type', type: 'varchar', length: 20, nullable: true })
  fuelType: FuelType | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  transmission: Transmission | null;

  @Index()
  @Column({ name: 'body_type', type: 'varchar', length: 20, nullable: true })
  bodyType: BodyType | null;

  @Column({ name: 'model_id' })
  modelId: string;

  @ManyToOne(() => CarModel, (model) => model.subModels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'model_id' })
  model: CarModel;
}
