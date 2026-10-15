# API

Base path: `/api`. All requests and responses use JSON. Only implemented endpoints
are documented here; this file grows with each phase.

## Error format

Every error response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "path": "email", "message": "Invalid email address" }]
  }
}
```

`details` is only present for validation errors. Clients should branch on `code`,
not on `message`.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request data failed validation |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 404 | `ROUTE_NOT_FOUND` | No such route |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | State conflict (more specific codes will be added, e.g. `SLOT_ALREADY_BOOKED`) |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 10 kB |
| 429 | `RATE_LIMITED` | Too many requests. Rate-limit info is in the `RateLimit` / `RateLimit-Policy` headers. |
| 500 | `INTERNAL_ERROR` | Unexpected error. No internals are exposed outside development. |

## Rate limiting

All `/api/*` routes except `/api/health` share a per-IP limit of 300 requests per
15 minutes.

## Endpoints

### `GET /api/health`

Liveness check. Not rate limited.

**200 OK**

```json
{ "status": "ok", "timestamp": "2026-10-15T12:46:01.003Z" }
```
