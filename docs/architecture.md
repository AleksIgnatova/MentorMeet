# Architecture

This document records the architecture and the main technical decisions. It is
updated at the end of each implementation phase.

## Overview

```text
React (Vite) ──HTTP/JSON──▶ Express API ──Prisma──▶ PostgreSQL
   [Phase 5]                 [Phase 1]    [Phase 2]
```

Monorepo with independent `backend/` and (later) `frontend/` packages, each with its
own `package.json` and lockfile so they can be deployed separately (e.g. Render and
Vercel). The root `package.json` only holds convenience scripts that delegate with
`npm --prefix`; npm workspaces are deliberately not used, to keep per-package
deploys simple.

## Backend layout

```text
backend/src/
├── app.ts                 createApp(config): builds the Express app, binds no port
├── server.ts              Starts HTTP server, graceful shutdown on SIGTERM/SIGINT
├── config/env.ts          Zod-validated environment → frozen AppConfig
├── common/http-errors.ts  HttpError + stable ErrorCode values
├── middleware/
│   ├── error-handler.ts   Central error → JSON mapping
│   ├── not-found.ts       JSON 404 for unknown routes
│   └── rate-limit.ts      express-rate-limit wrapper that emits HttpError(429)
└── modules/
    └── health/            GET /api/health
```

Feature modules (`slots`, `bookings`, `ai`) will each follow
`*.routes.ts → *.controller.ts (thin) → *.service.ts (business logic) → Prisma`,
with Zod schemas in `*.schemas.ts`.

### Request pipeline (order matters)

1. `cors({ origin: FRONTEND_URL list })`. Other origins get no CORS headers, so browsers block them.
2. `express.json({ limit: '10kb' })`
3. `/api/health`: mounted **before** the rate limiter so uptime probes are never throttled.
4. `/api` rate limiter: 300 requests / 15 min per IP by default. Stricter per-route limiters for booking and AI endpoints come in later phases.
5. Feature routers (later phases).
6. `notFoundHandler` → `ROUTE_NOT_FOUND`.
7. `createErrorHandler`.

## Decisions

### Express 5 instead of an async wrapper
Express 5 forwards rejected promises from async handlers to the error middleware.
The `common/async-handler.ts` file from the original plan is therefore unnecessary
and was not created. A test (`tests/app.test.ts`) verifies that an async handler's
rejection reaches the error handler.

### App factory with injected config
`createApp(config, options)` takes the validated config rather than reading
`process.env`. Tests can build apps with different CORS origins and rate limits
without mutating globals.

### Environment validation
`config/env.ts` validates variables with Zod at import time. Startup fails fast with
a list of the invalid variable names. Values are never echoed, so secrets don't leak
into logs. `.env` is loaded with Node's built-in `process.loadEnvFile` (no `dotenv`
dependency), and real environment variables take precedence over it. Under
`NODE_ENV=test`, `.env` is not loaded; `tests/setup.ts` points at the separate
`mentormeet_test` database instead.

### Error handling
All errors produce `{ "error": { "code", "message", "details?" } }`.

- `HttpError` instances are client-safe and returned as-is.
- `ZodError` → 400 `VALIDATION_ERROR` with per-field `details`.
- Body-parser errors → 400 `INVALID_JSON` / 413 `PAYLOAD_TOO_LARGE`.
- Anything else → 500 `INTERNAL_ERROR` with a generic message. The original error
  is logged server-side with only the HTTP method. URLs and bodies are not logged
  because they may contain emails or confirmation tokens. A `stack` field is added
  **only** when `NODE_ENV=development`.

### Proxy awareness
`TRUST_PROXY` (number of hops) sets Express's `trust proxy`, so rate limiting keys on
the real client IP behind a platform load balancer instead of on the proxy's IP.

### Tooling
- TypeScript is pinned to 5.9.x. TypeScript 7 (the native port) is `latest` on npm,
  but `typescript-eslint` and `ts-jest` don't support it yet.
- The Jest config is `jest.config.mts`, loaded through Node's native TypeScript
  support (Node ≥ 22.18). This avoids adding `ts-node`.

## Planned (later phases)

- **Phase 2:** Prisma models `TimeSlot` and `Booking`. `timestamptz` columns, a unique
  `Booking.timeSlotId`, a `CHECK (start_time < end_time)`, and a `btree_gist`
  exclusion constraint on `tstzrange(start_time, end_time, '[)')` for non-cancelled
  slots, to prevent overlaps at the database level.
- **Phase 4:** Atomic booking: a conditional `UPDATE … WHERE status = 'AVAILABLE' AND
  start_time > now()` plus `INSERT booking` in one transaction, mapping a 0-row
  update or a unique violation to 409.
