import { CONFIG } from '../config/index.js';

export interface TokenBreakdown {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
}

export interface PricingResult {
  uncached_input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_output_billable_tokens: number;
  total_billable_tokens: number;
  cost_microcents: number;
  cost_cents: number;
  formatted_usd: string;
}

export class PricingService {
  /**
   * Calculates the exact integer cost in micro-cents for a given token breakdown.
   * NO floating-point calculations are used to avoid monetary rounding drift.
   */
  public static calculateTokenCost(breakdown: TokenBreakdown): PricingResult {
    const inputTokens = BigInt(Math.max(0, breakdown.input_tokens));
    const cachedTokens = BigInt(Math.max(0, breakdown.cached_input_tokens));
    const outputTokens = BigInt(Math.max(0, breakdown.output_tokens));
    const reasoningTokens = BigInt(Math.max(0, breakdown.reasoning_tokens));

    // Calculate uncached input tokens
    const uncachedInputTokens = inputTokens >= cachedTokens ? inputTokens - cachedTokens : 0n;

    // Reasoning tokens count as output tokens
    const totalOutputBillable = outputTokens + reasoningTokens;

    // Calculate cost in micro-cents using pinned integer multipliers
    // Rate per 100 tokens: Uncached 125, Cached 30, Output/Reasoning 500
    const uncachedCost = uncachedInputTokens * CONFIG.PRICING.UNCACHED_INPUT_MICRO_CENTS_PER_100;
    const cachedCost = cachedTokens * CONFIG.PRICING.CACHED_INPUT_MICRO_CENTS_PER_100;
    const outputCost = totalOutputBillable * CONFIG.PRICING.OUTPUT_MICRO_CENTS_PER_100;

    const totalMicrocentsBigInt = (uncachedCost + cachedCost + outputCost) / 100n;
    const totalMicrocents = Number(totalMicrocentsBigInt);

    const cents = Math.floor(totalMicrocents / Number(CONFIG.PRICING.MICRO_CENTS_PER_CENT));
    const usdAmount = (totalMicrocents / 1_000_000).toFixed(4);

    const totalBillableTokens = Number(uncachedInputTokens + cachedTokens + totalOutputBillable);

    return {
      uncached_input_tokens: Number(uncachedInputTokens),
      cached_input_tokens: Number(cachedTokens),
      output_tokens: Number(outputTokens),
      reasoning_tokens: Number(reasoningTokens),
      total_output_billable_tokens: Number(totalOutputBillable),
      total_billable_tokens: totalBillableTokens,
      cost_microcents: totalMicrocents,
      cost_cents: cents,
      formatted_usd: `$${usdAmount}`,
    };
  }

  /**
   * Helper to format raw micro-cents into structured currency objects.
   */
  public static formatMicrocents(microcents: number) {
    const cents = Math.floor(microcents / 10000);
    const usd = (microcents / 1000000).toFixed(2);
    return {
      microcents,
      cents,
      formatted: `$${usd}`,
    };
  }
}
