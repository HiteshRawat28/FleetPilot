# TransitOps Backend

Express + TypeScript API backed by PostgreSQL through Prisma.

```bash
cp .env.example .env
npm install
docker compose -f ../docker-compose.yml up -d
npm run prisma:generate
npm run db:push
npm run db:seed
npm run dev
```

API: `http://localhost:4000/api` · Health: `GET /api/health`

Seed password for every role is `Password@123`. Owner account: `owner@transitops.in`.

Google sign-in uses Google Identity Services. Create a Web OAuth client, add `http://localhost:5173` as an authorized JavaScript origin, then set the same client ID as `GOOGLE_CLIENT_ID` in the backend and `VITE_GOOGLE_CLIENT_ID` in the frontend.

FleetPilot Copilot uses `GROQ_API_KEY` only in the backend and optionally accepts `GROQ_MODEL` (default: `openai/gpt-oss-20b`). Never put the key in a Vite variable or commit it. Without a key, the rest of FleetPilot remains available and the Copilot drawer shows a configuration notice. Set `COPILOT_ACTION_SECRET` to a long random server-side value for signed action confirmations; it falls back to `JWT_SECRET` for compatibility.

Copilot endpoints:

- `GET /api/chat/status` reports configuration, the current role's available tools, and guarded action types.
- `POST /api/chat` accepts a message, up to 12 prior messages, and optional page context.
- `POST /api/chat/actions/confirm` verifies and executes an unexpired draft-trip proposal.

Copilot lookups are organization-scoped and role allowlisted. Phase 2 adds assignment recommendations and operational-risk summaries. For now, organization administrators—the `OWNER` and `ADMIN` roles—can open the guided trip planner, select an available compatible vehicle and driver, and prepare a draft trip. Employee roles cannot access the preparation or confirmation endpoints. Preparation never writes data: the UI presents an explicit confirmation card, and confirmation rechecks the signed user, organization, role, token expiry, permissions, and current assignment eligibility in a serializable transaction. Successful actions are idempotent and recorded in `CopilotAction`. Dispatch, completion, cancellation, maintenance, finance, editing, and deletion remain unavailable to Copilot.

Conversations are capped, scoped to the signed-in user and organization, retained only in browser session storage, and sent with each request because Groq's Responses API does not currently support provider-managed conversation state. Confirmation tokens are intentionally removed from browser history. The backend logs tool-use metadata without logging tool results or credentials.

Copilot disclosure rules are enforced in code before Groq receives a tool result. Internal database and organization IDs are omitted, Dispatcher driver results omit licence numbers and trip revenue, Safety and Finance roles receive aggregate fleet counts without recent trip identities, and financial analytics are limited to Owner, Admin, Fleet Manager, and Financial Analyst roles. Final model text is also filtered for known internal IDs, CUID/UUID values, and JWT-shaped tokens.

Authentication flow:

- Browser authentication uses an 8-hour `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); JWTs are no longer stored in browser local storage. Bearer JWTs remain supported for non-browser API clients.
- State-changing browser requests are rejected when their `Origin` is not in `FRONTEND_URL`, and logout clears the server session cookie plus session-scoped Copilot history.
- `Create company` creates a tenant-isolated organization and makes the first user its `OWNER`.
- Owners and admins create employee credentials and assign roles from **People & access**.
- Sign-in never accepts a role from the browser; the API resolves it from the stored organization membership.

Free toll estimation:

- Google or another configured route provider remains the preferred source of monetary tolls.
- When the route provider has no price, FleetPilot builds a project-level estimate from the organization's own completed-trip history.
- `TOLL` finance expenses are matched to a completed trip for the same vehicle when their timestamp falls between 12 hours before dispatch and 36 hours after completion. A stored provider toll on a completed trip is used only when no matching finance expense exists.
- Same-corridor and same-vehicle-class observations are preferred. If none exist, same-class fleet history is used with low confidence.
- The API returns the estimate source, confidence, sample count, and observation date. With no usable evidence it returns `null`; it never invents a zero or a fixed toll-per-kilometre value.
- For useful estimates, finance users should record FASTag/toll expenses promptly and dispatchers should complete trips with accurate route distances.

NHAI TIS is suitable for manual verification, but FleetPilot does not scrape it because NHAI does not document a stable public route-pricing API. A commercial Mappls/Google adapter can be added later without changing the historical estimator.
