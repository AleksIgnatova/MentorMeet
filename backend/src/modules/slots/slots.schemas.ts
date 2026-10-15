import { z } from 'zod';
import { calendarDaysBetween, parseCalendarDate, type CalendarDate } from '../../utils/date-time';

export const ALLOWED_DURATIONS = [15, 30, 45, 60] as const;
export type SlotDuration = (typeof ALLOWED_DURATIONS)[number];

/** Maximum span of `GET /api/slots` (inclusive calendar days) to keep responses bounded. */
export const MAX_RANGE_DAYS = 93;

/**
 * ISO 8601 date-time that must carry an explicit offset or `Z`, so it is an
 * unambiguous instant regardless of the server's time zone.
 */
const isoInstant = z
  .string({ error: 'startTime is required' })
  .pipe(
    z.iso.datetime({
      offset: true,
      error: 'startTime must be an ISO 8601 date-time with a time zone offset, e.g. 2026-10-21T14:00:00+02:00',
    }),
  )
  .refine((value) => parseCalendarDate(value.slice(0, 10)) !== undefined, {
    error: 'startTime is not a valid calendar date',
  })
  .transform((value) => new Date(value));

const calendarDate = (name: string) =>
  z
    .string({ error: `${name} is required (YYYY-MM-DD)` })
    .transform((value, ctx): CalendarDate => {
      const date = parseCalendarDate(value);
      if (!date) {
        ctx.addIssue({ code: 'custom', message: `${name} must be a valid date in YYYY-MM-DD format` });
        return z.NEVER;
      }
      return date;
    });

/**
 * Body of `POST /api/slots`. Strict: `endTime`, `status` and any other field are
 * rejected because the server computes them.
 */
export const createSlotBodySchema = z.strictObject(
  {
    startTime: isoInstant,
    durationMinutes: z.literal(ALLOWED_DURATIONS, {
      error: `durationMinutes must be one of ${ALLOWED_DURATIONS.join(', ')}`,
    }),
  },
  { error: 'Request body must be a JSON object with startTime and durationMinutes' },
);
export type CreateSlotInput = z.infer<typeof createSlotBodySchema>;

/** Query of `GET /api/slots`. Unknown query parameters are ignored. */
export const listSlotsQuerySchema = z
  .object({
    from: calendarDate('from'),
    to: calendarDate('to'),
    status: z
      .literal('AVAILABLE', { error: 'status filter only supports AVAILABLE' })
      .optional(),
  })
  .superRefine(({ from, to }, ctx) => {
    const days = calendarDaysBetween(from, to);
    if (days < 0) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be on or after from' });
    } else if (days + 1 > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `The date range may span at most ${MAX_RANGE_DAYS} days`,
      });
    }
  });
export type ListSlotsQuery = z.infer<typeof listSlotsQuerySchema>;

export const slotIdParamsSchema = z.object({
  id: z.uuid({ error: 'id must be a valid UUID' }),
});
