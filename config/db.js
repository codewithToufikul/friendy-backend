import { Pool } from 'pg';
import config from './env.js';

if (!config.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL is not set. Set it in .env');
}

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PG error', err);
});

