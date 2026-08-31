# JOB CARD: LLM Usage Metering & Billing Engine

## Project Summary
- **Project**: LLM Usage Metering & Billing Engine
- **Track**: FlyRank Internship Backend Track Capstone
- **Core Technology Stack**: Node.js, Express, TypeScript, PostgreSQL (Docker Compose), Stripe API (Test Mode)
- **Primary Goal**: Design and implement an accurate, high-concurrency, multi-tenant usage metering and billing infrastructure for API calls and AI tokens with exact quota guardrails and idempotent Stripe integration.

---

## Task Checklist & Execution Status

### Phase 1: Architecture & Design Foundation (CURRENT PHASE)
- [x] **Repository Audit & Setup**: Initialize Node.js + TypeScript structure and `.gitignore` baseline.
- [x] **Secret Safety Verification**: Configure `.env.example` with dummy values and confirm `.env` is ignored.
- [x] **Problem & Scope Formulation**: Define problem statement, explicit scope, and non-goals in `DESIGN.md`.
- [x] **Architectural Blueprinting**: Render system architecture & multi-layered components (Express, Database, Stripe).
- [x] **Database Schema Design**: Conceptualize relational schema for `tenants`, `plans`, `subscriptions`, `usage_events`, and `stripe_events`.
- [x] **Idempotency & Race Condition Prevention**: Design PostgreSQL composite unique constraint strategy `UNIQUE(tenant_id, idempotency_key)` to prevent TOCTOU double-metering.
- [x] **Pro Tier Limits & Pricing Model**: Define plan limits (Free: 1k calls / 100k tokens; Pro: 50k calls / 5M tokens at $49/mo) and pinned micro-unit token rates ($1.25 input, $0.30 cached input, $5.00 output/reasoning).
- [x] **API Specifications**: Define contracts for `POST /generate` and `GET /usage`.
- [x] **Quota & Boundary Behavior**: Establish pre-check enforcement rules and boundary test cases (`limit - 1`, `limit`, `limit + 1`) returning HTTP `429` / `402`.
- [x] **Stripe Integration & Webhook Deduplication**: Map Stripe checkout, lifecycle events, raw signature validation, and atomic event deduplication via `stripe_events`.
- [x] **Background Job Strategy**: Design monthly usage reconciliation & rollup job.
- [x] **Documentation & Phase 1 Validation**: Finalize `README.md` (with limitations), `DESIGN.md`, `JOB-CARD.md`, and complete Phase 1 Git checkpoint commit.

---

### Phase 2: Core Engine Implementation (Upcoming)
- [ ] **Docker Compose Setup**: PostgreSQL database container configuration.
- [ ] **Database Migration Scripts**: DDL schema migrations with indices and foreign keys.
- [ ] **Middleware & Tenant Isolation**: Implement tenant extraction and quota verification middleware.
- [ ] **Billable Endpoint (`POST /generate`)**: Implement atomic usage log insertion with idempotency key handling.
- [ ] **Usage Reporting (`GET /usage`)**: Aggregate usage stats and calculate cost in integer money units.
- [ ] **Stripe Checkout & Webhooks**: Implement subscription flow and idempotent webhook listener.
- [ ] **Background Reconciliation Job**: Periodic job execution for monthly billing resets and rollups.

---

### Phase 3: Verification & Load Testing (Upcoming)
- [ ] **Unit & Integration Tests**: Test quota checks, boundary transitions, and calculations.
- [ ] **Concurrency & Idempotency Tests**: Stress test simultaneous retries with matching idempotency keys.
- [ ] **Webhook Replay Testing**: Verify signature rejection and zero duplicate side-effects.

---

## Phase 1 Deliverables Baseline
1. `JOB-CARD.md` (This file)
2. `DESIGN.md` (Detailed 16-section technical design blueprint)
3. `.env.example` (Safe credential templates)
4. `.gitignore` (Secret masking & file filtering)
5. `README.md` (Project overview, pricing tiers, setup guide, and honest limitations)
