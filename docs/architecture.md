# Architecture

This document records the architecture and the main technical decisions. It is
updated at the end of each implementation phase.

## Overview

```text
React (Vite) ──HTTP/JSON──▶ Express API ──Prisma (pg adapter)──▶ PostgreSQL
   [Phase 5]                 [Phase 1]         [Phase 2]
  frontend/                  backend/
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
    ├── slots/             /api/slots: routes, controller, service, schemas, types
    ├── bookings/          /api/bookings: routes, controller, service, schemas, types
    └── ai/                /api/ai: routes, controller, service, schemas, Gemini REST client
```

Feature modules (`slots`, `bookings`, `ai`) each follow
`*.routes.ts → *.controller.ts (thin) → *.service.ts (business logic) → Prisma`,
with Zod schemas in `*.schemas.ts`.

### Request pipeline (order matters)

1. `cors({ origin: FRONTEND_URL list })`. Other origins get no CORS headers, so browsers block them.
2. `express.json({ limit: '10kb' })`
3. `/api/health`: mounted **before** the rate limiter so uptime probes are never throttled.
4. `/api` rate limiter: 300 requests / 15 min per IP by default.
5. Feature routers: `/api/slots`, `/api/bookings`, `/api/ai`. `POST /api/bookings` has
   its own stricter rate limiter (20 / 15 min / IP), and `POST /api/ai/confirmation`
   one of 30 / 15 min / IP.
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
**UNIQUE**, `ai_confirmation_message` varchar(600) NULL (Phase 6; see below),
`created_at`/`updated_at`.

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
| `bookings_ai_message_not_blank` | CHECK | A stored AI message is NULL or not blank (migration `*_add_booking_ai_confirmation_message`) |

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
exclusion (both Prisma `P2039`). The Slots API maps `23P01` and `23503` to 409.
The Bookings API maps `23505` on `bookings_time_slot_id_key` to 409.
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

## Bookings API (Phase 4)

The API contract is in [api.md](api.md). **No authentication, by design:** the
project brief states that user authentication isn't required, so all booking
routes are public and there is no auth middleware. The README documents what that
exposes.

### Atomic booking: how double bookings are prevented
`bookings.service.ts` follows the plan step by step, in one Prisma interactive
transaction (PostgreSQL default isolation, READ COMMITTED):

```sql
-- 1-2. Claim the slot only if it is still bookable
--      (Prisma updateMany; updated_at is set by Prisma's @updatedAt)
UPDATE time_slots SET status = 'BOOKED', updated_at = $now
WHERE id = $slot AND status = 'AVAILABLE' AND start_time > $now;
-- 3.   exactly 1 row?  0 -> look up why: 404 SLOT_NOT_FOUND, 409 SLOT_ALREADY_BOOKED,
--      or 409 SLOT_NOT_AVAILABLE (started or cancelled). Throwing rolls back.
-- 4.   INSERT INTO bookings (...)            -- same transaction
-- 5.   any failure -> ROLLBACK, the slot goes back to AVAILABLE
```

**Why this is safe under concurrency.** The `UPDATE` takes a row lock on the slot.
A concurrent request for the same slot blocks on that lock. Once the first
transaction commits, PostgreSQL re-evaluates the second request's `WHERE` against
the committed row: `status` is now `BOOKED`, so 0 rows match and the request gets
409. If the first transaction rolls back, the waiting request proceeds and
succeeds. There's no "check, then write" gap anywhere. READ COMMITTED is enough
because the decision is made by the locking `UPDATE` itself, so `SERIALIZABLE`
and retries aren't needed.

**Defence in depth.** `UNIQUE(bookings.time_slot_id)` independently guarantees one
booking per slot. If it fires (`23505` on `bookings_time_slot_id_key`), the
transaction rolls back and the request gets 409 `SLOT_ALREADY_BOOKED`. Other
unique violations (e.g. an astronomically unlikely token collision) are not
disguised as 409: they roll back and return 500.

**Transaction time limits.** Prisma's interactive-transaction defaults apply: 2 s to
acquire a connection and 5 s to run. Under extreme contention a request that hits
either limit is rolled back and gets a 500, not a 409. Integrity is unaffected
(nothing is committed), but a client would see an error rather than "slot taken".
At this app's scale, transactions take milliseconds.

