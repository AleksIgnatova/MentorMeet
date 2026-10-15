# MentorMeet

Web application for booking one-to-one mentoring sessions. A host publishes time
slots; visitors pick a free slot, enter their name and email, and receive a
confirmation page. Bookings are stored in PostgreSQL, and a slot can never be
booked twice.

> **Status: Phase 1 of 8.** Only the backend foundation exists so far: an Express +
> TypeScript API with a health endpoint, middleware and error handling, plus Docker
> Compose for PostgreSQL. The database schema, slot/booking APIs, frontend and AI
> integration are not implemented yet. This README only documents what exists.

## Tech stack (current)

| Area | Technology |
|---|---|
| Backend | Node.js (>= 22.18), Express 5, TypeScript 5.9 |
| Validation | Zod 4 |
| Rate limiting | express-rate-limit |
| Tests | Jest 30 + ts-jest + Supertest |
| Lint | ESLint 10 + typescript-eslint (type-checked rules) |
| Local DB | PostgreSQL 17 via Docker Compose |

Planned for later phases: Prisma, React + Vite frontend, Vitest, Playwright, Gemini.

## Repository layout

```text
.
├── backend/                 Express API (see docs/architecture.md)
├── docker/postgres/init/    Creates the separate test database on first start
├── docs/                    architecture.md, api.md
├── docker-compose.yml       Local PostgreSQL
└── package.json             Root convenience scripts (delegate to backend/)
```

## Getting started

```bash
# 1. Install backend dependencies
npm run install:backend

# 2. Create the backend environment file and adjust it if needed
cp backend/.env.example backend/.env

# 3. Start PostgreSQL (requires Docker). Creates the `mentormeet` and `mentormeet_test` databases.
npm run db:up

# 4. Start the API in watch mode on http://localhost:3000
npm run dev:backend

# 5. Check that it is up
curl http://localhost:3000/api/health
```

The Phase 1 API does not connect to the database yet, so steps 3 and 4 are independent.

### Environment variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | no (default `development`) | `development`, `test` or `production`. Stack traces are only returned in `development`. |
| `PORT` | no (default `3000`) | HTTP port. |
| `DATABASE_URL` | yes | `postgresql://` connection string. |
| `FRONTEND_URL` | yes | Allowed CORS origin(s), comma-separated. |
| `GEMINI_API_KEY` | no | Backend only. Not used until Phase 6. |
| `TRUST_PROXY` | no (default `0`) | Number of reverse proxies in front of the API, so rate limiting sees real client IPs. |

The server validates these at startup and exits with a clear error if any are invalid.
Never commit `.env`: it is listed in `.gitignore`.

## Scripts

Root (`package.json`):

| Command | Description |
|---|---|
| `npm run install:backend` | Install backend dependencies |
| `npm run db:up` / `npm run db:down` | Start / stop local PostgreSQL |
| `npm run dev:backend` | Run the API with reload on change (tsx) |
| `npm run build` | Compile the backend to `backend/dist` |
| `npm run typecheck` | Type-check backend sources and tests |
| `npm run lint` | ESLint |
| `npm test` | Backend test suite |

Backend only (`backend/package.json`): `dev`, `build`, `start` (runs `dist/server.js`),
`typecheck`, `lint`, `test`, `test:watch`.

## API

Currently only `GET /api/health`. For the error format and status codes, see
[docs/api.md](docs/api.md).

## Known limitations (at this phase)

- No database access, slots, bookings, frontend or AI integration yet.
- Host endpoints will initially have **no authentication** (demo scope). This will be
  documented and must be addressed before any real production use.
