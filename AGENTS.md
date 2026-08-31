# Repository Instructions

## Project context

- Purpose: build TransitOps, a rule-driven transport operations platform for fleet records, dispatch, maintenance, costs, and operational insight.
- Current scope: the mandatory eight-hour hackathon v1 in `PRD.md`; bonus features are later scope until the release gate passes.
- Team shape: three human teammates mapped to Seat A, Seat B, and Seat C in `Team.md` before implementation.
- Planning docs: `PRD.md`, `Architecture.md`, `Phases.md`, `Design.md`, `Team.md`, and `Memory.md`.

## Before changing code

- Read the relevant planning documents, the current allocation in `Team.md`, and the latest state in `Memory.md`.
- Inspect existing code and tests before modifying behavior.
- Work only inside the active phase and the paths owned by the claimed team seat.
- Do not overwrite another teammate's in-progress work or change a shared contract silently.
- Preserve user-authored and unrelated changes.

## Commands

Verified with Node.js 22.22.2 and npm 10.9.7 on 2026-08-31:

- `npm install` - install the locked application dependencies; completed with zero audit vulnerabilities.
- `npm run dev` - start the Next.js development server; `/` returned HTTP 200.
- `npm run format:check` - check formatting for Seat A foundation paths.
- `npm run lint` - run the Next.js ESLint rules.
- `npm run typecheck` - run strict TypeScript validation without emitting files.
- `npm test` - run Vitest once; 7 route-access tests passed.
- `npm run build` - produce the optimized Next.js build; `/`, `/login`, and `/dashboard` were statically generated.
- `npm start` - serve the production build; `/`, `/login`, and `/dashboard` returned HTTP 200.

The hosted deployment command is not verified because Vercel authorization is unavailable in this workspace. The production-build/start fallback is verified and documented in `README.md`. Database migration and seed commands remain owned by Seat C and are not yet established.

## Engineering conventions

- Use TypeScript strictness and avoid untyped business data.
- Keep UI composition in `src/app`, reusable visuals in `src/components`, feature behavior in `src/features`, and authoritative lifecycle integrity in database commands.
- Validate at the form boundary for feedback and again at the server/database boundary for enforcement.
- Never expose a generic write path for vehicle, driver, trip, or maintenance lifecycle statuses.
- Use named commands for dispatch, completion, cancellation, maintenance open, and maintenance close.
- Normalize vehicle registration on the server and enforce uniqueness in PostgreSQL.
- Represent expected domain failures with stable error codes and plain-language UI messages; do not leak SQL/internal exceptions.
- Store dates/times consistently, use UTC timestamps, and compare licence expiry as a business date.
- Add or update tests for every changed business rule, permission, calculation, or state transition.
- Prefer small feature-local modules. New shared abstractions require agreement from the owning seat before dependents use them.

## Collaboration

- `Team.md` is the single source of live ownership and integration order. Only its current update owner edits active assignments/status.
- One writer owns a file, migration, schema, root configuration, or shared interface at a time.
- Keep one active implementation item per person unless the team explicitly changes the limit.
- Shared contracts freeze before dependent work starts. Propose changes to Seat C; record accepted durable changes in `Architecture.md`.
- Owners run item-level validation and provide the handoff described in `Team.md`.
- A different teammate reviews risk-bearing changes. Agent analysis does not replace human review.
- The milestone integration owner merges in dependency order and runs combined validation.

## Product and design constraints

- Mandatory business rules BR-001 through BR-012 are release invariants.
- UI eligibility filtering never replaces server/database validation.
- Status is communicated by text plus icon, never color alone.
- Explain disabled actions and blocked transitions with a recovery path.
- Preserve entered data on validation/network errors; do not optimistically show critical transitions as successful.
- Implement loading, initial-empty, filtered-empty, error, disabled, submitting, success, and permission-denied states.
- Target keyboard completion, visible focus, semantic controls, WCAG 2.2 AA contrast, and 44 px primary mobile targets.
- Never display fabricated zero KPI values while data is loading or a ratio denominator is zero.

## Boundaries

- Always: enforce authorization and invariants at the server/database boundary; preserve atomic status changes; update tests and relevant planning state.
- Ask first: changing the stack after Phase 0, changing calculation definitions, widening role permissions, adding third-party services, or expanding beyond v1.
- Never: commit credentials/tokens, expose privileged database keys to the client, bypass RLS for convenience, edit outside an owned path without coordination, or begin bonus work before the mandatory gate passes.

## Memory protocol

- Update `Memory.md` after a meaningful milestone, durable decision, approved deviation, or blocker.
- Keep current state concise, append only durable milestone history, and never store secrets or credentials.
