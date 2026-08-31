import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { StripeService, SignatureVerificationError } from '../services/stripe.service.js';
import { CONFIG } from '../config/index.js';
import Stripe from 'stripe';

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

  it('GET /billing/success should return 200 OK HTML response', async () => {
    const res = await request(app).get('/billing/success?session_id=cs_test_123');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Checkout Successful!'));
    assert.ok(res.text.includes('cs_test_123'));
  });

  it('GET /billing/cancel should return 200 OK HTML response', async () => {
    const res = await request(app).get('/billing/cancel');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Checkout Cancelled'));
  });

  it('POST /webhooks/stripe should handle valid signed customer.subscription.updated and replay idempotently', async () => {
    const stripeSecretKey = CONFIG.STRIPE.SECRET_KEY;
    const webhookSecret = CONFIG.STRIPE.WEBHOOK_SECRET;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    const eventId = `evt_sub_test_${Date.now()}`;
    const subEvent = {
      id: eventId,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `sub_test_unit_${Date.now()}`,
          object: 'subscription',
          customer: 'cus_unit_test',
          status: 'active',
          metadata: {
            tenant_id: '00000000-0000-0000-0000-000000000001',
            plan_id: 'pro',
          },
        },
      },
      type: 'customer.subscription.updated',
    };

    const payload = JSON.stringify(subEvent);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

    // First delivery
    const res1 = await request(app)
      .post('/webhooks/stripe')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.equal(res1.status, 200);
    assert.equal(res1.body.duplicate, false);
    assert.equal(res1.body.processed, true);

    // Replay delivery (Idempotency test)
    const res2 = await request(app)
      .post('/webhooks/stripe')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.equal(res2.status, 200);
    assert.equal(res2.body.duplicate, true);
    assert.equal(res2.body.processed, false);

    // Reset demo tenant subscription back to free for subsequent tests
    const { pool } = await import('../config/database.js');
    await pool.query("UPDATE subscriptions SET plan_id = 'free', stripe_subscription_id = NULL WHERE tenant_id = $1;", ['00000000-0000-0000-0000-000000000001']);
  });
});
