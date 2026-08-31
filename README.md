# TransitOps

TransitOps is a rule-driven transport operations platform for fleet records, dispatch,
maintenance, costs, and operational insight. This repository currently contains the
Phase 0 application foundation.

## Prerequisites

- Node.js 20.9 or newer (Node 22 LTS recommended)
- npm 10 or newer

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Supabase variables may remain
empty for the Phase 0 shell. Never place a service-role key in a browser-visible variable.

## Commands

| Command                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `npm install`          | Install the locked dependencies.                         |
| `npm run dev`          | Start the local development server.                      |
| `npm run lint`         | Run the Next.js ESLint rules.                            |
| `npm run typecheck`    | Run strict TypeScript validation without emitting files. |
| `npm test`             | Run the Vitest suite once.                               |
| `npm run build`        | Produce the optimized application build.                 |
| `npm start`            | Serve the optimized build.                               |
| `npm run format:check` | Check repository formatting.                             |

## Phase 0 routes

- `/` and `/login` are public route skeletons.
- `/dashboard` is composed under the protected application-shell route group.
- Authentication enforcement and role-aware navigation belong to P1-A1. Until then,
  the login screen intentionally collects no credentials and the protected shell is a
  composition preview, not an authorization boundary.

## Deployment

The target is Vercel. Import this repository, keep the framework preset as Next.js,
and add the values from `.env.example` after P0-C1 provisions Supabase. The production
command is `npm run build`; no privileged key belongs in Vercel's public environment.

If hosted credentials are unavailable during Phase 0, the verified local fallback is:

```bash
npm install
npm run build
npm start
```

The database migration and seed commands are owned by Seat C and will be documented
after P0-C1 verifies them.
