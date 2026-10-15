# Architecture

This document records the architecture and the main technical decisions. It is
updated at the end of each implementation phase.

## Overview

```text
React (Vite) ──HTTP/JSON──▶ Express API ──Prisma (pg adapter)──▶ PostgreSQL
   [Phase 5]                 [Phase 1]         [Phase 2]
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
├── common/db-errors.ts    Reads the PostgreSQL SQLSTATE from Prisma errors
├── lib/prisma.ts          createPrismaClient(url) + shared `prisma` client
├── utils/date-time.ts     Europe/Skopje wall-clock <-> instant conversion (DST-safe)
├── utils/api-response.ts  `{ data }` success envelope
├── generated/prisma/      Generated Prisma client (git-ignored, `prisma generate`)
├── middleware/
│   ├── error-handler.ts   Central error → JSON mapping
│   ├── not-found.ts       JSON 404 for unknown routes
│   └── rate-limit.ts      express-rate-limit wrapper that emits HttpError(429)
└── modules/
    ├── health/            GET /api/health
    └── slots/             /api/slots: routes, controller, service, schemas, types
```

Feature modules (`slots`, `bookings`, `ai`) will each follow
`*.routes.ts → *.controller.ts (thin) → *.service.ts (business logic) → Prisma`,
with Zod schemas in `*.schemas.ts`.

### Request pipeline (order matters)

1. `cors({ origin: FRONTEND_URL list })`. Other origins get no CORS headers, so browsers block them.
2. `express.json({ limit: '10kb' })`
3. `/api/health`: mounted **before** the rate limiter so uptime probes are never throttled.
4. `/api` rate limiter: 300 requests / 15 min per IP by default. Stricter per-route limiters for booking and AI endpoints come in later phases.
5. Feature routers: `/api/slots` (bookings and AI in later phases).
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

## Database

### Prisma 7 setup
- Prisma **7.10.0** (`prisma`, `@prisma/client` and `@prisma/adapter-pg` pinned to
  exactly the same version). npm's `latest` tag for the `prisma` CLI pointed at an
  8.0 release candidate at the time, so it was deliberately not used.
- Prisma 7 has no Rust query engine. The client talks to PostgreSQL through the
  `pg` driver adapter (`lib/prisma.ts`). The Prisma-specific `?schema=` URL
  parameter is removed from the connection string and passed to the adapter instead.
- The client is generated as TypeScript into `src/generated/prisma`
  (`moduleFormat = "cjs"`). It is git-ignored and regenerated by `postinstall` and
  `build`.
- `prisma.config.ts` holds the datasource URL, migrations path and seed command.
  Prisma 7 no longer reads `.env` itself, so the config loads `backend/.env` when present.

### Tables

`time_slots`: `id` uuid PK (`gen_random_uuid()`), `start_time`/`end_time`
`timestamptz(3)`, `status` enum `time_slot_status` (AVAILABLE | BOOKED | CANCELLED,
default AVAILABLE), `created_at`/`updated_at` `timestamptz(3)`.

`bookings`: `id` uuid PK, `time_slot_id` uuid **UNIQUE** FK → `time_slots.id`,
`name` varchar(100), `email` varchar(254), `status` enum `booking_status`
(CONFIRMED | CANCELLED, default CONFIRMED), `confirmation_token` varchar(128)
**UNIQUE**, `created_at`/`updated_at`.

Models are `TimeSlot`/`Booking` in Prisma and map to snake_case tables and columns.
This keeps the hand-written SQL (constraints now, the atomic booking `UPDATE` in
Phase 4) readable.

IDs and timestamps have database defaults (not only Prisma-side defaults), so raw
SQL inserts and updates get them too. Prisma's `@updatedAt` is applied by the
client only. Raw SQL updates in later phases must set `updated_at` explicitly.

### Integrity constraints

