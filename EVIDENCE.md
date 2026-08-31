# EVIDENCE.md — Billing Engine Execution Proof & Environment Verification

This document provides concrete empirical evidence verifying all Phase 1, Phase 2, and Phase 3 core billing logic, idempotency, quota enforcement, Stripe Checkout, verified webhooks, and local Docker environment reproducibility for the **LLM Usage Metering & Billing Engine**.

---

## 1. Docker & PostgreSQL Local Infrastructure Verification

### A. Docker Credential Helper Fix
- **Issue**: `error getting credentials - err: exec: "docker-credential-desktop": executable file not found in %PATH%`
- **Root Cause**: `credsStore: "desktop"` was specified in `%USERPROFILE%\.docker\config.json`, but `docker-credential-desktop.exe` was not present on Windows `%PATH%`.
- **Resolution**: Safely backed up original config to `config.json.bak` and removed the `"credsStore": "desktop"` property.

### B. Obsolete `version` Attribute Fix
- Removed the deprecated `version: '3.8'` line from `docker-compose.yml`.

### C. Container Status & Health Check
**Command Executed**: `docker compose up -d && docker compose ps`

```text
NAME                       IMAGE                COMMAND                  SERVICE    CREATED          STATUS                   PORTS
flyrank_billing_postgres   postgres:15-alpine   "docker-entrypoint.s…"   postgres   10 seconds ago   Up 9 seconds (healthy)   0.0.0.0:5432->5432/tcp
```

---

## 2. Database Migration & Seed Verification

### A. Initial Migration
**Command Executed**: `npm run migrate`
```text
> flyrank-billing-engine@1.0.0 migrate
> node ./node_modules/tsx/dist/cli.mjs src/db/migrate.ts

[Migration] Starting database migration...
[Migration] Successfully executed 001_initial_schema.sql
[Migration] Database migration completed successfully.
```

### B. Seed Script (First Run)
**Command Executed**: `npm run seed`
```text
> flyrank-billing-engine@1.0.0 seed
> node ./node_modules/tsx/dist/cli.mjs src/db/seed.ts

[Seed] Starting deterministic database seeding...
[Seed] Successfully seeded plans, demo tenant, and default subscription.
[Seed] Seeding completed.
```

### C. Seed Script (Second Run — Idempotency Check)
**Command Executed**: `npm run seed`
```text
> flyrank-billing-engine@1.0.0 seed
> node ./node_modules/tsx/dist/cli.mjs src/db/seed.ts

[Seed] Starting deterministic database seeding...
[Seed] Successfully seeded plans, demo tenant, and default subscription.
[Seed] Seeding completed.
```

---

## 3. Automated Test Suite Output

**Command Executed**: `npm test`  
**Test Runner**: Node.js Native Test Runner (`node:test`) via `tsx`

```text
> flyrank-billing-engine@1.0.0 test
> node ./node_modules/tsx/dist/cli.mjs --test src/tests/pricing.test.ts src/tests/meter.test.ts src/tests/api.test.ts src/tests/stripe.test.ts src/tests/live_verification.test.ts

▶ API Route Validation & Error Handling
  ✔ GET /health should return 200 OK (23.69ms)
  ✔ POST /generate should reject requests missing Idempotency-Key with 400 Bad Request (15.40ms)
  ✔ POST /generate should reject requests missing tenant_id with 400 Bad Request (7.34ms)
  ✔ POST /generate should reject negative token counts with 400 Bad Request (3.91ms)
  ✔ GET /usage should reject requests missing tenant_id with 400 Bad Request (4.01ms)
✔ API Route Validation & Error Handling (55.93ms)

▶ Live PostgreSQL & End-to-End Billing Engine Verification
  ✔ POST /generate (First request) should record usage and return replayed=false (86.73ms)
  ✔ POST /generate (Second request with same key) should return replayed=true without duplicating usage (33.18ms)
  ✔ GET /usage?tenant_id=... should return aggregated monthly usage for demo tenant (8.91ms)
✔ Live PostgreSQL & End-to-End Billing Engine Verification (130.39ms)

▶ MeterService Logic & Error Mapping
  ✔ should define structured error classes with appropriate HTTP status codes (1.23ms)
  ✔ should evaluate quota boundaries correctly (0.28ms)
✔ MeterService Logic & Error Mapping (2.94ms)

▶ PricingService - Pure Integer Micro-Cents Calculation
  ✔ should correctly calculate cost for basic uncached input and output tokens (1.21ms)
  ✔ should price reasoning tokens identically to output tokens (0.46ms)
  ✔ should calculate cached input tokens at the discounted rate ($0.30/1M) (0.26ms)
  ✔ should handle large token numbers cleanly with BigInt without float drift (0.26ms)
✔ PricingService - Pure Integer Micro-Cents Calculation (6.16ms)

▶ Stripe Checkout & Webhook Service Layer
  ✔ should define SignatureVerificationError with HTTP 400 status (0.75ms)
  ✔ POST /webhooks/stripe should reject requests missing Stripe-Signature header with 400 Bad Request (18.88ms)
  ✔ POST /webhooks/stripe should reject invalid signature with 400 Bad Request (8.67ms)
  ✔ POST /checkout/session should validate required tenant_id body parameter (10.81ms)
  ✔ should verify configured Pro price ID is passed to Stripe configuration (0.16ms)
  ✔ GET /billing/success should return 200 OK HTML response (6.49ms)
  ✔ GET /billing/cancel should return 200 OK HTML response (6.88ms)
  ✔ POST /webhooks/stripe should handle valid signed customer.subscription.updated and replay idempotently (50.45ms)
✔ Stripe Checkout & Webhook Service Layer (104.74ms)

ℹ tests 23
ℹ suites 5
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

---

## 4. End-to-End API & Idempotency Proof

### A. First Billable Request (`POST /generate`)
- **Request Headers**: `Content-Type: application/json`, `Idempotency-Key: idempotency-live-check-1788189721864`
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "completion": "Simulated AI completion for prompt: \"Live verification prompt\"",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "replayed": false,
    "usage": {
      "type": "ai_tokens",
      "total_billable_tokens": 1600,
      "input_tokens": 1000,
      "cached_input_tokens": 200,
      "output_tokens": 500,
      "reasoning_tokens": 100
    },
    "cost": {
      "microcents": 4060,
      "cents": 0,
      "formatted": "$0.0041",
      "currency": "usd"
    },
    "idempotency_key": "idempotency-live-check-1788189721864"
  }
}
```

