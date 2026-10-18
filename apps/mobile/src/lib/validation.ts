import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from '@app/shared';

/** Same rules as the API's DTOs, so most mistakes are caught before a round trip. */
export function validateCredentials(values: {
  email: string;
  password: string;
  username?: string;
}) {
  const errors: Partial<Record<'email' | 'password' | 'username', string>> = {};
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Enter a valid email address';
  if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `At least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (
    values.username !== undefined &&
    !USERNAME_PATTERN.test(values.username.trim().toLowerCase())
  ) {
    errors.username = '3–24 characters: letters, numbers, _ or .';
  }
  return errors;
}
