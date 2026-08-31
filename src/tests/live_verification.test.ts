import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../config/database.js';
import { DEMO_TENANT_ID } from '../db/seed.js';

const app = createApp();

describe('Live PostgreSQL & End-to-End Billing Engine Verification', () => {
  after(async () => {
    await pool.end();
  });

  const testKey = `idempotency-live-check-${Date.now()}`;

  it('POST /generate (First request) should record usage and return replayed=false', async () => {
    const res = await request(app)
      .post('/generate')
      .set('Idempotency-Key', testKey)
      .send({
        tenant_id: DEMO_TENANT_ID,
        prompt: 'Live verification prompt',
        input_tokens: 1000,
        cached_input_tokens: 200,
        output_tokens: 500,
        reasoning_tokens: 100,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.replayed, false);
    assert.equal(res.body.data.usage.total_billable_tokens, 1600);
    assert.equal(res.body.data.cost.microcents, 4060);
  });

  it('POST /generate (Second request with same key) should return replayed=true without duplicating usage', async () => {
    const res = await request(app)
      .post('/generate')
      .set('Idempotency-Key', testKey)
      .send({
        tenant_id: DEMO_TENANT_ID,
        prompt: 'Live verification prompt',
        input_tokens: 1000,
        cached_input_tokens: 200,
        output_tokens: 500,
        reasoning_tokens: 100,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.replayed, true);
    assert.equal(res.body.data.idempotency_key, testKey);

    // Database verification query: exactly 1 row recorded for this key
    const dbRes = await pool.query(
      'SELECT COUNT(*)::INT AS count FROM usage_events WHERE tenant_id = $1 AND idempotency_key = $2;',
      [DEMO_TENANT_ID, testKey]
    );
    assert.equal(dbRes.rows[0].count, 1);
  });

  it('GET /usage?tenant_id=... should return aggregated monthly usage for demo tenant', async () => {
    const res = await request(app).get(`/usage?tenant_id=${DEMO_TENANT_ID}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.tenant_id, DEMO_TENANT_ID);
    assert.equal(res.body.data.plan, 'Free Plan');
    assert.ok(res.body.data.ai_tokens.used >= 1600);
    assert.equal(res.body.data.ai_tokens.limit, 100000);
  });
});
