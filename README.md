# MentorMeet

Web application for booking one-to-one mentoring sessions. A host publishes time
slots; visitors pick a free slot, enter their name and email, and receive a
confirmation page. Bookings are stored in PostgreSQL, and a slot can never be
booked twice.

> **Status: Phase 5 of 8.** The backend (Express + TypeScript, Prisma/PostgreSQL,
> Slots API, concurrency-safe Bookings API) and the **React frontend** (host
> dashboard, public booking page, confirmation page) exist. The optional AI
> confirmation message is not implemented yet: the confirmation page shows a static
> message. This README only documents what exists.

## Tech stack (current)

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

Planned for later phases: Playwright E2E, Gemini.

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
│   └── src/test/            Page tests and the opt-in API contract test
├── docker/postgres/init/    Creates the separate test database on first start
├── docs/                    architecture.md, api.md
├── docker-compose.yml       Local PostgreSQL
└── package.json             Root convenience scripts (delegate to backend/)
```

## Getting started

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
| `GEMINI_API_KEY` | no | Backend only. Not used until Phase 6. |
| `TRUST_PROXY` | no (default `0`) | Number of reverse proxies in front of the API, so rate limiting sees real client IPs. |

The server validates these at startup and exits with a clear error if any are invalid.
Never commit `.env`: it is listed in `.gitignore`.

### Environment variables (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | no (default `http://localhost:3000/api` in development) | Base URL of the API. It is embedded in the browser bundle, so never put secrets in `VITE_` variables. The backend's `FRONTEND_URL` must contain the frontend's origin (CORS). |

Tests use `TEST_DATABASE_URL` (default
`postgresql://postgres:postgres@localhost:5432/mentormeet_test?schema=public`) and
**never** `DATABASE_URL`. They refuse to run unless the database name ends in `_test`.

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

Backend only (`backend/package.json`): `dev`, `build`, `start` (runs `dist/server.js`),
`typecheck`, `lint`, `test`, `test:unit` (no database needed), `test:integration`,
`test:watch`, `prisma:generate`, `db:migrate`, `db:deploy`, `db:status`, `db:seed`.

Frontend only (`frontend/package.json`): `dev`, `build`, `preview`, `typecheck`, `lint`,
`test`, `test:watch`, and `test:contract`. `test:contract` is an opt-in test that runs
the frontend's API modules against a **running backend** and creates data, so point
that backend at the test database:

```bash
# Backend on the test DB (the contract test runs in Node, so CORS does not apply)
(cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mentormeet_test?schema=public" PORT=3999 npm run dev)
# Then
(cd frontend && MENTORMEET_CONTRACT_TEST=1 VITE_API_BASE_URL=http://localhost:3999/api npm run test:contract)
```

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

For request and response formats, validation rules and error codes, see
[docs/api.md](docs/api.md).

## Known limitations (at this phase)

- No AI integration yet: the confirmation page shows a static message.
- The dashboard at `/dashboard` is public as well (see below). It is not linked from the
  visitor pages, but anyone who knows the URL can open it.
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
