# Architecture — FleetPilot

## System shape

```text
Browser (React/Vite)
    -> JSON + Bearer JWT
Express API (auth, RBAC, Zod, domain workflows)
    -> Prisma Client
PostgreSQL 16 (Docker Compose locally)
```

- Frontend entry: `frontend/src/main.tsx` -> `frontend/src/App.tsx`.
- API client/session: `frontend/src/api.ts`.
- Frontend domain types: `frontend/src/types.ts`.
- API entry: `backend/src/server.ts`.
- Assignment rules: `backend/src/services/assignmentEligibility.ts` with unit tests beside it.
- Data model and demo data: `backend/prisma/schema.prisma` and `backend/prisma/seed.ts`.
- Local database: `docker-compose.yml`.

## Runtime flow

1. The browser shows the landing/login experience or restores `transitops_token` using `GET /api/auth/me`.
2. `frontend/src/api.ts` calls `VITE_API_URL`, defaulting to `http://localhost:4000/api`.
3. Express applies CORS, JSON parsing, JWT authentication, endpoint role checks, and Zod validation.
4. Route handlers query/update PostgreSQL through one Prisma client.
5. Normal responses are JSON. Assignment conflicts return a structured error with `code: ASSIGNMENT_FAILED` and field-specific reasons. Analytics can return CSV.

## Main data model

- `User`: identity, password hash, and one of four roles.
- `Vehicle`: registration, type, capacity, required license category, odometer, acquisition cost, status, and region.
- `Driver`: license number/category/expiry, contact, safety score, and status.
- `Trip`: route, cargo, planned distance, revenue, vehicle/driver, status, and lifecycle timestamps/readings.
- `Maintenance`: service details, cost, dates, status, and vehicle.
- `FuelLog` and `Expense`: vehicle-linked operating costs.

Unique business keys are user email, vehicle registration, driver license number, and trip number.

## Main state transitions

- Create trip -> `DRAFT`; resources stay available.
- Dispatch draft -> trip `DISPATCHED`, vehicle/driver `ON_TRIP` in a serializable transaction with conditional claims.
- Complete dispatched trip -> trip `COMPLETED`, closing readings saved, vehicle/driver `AVAILABLE`.
- Cancel draft/dispatched trip -> `CANCELLED`; live resources are released.
- Open maintenance -> record `ACTIVE`, vehicle `IN_SHOP`.
- Close maintenance -> record `CLOSED`, non-retired vehicle `AVAILABLE`.

`assignmentEligibility.ts` centralizes the current dispatch checks and produces multiple actionable failure reasons. The UI mirrors capacity/category checks for immediate feedback, while the server rechecks before creation and dispatch.

## API summary

- Public: `GET /api/health`, `POST /api/auth/login`.
- Auth: `GET /api/auth/me`.
- Dashboard: `GET /api/dashboard`.
- Vehicles: list/available/create/update/delete.
- Drivers: list/available/create/update/delete.
- Trips: list, validate assignment, create, dispatch, complete, cancel.
- Maintenance: list, create, close.
- Finance: list, add fuel, add expense.
- Analytics: JSON summary and CSV export.

See `backend/src/server.ts` for the exact route/role matrix; it is the current source of truth.

### Assignment validation interface

- `POST /api/trips/validate-assignment` accepts `vehicleId`, `driverId`, and `cargoWeightKg` and returns `{ eligible, reasons }` without creating a trip.
- `POST /api/trips` and `POST /api/trips/:id/dispatch` return HTTP `409` for assignment conflicts with this stable envelope:

```json
{
  "code": "ASSIGNMENT_FAILED",
  "message": "Assignment failed for 2 reasons.",
  "reasons": [
    {
      "code": "CARGO_OVER_CAPACITY",
      "field": "cargoWeightKg",
      "message": "Cargo exceeds Van-05's capacity by 120 kg.",
      "details": { "cargoWeightKg": 620, "capacityKg": 500, "excessKg": 120 }
    }
  ]
}
```

- Reason codes are part of the frontend/backend contract and must not be renamed casually.
- Vehicle license requirements use the Prisma `LicenseCategory` enum. Existing driver license values remain stored as text for backward-compatible database migration, while Zod restricts API writes to `LMV`, `HMV`, or `MCWG`.
- Existing vehicles receive `LMV` as the schema migration default and must be reviewed if their operational requirement differs; the demo `Truck-11` is explicitly `HMV`.

## Configuration

- Backend: `DATABASE_URL`, `JWT_SECRET`, `PORT`, comma-separated `FRONTEND_URL`.
- Frontend: `VITE_API_URL`.
- Local PostgreSQL: database/user/password and port `5432` are defined in `docker-compose.yml`.
- No application Dockerfile, CI workflow, production deployment, reverse proxy, or migration history is currently established.

## Known architectural risks

- Trip numbers still use `count()+1` and can collide under concurrency.
- Direct vehicle/driver status edits can bypass lifecycle invariants.
- Completion does not enforce monotonic odometer at the API boundary.
- Maintenance creation/cancellation/closing are transactional but not fully protected against concurrent conflicting operations.
- JWT has a development fallback, no rate limiting/revocation, and is stored in browser localStorage.
- Most reads are available to every authenticated role.
- Monetary fields use floating-point storage.
- Analytics loads whole tables and uses formulas whose status/time semantics are not approved.
- Raw Prisma records tightly couple database and frontend contracts.
- License compatibility is currently exact category equality; it does not model jurisdiction-specific category hierarchies or endorsements.
- There is no pagination, OpenAPI contract, structured observability, database readiness, backup/restore, or production runbook.
