# JOB CARD: LLM Usage Metering & Billing Engine

## Project Summary
- **Project**: LLM Usage Metering & Billing Engine
- **Track**: FlyRank Internship Backend Track Capstone
- **Core Technology Stack**: Node.js, Express, TypeScript, PostgreSQL (Docker Compose), Stripe API (Test Mode)
- **Primary Goal**: Design and implement an accurate, high-concurrency, multi-tenant usage metering and billing infrastructure for API calls and AI tokens with exact quota guardrails and idempotent Stripe integration.

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
- [x] **Quota & Boundary Behavior**: Establish pre-check enforcement rules returning HTTP `429` / `402`.
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
- [x] **Execution Proof & Documentation**: Create `EVIDENCE.md` with complete command outputs, API transcripts, test logs, and database query proofs.

---

### Phase 3: Stripe Integration & System Hardening (Upcoming)
- [ ] **Stripe Checkout Integration**: Implement `POST /checkout/session` for Pro upgrades.
- [ ] **Stripe Webhook Listener**: Cryptographic raw body signature verification for `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- [ ] **Webhook Event Deduplication**: Atomic inserts into `stripe_events` table (`stripe_event_id UNIQUE`).
- [ ] **Background Reconciliation Job**: Monthly usage rollup and period state sync job.
- [ ] **Final Security Scan & Verification**: Repository audit, test suite validation, and final project documentation.

---

## Phase 2 Deliverables Baseline
1. `src/db/migrations/001_initial_schema.sql` (Schema DDL)
2. `src/db/migrate.ts` & `src/db/seed.ts` (Migration & Seed runners)
3. `src/services/pricing.service.ts` (Integer micro-cents token calculator)
4. `src/services/meter.service.ts` (MeterService, quota pre-check & idempotency logic)
5. `src/services/usage.service.ts` (Usage aggregation & reporting)
6. `src/routes/generate.router.ts` & `src/routes/usage.router.ts` (API Endpoints)
7. `src/tests/` (Automated unit & integration test suite)
8. `EVIDENCE.md` (Detailed Phase 2 verification proof)
