# Repository Instructions

## Project context

- FleetPilot is an India-oriented fleet operations web app for vehicles, drivers, trip dispatch, maintenance, fuel/expenses, and analytics.
- The current stack is React/Vite in `frontend`, Express/TypeScript in `backend`, and PostgreSQL through Prisma.
- Read `PRD.md`, `Architecture.md`, `Design.md`, and `Memory.md` before making broad changes.
- FleetPilot is the UI product name. TransitOps is still used by package names, demo organization data, API labels, and storage/export names; do not rename either globally without confirming the intended naming boundary.

## Before changing code

- Check `git status` and preserve unrelated or uncommitted work.
- Inspect the relevant source and tests before changing behavior.
- Treat `frontend/src`, `backend/src`, and `backend/prisma` as source. Do not hand-edit generated `dist`, Prisma client, Vite cache, or `node_modules` files.
- Keep schema, seed, backend validation/API responses, frontend types/forms, and tests synchronized when a domain field changes.
- Update `Memory.md` after a durable decision, meaningful milestone, or blocker.

## Commands

There is no root npm workspace; run npm commands inside each app.

- Database: `docker compose up -d` from the repository root.
- Backend setup: copy `backend/.env.example` to `backend/.env`, then run `npm install`, `npm run prisma:generate`, `npm run db:push`, and optionally `npm run db:seed` from `backend`.
- Backend development: `npm run dev`.
- Backend validation: `npm run build` and `npm test`.
- Frontend setup: copy `frontend/.env.example` to `frontend/.env`, then run `npm install` from `frontend`.
- Frontend development: `npm run dev`.
- Frontend validation: `npm run build` and `npm run lint`.
- Production-style local run: `npm start` in `backend`; `npm run preview` in `frontend`.

Known command status and current blockers are recorded in `Memory.md`; do not assume a script passes merely because it exists.

## Engineering rules

- The API is the authorization boundary. Client-side navigation and hidden controls are not security controls.
- Validate request input with Zod and return stable, user-safe error shapes.
- Preserve multi-entity trip and maintenance transitions with transactions. Assignment claims must remain concurrency-safe.
- Do not allow generic status edits to bypass trip or maintenance state rules.
- Current assignment compatibility is exact license-category matching (`LMV`, `HMV`, or `MCWG`) plus availability, license expiry, capacity, active trip, maintenance, and draft-state checks.
- Keep assignment rules centralized in `backend/src/services/assignmentEligibility.ts`; both trip creation and dispatch must call the same evaluator.
- Preserve the assignment error envelope `{ code: "ASSIGNMENT_FAILED", message, reasons }`. Add new stable reason codes rather than making the frontend parse human-readable messages.
- Cargo errors must include `cargoWeightKg`, `capacityKg`, and `excessKg`; license mismatches must include required and held categories.
- Changes to roles, assignment rules, state transitions, schema, analytics formulas, or CSV export require tests.
- Prefer reviewed Prisma migrations for shared data. `db:push` is only appropriate for disposable local development.
- `backend/prisma/seed.ts` deletes application data before loading the demo dataset. Never run it against valued data.
- Never expose values from local `.env` files or store credentials/tokens in context documents.
- Keep client requests typed and handle loading, empty, error, disabled, conflict, and success states explicitly.
- Preserve INR and `en-IN` formatting unless localization requirements change.

## Repository hazards

- Git currently tracks both `node_modules` trees and compiled/cache artifacts despite ignore rules. Install/build commands can create very large diffs.
- The root `.env.example` and parts of `.gitignore` still describe a previous Next.js/Supabase shape, while the implemented app is Vite/Express/PostgreSQL.
- Most backend behavior is still concentrated in `backend/src/server.ts`; most UI behavior is concentrated in `frontend/src/App.tsx`. Make small changes and extract only with tests protecting behavior.
- The shared demo password and fallback development JWT secret are local-demo conveniences, not production configuration.

## Product and UX boundaries

- Do not describe static landing/dashboard values as actual live telemetry.
- Keep primary flows usable from 320px width and by keyboard.
- Dialogs need accessible naming, focus containment/restoration, and Escape behavior.
- Icon-only controls need accessible labels; status cannot depend on color alone; motion must respect `prefers-reduced-motion`.
- Ask before changing product naming, role read permissions, analytics definitions, deployment architecture, or destructive data behavior.
