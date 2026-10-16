/** Client-side validation mirroring the backend Zod schemas (bookings/slots *.schemas.ts). */

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;

// Pragmatic check; the backend performs the authoritative validation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type BookingFormValues = { name: string; email: string };
export type BookingFormErrors = Partial<Record<keyof BookingFormValues, string>>;

export function validateBookingForm({ name, email }: BookingFormValues): BookingFormErrors {
  const errors: BookingFormErrors = {};
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  if (!trimmedName) errors.name = 'Please enter your name.';
  else if (trimmedName.length > NAME_MAX_LENGTH)
    errors.name = `Name must be at most ${NAME_MAX_LENGTH} characters.`;
  else if (CONTROL_CHARACTERS.test(trimmedName)) errors.name = 'Name contains invalid characters.';

  if (!trimmedEmail) errors.email = 'Please enter your email address.';
  else if (trimmedEmail.length > EMAIL_MAX_LENGTH)
    errors.email = `Email must be at most ${EMAIL_MAX_LENGTH} characters.`;
  else if (!EMAIL_PATTERN.test(trimmedEmail)) errors.email = 'Please enter a valid email address.';

  return errors;
}

export type SlotFormValues = { date: string; time: string; durationMinutes: string };
export type SlotFormErrors = Partial<Record<keyof SlotFormValues, string>>;

export function validateSlotForm(
  { date, time, durationMinutes }: SlotFormValues,
  isInFuture: (date: string, time: string) => boolean,
): SlotFormErrors {
  const errors: SlotFormErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Please choose a date.';
  if (!/^\d{2}:\d{2}$/.test(time)) errors.time = 'Please choose a start time.';
  if (!['15', '30', '45', '60'].includes(durationMinutes))
    errors.durationMinutes = 'Please choose a duration.';
  if (!errors.date && !errors.time && !isInFuture(date, time))
    errors.time = 'The start time must be in the future.';
  return errors;
}
