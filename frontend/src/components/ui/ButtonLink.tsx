import { Link, type LinkProps } from 'react-router';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes';

/**
 * A client-side navigation link styled like Button. Uses React Router's Link,
 * so navigating never reloads the page.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses({ variant, size, className })} {...rest} />;
}
