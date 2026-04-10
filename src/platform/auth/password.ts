import { scryptSync, timingSafeEqual } from 'node:crypto'

import { randomBytesAsync } from '@/src/shared/crypto/randomBytes'

const SALT_LEN_BYTES = 16
const SCRYPT_KEYLEN = 64
const SCRYPT_N = 16384
const SCRYPT_r = 8
const SCRYPT_p = 1

export const hashPassword = async (
  password: string,
  saltHex?: string,
): Promise<string> => {
  const salt =
    saltHex != null
      ? Buffer.from(saltHex, 'hex')
      : await randomBytesAsync(SALT_LEN_BYTES)

  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  }) as Buffer

  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString(
    'hex',
  )}$${derived.toString('hex')}`
}

export const verifyPassword = (password: string, stored: string): boolean => {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6) return false
    const [algo, nStr, rStr, pStr, saltHex, hashHex] = parts
    if (algo !== 'scrypt') return false

    const N = parseInt(nStr, 10)
    const r = parseInt(rStr, 10)
    const p = parseInt(pStr, 10)
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return false
    }

    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const derived = scryptSync(password, salt, expected.length, { N, r, p })
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
