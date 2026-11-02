import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Şema senkronizasyonu: NODE_ENV production değilse açık (mevcut davranış).
 * Production'da da açmak için DB_SYNC=true verilebilir (yalnızca kolon
 * ekleyen değişikliklerde; migration altyapısı yok).
 */
export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  autoLoadEntities: true,
  synchronize:
    process.env.DB_SYNC === 'true' ||
    (process.env.DB_SYNC !== 'false' && process.env.NODE_ENV !== 'production'),
});
