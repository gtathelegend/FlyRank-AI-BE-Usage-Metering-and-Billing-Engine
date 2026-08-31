import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PricingService } from '../services/pricing.service.js';

describe('PricingService - Pure Integer Micro-Cents Calculation', () => {
  it('should correctly calculate cost for basic uncached input and output tokens', () => {
    const result = PricingService.calculateTokenCost({
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 500,
      reasoning_tokens: 0,
    });

    // 1000 uncached input * 1.25 = 1250 microcents
    // 500 output * 5.00 = 2500 microcents
    // Total = 3750 microcents
    assert.equal(result.cost_microcents, 3750);
    assert.equal(result.cost_cents, 0);
    assert.equal(result.total_billable_tokens, 1500);
  });

  it('should price reasoning tokens identically to output tokens', () => {
    const resultOutput = PricingService.calculateTokenCost({
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 1000,
      reasoning_tokens: 0,
    });

    const resultReasoning = PricingService.calculateTokenCost({
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 1000,
    });

    assert.equal(resultReasoning.cost_microcents, resultOutput.cost_microcents);
    assert.equal(resultReasoning.cost_microcents, 5000); // 1000 * 5.00 microcents = 5000 microcents
  });

  it('should calculate cached input tokens at the discounted rate ($0.30/1M)', () => {
    const result = PricingService.calculateTokenCost({
      input_tokens: 1000,
      cached_input_tokens: 400, // 600 uncached, 400 cached
      output_tokens: 0,
      reasoning_tokens: 0,
    });

    // 600 uncached * 1.25 microcents = 750 microcents
    // 400 cached * 0.30 microcents = 120 microcents
    // Total = 870 microcents
    assert.equal(result.uncached_input_tokens, 600);
    assert.equal(result.cached_input_tokens, 400);
    assert.equal(result.cost_microcents, 870);
  });

  it('should handle large token numbers cleanly with BigInt without float drift', () => {
    const result = PricingService.calculateTokenCost({
      input_tokens: 10_000_000,
      cached_input_tokens: 2_000_000,
      output_tokens: 5_000_000,
      reasoning_tokens: 1_000_000,
    });

    // 8M uncached * 1.25 microcents = 10,000,000 microcents ($10.00)
    // 2M cached * 0.30 microcents = 600,000 microcents ($0.60)
    // 6M output/reasoning * 5.00 microcents = 30,000,000 microcents ($30.00)
    // Total = 40,600,000 microcents = 4060 cents ($40.60)
    assert.equal(result.cost_microcents, 40_600_000);
    assert.equal(result.cost_cents, 4060);
    assert.equal(result.formatted_usd, '$40.6000');
  });
});
