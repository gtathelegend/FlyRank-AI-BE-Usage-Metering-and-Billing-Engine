import { fileURLToPath } from 'url';
import { pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);

export const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function seedDatabase() {
  console.log('[Seed] Starting deterministic database seeding...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Plans
    await client.query(`
      INSERT INTO plans (id, name, api_call_limit, ai_token_limit, price_cents, currency, billing_interval)
      VALUES 
        ('free', 'Free Plan', 1000, 100000, 0, 'usd', 'month'),
        ('pro', 'Pro Plan', 50000, 5000000, 4900, 'usd', 'month')
      ON CONFLICT (id) DO UPDATE SET
        api_call_limit = EXCLUDED.api_call_limit,
        ai_token_limit = EXCLUDED.ai_token_limit,
        price_cents = EXCLUDED.price_cents;
    `);

    // 2. Seed Demo Tenant
    await client.query(`
      INSERT INTO tenants (id, name)
      VALUES ($1, 'Demo Tenant Inc.')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `, [DEMO_TENANT_ID]);

    // 3. Seed Demo Tenant Subscription (Free Plan)
    const now = new Date();
    const startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    await client.query('DELETE FROM subscriptions WHERE tenant_id = $1;', [DEMO_TENANT_ID]);
    await client.query(`
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
      VALUES ($1, 'free', 'active', $2, $3);
    `, [DEMO_TENANT_ID, startOfPeriod.toISOString(), endOfPeriod.toISOString()]);

    await client.query('COMMIT');
    console.log('[Seed] Successfully seeded plans, demo tenant, and default subscription.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Seed] Error seeding database:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === __filename) {
  seedDatabase()
    .then(() => {
      console.log('[Seed] Seeding completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Seeding failed:', err);
      process.exit(1);
    });
}
