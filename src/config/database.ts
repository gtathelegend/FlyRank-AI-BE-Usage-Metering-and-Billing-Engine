import { Pool } from 'pg';
import { CONFIG } from './index.js';

export const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (CONFIG.NODE_ENV === 'development' && duration > 100) {
    console.log(`[DB Query] Slow query (${duration}ms):`, { text, rowCount: res.rowCount });
  }
  return res;
}
