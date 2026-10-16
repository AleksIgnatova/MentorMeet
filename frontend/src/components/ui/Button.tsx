import type { ButtonHTMLAttributes } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes';
import { Spinner } from './Spinner';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Shows a spinner and disables the button (prevents duplicate submissions). */
  loading?: boolean;
  size?: ButtonSize;
};

export function Button({
  variant = 'primary',
  loading = false,
  size = 'md',
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
