import { useRef, useState, type FormEvent } from 'react';
import { validateBookingForm, type BookingFormErrors, type BookingFormValues } from '../../lib/validation';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';

/**
 * Name + email form. Validates on submit, and calls `onSubmit` at most once at a
 * time: further submits are ignored until the returned promise settles.
 */
export function BookingForm({
  onSubmit,
  serverErrors,
}: {
  onSubmit: (values: BookingFormValues) => Promise<void>;
  /** Field errors reported by the API (400 VALIDATION_ERROR). */
  serverErrors?: BookingFormErrors;
}) {
  const [values, setValues] = useState<BookingFormValues>({ name: '', email: '' });
  const [errors, setErrors] = useState<BookingFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const shownErrors = { ...serverErrors, ...errors };

  const update = (field: keyof BookingFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;

    const validation = validateBookingForm(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit({ name: values.name.trim(), email: values.email.trim() });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <TextField
        label="Your name"
        name="name"
        autoComplete="name"
        value={values.name}
        onChange={(event) => update('name')(event.target.value)}
        error={shownErrors.name}
        disabled={submitting}
        required
      />
      <TextField
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={values.email}
        onChange={(event) => update('email')(event.target.value)}
        error={shownErrors.email}
        hint="Only used to identify your booking. We don't send marketing emails."
        disabled={submitting}
        required
      />
      <Button type="submit" loading={submitting} className="w-full sm:w-auto">
        {submitting ? 'Booking…' : 'Confirm booking'}
      </Button>
    </form>
  );
}
