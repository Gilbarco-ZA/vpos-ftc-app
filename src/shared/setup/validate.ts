export function validateCertData(
  certData: string,
): { ok: true } | { ok: false; error: string } {
  if (!certData) return { ok: false, error: 'Certificate data missing' }
  const marker = 'base64,'
  const idx = certData.indexOf(marker)
  if (idx === -1)
    return { ok: false, error: 'Invalid certificate data (no base64 marker)' }

  const base64Payload = certData.slice(idx + marker.length)
  try {
    const buf = Buffer.from(base64Payload, 'base64')
    if (buf.length < 64)
      return { ok: false, error: 'Certificate payload too small' }
    if (buf.length > 5_000_000)
      return { ok: false, error: 'Certificate payload too large' }
  } catch {
    return { ok: false, error: 'Invalid certificate encoding' }
  }
  return { ok: true }
}

export function validateRegistrationCode(
  code: string,
): { ok: true; code: string } | { ok: false; error: string } {
  const value = String(code || '').trim()
  if (!value) return { ok: false, error: 'Registration code is required' }
  if (value.length < 6) {
    return {
      ok: false,
      error: 'Registration code must be at least 6 characters',
    }
  }
  return { ok: true, code: value }
}

export function validateSetupPayload(payload: {
  deviceRegistration?: { RegistrationCode?: string; registrationCode?: string }
  authConfig?: { username?: string; password?: string; email?: string }
}): { ok: true } | { ok: false; error: string } {
  const regCode =
    payload?.deviceRegistration?.RegistrationCode ||
    payload?.deviceRegistration?.registrationCode ||
    ''

  const v = validateRegistrationCode(regCode)
  if (!v.ok) return v

  const username = String(payload?.authConfig?.username || '').trim()
  const password = String(payload?.authConfig?.password || '').trim()

  if (username && !password) {
    return {
      ok: false,
      error: 'Password is required when username is provided',
    }
  }

  if (password && password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters' }
  }

  return { ok: true }
}
