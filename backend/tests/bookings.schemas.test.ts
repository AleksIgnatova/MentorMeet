import {
  createBookingBodySchema,
  isWellFormedToken,
  listBookingsQuerySchema,
} from '../src/modules/bookings/bookings.schemas';
import { generateConfirmationToken } from '../src/modules/bookings/bookings.service';

const valid = {
  timeSlotId: 'b3c0a7a2-5f0e-4c43-9a57-0c2a3f0e9d11',
  name: 'Ana Petrova',
  email: 'ana@example.com',
};

describe('createBookingBodySchema', () => {
  it('accepts a valid body and trims name and email', () => {
    expect(
      createBookingBodySchema.parse({ ...valid, name: '  Ana Petrova ', email: ' ana@example.com ' }),
    ).toEqual(valid);
  });

  it('accepts non-ASCII names and a 100-character name', () => {
    expect(createBookingBodySchema.safeParse({ ...valid, name: 'Ана Петрова' }).success).toBe(true);
    expect(createBookingBodySchema.safeParse({ ...valid, name: 'a'.repeat(100) }).success).toBe(true);
  });

  it.each([
    ['missing timeSlotId', { timeSlotId: undefined }],
    ['malformed timeSlotId', { timeSlotId: 'slot-1' }],
    ['missing name', { name: undefined }],
    ['blank name', { name: '   ' }],
    ['name over 100 characters', { name: 'a'.repeat(101) }],
    ['name with a newline', { name: 'Ana\nBcc: x@example.com' }],
    ['missing email', { email: undefined }],
    ['invalid email', { email: 'not-an-email' }],
    ['email without domain', { email: 'ana@' }],
    ['email over 254 characters', { email: `${'a'.repeat(250)}@example.com` }],
    ['email as number', { email: 42 }],
  ])('rejects %s', (_label, override) => {
    expect(createBookingBodySchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it.each([
    ['status', { status: 'CONFIRMED' }],
    ['startTime', { startTime: '2030-06-03T10:00:00+02:00' }],
    ['endTime', { endTime: '2030-06-03T10:30:00+02:00' }],
    ['confirmationToken', { confirmationToken: 'x'.repeat(43) }],
  ])('rejects client-supplied %s', (_label, extra) => {
    expect(createBookingBodySchema.safeParse({ ...valid, ...extra }).success).toBe(false);
  });
});

describe('listBookingsQuerySchema', () => {
  it('parses the optional upcoming flag', () => {
    expect(listBookingsQuerySchema.parse({})).toEqual({ upcoming: false });
    expect(listBookingsQuerySchema.parse({ upcoming: 'true' })).toEqual({ upcoming: true });
    expect(listBookingsQuerySchema.parse({ upcoming: 'false' })).toEqual({ upcoming: false });
  });

  it.each(['yes', '1', ''])('rejects upcoming=%p', (upcoming) => {
    expect(listBookingsQuerySchema.safeParse({ upcoming }).success).toBe(false);
  });
});

describe('confirmation tokens', () => {
  it('are 43-character base64url strings with 256 bits of entropy and do not repeat', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateConfirmationToken));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) expect(isWellFormedToken(token)).toBe(true);
  });

  it.each(['', 'short', 'a'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}/`, '../../etc/passwd'])(
    'treats %p as malformed',
    (token) => {
      expect(isWellFormedToken(token)).toBe(false);
    },
  );
});
