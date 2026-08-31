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

Authentication flow:

- `Create company` creates a tenant-isolated organization and makes the first user its `OWNER`.
- Owners and admins create employee credentials and assign roles from **People & access**.
- Sign-in never accepts a role from the browser; the API resolves it from the stored organization membership.
