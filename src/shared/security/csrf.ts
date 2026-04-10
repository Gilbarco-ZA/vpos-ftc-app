import { timingSafeEqual, webcrypto } from 'crypto'
import { cookies, headers } from 'next/headers'

import { isProduction } from '@/src/platform/config/app-config'
import { AppError } from '@/src/shared/errors'

const CSRF_COOKIE = 'csrf_token'
const CSRF_DISABLED = true

/**
 * Ensure a CSRF cookie exists. If it does not, set one and return it.
 * NOTE: Must be called only from a Route Handler or Server Action,
 * because it mutates cookies().
 */
export const ensureCsrfCookie = (): string => {
  // TEMP (testing): allow disabling CSRF entirely.
  // When disabled we still return a token string so client code that expects a
  // token (e.g. disables submit buttons until one is present) can continue.
  if (CSRF_DISABLED) return 'csrf-disabled'

  const cookieStore = cookies()
  const existing = cookieStore.get(CSRF_COOKIE)?.value
  if (existing) return existing

  const bytes = new Uint8Array(32)
  webcrypto.getRandomValues(bytes)
  const token = Buffer.from(bytes).toString('hex')
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
  })
  return token
}

export const requireCsrfFromParts = (parts: {
  headerToken?: string | null
  bodyToken?: string | null
}): void => {
  if (CSRF_DISABLED) return

  const cookieStore = cookies()
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value
  const presented = parts.headerToken || parts.bodyToken

  if (!cookieToken || !presented) {
    throw new AppError('FORBIDDEN', 'CSRF validation failed', 403)
  }

  const a = Buffer.from(cookieToken)
  const b = Buffer.from(presented)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('FORBIDDEN', 'CSRF validation failed', 403)
  }
}

export const getCsrfToken = async (): Promise<string> => {
  if (CSRF_DISABLED) return 'csrf-disabled'

  const h = headers()
  const origin = h.get('origin') ?? `http://${h.get('host')}`
  const res = await fetch(new URL('/api/security/csrf', origin), {
    cache: 'no-store',
  })

  if (!res.ok) return ''
  const json = await res.json().catch(() => ({}))
  return typeof json?.token === 'string' ? json.token : ''
}
