import { pool } from '../config/database.js';
import { TenantNotFoundError } from './meter.service.js';

export interface TenantUsageReport {
  tenant_id: string;
  tenant_name: string;
  plan: string;
  period: {
    start: string;
    end: string;
  };
  api_calls: {
    used: number;
    limit: number;
    remaining: number;
  };
  ai_tokens: {
    used: number;
    limit: number;
    remaining: number;
    breakdown: {
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
      reasoning_tokens: number;
    };
  };
  cost: {
    microcents: number;
    cents: number;
    formatted: string;
    currency: string;
  };
}

export class UsageService {
  /**
   * Generates tenant monthly usage report aggregated over the active billing cycle.
   */
  public static async getTenantUsage(tenant_id: string): Promise<TenantUsageReport> {
    if (!tenant_id) {
      throw new Error('tenant_id is required');
    }

    // 1. Verify tenant exists
    const tenantRes = await pool.query('SELECT id, name FROM tenants WHERE id = $1', [tenant_id]);
    if (tenantRes.rows.length === 0) {
      throw new TenantNotFoundError(`Tenant with ID '${tenant_id}' not found`);
    }

    const tenant = tenantRes.rows[0];

    // 2. Fetch Subscription and Plan limits
    const subRes = await pool.query(`
      SELECT 
        s.id AS subscription_id, s.status, s.current_period_start, s.current_period_end,
        p.id AS plan_id, p.name AS plan_name, p.api_call_limit, p.ai_token_limit, p.currency
      FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.tenant_id = $1
      ORDER BY s.created_at DESC
      LIMIT 1;
    `, [tenant_id]);

    const subscription = subRes.rows[0] || {
      plan_name: 'Free Plan',
      api_call_limit: 1000,
      ai_token_limit: 100000,
      currency: 'usd',
      current_period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      current_period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    };

    // 3. Query Usage Aggregations for current billing period
    const usageRes = await pool.query(`
      SELECT 
        COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'api_call'), 0)::INT AS used_api_calls,
        COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'ai_token'), 0)::INT AS used_ai_tokens,
        COALESCE(SUM(input_tokens), 0)::INT AS total_input_tokens,
        COALESCE(SUM(cached_input_tokens), 0)::INT AS total_cached_input_tokens,
        COALESCE(SUM(output_tokens), 0)::INT AS total_output_tokens,
        COALESCE(SUM(reasoning_tokens), 0)::INT AS total_reasoning_tokens,
        COALESCE(SUM(cost_microcents), 0)::BIGINT AS total_cost_microcents
      FROM usage_events
      WHERE tenant_id = $1
        AND created_at >= $2
        AND created_at < $3;
    `, [tenant_id, subscription.current_period_start, subscription.current_period_end]);

    const stats = usageRes.rows[0];
    const usedApiCalls = stats.used_api_calls;
    const usedAiTokens = stats.used_ai_tokens;
    const totalCostMicrocents = Number(stats.total_cost_microcents);
    const totalCostCents = Math.floor(totalCostMicrocents / 10000);
    const formattedUsd = `$${(totalCostMicrocents / 1000000).toFixed(2)}`;

    return {
      tenant_id,
      tenant_name: tenant.name,
      plan: subscription.plan_name,
      period: {
        start: new Date(subscription.current_period_start).toISOString(),
        end: new Date(subscription.current_period_end).toISOString(),
      },
      api_calls: {
        used: usedApiCalls,
        limit: subscription.api_call_limit,
        remaining: Math.max(0, subscription.api_call_limit - usedApiCalls),
      },
      ai_tokens: {
        used: usedAiTokens,
        limit: subscription.ai_token_limit,
        remaining: Math.max(0, subscription.ai_token_limit - usedAiTokens),
        breakdown: {
          input_tokens: stats.total_input_tokens,
          cached_input_tokens: stats.total_cached_input_tokens,
          output_tokens: stats.total_output_tokens,
          reasoning_tokens: stats.total_reasoning_tokens,
        },
      },
      cost: {
        microcents: totalCostMicrocents,
        cents: totalCostCents,
        formatted: formattedUsd,
        currency: subscription.currency,
      },
    };
  }
}
