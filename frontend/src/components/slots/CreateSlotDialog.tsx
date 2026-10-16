import { useState, type FormEvent } from 'react';
import { createSlot } from '../../features/dashboard/dashboard.api';
import { isApiError } from '../../lib/api-client';
import { todayInZone, zonedDateTimeToIso } from '../../lib/date-time';
import { describeError } from '../../lib/error-messages';
import { validateSlotForm, type SlotFormErrors, type SlotFormValues } from '../../lib/validation';
import { SLOT_DURATIONS, type Slot, type SlotDuration } from '../../types/slot';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { SelectField, TextField } from '../ui/Field';

const initialValues = (): SlotFormValues => ({ date: todayInZone(), time: '', durationMinutes: '30' });

/** Host form for a new slot. Times are entered in Europe/Skopje and sent with their offset. */
export function CreateSlotDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (slot: Slot) => void;
}) {
  const [values, setValues] = useState<SlotFormValues>(initialValues);
  const [errors, setErrors] = useState<SlotFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setValues(initialValues());
    setErrors({});
    setSubmitError(null);
    onClose();
  };

  const update = (field: keyof SlotFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const validation = validateSlotForm(
      values,
      (date, time) => new Date(zonedDateTimeToIso(date, time)) > new Date(),
    );
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const slot = await createSlot({
        startTime: zonedDateTimeToIso(values.date, values.time),
        durationMinutes: Number(values.durationMinutes) as SlotDuration,
      });
      setValues(initialValues());
      onCreated(slot);
    } catch (error) {
      setSubmitError(
        isApiError(error) && error.code === 'SLOT_OVERLAP'
          ? 'This time overlaps an existing slot. Please choose a different time.'
          : describeError(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={submitting}
      title="New time slot"
      description="Times are in Europe/Skopje."
    >
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        {submitError && <Alert tone="error">{submitError}</Alert>}
        <TextField
          label="Date"
          type="date"
          min={todayInZone()}
          value={values.date}
          onChange={(event) => update('date')(event.target.value)}
          error={errors.date}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start time"
            type="time"
            step={300}
            value={values.time}
            onChange={(event) => update('time')(event.target.value)}
            error={errors.time}
            required
          />
          <SelectField
            label="Duration"
            value={values.durationMinutes}
            onChange={(event) => update('durationMinutes')(event.target.value)}
            error={errors.durationMinutes}
          >
            {SLOT_DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </SelectField>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={close} disabled={submitting} data-dialog-close>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create slot
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
