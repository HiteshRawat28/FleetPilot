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

Seed password for every role is `Password@123`. Accounts: `manager@transitops.in`, `dispatcher@transitops.in`, `safety@transitops.in`, and `finance@transitops.in`.
