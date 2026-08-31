# FlyRank AI — LLM Usage Metering & Billing Engine

An enterprise-grade, high-concurrency **LLM Usage Metering & Billing Engine** built with Node.js, Express, TypeScript, PostgreSQL, and Stripe Test Mode. Features real-time pre-check quota enforcement, database-level composite unique constraint idempotency protection, zero-drift integer micro-cents financial arithmetic, Stripe Checkout sessions, and signature-verified webhook state synchronization.

> [!IMPORTANT]
> **TEST MODE ONLY**: Stripe Test Mode is used exclusively (`sk_test_*`, `whsec_*`). Real payment processing is strictly disabled. Only Stripe test payment methods (such as test card `4242 4242 4242 4242`) are used during development and E2E verification. No real card data is processed.

---

## System Architecture & Data Flow

```text
Client
  |
  +--> POST /generate ------> MeterService ------> PostgreSQL
  |
  +--> GET /usage ----------> UsageService -------> PostgreSQL
  |
  +--> POST /checkout/session
              |
              v
        Stripe Checkout
              |
              v
        Stripe Webhooks
              |
              v
    Signature Verification
              |
              v
    Webhook Deduplication
              |
              v
          PostgreSQL
              |
              v
       Pro Subscription
```

---

## Local Development & Docker Setup

### 1. Prerequisites & Environment Variables
- Node.js (v18+)
- Docker Desktop & Docker Compose

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure `.env` contains local placeholders:
```env
PORT=8000
NODE_ENV=development
DATABASE_URL=postgresql://billing_user:billing_password@localhost:5432/flyrank_billing_db
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_PRO=price_REPLACE_ME
```

> [!NOTE]
> **Docker Credential Helper Troubleshooting (Windows)**:
> If `docker compose up -d` fails with `error getting credentials - err: exec: "docker-credential-desktop": executable file not found in %PATH%`, safely remove `"credsStore": "desktop"` from `%USERPROFILE%\.docker\config.json`.

---

## Quick Start Command Sequence

### 1. Start Local PostgreSQL Database
```bash
docker compose up -d
```
Verify container status:
```bash
docker compose ps
# Container flyrank_billing_postgres should show as (healthy)
```

### 2. Install Dependencies & Build
```bash
npm install
npm run build
```

### 3. Run Database Migrations & Seed Data
```bash
npm run migrate
npm run seed
```
> The seed command is 100% idempotent and can be safely re-run at any time.

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
3. Complete checkout using Stripe's official test card (`4242 4242 4242 4242`, Exp: `12/34`, CVC: `123`).
4. Stripe CLI forwards `checkout.session.completed` event to `/webhooks/stripe`.
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

### 2. `GET /billing/success` & `GET /billing/cancel` (Checkout Redirect Pages)
- **GET `/billing/success?session_id=cs_test_...`**: Returns HTTP 200 with an HTML confirmation page confirming subscription activation.
- **GET `/billing/cancel`**: Returns HTTP 200 with an HTML page confirming checkout cancellation.

### 3. `POST /webhooks/stripe` (Raw Body Signature Verified Webhook Listener)
- **Headers**: `Stripe-Signature: t=...,v1=...`
- **Body**: Raw JSON Buffer payload.
- **Handled Events**:
  - `checkout.session.completed`: Upgrades tenant plan to `pro` and assigns `stripe_subscription_id`.
  - `customer.subscription.created`: Syncs subscription state.
  - `customer.subscription.updated`: Syncs state (`active`, `past_due`, `unpaid`). Safely handles missing timestamps and unmapped subscriptions.
  - `customer.subscription.deleted`: Reverts tenant plan to `free` limits and marks status `canceled`.

### 4. `POST /generate` (Dummy Billable Endpoint)
- **Headers**: `Idempotency-Key: <unique-uuid>`
- **Body**: `{ "tenant_id": "...", "input_tokens": 1000, "cached_input_tokens": 200, "output_tokens": 500, "reasoning_tokens": 100 }`

### 5. `GET /usage?tenant_id=<uuid>` (Tenant Usage Report)
- Returns current monthly usage breakdown, quota limits, remaining balance, and cost in micro-cents and USD.

---

## Key Security & System Protections

1. **Environment-Only Secret Loading**: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are strictly read from process environment variables. No credentials or secret keys are committed or exposed in client API responses. The `.env` file is git-ignored.
2. **Cryptographic Webhook Signature Verification**: Uses preserved raw HTTP request body buffers (`express.raw({ type: 'application/json' })`) to construct and verify HMAC-SHA256 signatures via `stripe.webhooks.constructEvent`. Invalid signatures yield **HTTP 400 Bad Request**.
3. **Database Webhook Deduplication**: Stripe webhook events are processed idempotently using a unique database constraint on `stripe_event_id`. Duplicate deliveries return **HTTP 200 OK** without reapplying subscription state.
4. **Database-Level Metering Idempotency**: `CONSTRAINT uk_tenant_idempotency UNIQUE(tenant_id, idempotency_key)` protects against concurrent retry race conditions.
5. **Tenant Isolation & Quota Enforcement**: Tenant data is isolated using `tenant_id`. Synchronously checks remaining quota inside PostgreSQL transactions before execution. Limit violations yield **HTTP 429 Too Many Requests**. Inactive subscription states yield **HTTP 402 Payment Required**.

---

## Honest Limitations

1. **Stripe Test Mode Only**: Configured strictly for Stripe Test Mode (`sk_test_*`). Production payments are not supported.
2. **Simulated AI Completion**: The billable `/generate` endpoint simulates AI token usage and completion text rather than invoking live external LLM APIs (OpenAI/Anthropic).
3. **In-Process Scheduler**: The background reconciliation job runs via an in-process scheduler rather than a distributed worker queue (like BullMQ/Celery).

---

## Verification

- **TypeScript build**: PASS (`npm run build`)
- **Automated tests**: 23/23 passed (`npm test`)
- **PostgreSQL E2E verification**: PASS
- **Stripe Test Mode Checkout**: PASS (`POST /checkout/session` → HTTP 200)
- **Stripe webhook signature verification**: PASS (HMAC-SHA256 validated via `stripe.webhooks.constructEvent`)
- **`checkout.session.completed`**: HTTP 200 (`received: true`, `processed: true`)
- **`customer.subscription.created`**: HTTP 200 (`received: true`, `processed: true`)
- **`customer.subscription.updated`**: HTTP 200 (`received: true`, `processed: true`)
- **Webhook idempotency replay**: PASS (`duplicate: true`, `processed: false`)
- **Duplicate Stripe event records**: 0 (Unique constraint enforced on `stripe_event_id`)
- **Demo tenant Free → Pro upgrade**: PASS
- **`GET /usage` reflects Pro limits**: PASS (AI token limit upgraded to 5,000,000)
- **Secret scan**: PASS (All keys loaded from environment; `.env` gitignored)
