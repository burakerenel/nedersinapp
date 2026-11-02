/* Script'ler için ortak Postgres bağlantısı (.env okur). */
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export function createClient(): Client {
  return new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}
