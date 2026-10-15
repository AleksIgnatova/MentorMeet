import { z } from 'zod';

/** Matches the Booking.name column (VARCHAR(100)). */
export const NAME_MAX_LENGTH = 100;
/** Matches the Booking.email column (VARCHAR(254), the practical maximum for an address). */
export const EMAIL_MAX_LENGTH = 254;

/** 32 random bytes encoded as base64url (see bookings.service.ts). */
export const CONFIRMATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Control characters (incl. newlines) are never valid in a name or address and
// could break e-mail headers or log lines later.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Body of `POST /api/bookings`. Strict: `status`, `startTime`, `endTime` or any
 * other field is rejected, because only the server decides those values.
 */
export const createBookingBodySchema = z.strictObject(
  {
    timeSlotId: z.uuid({ error: 'timeSlotId must be a valid UUID' }),
    name: z
      .string({ error: 'name is required' })
      .trim()
      .min(1, { error: 'name is required' })
      .max(NAME_MAX_LENGTH, { error: `name must be at most ${NAME_MAX_LENGTH} characters` })
      .refine((value) => !CONTROL_CHARACTERS.test(value), {
        error: 'name contains invalid characters',
      }),
    email: z
      .string({ error: 'email is required' })
      .trim()
      .max(EMAIL_MAX_LENGTH, { error: `email must be at most ${EMAIL_MAX_LENGTH} characters` })
      .pipe(z.email({ error: 'email must be a valid email address' })),
  },
  { error: 'Request body must be a JSON object with timeSlotId, name and email' },
);
export type CreateBookingInput = z.infer<typeof createBookingBodySchema>;

/** Query of `GET /api/bookings`. Unknown query parameters are ignored. */
export const listBookingsQuerySchema = z.object({
  upcoming: z
    .enum(['true', 'false'], { error: 'upcoming must be true or false' })
    .optional()
    .transform((value) => value === 'true'),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

/**
 * `:token` path parameter. A malformed token is reported exactly like an
 * unknown one (404), so the API does not reveal anything about token format.
 */
export const isWellFormedToken = (token: string) => CONFIRMATION_TOKEN_PATTERN.test(token);