**Interaction with `DELETE /api/slots/:id`.** The delete's `WHERE status =
'AVAILABLE'` and the booking's `UPDATE` serialize on the same row lock. The
booking's `INSERT` also takes a key-share lock on the slot through the FK. So a
race always ends either as "deleted, then the booking gets 404" or as "booked, then
the delete gets 409".

### Tokens and data exposure
- `confirmationToken = randomBytes(32).toString('base64url')`: 256 bits, 43
  characters, generated only on the server. The DB `CHECK` requires at least 32
  characters, and the column is `UNIQUE`.
- `GET /api/bookings/:token` returns only name, status and session times. Unknown
  and malformed tokens both return 404 (malformed tokens never reach the database),
  and the internal booking id never works as a token.
- `POST /api/bookings` returns the token once and doesn't echo the email.
  `GET /api/bookings` (host) includes emails but never tokens.
- Token and host-list responses send `Cache-Control: no-store`.
- Logs never contain names, emails or tokens: errors are logged through
  `describeErrorForLog`, which a test verifies on the rollback path.

### Testing strategy for races
`tests/bookings-concurrency.integration.test.ts` runs against the real test database:

- **Parallel bursts:** 10 simultaneous requests for one slot give exactly one 201
  and nine 409s, and the stored booking is the winner's. Also 4 slots × 6 requests
  over 3 rounds, and simultaneous bookings of *different* slots (no false conflicts).
- **Deterministic interleavings:** a raw `pg` transaction claims the slot and holds
  the lock. The test waits until `pg_stat_activity` shows the API request blocked on
  the lock, then commits (the API request must get 409) or rolls back (it must get
  201). The same is done for a concurrent `DELETE`. This proves the waiting and
  re-checking mechanism directly instead of relying on lucky timing.
- **Booking vs. delete:** 10 rounds of a simultaneous `DELETE` and `POST`.
- After every scenario, the invariant "slot `BOOKED` ⇔ booking exists" is checked in SQL.
- **Rollback:** an injected colliding token makes the `INSERT` fail after the
  `UPDATE`. The slot stays `AVAILABLE` and the response is a generic 500 with no
  personal data logged.
- **Sabotage check (done manually):**
  - Removing `status = 'AVAILABLE'` from the `UPDATE` fails the test that isolates
    that condition: a slot marked `BOOKED` with no booking row.
  - Removing that condition *and* the unique-violation mapping fails 7 tests,
    including the burst and interleaving tests.
  - The concurrency suite passed 10 of 10 consecutive runs.

## Frontend (Phase 5)

React 19 + TypeScript + Vite 8, React Router 8, Tailwind CSS 4. It is a separate
package (`frontend/`) that talks to the API only over HTTP, using `VITE_API_BASE_URL`.

```text
frontend/src/
├── main.tsx, App.tsx      Entry: <RouterProvider>
├── app/router.tsx         Route table (shared by the app and the tests)
├── features/
│   ├── dashboard/         DashboardPage + dashboard.api.ts
│   ├── public-booking/    BookingPage + booking.api.ts
│   └── confirmation/      ConfirmationPage + confirmation.api.ts
├── components/
│   ├── layout/            AppLayout + Sidebar (host), PublicLayout (visitors), PageHeader
│   ├── slots/             SlotList, CreateSlotDialog, DeleteSlotDialog
│   ├── bookings/          BookingForm, UpcomingBookings
│   ├── common/            LoadingState, ErrorState, EmptyState, ConfirmDialog
│   └── ui/                Button, Field, Card, Alert, Badge, Dialog, Spinner
├── lib/                   api-client, date-time, validation, error-messages, use-api-resource
└── types/                 Slot / booking types mirroring the backend DTOs
```

### Routes
| Path | Page | API calls |
|---|---|---|
| `/` | Redirects to `/book` | |
| `/book` | Pick a day → free times → name/email form | `GET /slots?from=d&to=d&status=AVAILABLE`, `POST /bookings` |
| `/booking/confirmation/:token` | Booking details + message | `GET /bookings/:token`, then `POST /ai/confirmation` |
| `/dashboard` | Stats, 14-day slot list, create/delete slots, upcoming bookings | `GET /slots?from&to`, `POST /slots`, `DELETE /slots/:id`, `GET /bookings?upcoming=true` |

### Decisions
- **One API client** (`lib/api-client.ts`) implements the documented contract: it
  unwraps `{ data }`, turns `{ error: { code, message, details } }` into a typed
  `ApiError`, maps 204 to `undefined`, and adds client-side codes `NETWORK_ERROR`,
  `TIMEOUT` (15 s) and `UNEXPECTED_RESPONSE`. Pages branch on `error.code`, never
  on message text.
- **Data loading** (`lib/use-api-resource.ts`) aborts superseded requests and ignores
  their results, so quickly switching days can't show stale slots.
- **Time zones.** All display uses `Intl.DateTimeFormat` with `timeZone:
  'Europe/Skopje'`, independent of the browser's zone. The create-slot form turns the
  Skopje wall-clock time into ISO 8601 with the correct offset using `@date-fns/tz`
  (e.g. `+01:00` in winter, `+02:00` in summer), as the API requires.
- **Booking page flows.**
  - **Duplicate submissions:** the form ignores submits while one is in flight (a ref
    guard plus a disabled button).
  - **Slot taken:** on `SLOT_ALREADY_BOOKED`, `SLOT_NOT_AVAILABLE` or `SLOT_NOT_FOUND`,
    the page clears the selection, explains what happened and reloads the free times.
  - **Success:** it navigates to `/booking/confirmation/:token`.
- **Refresh-safe confirmation.** The page loads everything from
  `GET /api/bookings/:token` using only the URL, so it survives refreshes and shared
  links. It distinguishes loading, invalid token (404), and network or server errors
  (with retry).
- **No fake success.** Every success message comes after a successful API response.
  On failure the UI shows the error and keeps the user's input where useful.
- **Client-side validation mirrors the backend rules** (name 1–100 characters, email
  format and length, durations, future start). The backend stays authoritative, and
  its 400 field details are shown on the form fields.
- **Components.** The plan lists shadcn/ui. The shadcn CLI would generate code and add
  Radix and other dependencies, so the few primitives needed (Button, Field, Card,
  Alert, Badge, Dialog) are hand-written in the same style with Tailwind. The dialog
  is accessible: `role="dialog"`, `aria-modal`, labelled, Escape to close, focus
  moved inside and restored, and it can't be dismissed while a request is pending.
- **Not created:** `SlotCalendar.tsx`, `SlotCard.tsx` and `BookingCard.tsx`. The
  grouped-by-day list covers "list or calendar", and the plan says not to add unused
  files. `lib/validation.ts`, `LoadingState`, `ErrorState`, `EmptyState` and
  `ConfirmDialog` follow the plan.

### Frontend tests
Vitest + React Testing Library (jsdom). The tests render the **real route table and
API client** and replace only `fetch`, so they also check the HTTP contract (method,
path, query, JSON body). They cover:
- the available-slot list and its query;
- form validation;
- loading, empty and error states with retry;
- a successful booking and navigation to the confirmation page;
- the 409 refresh-and-explain flow, rate limiting, and a single request on repeated clicks;
- the confirmation page after a "refresh", with an invalid token, and with a network
  error and retry;
- the personal message: AI text, the backend's fallback, details shown while it
  loads, the static fallback on 500/429/network errors or an unusable response, and
  no request for a cancelled booking;
- the dashboard: stats, the Skopje offset on slot creation, overlap and delete conflicts.

`src/test/api-contract.test.ts` is opt-in (`MENTORMEET_CONTRACT_TEST=1`). It runs the
frontend's real API modules against a running backend and performs the whole flow.

## AI confirmation message (Phase 6)

`POST /api/ai/confirmation { token }` returns `{ data: { message, source } }`, where
`source` is `ai` or `fallback`.

```text
ai.routes (30/15 min limiter) → ai.controller (Zod: { token }) → ai.service
   ├─ booking by token                  same 404 as GET /api/bookings/:token
   ├─ not CONFIRMED                     → fallback, provider not called
   ├─ ai_confirmation_message stored    → return it (provider not called)
   ├─ no key                            → fallback
   └─ generation in flight for booking? → share it; otherwise:
        gemini.client (fetch) ── 12 s budget, ≤ 1 retry on 429/5xx/network ──→ sanitize
          → UPDATE … SET message WHERE id = ? AND message IS NULL AND CONFIRMED
          → read back the stored message → { source: 'ai' }
        any failure → log reason category → fallback (200), nothing stored
