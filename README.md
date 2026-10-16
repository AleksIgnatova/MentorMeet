# MentorMeet

Web application for booking one-to-one mentoring sessions. A host publishes time
slots; visitors pick a free slot, enter their name and email, and receive a
confirmation page. Bookings are stored in PostgreSQL, and a slot can never be
booked twice.

> **Status: Phase 7 of 8 (feature-complete, tested, not deployed yet).** Deployment
> and a live URL follow in Phase 8. This README only documents what exists.

**Live URL:** not available yet (Phase 8).

## Features

- **Host dashboard** (`/dashboard`, the landing page): statistics, a 14-day list of
  time slots grouped by day, creating slots (15/30/45/60 minutes) and deleting free
  ones, and the list of upcoming bookings.
- **Public booking page** (`/book`): pick a day, see the free times, enter a name and
  email, and book. A double submit sends one request; if someone else booked the time
  first (`409 Conflict`), the page reloads the free times and explains what happened.
- **Confirmation page** (`/booking/confirmation/:token`): the booking details, loaded
  from the API by an unguessable token, so it works after a refresh or from a bookmark.
- **Optional AI confirmation message** (Gemini, backend only): generated once per
  booking and stored. If Gemini is not configured or unavailable, a prepared message is
  shown instead; the booking never depends on the AI.
- **Data integrity in PostgreSQL:** a slot can never be booked twice or overlap
  another slot, even under concurrent requests (see
  [docs/architecture.md](docs/architecture.md)).
- **Time zone:** times are stored as absolute instants and shown in `Europe/Skopje`.

## Tech stack

| Area | Technology |
|---|---|
| Backend | Node.js (>= 22.18), Express 5, TypeScript 5.9 |
| Database | PostgreSQL 17 (Docker Compose locally) |
| ORM / migrations | Prisma 7.10 with the `pg` driver adapter |
| Validation | Zod 4 |
| Date/time | `@date-fns/tz` (time zone `Europe/Skopje`) |
| Rate limiting | express-rate-limit |
| Tests | Jest 30 + ts-jest + Supertest |
| Lint | ESLint 10 + typescript-eslint (type-checked rules) |
| Frontend | React 19, TypeScript 5.9, Vite 8, React Router 8 |
| Styling | Tailwind CSS 4 (shadcn/ui-style components, hand-written) |
| Frontend tests | Vitest 5 + React Testing Library (jsdom) |
| E2E tests | Playwright 1.63 (installed Google Chrome by default) |
| AI (optional) | Gemini API (`generateContent` REST, called from the backend with `fetch`; no SDK) |

## Architecture

```text
React + Vite (frontend/) ──HTTP/JSON──▶ Express API (backend/) ──Prisma──▶ PostgreSQL
                                              └──HTTPS (optional)──▶ Gemini API
```

The backend is layered as `routes → controllers (thin, Zod validation) → services
(business logic) → Prisma`, with central error handling and rate limiting. The
frontend talks to the API only through one typed API client. Integrity rules
(one booking per slot, no overlapping slots) are enforced by PostgreSQL constraints
and an atomic booking transaction. Details and decisions:
[docs/architecture.md](docs/architecture.md). API reference: [docs/api.md](docs/api.md).

## Repository layout

```text
.
├── backend/
│   ├── prisma/              schema.prisma, migrations/, seed.ts
│   ├── prisma.config.ts     Prisma CLI configuration
│   ├── src/                 Express API (see docs/architecture.md)
│   └── tests/               Unit and integration tests
├── frontend/
│   ├── src/app/             Route table
│   ├── src/features/        Pages: dashboard, public-booking, confirmation (+ their API calls)
│   ├── src/components/      Layout, slots, bookings, common states, UI primitives
│   ├── src/lib/             API client, Europe/Skopje date helpers, validation
│   ├── src/test/            Page, navigation and flow tests; the opt-in API contract test
│   ├── e2e/                 Playwright end-to-end tests (*.e2e.ts)
│   └── playwright.config.ts Starts its own backend (test database) and frontend for E2E
├── docker/postgres/init/    Creates the separate test database on first start
├── docs/                    architecture.md, api.md
├── docker-compose.yml       Local PostgreSQL
└── package.json             Root convenience scripts (delegate to backend/ and frontend/)
```

