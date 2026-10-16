# MentorMeet

A web application for booking one-to-one mentoring sessions, built for the TeamLift
internship challenge.

## About MentorMeet

A mentor (the host) publishes available time slots. Visitors choose a free slot,
enter their name and email, and book it. They then get a confirmation page with the
session details.

All data is stored in PostgreSQL, and the backend guarantees that a slot can never be
booked twice, even when two people book at the same moment.

> **Demo scope:** there is a single host and no login. The dashboard and the booking
> list (including visitors' names and emails) are not protected, so this version is
> not meant to hold real personal data.

## Features

- **Host dashboard** (`/dashboard`, the start page): booking statistics, a 14-day
  list of time slots, creating slots (15, 30, 45 or 60 minutes), deleting free slots,
  and upcoming bookings.
- **Public booking page** (`/book`): pick a day, choose a free time, enter a name
  and email, and book. If someone else takes the slot first, the page refreshes the
  free times and explains what happened.
- **Confirmation page**: shows the booking details. It loads by a secure link, so it
  still works after a refresh or from a bookmark.
- **AI confirmation message (optional):** a short personal message generated with
  the Gemini API on the backend and saved with the booking. If Gemini is not
  configured or unavailable, a standard message is shown and the booking is
  unaffected.
- **Reliable booking rules:** no double bookings and no overlapping slots. Both are
  enforced by the database and tested with concurrent requests.
- Input validation, rate limiting, and clear loading, empty and error states.
- All times are shown in the `Europe/Skopje` time zone.

## Tech Stack

| Area | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Tailwind CSS |
| Backend | Node.js, Express 5, TypeScript, Zod |
| Database | PostgreSQL 17 (Docker Compose locally), Prisma ORM and migrations |
| Testing | Jest and Supertest (backend), Vitest and React Testing Library (frontend), Playwright (end-to-end) |
| AI integration | Gemini API, called only from the backend (optional) |

## Getting Started

### Prerequisites

- Node.js 22.22 or newer, and npm
- Docker (runs the local PostgreSQL database)
- Google Chrome, only for the end-to-end tests

### Run locally

```bash
# 1. Clone the repository
git clone https://github.com/AleksIgnatova/MentorMeet.git
cd MentorMeet

# 2. Install dependencies
npm run install:backend
npm run install:frontend

# 3. Create the environment files from the examples
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. Start PostgreSQL and apply the database migrations
npm run db:up
npm run db:migrate

# 5. (Optional) Add sample time slots
npm run db:seed

# 6. Start the backend (http://localhost:3000) and, in a second terminal, the frontend
npm run dev:backend
npm run dev:frontend
```

Open http://localhost:5173. It redirects to the host dashboard; visitors use
http://localhost:5173/book.

The example environment files work as they are for local development. To enable
the AI message, set `GEMINI_API_KEY` in `backend/.env` and restart the backend. Never
commit `.env` files. Stop the database with `npm run db:down`; your data stays in the
Docker volume.

### Run the tests

PostgreSQL must be running (`npm run db:up`). The tests use a separate
`mentormeet_test` database, so your development data is never touched, and they
never call the real Gemini API.

```bash
npm test             # backend (unit and integration) and frontend tests
npm run test:e2e     # end-to-end tests in a real browser (Playwright)
npm run typecheck && npm run lint && npm run build
```

The end-to-end tests start their own backend and frontend on ports 3999 and 5174,
so those ports must be free.

### More documentation

- [API reference](docs/api.md): endpoints, request and response formats, error codes
- [Architecture](docs/architecture.md): design decisions, database constraints,
  concurrency handling and testing strategy

## AI Tools Used

I used **Claude Code** (Anthropic) as an AI-assisted development tool.

- I defined the requirements, architecture and a phase-by-phase plan in advance.
  They are included in the repository as
  [MENTORMEET_IMPLEMENTATION_PLAN.md](MENTORMEET_IMPLEMENTATION_PLAN.md) and
  [CLAUDE_CODE_PROMPT.md](CLAUDE_CODE_PROMPT.md), both in Macedonian.
- Claude Code helped write code, tests and documentation one phase at a time, under
  those instructions.
- I reviewed and approved every phase before it was committed, tested the application
  manually in the browser, and made the product and design decisions. For example, I
  decided to save AI messages so they stay the same after a refresh, and to make the
  dashboard the start page.
- Claude Code was used throughout the project. The first five commits also carry a
  `Co-Authored-By` line.

Separately, the application itself uses the **Gemini API** to generate the optional
confirmation message.

## What I Would Improve With More Time

These are future improvements for real-world use; they are **not** part of the
current version.

- **Authentication and authorization:** separate accounts and appropriate permissions
  for mentors and users, so that host pages and visitors' personal data are protected.
- **Booking management:** let users cancel or reschedule bookings, and make the
  released slots available again.
- **Notifications:** email confirmations and booking reminders.
- **Production readiness:** stronger API security, structured logging, monitoring,
  and regular database backups.
