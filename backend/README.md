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

FleetPilot Copilot uses `GROQ_API_KEY` only in the backend and optionally accepts `GROQ_MODEL` (default: `openai/gpt-oss-20b`). Never put the key in a Vite variable or commit it. Without a key, the rest of FleetPilot remains available and the Copilot drawer shows a configuration notice.

Copilot endpoints:

- `GET /api/chat/status` reports configuration and the current role's available read tools.
- `POST /api/chat` accepts a message, up to 12 prior messages, and optional page context.

The Phase 1 model has no direct database or mutation access. Lookups are organization-scoped and role allowlisted. Conversations are capped, retained in browser local storage, and sent with each request because Groq's Responses API does not currently support provider-managed conversation state. The backend logs tool-use metadata without logging tool results or credentials.

Authentication flow:

- `Create company` creates a tenant-isolated organization and makes the first user its `OWNER`.
- Owners and admins create employee credentials and assign roles from **People & access**.
- Sign-in never accepts a role from the browser; the API resolves it from the stored organization membership.

## Trip dispatch upgrade

Existing databases must run the base organization upgrade first, followed by the
data-preserving trip/driver/FASTag upgrade:

```bash
npm run db:upgrade
npm run db:upgrade:trip-dispatch
npm run build
```

New databases can use `npm run db:push`. The upgraded model stores exact route
coordinates, route snapshots, driver documents, trip evidence, trip-linked fuel,
expenses and maintenance, plus canonical FASTag transactions.

Route planning uses `GOOGLE_MAPS_API_KEY` when available and falls back to Photon
and Valhalla. Google toll data is requested with `TOLLS`; commercial-vehicle
adjustments remain clearly labelled as estimates.

### FASTag integration

FASTag transaction history cannot be fetched from a registration number without
authorized issuer access. Configure an issuer/fleet-provider API or signed webhook:

```env
FASTAG_PROVIDER_BASE_URL=https://issuer.example/api
FASTAG_PROVIDER_API_TOKEN=server-side-token
FASTAG_WEBHOOK_SECRET=long-random-shared-secret
```

- Connect a vehicle with `POST /api/vehicles/:id/fastag`.
- Pull issuer transactions with `POST /api/vehicles/:id/fastag/sync`.
- Provider webhooks post to `POST /api/fastag/webhook/:connectionId` and sign the
  canonical body `${connectionId}.${JSON.stringify(body)}` using HMAC-SHA256 in
  `X-FASTag-Signature: sha256=<hex>`.
- `providerTxnId` is idempotent per connection.
- Settled, confidently matched transactions create one `TOLL` expense with source
  `FASTAG`; reversals zero that same expense without deleting the audit record.
- Uncertain matches are returned by
  `GET /api/fastag/transactions?matchStatus=REVIEW_REQUIRED`.