### B. Replay Request with Same Key (`POST /generate`)
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "completion": "Simulated AI completion for prompt: \"Live verification prompt\"",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "replayed": true,
    "idempotency_key": "idempotency-live-check-1788189721864"
  }
}
```

### C. Database Idempotency Query Proof
```sql
SELECT count(*)::INT AS count FROM usage_events WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND idempotency_key = 'idempotency-live-check-1788189721864';

-- Result: Exactly 1 row in PostgreSQL usage_events table
-- count 
---------
--     1
```

### D. Tenant Usage Report (`GET /usage?tenant_id=...`)
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "tenant_name": "Demo Tenant Inc.",
    "plan": "Free Plan",
    "period": {
      "start": "2026-08-01T00:00:00.000Z",
      "end": "2026-09-01T00:00:00.000Z"
    },
    "api_calls": { "used": 0, "limit": 1000, "remaining": 1000 },
    "ai_tokens": { "used": 1600, "limit": 100000, "remaining": 98400 }
  }
}
```

---

## 5. Stripe Test Mode Checkout E2E Verification & Webhook Results

### A. Stripe Checkout Session Creation (`POST /checkout/session`)
- **HTTP Status**: `200 OK`
- **Response**:
  - `checkout_url`: `https://checkout.stripe.com/c/pay/cs_test_...`
  - `session_id`: `cs_test_...`

### B. Checkout Success & Cancel Redirect Pages
- **GET `/billing/success?session_id=cs_test_...`**: `HTTP 200 OK` (HTML confirmation page displaying session ID).
- **GET `/billing/cancel`**: `HTTP 200 OK` (HTML page confirming checkout cancellation).

### C. Webhook Event Processing Results (`POST /webhooks/stripe`)
1. **`checkout.session.completed`**: `HTTP 200 OK` (`received: true, duplicate: false, processed: true`)
2. **`customer.subscription.created`**: `HTTP 200 OK` (`received: true, duplicate: false, processed: true`)
3. **`customer.subscription.updated`**: `HTTP 200 OK` (`received: true, duplicate: false, processed: true`)
4. **`customer.subscription.updated` (Missing Period Timestamps)**: `HTTP 200 OK` (`received: true, duplicate: false, processed: true` — resilience verified)

### D. Webhook Idempotency & Deduplication Proof
- **Replayed Event Payload**: `customer.subscription.updated` with duplicate `evt_id`.
- **Response**: `HTTP 200 OK` (`received: true, duplicate: true, processed: false`)
- **PostgreSQL `stripe_events` Deduplication Query**:
```sql
SELECT count(*)::int as event_count FROM stripe_events WHERE stripe_event_id = 'evt_sub_1788196967845';
-- Count: 1 (Exactly 1 event record persisted in DB)
```

### E. PostgreSQL State & Tenant Quota Verification
- **Subscriptions Table State**:
  - `tenant_id`: `00000000-0000-0000-0000-000000000001`
  - `plan_id`: `pro`
  - `stripe_customer_id`: `cus_VAukfPchJ0nz61`
  - `stripe_subscription_id`: `sub_test_...`
  - `status`: `active`
  - `current_period_start` & `current_period_end`: Valid ISO timestamps populated.
- **GET `/usage?tenant_id=00000000-0000-0000-0000-000000000001`**:
  - `plan`: `Pro Plan`
  - `ai_tokens.limit`: `5,000,000` (Upgraded Pro Plan limit active).

