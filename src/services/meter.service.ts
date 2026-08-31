import { pool } from '../config/database.js';
import { PricingService, TokenBreakdown } from './pricing.service.js';

export class QuotaExceededError extends Error {
  public status = 429;
  public details: { usage_type: string; used: number; limit: number; requested: number };

  constructor(message: string, details: { usage_type: string; used: number; limit: number; requested: number }) {
    super(message);
    this.name = 'QuotaExceededError';
    this.details = details;
  }
}

export class BillingStatusError extends Error {
  public status = 402;
  constructor(message: string) {
    super(message);
    this.name = 'BillingStatusError';
  }
}

export class IdempotencyMismatchError extends Error {
  public status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyMismatchError';
  }
}

export class TenantNotFoundError extends Error {
  public status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'TenantNotFoundError';
  }
}

export interface RecordUsageInput {
  tenant_id: string;
  usage_type: 'api_call' | 'ai_token';
  quantity?: number;
  idempotency_key: string;
  token_breakdown?: TokenBreakdown;
  metadata?: Record<string, any>;
}

export interface MeterUsageResult {
  id: string;
  tenant_id: string;
  usage_type: string;
  quantity: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost_microcents: number;
  cost_cents: number;
  formatted_usd: string;
  idempotency_key: string;
  replayed: boolean;
  created_at: string;
}

