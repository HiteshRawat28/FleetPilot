# FleetPilot integration verification

## Test layers

- Backend unit tests validate authentication, authorization, assignment rules, OCR, analytics, profitability, notifications, and location trust/status rules.
- Backend HTTP integration tests validate driver login, assignment isolation, location validation, idempotency, web polling/SSE visibility, and terminal-trip rejection.
- Frontend tests validate `WAITING_FOR_GPS`, polling/SSE URL consistency, event deduplication, and the 100-point trail limit.
- Flutter tests validate secure sessions, driver-only endpoints, exact upload JSON, encrypted queue behavior, capture normalization, retries, and every documented HTTP error state.
- The opt-in Flutter live test sends the real mobile repository contract to a running FleetPilot backend.

## Safe integration seed

`prisma/seed-integration.ts` deletes and recreates only organizations with the dedicated integration slugs. It never deletes normal development organizations.

```bash
cd backend
npm run db:seed:integration
```

Fixture driver:

```text
verified.driver.integration@transitops.test
Integration@123
```

The standard development seed also includes a verified linked driver:

```text
driver@transitops.in
Password@123
```

## Commands

```bash
cd backend
npm test
npm run build
INTEGRATION_BASE_URL=http://localhost:4100/api npm run test:integration

cd ../frontend
npm run lint
npm test
npm run build

cd /Users/sanketmistry/Desktop/TransiOps_app
flutter analyze
flutter test
flutter test test/live_backend_integration_test.dart \
  --dart-define=RUN_LIVE_INTEGRATION=true \
  --dart-define=API_BASE_URL=http://localhost:4100/api
```

Use a disposable PostgreSQL schema for the HTTP and Flutter live tests. The regular unit test run skips live-network tests by default.