## Getting started

### Prerequisites

- Node.js **22.22 or newer** (the frontend requires >= 22.22, the backend >= 22.18) and npm
- Docker (for the local PostgreSQL 17 database)
- Google Chrome, only for the E2E tests (or Playwright's Chromium, see [Testing](#testing))

### Setup

```bash
# 1. Install dependencies (the backend install also generates the Prisma client)
npm run install:backend
npm run install:frontend

# 2. Create the environment files and adjust them if needed
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start PostgreSQL (requires Docker). Creates the `mentormeet` and `mentormeet_test` databases.
npm run db:up

# 4. Apply database migrations to the development database
npm run db:migrate

# 5. (Optional) Insert sample time slots for the next 10 working days
npm run db:seed

# 6. Start the API in watch mode on http://localhost:3000
npm run dev:backend

# 7. Check that it is up
curl http://localhost:3000/api/health

# 8. In a second terminal, start the frontend on http://localhost:5173
npm run dev:frontend
```

Then open:
- http://localhost:5173/: redirects to the host dashboard
- http://localhost:5173/book: public booking page (visitors)
- http://localhost:5173/dashboard: host dashboard
- http://localhost:5173/booking/confirmation/:token: confirmation page (linked after booking)

To stop PostgreSQL, run `npm run db:down`. Your data stays in the Docker volume.
`docker compose down -v` would **delete** all local data.

### Environment variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | no (default `development`) | `development`, `test` or `production`. Stack traces are only returned in `development`. |
| `PORT` | no (default `3000`) | HTTP port. |
| `DATABASE_URL` | yes | `postgresql://` connection string. Also used by the Prisma CLI. |
| `FRONTEND_URL` | yes | Allowed CORS origin(s), comma-separated. |
| `GEMINI_API_KEY` | no | Backend only. Enables the AI confirmation message. Empty: the fallback message is used. |
| `GEMINI_MODEL` | no (default `gemini-3.5-flash-lite`) | Gemini model ID. |
| `TRUST_PROXY` | no (default `0`) | Number of reverse proxies in front of the API, so rate limiting sees real client IPs. |

The server validates these at startup and exits with a clear error if any are invalid.
Never commit `.env`: it is listed in `.gitignore`.

### Environment variables (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | no (default `http://localhost:3000/api` in development) | Base URL of the API. It is embedded in the browser bundle, so never put secrets in `VITE_` variables. The backend's `FRONTEND_URL` must contain the frontend's origin (CORS). |

### Optional: AI confirmation message (Gemini)

Without a key, everything works and the confirmation page shows a prepared fallback
message. To try the real AI message locally:

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Open `backend/.env` in your editor and set `GEMINI_API_KEY=` to the key. Do not
   put it in `.env.example`, in a `VITE_` variable, in a shell command that is saved
   to your history, or in a chat.
3. Restart the backend (`npm run dev:backend`), book a slot, and open the
   confirmation page. The API response's `source` is `ai` when Gemini answered and
   `fallback` otherwise. The backend logs a one-line reason (e.g. `http_error (HTTP 403)`)
   when it falls back. Once a booking has an AI message it is stored, and refreshing
   the page shows the same message. A fallback is not stored, so the next page load
   tries again.

The automated tests never call Gemini: they inject a fake provider and clear
`GEMINI_API_KEY`.

## Database

- Schema: `backend/prisma/schema.prisma`. Tables are `time_slots` and `bookings`.
- Migrations: `backend/prisma/migrations/`. The initial migration also contains
  hand-written constraints that Prisma cannot express: no overlapping active slots,
  start before end, and booking data checks. See
  [docs/architecture.md](docs/architecture.md#database).
- Timestamps are stored as `timestamptz` (absolute instants) and displayed in `Europe/Skopje`.
- The seed only inserts future `AVAILABLE` slots. It never deletes data, can be run
  repeatedly, and refuses to run with `NODE_ENV=production`.
- In deployed environments, apply migrations with `npm run db:deploy` (never `db:migrate`).

## Scripts

Root (`package.json`):

| Command | Description |
|---|---|
| `npm run install:backend` / `install:frontend` | Install dependencies |
| `npm run db:up` / `npm run db:down` | Start / stop local PostgreSQL |
| `npm run db:migrate` | Create/apply migrations in development (`prisma migrate dev`) |
| `npm run db:deploy` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Insert sample time slots |
| `npm run dev:backend` | Run the API with reload on change (tsx) |
| `npm run dev:frontend` | Run the Vite dev server |
| `npm run build` | Build the backend (`backend/dist`) and the frontend (`frontend/dist`) |
| `npm run typecheck` | Type-check backend and frontend |
| `npm run lint` | ESLint (backend and frontend) |
| `npm test` | Backend tests (needs PostgreSQL running for the integration tests), then frontend tests |
| `npm run test:backend` / `test:frontend` | One side only |
| `npm run test:e2e` | Playwright end-to-end tests (needs PostgreSQL running and Google Chrome) |

Backend only (`backend/package.json`): `dev`, `build`, `start` (runs `dist/server.js`),
`typecheck`, `lint`, `test`, `test:unit` (no database needed), `test:integration`,
`test:watch`, `prisma:generate`, `db:migrate`, `db:deploy`, `db:status`, `db:seed`.

Frontend only (`frontend/package.json`): `dev`, `build`, `preview`, `typecheck`, `lint`,
`test`, `test:watch`, `test:contract` and `test:e2e`.

## Testing

Start PostgreSQL first (`npm run db:up`). Then:

```bash
npm test            # backend (Jest: unit + integration) and frontend (Vitest)
npm run test:e2e    # end-to-end in a real browser (Playwright)
npm run typecheck && npm run lint && npm run build
```

| Suite | What it covers | Database |
|---|---|---|
| Backend unit (`npm --prefix backend run test:unit`) | Validation schemas, env parsing, date/time helpers, the Gemini client and the AI message pipeline (retry, timeout, sanitizing) with a fake provider | none |
| Backend integration (`npm --prefix backend run test:integration`) | Every endpoint through HTTP: slots, bookings, rollback, **concurrent bookings and overlapping slots**, the database constraints, the AI message (stored once, fallback, concurrent requests) | `mentormeet_test` |
| Frontend (`npm run test:frontend`) | Pages, form validation, loading/empty/error states, `409` handling, the confirmation page after a refresh, the AI/fallback message, navigation and the `/` → `/dashboard` redirect | none (`fetch` is mocked) |
| E2E (`npm run test:e2e`) | The plan's end-to-end flow: create a free slot, book it on `/book`, check the confirmation page (also after a refresh), check the slot is gone, and a second booking gets `409`. Also two visitors racing for one slot, and navigation | `mentormeet_test` |

**Your development data is safe.**
- Tests use `TEST_DATABASE_URL` (default
  `postgresql://postgres:postgres@localhost:5432/mentormeet_test?schema=public`), never
  `DATABASE_URL`, and refuse any database whose name does not end in `_test`.
- Integration tests empty the test database's tables before each test. They apply
  migrations to it with `prisma migrate deploy` (never `migrate dev` or a reset).
- No automated test calls the real Gemini API.

**E2E details.** `npm run test:e2e` starts its **own** backend on port 3999, using the
test database, with `NODE_ENV=test` (so `backend/.env` is not read) and no Gemini key.
It also starts its own Vite server on port 5174. It never reuses running servers, so
those ports must be free. It uses your installed Google Chrome. To use Playwright's
own Chromium instead, run `(cd frontend && npx playwright install chromium)` once and
then `PLAYWRIGHT_CHANNEL= npm run test:e2e`. E2E data stays in the test database and
is cleared by the next integration test run. Test runs create
`frontend/test-results/`, which is git-ignored.

**Opt-in API contract test.** It runs the frontend's API modules against a running
backend and creates data, so point that backend at the test database:

```bash
# Backend on the test DB (the contract test runs in Node, so CORS does not apply)
(cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mentormeet_test?schema=public" PORT=3999 npm run dev)
# Then
(cd frontend && MENTORMEET_CONTRACT_TEST=1 VITE_API_BASE_URL=http://localhost:3999/api npm run test:contract)
```
Without `MENTORMEET_CONTRACT_TEST=1` this file is skipped, which is why the normal
frontend run reports one skipped test.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness check |
| `POST` | `/api/slots` | Create a slot (host) |
| `GET` | `/api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD[&status=AVAILABLE]` | List slots in a date range |
| `GET` | `/api/slots/:id` | Get one slot |
| `DELETE` | `/api/slots/:id` | Delete an available slot (host) |
| `POST` | `/api/bookings` | Book a slot (public) |
| `GET` | `/api/bookings/:token` | Booking confirmation by token (public) |
| `GET` | `/api/bookings[?upcoming=true]` | List bookings (host dashboard) |
| `POST` | `/api/ai/confirmation` | Personal confirmation message for a booking token, or the fallback (public) |

For request and response formats, validation rules and error codes, see
[docs/api.md](docs/api.md).

## Security considerations

- **No authentication (by design, see below).** The host endpoints and
  `GET /api/bookings`, which returns visitors' names and email addresses, are public.
- **CORS** allows only the origins in `FRONTEND_URL`.
- **Rate limits** per IP: 300 requests / 15 min for the whole API, plus 20 / 15 min
  for creating bookings and 30 / 15 min for AI messages. Set `TRUST_PROXY` behind a
  reverse proxy so the real client IP is used.
- **Input validation:** every request is validated with Zod. JSON bodies are limited to
  10 kB. Unknown fields in write requests are rejected.
- **Error responses** never include Prisma or database details. Stack traces are only
  returned with `NODE_ENV=development`.
- **Logs** never contain emails, confirmation tokens or API keys. Unexpected errors
  are logged as a sanitized summary.
- **Confirmation tokens** are 256-bit random values. The confirmation endpoints return
  no email, and their responses are sent with `Cache-Control: no-store`.
- **Secrets:** `.env` files are git-ignored. Only `.env.example` files with
  placeholders are committed. The Gemini key is used only by the backend and never
  sent to the browser.

## Deployment notes

Not deployed yet (Phase 8). What a deployment needs, based on the current code:

- **Database:** a PostgreSQL 17 instance. Apply migrations with `npm run db:deploy`
  (never `db:migrate`). The seed refuses to run with `NODE_ENV=production`.
- **Backend:** `npm --prefix backend run build`, then `npm --prefix backend start`.
  Set `NODE_ENV=production`, `DATABASE_URL`, `FRONTEND_URL` (the deployed frontend
  origin) and, behind a proxy, `TRUST_PROXY`. `GEMINI_API_KEY` and `GEMINI_MODEL` are
  optional. Health check: `GET /api/health`.
- **Frontend:** set `VITE_API_BASE_URL` to the deployed API URL **at build time** (it
  is compiled into the bundle; without it the production build calls `/api` on its
  own origin). Then run `npm --prefix frontend run build` and serve `frontend/dist`
  as static files. The host must serve `index.html` for every path (SPA routing), so
  that `/dashboard`, `/book` and confirmation links work on a refresh.
- Never reuse the local Docker credentials in a deployed environment.

## Known limitations

- Gemini sometimes answers slowly or with HTTP 503 ("overloaded"); in a manual check,
  about 1 in 5 calls failed that way. The backend retries a temporary failure once
  within a 12 s budget and otherwise shows the fallback. Only a successful message is
  stored, so a page showing the fallback gets the AI message on a later load.
  Message requests are rate limited (30 / 15 min / IP).
- With a key configured, the visitor's **name** and the session date/time are sent to
  Google's Gemini API (never the email or token). A public deployment should mention
  this in its privacy notice.
- The name is user input. The prompt marks it as data and the output is sanitized
  and rendered as plain text, but prompt injection can't be ruled out completely: a
  visitor can at most influence the message shown on their own confirmation page.
- The dashboard at `/dashboard` is public as well (see below). It is the landing page
  (`/` redirects to it), and the booking and confirmation pages link to it.
  Anyone who can open the site can open the dashboard.
- **No authentication, by design.** The project brief explicitly says user
  authentication is not required, so there are no accounts, logins or tokens for the
  host. As a result, **anyone who can reach the API can create and delete slots and
  read the booking list, including visitors' names and emails**
  (`GET /api/bookings`). This is acceptable for the interview/demo scope but is
  **not production-secure**. A real deployment would need to protect the host
  endpoints.
- Deleting a slot is permanent (hard delete). Bookings cannot be cancelled yet.
  `CANCELLED` statuses are reserved for that.
- Confirmation tokens are stored as-is (unique, 256-bit random). Storing only a hash
  would be a further hardening step.
