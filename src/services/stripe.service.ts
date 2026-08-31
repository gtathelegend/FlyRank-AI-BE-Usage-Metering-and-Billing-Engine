import Stripe from 'stripe';
import { CONFIG } from '../config/index.js';
import { pool } from '../config/database.js';
import { TenantNotFoundError } from './meter.service.js';

export class SignatureVerificationError extends Error {
  public status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

export class StripeService {
  private static stripeClient: Stripe | null = null;

  /**
   * Lazy getter for official Stripe SDK instance (Test Mode)
   */
  public static getStripe(): Stripe {
    if (!this.stripeClient) {
      this.stripeClient = new Stripe(CONFIG.STRIPE.SECRET_KEY, {
        apiVersion: '2023-10-16',
      });
    }
    return this.stripeClient;
  }

  /**
   * Creates a Stripe Checkout Session for upgrading a tenant to Pro plan.
   */
  public static async createCheckoutSession(tenant_id: string, successUrl?: string, cancelUrl?: string) {
    if (!tenant_id) {
      throw new Error('tenant_id is required');
    }

    // 1. Verify tenant exists
    const tenantRes = await pool.query('SELECT id, name FROM tenants WHERE id = $1', [tenant_id]);
    if (tenantRes.rows.length === 0) {
      throw new TenantNotFoundError(`Tenant with ID '${tenant_id}' not found`);
    }
    const tenant = tenantRes.rows[0];

    // 2. Fetch existing Stripe customer ID or create new customer in Stripe Test Mode
    let stripeCustomerId: string | null = null;
    const subRes = await pool.query(`
      SELECT stripe_customer_id FROM subscriptions 
      WHERE tenant_id = $1 AND stripe_customer_id IS NOT NULL 
      LIMIT 1;
    `, [tenant_id]);

    if (subRes.rows.length > 0) {
      stripeCustomerId = subRes.rows[0].stripe_customer_id;
    }

    const stripe = this.getStripe();

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: {
          tenant_id: tenant.id,
        },
      });
      stripeCustomerId = customer.id;
    }

    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [
        {
          price: CONFIG.STRIPE.PRICE_PRO,
          quantity: 1,
        },
      ],
      metadata: {
        tenant_id: tenant.id,
        plan_id: 'pro',
      },
      subscription_data: {
        metadata: {
          tenant_id: tenant.id,
          plan_id: 'pro',
        },
      },
      success_url: successUrl || 'http://localhost:8000/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'http://localhost:8000/billing/cancel',
    });

    return {
      checkout_url: session.url,
      session_id: session.id,
      customer_id: stripeCustomerId,
    };
  }

  /**
   * Verifies raw Stripe webhook signature and executes transaction-safe state sync & deduplication.
   */
  public static async handleWebhookEvent(rawBody: Buffer | string, signatureHeader: string | undefined) {
    if (!signatureHeader) {
      throw new SignatureVerificationError('Missing Stripe-Signature header');
    }

    const stripe = this.getStripe();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signatureHeader,
        CONFIG.STRIPE.WEBHOOK_SECRET
      );
    } catch (err: any) {
      throw new SignatureVerificationError(`Webhook signature verification failed: ${err.message}`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Transaction-safe event deduplication via stripe_events table (UNIQUE stripe_event_id)
      const dedupeRes = await client.query(`
        INSERT INTO stripe_events (stripe_event_id, event_type)
        VALUES ($1, $2)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING id;
      `, [event.id, event.type]);

      // Duplicate delivery -> safely return without re-applying state changes
      if (dedupeRes.rows.length === 0) {
        await client.query('COMMIT');
        return {
          received: true,
          event_id: event.id,
          event_type: event.type,
          duplicate: true,
          processed: false,
        };
      }

      // 2. Process required webhook event types
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await this.processCheckoutCompleted(client, session);
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.processSubscriptionUpdated(client, subscription);
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.processSubscriptionDeleted(client, subscription);
          break;
        }

        default:
          // Unknown or unhandled event type is safely logged and accepted
          console.log(`[Stripe Webhook] Ignored unhandled event type: ${event.type}`);
          break;
      }

      await client.query('COMMIT');
      return {
        received: true,
        event_id: event.id,
        event_type: event.type,
        duplicate: false,
        processed: true,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  private static async processCheckoutCompleted(client: any, session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenant_id;
    const stripeCustomerId = session.customer as string;
    const stripeSubscriptionId = session.subscription as string;

    if (!tenantId) {
      console.warn('[Stripe Webhook] checkout.session.completed missing tenant_id metadata');
      return;
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // 1. Try to update existing subscription row (matching sub ID or null sub ID for tenant)
    const updateRes = await client.query(`
      UPDATE subscriptions 
      SET 
        plan_id = 'pro', 
        status = 'active', 
        stripe_customer_id = COALESCE($2, stripe_customer_id), 
        stripe_subscription_id = COALESCE($3, stripe_subscription_id), 
        current_period_start = $4,
        current_period_end = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE (stripe_subscription_id IS NOT NULL AND stripe_subscription_id = $3)
         OR (tenant_id = $1 AND stripe_subscription_id IS NULL);
    `, [tenantId, stripeCustomerId, stripeSubscriptionId, periodStart.toISOString(), periodEnd.toISOString()]);

    // 2. If no existing row found, insert new subscription record
    if (updateRes.rowCount === 0) {
      await client.query(`
        INSERT INTO subscriptions (
          tenant_id, plan_id, stripe_customer_id, stripe_subscription_id, 
          status, current_period_start, current_period_end, updated_at
        ) VALUES ($1, 'pro', $2, $3, 'active', $4, $5, CURRENT_TIMESTAMP);
      `, [tenantId, stripeCustomerId, stripeSubscriptionId, periodStart.toISOString(), periodEnd.toISOString()]);
    }
  }

  private static async processSubscriptionUpdated(client: any, subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : (subscription.customer as any)?.id || null;
    const status = subscription.status || 'active'; // 'active', 'past_due', 'unpaid', 'canceled', etc.

    const rawStart = (subscription as any).current_period_start;
    const rawEnd = (subscription as any).current_period_end;

    let periodStart = rawStart && !isNaN(Number(rawStart)) ? new Date(Number(rawStart) * 1000) : new Date();
    let periodEnd = rawEnd && !isNaN(Number(rawEnd)) ? new Date(Number(rawEnd) * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (isNaN(periodStart.getTime())) {
      periodStart = new Date();
    }
    if (isNaN(periodEnd.getTime())) {
      periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // Attempt tenant mapping: existing sub record, sub metadata, or customer record
    const existingSub = await client.query(
      `SELECT tenant_id FROM subscriptions WHERE stripe_subscription_id = $1 LIMIT 1;`,
      [stripeSubscriptionId]
    );

    let tenantId: string | null = existingSub.rows.length > 0 ? existingSub.rows[0].tenant_id : null;

    if (!tenantId && subscription.metadata?.tenant_id) {
      tenantId = subscription.metadata.tenant_id;
    }

    if (!tenantId && stripeCustomerId) {
      const custSub = await client.query(
        `SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1;`,
        [stripeCustomerId]
      );
      if (custSub.rows.length > 0) {
        tenantId = custSub.rows[0].tenant_id;
      }
    }

    if (!tenantId) {
      console.warn(`[Stripe Webhook] customer.subscription.updated received for unmapped tenant/subscription: ${stripeSubscriptionId}`);
      return;
    }

    const planId = (subscription.metadata?.plan_id as string) || (status === 'canceled' ? 'free' : 'pro');

    // Update existing subscription record if available
    const updateRes = await client.query(`
      UPDATE subscriptions 
      SET 
        plan_id = $2, 
        status = $5, 
        stripe_customer_id = COALESCE($3, stripe_customer_id), 
        stripe_subscription_id = COALESCE($4, stripe_subscription_id), 
        current_period_start = $6,
        current_period_end = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE (stripe_subscription_id IS NOT NULL AND stripe_subscription_id = $4)
         OR (tenant_id = $1 AND stripe_subscription_id IS NULL);
    `, [tenantId, planId, stripeCustomerId, stripeSubscriptionId, status, periodStart.toISOString(), periodEnd.toISOString()]);

    // Insert new subscription record if tenant had no existing row
    if (updateRes.rowCount === 0) {
      await client.query(`
        INSERT INTO subscriptions (
          tenant_id, plan_id, stripe_customer_id, stripe_subscription_id, 
          status, current_period_start, current_period_end, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP);
      `, [tenantId, planId, stripeCustomerId, stripeSubscriptionId, status, periodStart.toISOString(), periodEnd.toISOString()]);
    }
  }

  private static async processSubscriptionDeleted(client: any, subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;

    // Update local subscription to canceled status and revert plan to free
    await client.query(`
      UPDATE subscriptions
      SET 
        status = 'canceled',
        plan_id = 'free',
        updated_at = CURRENT_TIMESTAMP
      WHERE stripe_subscription_id = $1;
    `, [stripeSubscriptionId]);
  }
}