| Constraint | Kind | Rule |
|---|---|---|
| `time_slots_pkey`, `bookings_pkey` | PK | |
| `bookings_time_slot_id_key` | UNIQUE | At most one booking per slot (backstop for the Phase 4 atomic booking) |
| `bookings_confirmation_token_key` | UNIQUE | Tokens are unique |
| `bookings_time_slot_id_fkey` | FK, `ON DELETE RESTRICT` | A slot with a booking cannot be deleted |
| `time_slots_start_before_end` | CHECK | `start_time < end_time` |
| `time_slots_no_overlap` | EXCLUDE USING gist | No two **non-cancelled** slots overlap |
| `bookings_name_not_blank`, `bookings_email_not_blank` | CHECK | Defence in depth; the API validates fully |
| `bookings_token_min_length` | CHECK | Token is at least 32 characters |

Indexes: `(status, start_time)` for the public "available slots in range" query and
`(start_time)` for the host dashboard. The GiST index behind the exclusion
constraint also serves overlap lookups.

#### Why an exclusion constraint for overlaps
```sql
EXCLUDE USING gist (tstzrange(start_time, end_time, '[)') WITH &&)
WHERE (status <> 'CANCELLED')
```
- **Database-level:** two concurrent requests cannot both insert overlapping slots.
  A JavaScript "check then insert" could, which the requirements rule out. This is
  covered by a test that runs 5 concurrent overlapping inserts, of which exactly 1
  succeeds.
- **Half-open `[)` intervals:** 14:00–14:30 and 14:30–15:00 may coexist.
- **CANCELLED slots don't block new slots** ("must not overlap another *active*
  slot"). A cancelled slot can only be reactivated if it doesn't overlap.
- **No `btree_gist` extension:** it's only needed when the constraint also compares
  plain scalar columns with `=`. Here only a range is compared, which core GiST
  supports. This also avoids needing `CREATE EXTENSION` privileges on managed
  PostgreSQL hosts.
- Prisma can't express exclusion or CHECK constraints, so they're appended to the
  initial migration by hand. `prisma migrate diff` (database → schema) reports an
  empty diff, so Prisma will not try to drop them.

#### Rules that are *not* enforced in the database
- **"A new slot must be in the future":** a CHECK constraint can't sensibly use
  `now()`, because it would be re-evaluated on every update and reject edits to past
  rows. The API enforces this rule in Phase 3, and the atomic booking (Phase 4)
  re-checks `start_time > now()` in its conditional `UPDATE`.
- **"A BOOKED slot has a booking":** guaranteed by updating the slot and inserting
  the booking in one transaction (Phase 4), not by a trigger.
- **Allowed durations (15/30/45/60):** an API rule (Phase 3).

### Error codes from the pg adapter
Constraint violations surface as `PrismaClientKnownRequestError`. With the adapter,
the PostgreSQL SQLSTATE is at `error.meta.driverAdapterError.cause.originalCode`:
`23505` unique (Prisma `P2002`), `23503` FK (`P2003`), `23514` CHECK and `23P01`
exclusion (both Prisma `P2039`). The Slots API maps `23P01` and `23503` to 409; Phase 4 will map `23505`.
**`meta` contains full row data, including emails, so it must never be logged or
returned to clients.**

