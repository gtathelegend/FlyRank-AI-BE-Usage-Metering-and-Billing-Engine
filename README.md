# FlyRank AI — LLM Usage Metering & Billing Engine

An enterprise-grade, high-concurrency **LLM Usage Metering & Billing Engine** designed to track API calls and multi-dimensional AI token usage with exact quota guardrails, database-level idempotency guarantees, zero-drift integer financial calculations, and Stripe subscription synchronization in Test Mode.

---

## Technical Stack & Foundation

- **Backend Framework**: Node.js + Express with TypeScript
- **Database**: PostgreSQL (via Docker Compose)
- **Payment Provider**: Stripe API (Test Mode Only)
- **Idempotency Model**: PostgreSQL Composite Unique Constraint `UNIQUE(tenant_id, idempotency_key)`
- **Financial Arithmetic**: Integer Micro-Cents (1 Cent = 10,000 Micro-Cents)

---

## Subscription Plans & Tier Limits

| Plan Name | Monthly API Call Limit | Monthly AI Token Limit | Monthly Price (USD) | Price (Integer Cents) |
|---|---|---|---|---|
| **Free Plan** | 1,000 calls | 100,000 tokens | $0.00 | `0` cents |
| **Pro Plan** | 50,000 calls | 5,000,000 tokens | $49.00 | `4900` cents |

---

## AI Token Pricing Rates (Pinned Configuration)

All usage costs are calculated in integer **micro-cents** (1 cent = 10,000 micro-cents) to prevent rounding drift:

- **Input Tokens (Uncached)**: $1.25 per 1,000,000 tokens (125 micro-cents / 1k tokens)
- **Cached Input Tokens**: $0.30 per 1,000,000 tokens (30 micro-cents / 1k tokens)
- **Output Tokens**: $5.00 per 1,000,000 tokens (500 micro-cents / 1k tokens)
- **Reasoning Tokens**: Priced as **Output Tokens** ($5.00 per 1M tokens)

---

## Key System Architecture Features

1. **Pre-Execution Quota Enforcement**: Synchronous quota evaluation happens *before* executing billable actions. Exceeded quotas return **HTTP 429 Too Many Requests**. Inactive subscription states return **HTTP 402 Payment Required**.
2. **Race-Condition Safe Idempotency**: Atomic database unique constraints prevent double-metering during concurrent HTTP retries.
3. **Stripe Event Deduplication**: Webhooks parse raw request bodies for signature verification and insert event IDs into a `stripe_events` deduplication table.
4. **Tenant Isolation**: Multi-tenant dataset isolation enforced via database schema design and middleware query scoping.

---

## Project Structure

```text
├── DESIGN.md           # Comprehensive 16-section technical design document
├── JOB-CARD.md         # Phase tracking and task execution checklist
├── .env.example        # Template for environment variables (safe placeholders only)
├── .gitignore          # Repository git ignore rules
├── package.json        # Dependencies and project scripts
└── README.md           # Project summary, architecture, and limitations
```

---

## Honest Limitations

1. **Stripe Test Mode Only**: This project is configured strictly for Stripe Test Mode (`sk_test_*`). Real payments are not processed.
2. **Simulated AI Completion**: The billable `/generate` endpoint simulates AI token usage and completion text rather than invoking external LLM APIs (OpenAI/Anthropic).
3. **Single-Instance Background Scheduler**: The background reconciliation job runs via simple periodic scheduling within the process rather than a distributed worker queue (like BullMQ/Celery).
4. **Single-Region PostgreSQL**: High-concurrency ACID guarantees rely on single-region PostgreSQL transactions rather than distributed consensus protocol setups.
