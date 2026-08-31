# JOB CARD: LLM Usage Metering & Billing Engine

## Project Summary
- **Project**: LLM Usage Metering & Billing Engine
- **Track**: FlyRank Internship Backend Track Capstone
- **Core Technology Stack**: Node.js, Express, TypeScript, PostgreSQL (Docker Compose), Stripe API (Test Mode)
- **Primary Goal**: Design and implement an accurate, high-concurrency, multi-tenant usage metering and billing infrastructure for API calls and AI tokens with exact quota guardrails, database-level idempotency, and signature-verified Stripe webhooks.

---

## Task Checklist & Execution Status

### Phase 1: Architecture & Design Foundation (COMPLETED - PASS)
- [x] **Repository Audit & Setup**: Initialize Node.js + TypeScript structure and `.gitignore` baseline.
- [x] **Secret Safety Verification**: Configure `.env.example` with dummy values and confirm `.env` is ignored.
- [x] **Problem & Scope Formulation**: Define problem statement, explicit scope, and non-goals in `DESIGN.md`.
- [x] **Architectural Blueprinting**: Render system architecture & multi-layered components.
- [x] **Database Schema Design**: Conceptualize relational schema for `tenants`, `plans`, `subscriptions`, `usage_events`, and `stripe_events`.
- [x] **Idempotency & Race Condition Prevention**: Design PostgreSQL composite unique constraint strategy `UNIQUE(tenant_id, idempotency_key)`.
- [x] **Pro Tier Limits & Pricing Model**: Define plan limits (Free vs Pro) and pinned micro-unit token rates.
- [x] **API Specifications**: Define contracts for `POST /generate` and `GET /usage`.
- [x] **Documentation & Phase 1 Validation**: Finalize baseline artifacts and Git commit `12a049d`.

---

### Phase 2: Core Billing Logic & Metering (COMPLETED - PASS)
- [x] **PostgreSQL Persistence & DDL**: Create SQL migration DDL `001_initial_schema.sql` with primary keys, foreign keys, indices, and composite unique constraint `UNIQUE(tenant_id, idempotency_key)`.
- [x] **Migration & Seed Scripting**: Implement `npm run migrate` (`src/db/migrate.ts`) and `npm run seed` (`src/db/seed.ts`).
- [x] **Deterministic Seed Data**: Seed Free ($0) and Pro ($49) plans, plus Demo Tenant (`00000000-0000-0000-0000-000000000001`) with active Free subscription.
- [x] **Integer Micro-Cents Pricing Calculator**: Implement `PricingService` computing costs in micro-cents ($1.25 input, $0.30 cached, $5.00 output/reasoning) with ZERO floating point math.
- [x] **MeterService & Idempotency Engine**: Implement `MeterService.recordUsage()` with PostgreSQL error `23505` handling, returning `{ replayed: true }` on exact retry and HTTP 409 Conflict on payload mismatch.
- [x] **Pre-Check Quota Guardrails**: Enforce synchronous quota checking inside transactions before execution, returning HTTP 429 (`quota_exceeded`) on overflow and 402 (`payment_required`) on inactive billing.
- [x] **Dummy Billable Endpoint (`POST /generate`)**: Implement endpoint supporting simulated AI token breakdowns and idempotency header validation.
- [x] **Usage Reporting (`GET /usage`)**: Implement tenant-isolated usage aggregation endpoint.
- [x] **Automated Test Suite**: Implement unit and integration tests covering pricing, idempotency, quota boundaries, and API validation.
- [x] **Execution Proof**: Finalize `EVIDENCE.md` baseline and Git commit `4176646`.

---

### Phase 3: Stripe Checkout & Verified Webhooks (COMPLETED - PASS)
- [x] **Stripe SDK & Service Module**: Implement `StripeService` (`src/services/stripe.service.ts`) encapsulating official Node.js Stripe SDK API calls in Test Mode.
- [x] **Checkout Endpoint (`POST /checkout/session`)**: Create session builder associating Pro plan price and tenant metadata, returning checkout URL.
- [x] **Raw Body Webhook Parsing**: Configure Express `express.raw({ type: 'application/json' })` for `/webhooks/stripe` route handler.
- [x] **Cryptographic Webhook Signature Verification**: Implement `stripe.webhooks.constructEvent()` validation returning HTTP 400 Bad Request on invalid HMAC signatures.
- [x] **Database Webhook Deduplication**: Enforce atomic event deduplication via `stripe_events` table (`stripe_event_id UNIQUE`) protecting against duplicate delivery and concurrent delivery races.
- [x] **Required Event Handlers**:
  - `checkout.session.completed`: Upgrade tenant subscription to Pro plan (`plan_id = 'pro'`, `status = 'active'`).
  - `customer.subscription.updated`: Synchronize local subscription status (`active`, `past_due`, `unpaid`).
  - `customer.subscription.deleted`: Revert tenant plan to Free limits (`status = 'canceled'`).
- [x] **Dynamic Quota Integration**: Connect Stripe subscription state synchronization directly to `MeterService` pre-check quota evaluation.
- [x] **Stripe Test Suite**: Implement unit and integration tests in `src/tests/stripe.test.ts`.
- [x] **Documentation & Verification Proof**: Update `EVIDENCE.md`, `README.md`, `JOB-CARD.md`, and complete Phase 3 Git checkpoint.

---

## Deliverables Baseline Summary
1. `src/services/stripe.service.ts` (Dedicated Stripe service layer)
2. `src/routes/checkout.router.ts` & `src/routes/webhook.router.ts` (Checkout & Webhook API endpoints)
3. `src/tests/stripe.test.ts` (Stripe integration test suite)
4. `EVIDENCE.md` (Comprehensive execution proof)
5. `README.md` & `JOB-CARD.md` (Project documentation & task checklist)
