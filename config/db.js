import { Pool } from 'pg';
import config from './env.js';

if (!config.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL is not set. Set it in .env');
}

// Neon/remote PG best practices: small pool, keepAlive, timeouts, SSL
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT || 10000),
  keepAlive: true,
  ssl: (() => {
    // Force SSL for Neon even in dev
    const isNeon = (config.DATABASE_URL || '').includes('neon.tech');
    if (config.NODE_ENV === 'production' || isNeon) return { rejectUnauthorized: false };
    return false;
  })(),
});

pool.on('error', (err) => {
  console.error('Unexpected PG error', err);
});

pool.on('connect', (client) => {
  try { client.query('SET application_name = \'friendy-api\''); } catch {}
});

// Simple retrying query helper (retries once on transient network errors)
export async function dbQuery(text, params, attempt = 1) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    const code = err?.code || err?.message || '';
    const transient = /ECONNRESET|ETIMEDOUT|ENETRESET|EPIPE|read ETIMEDOUT/i.test(String(code));
    if (transient && attempt < 2) {
      console.warn('[pg] transient error, retrying once...', { code: err?.code || err?.message });
      return dbQuery(text, params, attempt + 1);
    }
    throw err;
  }
}

// Warm-up ping to establish initial connection
export async function ensureDbReady() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PG pool ready');
  } catch (e) {
    console.warn('⚠️ PG warm-up failed', e?.message);
  }
}