### Time zones
All instants are `timestamptz`. The database server runs in UTC. Calendar dates and
wall-clock times are interpreted in `Europe/Skopje` through `utils/date-time.ts`
(`@date-fns/tz`), which handles DST without manually adding hours. The unit tests
cover both 2026 DST transitions. (`Temporal` isn't available in Node 24.)

### Seed
`prisma/seed.ts` inserts six slots (mixed durations) for each of the next 10
working days in Europe/Skopje. It uses `createMany({ skipDuplicates: true })`, i.e.
`ON CONFLICT DO NOTHING`, which also covers exclusion-constraint conflicts. So it is
idempotent and never deletes or changes existing rows. It inserts no bookings, so no
personal data is seeded, and it refuses to run with `NODE_ENV=production`.

## Testing

- **Two Jest projects.** `unit` needs no database. `integration` (`*.integration.test.ts`)
  runs `prisma migrate deploy` against the test database in `globalSetup`.
- **Test database isolation.** Tests read `TEST_DATABASE_URL` (default
  `mentormeet_test`), never `DATABASE_URL`, and refuse any database whose name
  doesn't end in `_test`. Integration tests truncate tables before each test, and
  files run one at a time (`maxWorkers: 1`).
- **Jest needs `--experimental-vm-modules`.** The Prisma 7 client loads its WASM
  query compiler with a dynamic `import()`, which Jest's CommonJS sandbox only allows
  with this Node flag. The `test*` scripts pass it (and silence its
  `ExperimentalWarning`). Running `npx jest` directly will fail the integration tests.

## Slots API (Phase 3)

The API contract is in [api.md](api.md). Decisions made with the project owner where
the plan was open:

- **DELETE is a hard delete** of an `AVAILABLE` slot. `CANCELLED` is reserved.
- **One list endpoint with an optional filter.** `GET /api/slots?from&to` returns all
  slots (dashboard). `&status=AVAILABLE` returns only bookable slots: `AVAILABLE`
  and `start_time > now()` (public booking page). Filtering happens on the server,
  so it doesn't depend on the browser clock.
- **`from`/`to` are required, inclusive Europe/Skopje calendar days**, capped at 93
  days. They become the half-open instant range [`from` 00:00, `to`+1 00:00) with
  `zonedDayRange`, so DST days are 23 or 25 hours long and slots are never lost or
  duplicated at the boundaries.
- **Success responses use a `{ data }` envelope.**

### Layering
- **Routes** (`slots.routes.ts`) only wire HTTP verbs to the controller.
- **Controller** (`slots.controller.ts`) is thin: `schema.parse(req.…)` →
  service → response. A `ZodError` becomes 400 `VALIDATION_ERROR` in the central
  error handler. Validation happens in the controller rather than in a generic
  `validate-request` middleware, because Express 5's `req.query` is read-only and
  parsing in place keeps the parsed values fully typed. The planned
  `validate-request.ts` file was therefore not created.
- **Service** (`slots.service.ts`) holds all business rules and is created by
  `createSlotsService({ prisma, now })`. `createApp(config, { prisma, now })`
  injects the client and clock, so tests run against the test database with a fixed
  clock.

### Business rules and where they are enforced
| Rule | Enforced by |
|---|---|
| Duration ∈ {15, 30, 45, 60}; `startTime` has an explicit zone and is a real date | Zod schema |
| `endTime`/`status`/`id` are not accepted from the client | Strict Zod object |
| `endTime = startTime + duration` | Service (absolute minutes, DST-safe) |
| Start strictly in the future | Service, checked against the injectable clock |
| No overlap with non-cancelled slots, including concurrent requests | **DB exclusion constraint**. The service maps `23P01` to 409 `SLOT_OVERLAP` and doesn't pre-check in JavaScript, because a pre-check would add a race without adding safety. |
| Only `AVAILABLE` slots can be deleted | `DELETE … WHERE id = $1 AND status = 'AVAILABLE'` (atomic); the FK `RESTRICT` (`23503`) maps to 409 `SLOT_HAS_BOOKING` |

### Safe error handling
- The Prisma client uses `errorFormat: 'minimal'`. The default format embeds a
  source-code frame in error messages, which a probe showed can contain literal
  values.
- `common/db-errors.ts` reads only `meta.driverAdapterError.cause.originalCode`.
  The rest of `meta` contains full rows (e.g. emails).
- The error handler logs `describeErrorForLog(err)` (name, code, message, stack
  frames), never the raw error object. A unit test feeds it a Prisma error whose
  `meta` contains an email and asserts that neither the log nor the response
  contains it.

## Planned (later phases)

- **Phase 4:** Atomic booking. A conditional `UPDATE … SET status = 'BOOKED',
  updated_at = now() WHERE id = $1 AND status = 'AVAILABLE' AND start_time > now()`
  plus `INSERT booking` in one transaction. A 0-row update or a unique violation
  maps to 409.
