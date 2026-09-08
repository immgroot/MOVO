export type AccountView = 'entry' | 'signin' | 'signup' | 'profile';
export function accountValidation(
  view: 'signin' | 'signup',
  values: { email: string; password: string; name?: string; confirm?: string },
) {
  if (
    view === 'signup' &&
    (!values.name?.trim() ||
      values.name.trim().length > 18 ||
      /\p{Cc}/u.test(values.name))
  )
    return 'Choose a display name of 1–18 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    return 'Enter a valid email address.';
  if (
    !values.password ||
    (view === 'signup' &&
      (values.password.length < 12 || values.password.length > 128))
  )
    return 'Use a password of 12–128 characters.';
  if (view === 'signup' && values.password !== values.confirm)
    return 'Your passwords do not match.';
  return '';
}
export function accountError(code?: string) {
  if (code === 'INVALID_DISPLAY_NAME')
    return 'Choose a display name of 1–18 characters.';
  if (code?.includes('PASSWORD_TOO') || code === 'INVALID_PASSWORD')
    return 'Password does not meet requirements.';
  if (code?.includes('ALREADY_EXISTS'))
    return 'Email already in use. Try signing in.';
  if (code === 'INVALID_EMAIL') return 'Enter a valid email address.';
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'USER_NOT_FOUND')
    return 'Invalid email or password.';
  if (code?.includes('RATE_LIMIT') || code === 'TOO_MANY_REQUESTS')
    return 'Too many attempts. Wait a minute and try again.';
  return 'Connection failed. Please try again.';
}
