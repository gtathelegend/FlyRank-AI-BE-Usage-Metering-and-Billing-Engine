# FlyRank AI — LLM Usage Metering & Billing Engine

An enterprise-grade, high-concurrency **LLM Usage Metering & Billing Engine** built with Node.js, Express, TypeScript, and PostgreSQL. Features real-time pre-check quota enforcement, database-level composite unique constraint idempotency protection, zero-drift integer micro-cents financial arithmetic, and Stripe subscription sync in Test Mode.

---

## Technical Architecture & Design

- **Backend Framework**: Node.js + Express with TypeScript
- **Database**: PostgreSQL (via Docker Compose)
- **Payment Provider**: Stripe API (Test Mode Only)
- **Idempotency Engine**: PostgreSQL Composite Unique Constraint `UNIQUE(tenant_id, idempotency_key)`
- **Financial Unit**: Integer Micro-Cents (1 Cent = 10,000 Micro-Cents, 1 USD = 1,000,000 Micro-Cents)

---

## Quick Start & Setup Instructions

### 1. Requirements & Dependencies
- Node.js (v18+)
- Docker & Docker Compose (or local PostgreSQL 15+)

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Start PostgreSQL Database
```bash
docker-compose up -d
```

### 4. Install Dependencies & Build
```bash
npm install
npm run build
```

### 5. Run Database Migrations & Seed Data
```bash
npm run migrate
npm run seed
```
> The seed script deterministically creates `free` and `pro` plans, plus a Demo Tenant (`00000000-0000-0000-0000-000000000001`) with an active Free Plan subscription.

### 6. Start Server
```bash
npm run dev
# Server running at http://localhost:8000
```

### 7. Run Test Suite
```bash
npm test
```

---

## Subscription Plans & Pricing Rates

| Plan Name | API Calls / Month | AI Tokens / Month | Price (USD) | Price (Integer Cents) |
|---|---|---|---|---|
| **Free Plan** | 1,000 calls | 100,000 tokens | $0.00 | `0` cents |
| **Pro Plan** | 50,000 calls | 5,000,000 tokens | $49.00 | `4900` cents |

### Pinned AI Token Pricing Rates (Zero Floating Point Math)
Costs are computed strictly in integer **micro-cents** to prevent monetary rounding drift:
- **Input Tokens (Uncached)**: $1.25 / 1,000,000 tokens (125 micro-cents / 1k tokens)
- **Cached Input Tokens**: $0.30 / 1,000,000 tokens (30 micro-cents / 1k tokens)
- **Output Tokens**: $5.00 / 1,000,000 tokens (500 micro-cents / 1k tokens)
- **Reasoning Tokens**: Priced as **Output Tokens** ($5.00 / 1,000,000 tokens)

$$\text{Cost}_{\text{microcents}} = \frac{\text{Uncached Input} \times 125 + \text{Cached Input} \times 30 + (\text{Output} + \text{Reasoning}) \times 500}{100}$$

---

## API surface & Contracts

### 1. `POST /generate` (Dummy Billable Endpoint)
- **Headers**: `Content-Type: application/json`, `Idempotency-Key: <unique-key>`
- **Request Body**:
```json
{
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "prompt": "Summarize this article",
  "input_tokens": 1000,
  "cached_input_tokens": 200,
  "output_tokens": 500,
  "reasoning_tokens": 100
}
```
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "completion": "Simulated AI completion...",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "replayed": false,
    "usage": {
      "type": "ai_tokens",
      "total_billable_tokens": 1400,
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
    "idempotency_key": "req-123"
  }
}
```

### 2. `GET /usage?tenant_id=<tenant-uuid>`
Returns current monthly usage stats, remaining quota, and accumulated costs.

---

## Key System Guardrails

1. **Database-Level Idempotency**: PostgreSQL `CONSTRAINT uk_tenant_idempotency UNIQUE(tenant_id, idempotency_key)` protects against concurrent request retries and TOCTOU race conditions.
2. **Idempotency Key Mismatch Guard**: Reusing the same `Idempotency-Key` with a different payload returns **HTTP 409 Conflict**.
3. **Pre-Check Quota Enforcement**: Synchronously checks remaining quota inside database transactions before billable execution. Exceeded quotas return **HTTP 429 Too Many Requests**. Inactive subscription states return **HTTP 402 Payment Required**.

---

## Honest Limitations

1. **Stripe Test Mode Only**: Strict reliance on Stripe Test Mode keys (`sk_test_*`). No live credit cards are processed.
2. **Simulated AI Completion**: The billable `/generate` endpoint simulates AI model outputs without calling external APIs (e.g. OpenAI/Anthropic).
3. **Single-Instance Background Job**: Reconciliation jobs run via periodic in-process scheduling rather than distributed queues (e.g. BullMQ).
