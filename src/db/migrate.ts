import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('[Migration] Starting database migration...');
  const client = await pool.connect();
  try {
    const migrationPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Migration] Successfully executed 001_initial_schema.sql');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration] Failed to run database migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => {
      console.log('[Migration] Database migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] Migration error:', err);
      process.exit(1);
    });
}