```

### Decisions
- **The booking never depends on AI.** The message is a separate request made by the
  confirmation page after the booking has been saved and loaded, never part of the
  booking transaction. It only ever writes `ai_confirmation_message`: booking status
  and slot are never changed. Every provider failure becomes the fallback message
  with HTTP 200, so the page never shows an error for it.
- **Stored once, generated lazily.** Without storage, every page load called Gemini
  again, so a refresh could turn a good message into the fallback whenever Gemini was
  briefly unavailable (measured: about 1 in 5 calls failed with HTTP 503 or a timeout).
  Now the first successful message is stored in `bookings.ai_confirmation_message` and
  returned as is from then on. The fallback is never stored, so it can still be
  replaced by an AI message on a later load. This column is not in the plan's
  original `Booking` field list. It was added in Phase 6 with approval, using a separate
  migration (no data rewrite: nullable, no default).
- **Concurrency.** The message is stored with one conditional `UPDATE … WHERE
  ai_confirmation_message IS NULL` (Prisma `updateMany`). PostgreSQL row-locks the
  booking, so of several concurrent writers exactly one updates a row, and the others
  match none. Every request then reads back the stored message, which never changes
  once set. Within one server, simultaneous requests for the same booking (e.g. React
  StrictMode's double effect in development) also share a single in-flight provider
  call, so Gemini is not asked twice.
- **Real data, minimal data.** The client sends only the token. The prompt is built
  from the stored booking: the name, date and time in Europe/Skopje, and the
  duration. The email, token and IDs are never sent to Gemini.
- **No SDK.** `gemini.client.ts` calls the `generateContent` REST endpoint with the
  built-in `fetch`, so no dependency is added. The key is sent in the
  `x-goog-api-key` header, not the URL. `GEMINI_MODEL` is validated as a plain model ID
  because it becomes part of the URL path.
- **Timeout and retry.** One 12 s budget covers the whole generation, so it stays
  under the frontend's 15 s request timeout (successful calls took 3–7 s). When the
  budget runs out, the shared abort signal cancels the provider request, and the
  service stops waiting even if the provider ignores the signal. A temporary failure
  (HTTP 429/500/502/503/504 or a network error) is retried **once** after 500 ms,
  but only if at least 2 s of the budget remain. Permanent errors (e.g. 400/401/403 for
  a bad key or 404 for an unknown model), timeouts, and blocked, truncated or empty
  output are not retried.
- **Length and format.** `maxOutputTokens: 512` at the provider. Then the service strips
  control characters and stray markdown, collapses whitespace, and caps the message
  at 600 characters (cut at a sentence end where possible). Responses that were
  blocked, cut off by the token limit (`MAX_TOKENS`), or are empty or malformed fall
  back.
- **Prompt injection.** The name is placed in a JSON data block, and the system
  instruction says the data is not instructions. The output is plain text, rendered
  by React as text (no HTML). The remaining risk is limited to the visitor's own
  confirmation page.
- **Logging.** One line per retry and per fallback, with the failure category and,
  for HTTP errors, the status (e.g. `[ai] Confirmation message unavailable
  (http_error (HTTP 503)); using the fallback message`).
  Provider bodies, prompts, names, emails, tokens and keys are never logged or
  returned.
- **Frontend.** The booking details render as soon as `GET /bookings/:token`
  succeeds. The message area shows "Preparing your personal message…" while
  waiting, then the message. If the request fails, or the response has no usable
  message, the page shows its own static message. Cancelled bookings get no
  message request.

### Tests
- `tests/gemini.client.test.ts`: request shape (URL, key header, body), joining parts
  and skipping thought parts, HTTP errors, network errors, abort/timeout, malformed
  bodies, blocked or truncated responses, empty responses.
- `tests/ai.service.test.ts` (no database): the generation pipeline. Success, one
  retry on 429/500/502/503/504/network, no second retry, no retry on
  400/401/403/404, blocked, truncated, malformed or unexpected errors, a timeout
  that aborts the provider, a retry that stays within the same budget, skipping the
  retry when too little budget is left, unusable or over-long output, prompt
  content, sanitizing, and logs without names or provider text.
- `tests/ai.integration.test.ts` (test database): fallback without a key (nothing
  stored), AI path with a fake provider (prompt has no email or token), storing the
  message and returning it on refresh without a new provider call, a stored message
  served without a key, a fallback that is not stored and later replaced by an AI
  message, a retry within one request, cancelled bookings, five simultaneous
  requests sharing one provider call, three "servers" racing so exactly one message
  is stored and all return it, the booking unchanged after failures, timeout, 404,
  400, the rate limit.
- No test calls the real Gemini API. `tests/setup.ts` clears `GEMINI_API_KEY`.

## Planned (later phases)

- **Phases 7–8:** Final regression pass, E2E tests and deployment.
