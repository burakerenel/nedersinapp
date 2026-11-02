import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Exclude, Expose } from 'class-transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ unique: true })
  email: string;

  /** Sadece sosyal girişle açılan hesaplarda boş olabilir. */
  @Column({ type: 'varchar', nullable: true })
  @Exclude()
  password: string | null;

  @Column({ name: 'terms_accepted', default: false })
  termsAccepted: boolean;

  @Index({ unique: true, where: '"google_id" IS NOT NULL' })
  @Column({ name: 'google_id', type: 'varchar', nullable: true })
  @Exclude()
  googleId: string | null;

  @Index({ unique: true, where: '"apple_id" IS NOT NULL' })
  @Column({ name: 'apple_id', type: 'varchar', nullable: true })
  @Exclude()
  appleId: string | null;

  /** Apple "Sign in" refresh token; hesap silinirken iptal için saklanır. */
  @Column({ name: 'apple_refresh_token', type: 'text', nullable: true })
  @Exclude()
  appleRefreshToken: string | null;

  /** Hesap silindiğinde dolar; kullanıcı anonimleşir, giriş yapamaz. */
  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  @Exclude()
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Expose()
  get hasPassword(): boolean {
    return !!this.password;
  }

  @Expose()
  get authProviders(): string[] {
    const p: string[] = [];
    if (this.password) p.push('password');
    if (this.googleId) p.push('google');
    if (this.appleId) p.push('apple');
    return p;
  }
}

export const DELETED_USER_FIRST_NAME = 'Silinmiş';
export const DELETED_USER_LAST_NAME = 'Kullanıcı';