export class MeterService {
  /**
   * Records usage for a tenant with synchronous quota pre-checking
   * and database-level idempotency protection.
   */
  public static async recordUsage(input: RecordUsageInput): Promise<MeterUsageResult> {
    const { tenant_id, usage_type, idempotency_key, metadata } = input;

    if (!tenant_id) {
      throw new Error('tenant_id is required');
    }
    if (!idempotency_key || typeof idempotency_key !== 'string' || idempotency_key.trim() === '') {
      throw new Error('Valid Idempotency-Key header is required');
    }

    let tokenBreakdown: TokenBreakdown = {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
    };

    let requestedQuantity = input.quantity || 1;

    if (usage_type === 'ai_token' && input.token_breakdown) {
      tokenBreakdown = input.token_breakdown;
      const pricing = PricingService.calculateTokenCost(tokenBreakdown);
      requestedQuantity = pricing.total_billable_tokens;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Validate Tenant existence
      const tenantRes = await client.query('SELECT id, name FROM tenants WHERE id = $1', [tenant_id]);
      if (tenantRes.rows.length === 0) {
        throw new TenantNotFoundError(`Tenant with ID '${tenant_id}' not found`);
      }

      // 2. Fetch Subscription and Plan limits (with ROW LOCK FOR SHARE to prevent period state changes)
      const subRes = await client.query(`
        SELECT 
          s.id AS subscription_id, s.status, s.current_period_start, s.current_period_end,
          p.id AS plan_id, p.name AS plan_name, p.api_call_limit, p.ai_token_limit
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        WHERE s.tenant_id = $1
        ORDER BY s.created_at DESC
        LIMIT 1
        FOR SHARE;
      `, [tenant_id]);

      if (subRes.rows.length === 0) {
        throw new BillingStatusError('No active subscription found for tenant');
      }

      const subscription = subRes.rows[0];

      if (subscription.status !== 'active') {
        throw new BillingStatusError(`Subscription status '${subscription.status}' requires payment/upgrade`);
      }

      // 3. Check Current Period Usage (Pre-Check Quota before billable execution)
      const usageRes = await client.query(`
        SELECT 
          COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'api_call'), 0)::INT AS used_api_calls,
          COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'ai_token'), 0)::INT AS used_ai_tokens
        FROM usage_events
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at < $3;
      `, [tenant_id, subscription.current_period_start, subscription.current_period_end]);

      const currentUsedApi = usageRes.rows[0].used_api_calls;
      const currentUsedAi = usageRes.rows[0].used_ai_tokens;

      if (usage_type === 'api_call') {
        if (currentUsedApi + requestedQuantity > subscription.api_call_limit) {
          throw new QuotaExceededError(`Monthly API call limit of ${subscription.api_call_limit} exceeded`, {
            usage_type: 'api_call',
            used: currentUsedApi,
            limit: subscription.api_call_limit,
            requested: requestedQuantity,
          });
        }
      } else if (usage_type === 'ai_token') {
        if (currentUsedAi + requestedQuantity > subscription.ai_token_limit) {
          throw new QuotaExceededError(`Monthly AI token limit of ${subscription.ai_token_limit} exceeded`, {
            usage_type: 'ai_token',
            used: currentUsedAi,
            limit: subscription.ai_token_limit,
            requested: requestedQuantity,
          });
        }
      }

      // 4. Calculate integer cost
      const pricing = PricingService.calculateTokenCost(tokenBreakdown);
      const costMicrocents = usage_type === 'ai_token' ? pricing.cost_microcents : 100; // 100 microcents ($0.001) for API call

      // 5. Attempt atomic database insertion
      try {
        const insertRes = await client.query(`
          INSERT INTO usage_events (
            tenant_id, usage_type, quantity, input_tokens, cached_input_tokens, 
            output_tokens, reasoning_tokens, cost_microcents, idempotency_key, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id, created_at;
        `, [
          tenant_id,
          usage_type,
          requestedQuantity,
          tokenBreakdown.input_tokens,
          tokenBreakdown.cached_input_tokens,
          tokenBreakdown.output_tokens,
          tokenBreakdown.reasoning_tokens,
          costMicrocents,
          idempotency_key,
          JSON.stringify(metadata || {}),
        ]);

        await client.query('COMMIT');

        const newRow = insertRes.rows[0];
        return {
          id: newRow.id,
          tenant_id,
          usage_type,
          quantity: requestedQuantity,
          input_tokens: tokenBreakdown.input_tokens,
          cached_input_tokens: tokenBreakdown.cached_input_tokens,
          output_tokens: tokenBreakdown.output_tokens,
          reasoning_tokens: tokenBreakdown.reasoning_tokens,
          cost_microcents: costMicrocents,
          cost_cents: PricingService.formatMicrocents(costMicrocents).cents,
          formatted_usd: PricingService.formatMicrocents(costMicrocents).formatted,
          idempotency_key,
          replayed: false,
          created_at: newRow.created_at.toISOString(),
        };
      } catch (insertError: any) {
        // Handle PostgreSQL Unique Constraint Violation (Code 23505)
        if (insertError.code === '23505') {
          await client.query('ROLLBACK');

          // Fetch original event to check parameter match
          const existingRes = await pool.query(`
            SELECT * FROM usage_events WHERE tenant_id = $1 AND idempotency_key = $2;
          `, [tenant_id, idempotency_key]);

          if (existingRes.rows.length === 0) {
            throw insertError;
          }

          const existing = existingRes.rows[0];

          // Validate parameter consistency for idempotency key reuse
          const isMatch =
            existing.usage_type === usage_type &&
            Number(existing.quantity) === requestedQuantity &&
            Number(existing.input_tokens) === tokenBreakdown.input_tokens &&
            Number(existing.cached_input_tokens) === tokenBreakdown.cached_input_tokens &&
            Number(existing.output_tokens) === tokenBreakdown.output_tokens &&
            Number(existing.reasoning_tokens) === tokenBreakdown.reasoning_tokens;

          if (!isMatch) {
            throw new IdempotencyMismatchError(
              `Idempotency-Key '${idempotency_key}' was previously used with different request parameters.`
            );
          }

          return {
            id: existing.id,
            tenant_id: existing.tenant_id,
            usage_type: existing.usage_type,
            quantity: Number(existing.quantity),
            input_tokens: Number(existing.input_tokens),
            cached_input_tokens: Number(existing.cached_input_tokens),
            output_tokens: Number(existing.output_tokens),
            reasoning_tokens: Number(existing.reasoning_tokens),
            cost_microcents: Number(existing.cost_microcents),
            cost_cents: PricingService.formatMicrocents(Number(existing.cost_microcents)).cents,
            formatted_usd: PricingService.formatMicrocents(Number(existing.cost_microcents)).formatted,
            idempotency_key: existing.idempotency_key,
            replayed: true,
            created_at: new Date(existing.created_at).toISOString(),
          };
        }
        throw insertError;
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
