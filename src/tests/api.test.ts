import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('API Route Validation & Error Handling', () => {
  it('GET /health should return 200 OK', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('POST /generate should reject requests missing Idempotency-Key with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/generate')
      .send({
        tenant_id: '00000000-0000-0000-0000-000000000001',
        input_tokens: 100,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.ok(res.body.message.includes('Idempotency-Key'));
  });

  it('POST /generate should reject requests missing tenant_id with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/generate')
      .set('Idempotency-Key', 'test-key-123')
      .send({
        input_tokens: 100,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.ok(res.body.message.includes('tenant_id'));
  });

  it('POST /generate should reject negative token counts with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/generate')
      .set('Idempotency-Key', 'test-key-negative')
      .send({
        tenant_id: '00000000-0000-0000-0000-000000000001',
        input_tokens: -50,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.ok(res.body.message.includes('non-negative'));
  });

  it('GET /usage should reject requests missing tenant_id with 400 Bad Request', async () => {
    const res = await request(app).get('/usage');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.ok(res.body.message.includes('tenant_id'));
  });
});
