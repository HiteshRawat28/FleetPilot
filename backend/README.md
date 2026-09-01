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
