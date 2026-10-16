# API

Base path: `/api`. All requests and responses use JSON. Only implemented endpoints
are documented here.

> **No authentication, by design.** The project brief explicitly states that user
> authentication is not required, so every endpoint is public. That includes the
> host operations (`POST /api/slots`, `DELETE /api/slots/:id`) and
> `GET /api/bookings`, which returns visitors' names and emails. This is acceptable
> for the interview/demo scope but **not** production-secure. See the README's
> known limitations.

## Conventions

### Success responses
Successful responses wrap the payload in `data`:

```json
{ "data": { "id": "…" } }
```

`204 No Content` responses have no body.

### Times
- Request instants are ISO 8601 date-times **with** an offset or `Z`
  (e.g. `2026-10-21T14:00:00+02:00`). Times without a zone are rejected.
- Response instants are ISO 8601 in UTC (e.g. `2026-10-21T12:00:00.000Z`). Clients
  display them in `Europe/Skopje`.
- Calendar dates in query strings (`YYYY-MM-DD`) are days in `Europe/Skopje`.
- Slot intervals are half-open: `[startTime, endTime)`. Adjacent slots don't overlap.

### Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "path": "durationMinutes", "message": "durationMinutes must be one of 15, 30, 45, 60" }]
  }
}
```

`details` is only present for validation errors. Clients should branch on `code`,
not on `message`.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request data failed validation |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 400 | `SLOT_IN_PAST` | Slot start time is not in the future |
| 404 | `ROUTE_NOT_FOUND` | No such route |
| 404 | `SLOT_NOT_FOUND` | Time slot does not exist |
| 409 | `SLOT_OVERLAP` | New slot overlaps an existing non-cancelled slot |
| 409 | `SLOT_HAS_BOOKING` | Slot cannot be deleted because it has a booking |
| 409 | `SLOT_ALREADY_BOOKED` | Slot was booked by someone else (including a concurrent request) |
| 409 | `SLOT_NOT_AVAILABLE` | Slot can't be booked: it has already started or was cancelled |
| 404 | `BOOKING_NOT_FOUND` | No booking for this confirmation token (unknown or malformed) |
| 409 | `CONFLICT` | Other state conflict |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 10 kB |
| 429 | `RATE_LIMITED` | Too many requests. Rate-limit info is in the `RateLimit` / `RateLimit-Policy` headers. |
| 500 | `INTERNAL_ERROR` | Unexpected error. No internals are exposed outside development. |

### Rate limiting
All `/api/*` routes except `/api/health` share a per-IP limit of 300 requests per
15 minutes. `POST /api/bookings` additionally has a stricter per-IP limit of 20
requests per 15 minutes, and `POST /api/ai/confirmation` one of 30 requests per
15 minutes.

### The slot object

```json
{
  "id": "8b71a61b-75ab-43b5-8e58-57ca97c8df38",
  "startTime": "2026-10-21T12:00:00.000Z",
  "endTime": "2026-10-21T12:30:00.000Z",
  "durationMinutes": 30,
  "status": "AVAILABLE"
}
```

`status` is `AVAILABLE`, `BOOKED` or `CANCELLED`. Nothing produces `CANCELLED` yet;
it's reserved for a future cancellation feature.

## Endpoints

### `GET /api/health`

Liveness check. Not rate limited.

**200 OK**

```json
{ "status": "ok", "timestamp": "2026-10-15T12:46:01.003Z" }
```

### `POST /api/slots` (host)

Creates an available time slot.

**Request body**

```json
{ "startTime": "2026-10-21T14:00:00+02:00", "durationMinutes": 30 }
```

| Field | Rules |
|---|---|
| `startTime` | Required. ISO 8601 date-time with offset or `Z`; a real calendar date; strictly in the future. |
| `durationMinutes` | Required. JSON number, one of `15`, `30`, `45`, `60`. |

Any other field (e.g. `endTime`, `status`, `id`) is rejected with 400. The server
computes `endTime = startTime + durationMinutes`.

| Status | Body |
|---|---|
| 201 Created | `{ "data": <slot> }`, with a `Location: /api/slots/{id}` header |
| 400 | `VALIDATION_ERROR` (invalid body), `SLOT_IN_PAST` |
| 409 | `SLOT_OVERLAP`: overlaps a non-cancelled slot. Enforced by a PostgreSQL exclusion constraint, so it also holds for concurrent requests. |

### `GET /api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD[&status=AVAILABLE]`

Lists slots whose **start** falls on the calendar days `from` through `to`
(**inclusive**) in Europe/Skopje, ordered by start time.

| Parameter | Rules |
|---|---|
| `from`, `to` | Required. Valid `YYYY-MM-DD` dates. `to` ≥ `from`. At most 93 days inclusive. |
| `status` | Optional. Only `AVAILABLE` is supported. It returns only slots that are `AVAILABLE` **and have not started yet** (what the public booking page shows). Without it, all slots in the range are returned, whatever their status (host dashboard). |

Other query parameters are ignored.

| Status | Body |
|---|---|
| 200 OK | `{ "data": [<slot>, …] }` (possibly empty) |
| 400 | `VALIDATION_ERROR` |

### `GET /api/slots/:id`

| Status | Body |
|---|---|
| 200 OK | `{ "data": <slot> }` |
| 400 | `VALIDATION_ERROR`: `id` is not a UUID |
| 404 | `SLOT_NOT_FOUND` |

### `DELETE /api/slots/:id` (host)

Permanently deletes a slot that is still `AVAILABLE`. The status check and the
delete happen in a single SQL statement, and the `bookings` foreign key
(`ON DELETE RESTRICT`) is a second safeguard.

| Status | Body |
|---|---|
| 204 No Content | Deleted. Deleting it again returns 404. |
| 400 | `VALIDATION_ERROR`: `id` is not a UUID |
| 404 | `SLOT_NOT_FOUND` |
| 409 | `SLOT_HAS_BOOKING`: the slot is booked |

### `POST /api/bookings` (public)

Books an available slot. Only one booking per slot can ever succeed, including
under concurrent requests (see [architecture.md](architecture.md#bookings-api-phase-4)).

**Request body**

```json
{ "timeSlotId": "8b71a61b-75ab-43b5-8e58-57ca97c8df38", "name": "Ana Petrova", "email": "ana@example.com" }
```

| Field | Rules |
|---|---|
| `timeSlotId` | Required. UUID of an existing slot. |
| `name` | Required. Trimmed; 1–100 characters; no control characters (e.g. newlines). |
| `email` | Required. Trimmed; a valid email address; at most 254 characters. |

Any other field (e.g. `status`, `startTime`, `endTime`, `confirmationToken`) is
rejected with 400. The session times always come from the stored slot.

**201 Created**

```json
{
  "data": {
    "name": "Ana Petrova",
    "status": "CONFIRMED",
    "slot": {
      "startTime": "2026-10-21T12:00:00.000Z",
      "endTime": "2026-10-21T12:30:00.000Z",
      "durationMinutes": 30
    },
    "confirmationToken": "Jx3…(43 characters)"
  }
}
```

Use `confirmationToken` for the confirmation page URL
(`/booking/confirmation/:token`). It is a 256-bit random value, encoded as 43
base64url characters. The response does not echo the email.

| Status | Body |
|---|---|
| 201 Created | See above |
| 400 | `VALIDATION_ERROR` |
| 404 | `SLOT_NOT_FOUND` |
| 409 | `SLOT_ALREADY_BOOKED`, or `SLOT_NOT_AVAILABLE` (already started or cancelled) |
| 429 | `RATE_LIMITED` |

### `GET /api/bookings/:token` (public)

Data for the confirmation page. It returns only what the page shows: no email, no
internal id and no token. Responses carry `Cache-Control: no-store`.

**200 OK**

```json
{
  "data": {
    "name": "Ana Petrova",
    "status": "CONFIRMED",
    "slot": {
      "startTime": "2026-10-21T12:00:00.000Z",
      "endTime": "2026-10-21T12:30:00.000Z",
      "durationMinutes": 30
    }
  }
}
```

| Status | Body |
|---|---|
| 200 OK | See above |
| 404 | `BOOKING_NOT_FOUND`, for both unknown and malformed tokens. A booking's internal id does not work as a token. |

### `GET /api/bookings[?upcoming=true]` (host dashboard)

Lists bookings ordered by session start. It contains personal data (name, email)
but never confirmation tokens. Responses carry `Cache-Control: no-store`.

| Parameter | Rules |
|---|---|
| `upcoming` | Optional, `true` or `false` (default `false`). With `true`, only bookings whose session has not ended yet. |

**200 OK**

```json
{
  "data": [
    {
      "id": "1f0c…",
      "name": "Ana Petrova",
      "email": "ana@example.com",
      "status": "CONFIRMED",
      "createdAt": "2026-10-15T14:02:11.120Z",
      "slot": {
        "id": "8b71a61b-75ab-43b5-8e58-57ca97c8df38",
        "startTime": "2026-10-21T12:00:00.000Z",
        "endTime": "2026-10-21T12:30:00.000Z",
        "durationMinutes": 30,
        "status": "BOOKED"
      }
    }
  ]
}
```

| Status | Body |
|---|---|
| 200 OK | See above (possibly an empty list) |
| 400 | `VALIDATION_ERROR` (invalid `upcoming`) |

### `POST /api/ai/confirmation` (public)

The personal message for the confirmation page. The backend loads the booking by
token from the database and builds the message from the stored data. The client
sends only the token.

- The first successful AI message for a booking is **stored**, and every later request
  (for example a page refresh) returns that same message without calling Gemini again.
- If no Gemini API key is configured, or Gemini fails, times out (12 s in total,
  including one retry of a temporary failure such as HTTP 503/429 or a network
  error), is blocked or returns nothing usable, the response is still **200** with
  the prepared fallback message. The fallback is **not** stored, so a later request
  tries again.
- Concurrent requests for the same booking all get the one stored message.
- The booking's status and slot are never changed. Responses carry
  `Cache-Control: no-store`.

**Request**

```json
{ "token": "Jx3…(43 characters)" }
```

| Field | Rules |
|---|---|
| `token` | Required string (at most 100 characters). Any other field is rejected (400). |

**200 OK**

```json
{
  "data": {
    "message": "Thank you, Ana! Your 30-minute mentoring session on Wednesday, 21 October 2026 at 14:00 is booked. …",
    "source": "ai"
  }
}
```

`source` is `ai` for a Gemini message and `fallback` for the prepared one. `message`
is plain text (no HTML or markdown), at most 600 characters. Provider errors are
never passed to the client.

| Status | Body |
|---|---|
| 200 OK | See above (AI or fallback message) |
| 400 | `VALIDATION_ERROR` (missing, non-string or extra fields) |
| 404 | `BOOKING_NOT_FOUND`, for both unknown and malformed tokens |
| 429 | `RATE_LIMITED` |
