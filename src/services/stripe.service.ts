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

    // Upsert subscription to Pro plan
    await client.query(`
      INSERT INTO subscriptions (
        tenant_id, plan_id, stripe_customer_id, stripe_subscription_id, 
        status, current_period_start, current_period_end, updated_at
      ) VALUES ($1, 'pro', $2, $3, 'active', $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        plan_id = 'pro',
        status = 'active',
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = CURRENT_TIMESTAMP;
    `, [tenantId, stripeCustomerId, stripeSubscriptionId, periodStart.toISOString(), periodEnd.toISOString()]);

    // Update existing records for tenant if necessary
    await client.query(`
      UPDATE subscriptions 
      SET plan_id = 'pro', status = 'active', stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND (stripe_subscription_id IS NULL OR stripe_subscription_id = $3);
    `, [tenantId, stripeCustomerId, stripeSubscriptionId]);
  }

  private static async processSubscriptionUpdated(client: any, subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId = subscription.customer as string;
    const status = subscription.status; // 'active', 'past_due', 'unpaid', 'canceled', etc.

    const periodStart = new Date(subscription.current_period_start * 1000);
    const periodEnd = new Date(subscription.current_period_end * 1000);

    await client.query(`
      UPDATE subscriptions
      SET 
        status = $1,
        stripe_customer_id = $2,
        current_period_start = $3,
        current_period_end = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE stripe_subscription_id = $5;
    `, [status, stripeCustomerId, periodStart.toISOString(), periodEnd.toISOString(), stripeSubscriptionId]);
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
