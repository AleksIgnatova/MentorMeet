import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BookingForm } from '../components/bookings/BookingForm';

describe('BookingForm', () => {
  it('shows validation errors and does not submit invalid data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<BookingForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Your name'), 'Ana');
    await user.type(screen.getByLabelText('Email address'), 'ana@');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(screen.queryByText('Please enter your name.')).not.toBeInTheDocument();
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits trimmed values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<BookingForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Your name'), '  Ana Petrova ');
    await user.type(screen.getByLabelText('Email address'), ' ana@example.com ');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ name: 'Ana Petrova', email: 'ana@example.com' });
  });

  it('disables the form while submitting and ignores repeated submits', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<BookingForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Your name'), 'Ana');
    await user.type(screen.getByLabelText('Email address'), 'ana@example.com');
    const button = screen.getByRole('button', { name: 'Confirm booking' });
    await user.dblClick(button);
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Booking…/ })).toBeDisabled();
    expect(screen.getByLabelText('Your name')).toBeDisabled();

    finish();
    expect(await screen.findByRole('button', { name: 'Confirm booking' })).toBeEnabled();
  });

  it('shows field errors reported by the server', () => {
    render(<BookingForm onSubmit={vi.fn()} serverErrors={{ email: 'email must be a valid email address' }} />);
    expect(screen.getByText('email must be a valid email address')).toBeInTheDocument();
  });
});
