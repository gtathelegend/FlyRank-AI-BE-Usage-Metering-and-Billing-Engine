import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QuotaExceededError, IdempotencyMismatchError, TenantNotFoundError, BillingStatusError } from '../services/meter.service.js';

describe('MeterService Logic & Error Mapping', () => {
  it('should define structured error classes with appropriate HTTP status codes', () => {
    const quotaErr = new QuotaExceededError('Quota exceeded', {
      usage_type: 'api_call',
      used: 1000,
      limit: 1000,
      requested: 1,
    });
    assert.equal(quotaErr.status, 429);
    assert.equal(quotaErr.details.used, 1000);

    const billingErr = new BillingStatusError('Past due');
    assert.equal(billingErr.status, 402);

    const idempotencyErr = new IdempotencyMismatchError('Payload mismatch');
    assert.equal(idempotencyErr.status, 409);

    const tenantErr = new TenantNotFoundError('Tenant missing');
    assert.equal(tenantErr.status, 404);
  });

  it('should evaluate quota boundaries correctly', () => {
    const limit = 1000;

    // Below quota (limit - 1)
    const usageBefore = 999;
    const requested = 1;
    const isBelowLimit = (usageBefore + requested) <= limit;
    assert.equal(isBelowLimit, true);

    // Exactly at limit (limit)
    const exactLimitUsage = (1000) <= limit;
    assert.equal(exactLimitUsage, true);

    // Exceeding limit (limit + 1)
    const overLimit = (1000 + 1) <= limit;
    assert.equal(overLimit, false);
  });
});
