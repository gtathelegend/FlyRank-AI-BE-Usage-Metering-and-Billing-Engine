# FlyRank AI — LLM Usage Metering & Billing Engine

An enterprise-grade, high-concurrency **LLM Usage Metering & Billing Engine** built with Node.js, Express, TypeScript, PostgreSQL, and Stripe Test Mode. Features real-time pre-check quota enforcement, database-level composite unique constraint idempotency protection, zero-drift integer micro-cents financial arithmetic, Stripe Checkout sessions, and signature-verified webhook state synchronization.

> [!IMPORTANT]
> **TEST MODE ONLY**: Real payment processing is strictly disabled. All Stripe operations utilize Test Mode credentials (`sk_test_*`, `whsec_*`). Real card data is never accepted or processed.

---

## Technical Architecture & System Modules

- **Backend Framework**: Node.js + Express with TypeScript
- **Database**: PostgreSQL (via Docker Compose)
- **Payment Provider**: Stripe API (Test Mode Only)
- **Idempotency Engine**: PostgreSQL Composite Unique Constraint `UNIQUE(tenant_id, idempotency_key)`
- **Webhook Deduplication**: PostgreSQL Unique Constraint `UNIQUE(stripe_event_id)`
- **Financial Unit**: Integer Micro-Cents (1 Cent = 10,000 Micro-Cents, 1 USD = 1,000,000 Micro-Cents)

---

## Environment Variables Configuration

Copy `.env.example` to `.env` and fill in Test Mode credentials:

```env
# Server & Database Configuration
PORT=8000
NODE_ENV=development
DATABASE_URL=postgresql://billing_user:billing_password@localhost:5432/flyrank_billing_db

# Stripe API Keys (TEST MODE ONLY - Server-only secrets)
STRIPE_SECRET_KEY=sk_test_51PlaceholderSecretKeyDoNotCommit12345
STRIPE_WEBHOOK_SECRET=whsec_PlaceholderWebhookSecretDoNotCommit12345
STRIPE_PRICE_PRO=price_1PlaceholderProPriceId12345
```

---

## Quick Start & Execution Guide

### 1. Start Local PostgreSQL Database
```bash
docker-compose up -d
```

### 2. Install Dependencies & Compile Project
```bash
npm install
npm run build
```

### 3. Run Database Migrations & Seed Data
```bash
npm run migrate
npm run seed
```

### 4. Start Local Development Server
```bash
npm run dev
# Server running at http://localhost:8000
```

### 5. Run Automated Test Suite
```bash
npm test
```

---

## Stripe Test Mode Manual Demo Flow

### Local Webhook Forwarding with Stripe CLI
1. Download and install the [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Authenticate and forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:8000/webhooks/stripe
   ```
3. Copy the output webhook signing secret (`whsec_...`) into your `.env` file as `STRIPE_WEBHOOK_SECRET`.

### Upgrade Tenant to Pro Plan
1. Send a request to initiate a Checkout Session:
   ```bash
   curl -X POST http://localhost:8000/checkout/session \
     -H "Content-Type: application/json" \
     -d '{"tenant_id": "00000000-0000-0000-0000-000000000001"}'
   ```
2. Open the returned `checkout_url` in a browser.
3. Complete the checkout using Stripe's official test card (`4242 4242 4242 4242`, Exp: `12/34`, CVC: `123`).
4. Stripe CLI forwards the `checkout.session.completed` event to `/webhooks/stripe`.
5. The local engine verifies the raw body HMAC signature, records the event in `stripe_events`, and upgrades the tenant's subscription to the Pro plan.

---

## API Surface & Endpoint Contracts

### 1. `POST /checkout/session` (Initiate Pro Plan Upgrade)
- **Body**: `{ "tenant_id": "00000000-0000-0000-0000-000000000001" }`
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
    "session_id": "cs_test_..."
  }
}
```

### 2. `POST /webhooks/stripe` (Raw Body Signature Verified Webhook Listener)
- **Headers**: `Stripe-Signature: t=...,v1=...`
- **Body**: Raw JSON Buffer payload.
- **Handled Events**:
  - `checkout.session.completed`: Upgrades tenant plan to `pro` and assigns `stripe_subscription_id`.
  - `customer.subscription.updated`: Syncs state (`active`, `past_due`, `unpaid`).
  - `customer.subscription.deleted`: Reverts tenant plan to `free` limits and marks status `canceled`.

### 3. `POST /generate` (Dummy Billable Endpoint)
- **Headers**: `Idempotency-Key: <unique-uuid>`
- **Body**: `{ "tenant_id": "...", "input_tokens": 1000, "cached_input_tokens": 200, "output_tokens": 500, "reasoning_tokens": 100 }`

### 4. `GET /usage?tenant_id=<uuid>` (Tenant Usage Report)
- Returns current monthly usage breakdown, quota limits, remaining balance, and cost in micro-cents and USD.

---

## Key System Protections

1. **Cryptographic Webhook Signature Verification**: Uses raw HTTP request body buffers to construct and verify HMAC-SHA256 signatures via `stripe.webhooks.constructEvent`. Invalid signatures yield **HTTP 400 Bad Request**.
2. **Database Webhook Deduplication**: `CONSTRAINT idx_stripe_events_event_id UNIQUE(stripe_event_id)` ensures at-least-once Stripe webhook events are processed exactly once. Duplicate events return **HTTP 200 OK** without double-applying state changes.
3. **Database-Level Metering Idempotency**: `CONSTRAINT uk_tenant_idempotency UNIQUE(tenant_id, idempotency_key)` protects against concurrent retry race conditions.
4. **Pre-Check Quota Enforcement**: Synchronously checks remaining quota inside database transactions before execution. Limit violations yield **HTTP 429 Too Many Requests**. Inactive subscription states yield **HTTP 402 Payment Required**.

---

## Honest Limitations

1. **Stripe Test Mode Only**: Configured strictly for Stripe Test Mode (`sk_test_*`). Real payments are not processed.
2. **Simulated AI Completion**: The billable `/generate` endpoint simulates AI token usage and completion text rather than invoking live external LLM APIs (OpenAI/Anthropic).
3. **Single-Instance Background Scheduler**: The background reconciliation job runs via simple periodic scheduling within the process rather than a distributed worker queue (like BullMQ/Celery).
