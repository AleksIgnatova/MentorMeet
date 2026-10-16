import { describe, expect, it } from 'vitest';
import { validateBookingForm, validateSlotForm } from './validation';

describe('validateBookingForm', () => {
  it('accepts a valid name and email', () => {
    expect(validateBookingForm({ name: 'Ana', email: 'ana@example.com' })).toEqual({});
  });

  it.each([
    [{ name: '', email: 'ana@example.com' }, 'name', 'Please enter your name.'],
    [{ name: '   ', email: 'ana@example.com' }, 'name', 'Please enter your name.'],
    [{ name: 'a'.repeat(101), email: 'ana@example.com' }, 'name', 'Name must be at most 100 characters.'],
    [{ name: 'Ana', email: '' }, 'email', 'Please enter your email address.'],
    [{ name: 'Ana', email: 'ana@' }, 'email', 'Please enter a valid email address.'],
    [{ name: 'Ana', email: 'ana example.com' }, 'email', 'Please enter a valid email address.'],
  ] as const)('rejects %o', (values, field, message) => {
    expect(validateBookingForm(values)[field]).toBe(message);
  });
});

describe('validateSlotForm', () => {
  const future = () => true;

  it('accepts complete future values', () => {
    expect(validateSlotForm({ date: '2030-06-03', time: '10:00', durationMinutes: '30' }, future)).toEqual({});
  });

  it('requires date, time and an allowed duration', () => {
    expect(validateSlotForm({ date: '', time: '', durationMinutes: '20' }, future)).toEqual({
      date: 'Please choose a date.',
      time: 'Please choose a start time.',
      durationMinutes: 'Please choose a duration.',
    });
  });

  it('rejects a start time in the past', () => {
    expect(validateSlotForm({ date: '2020-01-01', time: '10:00', durationMinutes: '30' }, () => false)).toEqual({
      time: 'The start time must be in the future.',
    });
  });
});
