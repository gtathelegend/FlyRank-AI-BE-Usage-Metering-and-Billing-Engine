import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { StripeService, SignatureVerificationError } from '../services/stripe.service.js';
import { CONFIG } from '../config/index.js';

const app = createApp();

describe('Stripe Checkout & Webhook Service Layer', () => {
  it('should define SignatureVerificationError with HTTP 400 status', () => {
    const err = new SignatureVerificationError('Bad signature');
    assert.equal(err.status, 400);
    assert.equal(err.message, 'Bad signature');
  });

  it('POST /webhooks/stripe should reject requests missing Stripe-Signature header with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt_test_123', type: 'ping' }));

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.ok(res.body.message.includes('Stripe-Signature'));
  });

  it('POST /webhooks/stripe should reject invalid signature with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Stripe-Signature', 't=1234567,v1=invalid_signature')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt_test_invalid', type: 'checkout.session.completed' }));

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.ok(res.body.message.includes('signature verification failed'));
  });

  it('POST /checkout/session should validate required tenant_id body parameter', async () => {
    const res = await request(app)
      .post('/checkout/session')
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.ok(res.body.message.includes('tenant_id'));
  });

  it('should verify configured Pro price ID is passed to Stripe configuration', () => {
    assert.ok(CONFIG.STRIPE.PRICE_PRO);
    assert.ok(CONFIG.STRIPE.SECRET_KEY.startsWith('sk_test_') || CONFIG.STRIPE.SECRET_KEY === 'sk_test_placeholder');
  });
});
