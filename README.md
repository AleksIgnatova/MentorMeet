# MentorMeet

Web application for booking one-to-one mentoring sessions. A host publishes time
slots; visitors pick a free slot, enter their name and email, and receive a
confirmation page. Bookings are stored in PostgreSQL, and a slot can never be
booked twice.

> **Status: Phase 3 of 8.** The backend foundation (Express + TypeScript, health
> endpoint, middleware, error handling), the database layer (Prisma schema,
> migration with integrity constraints, seed) and the **Slots API** exist. The
> bookings API, frontend and AI integration are not implemented yet. This README
> only documents what exists.

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

Planned for later phases: React + Vite frontend, Vitest, Playwright, Gemini.

## Repository layout

```text
.
├── backend/
│   ├── prisma/              schema.prisma, migrations/, seed.ts
│   ├── prisma.config.ts     Prisma CLI configuration
│   ├── src/                 Express API (see docs/architecture.md)
│   └── tests/               Unit and integration tests
├── docker/postgres/init/    Creates the separate test database on first start
├── docs/                    architecture.md, api.md
├── docker-compose.yml       Local PostgreSQL
└── package.json             Root convenience scripts (delegate to backend/)
```

## Getting started

```bash
# 1. Install backend dependencies (also generates the Prisma client)
npm run install:backend

# 2. Create the backend environment file and adjust it if needed
cp backend/.env.example backend/.env

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
```

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
| `npm run install:backend` | Install backend dependencies |
| `npm run db:up` / `npm run db:down` | Start / stop local PostgreSQL |
| `npm run db:migrate` | Create/apply migrations in development (`prisma migrate dev`) |
| `npm run db:deploy` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Insert sample time slots |
| `npm run dev:backend` | Run the API with reload on change (tsx) |
| `npm run build` | Generate the Prisma client and compile the backend to `backend/dist` |
| `npm run typecheck` | Type-check backend sources and tests |
| `npm run lint` | ESLint |
| `npm test` | All backend tests (needs PostgreSQL running for the integration tests) |

Backend only (`backend/package.json`): `dev`, `build`, `start` (runs `dist/server.js`),
`typecheck`, `lint`, `test`, `test:unit` (no database needed), `test:integration`,
`test:watch`, `prisma:generate`, `db:migrate`, `db:deploy`, `db:status`, `db:seed`.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness check |
| `POST` | `/api/slots` | Create a slot (host) |
| `GET` | `/api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD[&status=AVAILABLE]` | List slots in a date range |
| `GET` | `/api/slots/:id` | Get one slot |
| `DELETE` | `/api/slots/:id` | Delete an available slot (host) |

For request and response formats, validation rules and error codes, see
[docs/api.md](docs/api.md).

## Known limitations (at this phase)

- No bookings API, frontend or AI integration yet.
- **Host endpoints have no authentication** (demo scope): anyone who can reach the API
  can create and delete slots (`POST`/`DELETE /api/slots`). Protect them before any
  real production use.
- Deleting a slot is permanent (hard delete). The `CANCELLED` status is reserved for a
  future cancellation feature.
