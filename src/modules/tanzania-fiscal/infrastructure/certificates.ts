import crypto from 'node:crypto'

import { getSecureArtifactPayload } from '@/src/platform/security/secure-artifacts'
import { kvGet, kvGetMany } from '@/src/shared/storage/stationKv'

export type TanzaniaCertificateKind = 'tra' | 'ewura' | 'shared'

export type TanzaniaSigningBundle = {
  stationId: string
  kind: TanzaniaCertificateKind
  privateKeyPem: string | null
  publicCertificatePem: string | null
  publicKeyPem: string | null
  certSerial: string | null
  certSerialBase64: string | null
  passphrase: string | null
  warnings: string[]
}

const PRIVATE_KEY_MARKER = 'PRIVATE KEY'
const CERTIFICATE_MARKER = 'CERTIFICATE'

const trimText = (value: unknown): string | null => {
  if (value == null) return null
  const text = Buffer.isBuffer(value)
    ? value.toString('utf8').trim()
    : String(value).trim()
  return text.length ? text : null
}

function isObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function pickString(
  obj: Record<string, any> | null | undefined,
  keys: string[],
) {
  if (!obj) return null
  for (const key of keys) {
    const value = obj[key]
    const text = trimText(value)
    if (text) return text
  }
  return null
}

function normalizePemBlock(text: string): string {
  const clean = text.trim()
  if (clean.includes('-----BEGIN ')) return clean

  const base64 = clean.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return clean

  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`
}

export function normalizeContentForSigning(input: string | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input
  return Buffer.from(
    String(input || '')
      .replace(/<\?xml[^>]*\?>/, '')
      .replace(/[\n\r]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .replace(/>\s+/g, '>')
      .replace(/\s+</g, '<')
      .trim(),
    'utf8',
  )
}

export function signXmlSha1Base64(args: {
  payload: string | Buffer
  privateKeyPem: string
  passphrase?: string | null
}): string {
  const signer = crypto.createSign('SHA1')
  signer.update(normalizeContentForSigning(args.payload))
  const key = args.passphrase
    ? { key: args.privateKeyPem, passphrase: args.passphrase }
    : args.privateKeyPem
  return signer.sign(key, 'base64')
}

export function verifyXmlSha1Base64(args: {
  payload: string | Buffer
  signature: string
  publicKeyPem?: string | null
  certificatePem?: string | null
}): boolean {
  const keyText = args.publicKeyPem ?? args.certificatePem
  if (!keyText) return false
  const verifier = crypto.createVerify('SHA1')
  verifier.update(normalizeContentForSigning(args.payload))
  try {
    return verifier.verify(keyText, args.signature, 'base64')
  } catch {
    return false
  }
}

export function pemPublicKeyFromCertificate(
  certificatePem: string,
): string | null {
  try {
    return crypto.createPublicKey(certificatePem).export({
      format: 'pem',
      type: 'spki',
    }) as string
  } catch {
    return null
  }
}

export function formatCertificateSerial(serial: string | null | undefined) {
  const clean = String(serial || '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toUpperCase()
  if (!clean) return null
  return clean.replace(/(.{2})/g, '$1 ').trim()
}

export function base64CertificateSerial(serial: string | null | undefined) {
  const formatted = formatCertificateSerial(serial)
  return formatted ? Buffer.from(formatted).toString('base64') : null
}

export function extractCertificateSerials(payload: Buffer | string): {
  serial: string | null
  serialBase64: string | null
} {
  try {
    const cert = new crypto.X509Certificate(payload)
    const serial = formatCertificateSerial(cert.serialNumber)
    return { serial, serialBase64: base64CertificateSerial(serial) }
  } catch {
    return { serial: null, serialBase64: null }
  }
}

async function readArtifactText(
  stationId: string,
  artifactType: string,
  artifactKey: string,
): Promise<string | null> {
  try {
    const payload = await getSecureArtifactPayload(
      stationId,
      artifactType,
      artifactKey,
    )
    return trimText(payload)
  } catch {
    return null
  }
}

async function readArtifactBuffer(
  stationId: string,
  artifactType: string,
  artifactKey: string,
): Promise<Buffer | null> {
  try {
    return await getSecureArtifactPayload(stationId, artifactType, artifactKey)
  } catch {
    return null
  }
}

function privateKeyArtifactAttempts(kind: TanzaniaCertificateKind) {
  const prefix = kind === 'ewura' ? 'ewura' : kind === 'tra' ? 'tra' : 'cert'
  return [
    [prefix, 'private-key.pem'],
    [prefix, 'certificate.key'],
    [prefix, 'key.pem'],
    [`vpos.${prefix}`, 'private-key.pem'],
    [`vpos.${prefix}`, 'certificate.key'],
    ['cert', 'private-key.pem'],
    ['cert', 'certificate.key'],
    ['cert', 'key.pem'],
    ['vpos.cert', 'private-key.pem'],
    ['vpos.cert', 'certificate.key'],
  ] as Array<[string, string]>
}

function certificateArtifactAttempts(kind: TanzaniaCertificateKind) {
  const prefix = kind === 'ewura' ? 'ewura' : kind === 'tra' ? 'tra' : 'cert'
  return [
    [prefix, 'certificate.pem'],
    [prefix, 'certificate.crt'],
    [prefix, 'public.pem'],
    [prefix, 'public.crt'],
    [`vpos.${prefix}`, 'certificate.pem'],
    [`vpos.${prefix}`, 'certificate.crt'],
    ['cert', 'certificate.pem'],
    ['cert', 'certificate.crt'],
    ['cert', 'public.pem'],
    ['cert', 'public.crt'],
  ] as Array<[string, string]>
}

function pfxArtifactAttempts(kind: TanzaniaCertificateKind) {
  const prefix = kind === 'ewura' ? 'ewura' : kind === 'tra' ? 'tra' : 'cert'
  return [
    [prefix, 'certificate.pfx'],
    [prefix, 'private.pfx'],
    [`vpos.${prefix}`, 'certificate.pfx'],
    ['cert', 'certificate.pfx'],
  ] as Array<[string, string]>
}

async function resolvePrivateKeyPem(args: {
  stationId: string
  kind: TanzaniaCertificateKind
  kvs: Record<string, any>
}) {
  const directKeys =
    args.kind === 'ewura'
      ? [
          'vpos.ewura.privateKeyPem',
          'vpos.cert.privateKeyPem',
          'vpos.cert.data',
        ]
      : args.kind === 'tra'
        ? [
            'vpos.tra.privateKeyPem',
            'vpos.cert.privateKeyPem',
            'vpos.cert.data',
          ]
        : ['vpos.cert.privateKeyPem', 'vpos.cert.data']

  for (const key of directKeys) {
    const value = args.kvs[key]
    const text = isObject(value)
      ? pickString(value, ['privateKeyPem', 'privateKey', 'keyPem', 'pem'])
      : trimText(value)
    if (text?.includes(PRIVATE_KEY_MARKER)) return text
  }

  for (const [artifactType, artifactKey] of privateKeyArtifactAttempts(
    args.kind,
  )) {
    const text = await readArtifactText(
      args.stationId,
      artifactType,
      artifactKey,
    )
    if (text?.includes(PRIVATE_KEY_MARKER)) return text
  }

  return null
}

async function resolvePublicCertificatePem(args: {
  stationId: string
  kind: TanzaniaCertificateKind
  kvs: Record<string, any>
}) {
  const directKeys =
    args.kind === 'ewura'
      ? ['vpos.ewura.publicCertificatePem', 'vpos.cert.publicCertificatePem']
      : args.kind === 'tra'
        ? ['vpos.tra.publicCertificatePem', 'vpos.cert.publicCertificatePem']
        : ['vpos.cert.publicCertificatePem']

  for (const key of directKeys) {
    const text = trimText(args.kvs[key])
    if (text?.includes(CERTIFICATE_MARKER)) return normalizePemBlock(text)
  }

  for (const [artifactType, artifactKey] of certificateArtifactAttempts(
    args.kind,
  )) {
    const text = await readArtifactText(
      args.stationId,
      artifactType,
      artifactKey,
    )
    if (text?.includes(CERTIFICATE_MARKER)) return normalizePemBlock(text)
  }

  return null
}

async function resolveSerialFromArtifacts(args: {
  stationId: string
  kind: TanzaniaCertificateKind
  publicCertificatePem: string | null
  kvs: Record<string, any>
}) {
  const direct =
    trimText(args.kvs[`vpos.${args.kind}.cert.serial`]) ??
    trimText(args.kvs['vpos.cert.serial'])
  if (direct) {
    const serial = formatCertificateSerial(direct)
    return { serial, serialBase64: base64CertificateSerial(serial) }
  }

  if (args.publicCertificatePem) {
    const serials = extractCertificateSerials(args.publicCertificatePem)
    if (serials.serialBase64) return serials
  }

  for (const [artifactType, artifactKey] of certificateArtifactAttempts(
    args.kind,
  )) {
    const payload = await readArtifactBuffer(
      args.stationId,
      artifactType,
      artifactKey,
    )
    if (!payload) continue
    const serials = extractCertificateSerials(payload)
    if (serials.serialBase64) return serials
  }

  return { serial: null, serialBase64: null }
}

export async function resolveTanzaniaSigningBundle(args: {
  stationId: string
  kind?: TanzaniaCertificateKind
}): Promise<TanzaniaSigningBundle> {
  const kind = args.kind ?? 'shared'
  const kvs = await kvGetMany<any>(args.stationId, [
    'vpos.cert.privateKeyPem',
    'vpos.cert.publicCertificatePem',
    'vpos.cert.data',
    'vpos.cert.passphrase',
    'vpos.cert.serial',
    'vpos.tra.privateKeyPem',
    'vpos.tra.publicCertificatePem',
    'vpos.tra.cert.serial',
    'vpos.ewura.privateKeyPem',
    'vpos.ewura.publicCertificatePem',
    'vpos.ewura.cert.serial',
  ])

  const privateKeyPem = await resolvePrivateKeyPem({
    stationId: args.stationId,
    kind,
    kvs,
  })
  const publicCertificatePem = await resolvePublicCertificatePem({
    stationId: args.stationId,
    kind,
    kvs,
  })
  const publicKeyPem = publicCertificatePem
    ? pemPublicKeyFromCertificate(publicCertificatePem)
    : null
  const serials = await resolveSerialFromArtifacts({
    stationId: args.stationId,
    kind,
    publicCertificatePem,
    kvs,
  })
  const passphrase =
    trimText(kvs[`vpos.${kind}.cert.passphrase`]) ??
    trimText(kvs['vpos.cert.passphrase']) ??
    (await kvGet<string>(args.stationId, 'vpos.cert.passphrase'))

  const warnings: string[] = []
  if (!privateKeyPem) {
    warnings.push(
      'No PEM private key was found in secure artifacts or station KV.',
    )
  }
  if (!publicCertificatePem) {
    warnings.push(
      'No PEM/X.509 public certificate was found in secure artifacts or station KV.',
    )
  }

  for (const [artifactType, artifactKey] of pfxArtifactAttempts(kind)) {
    const payload = await readArtifactBuffer(
      args.stationId,
      artifactType,
      artifactKey,
    )
    if (payload?.length) {
      warnings.push(
        `PKCS#12 artifact ${artifactType}/${artifactKey} is present, but FTC signing uses PEM secure artifacts. Convert/import the private key and public certificate PEM for runtime signing.`,
      )
      break
    }
  }

  return {
    stationId: args.stationId,
    kind,
    privateKeyPem,
    publicCertificatePem,
    publicKeyPem,
    certSerial: serials.serial,
    certSerialBase64: serials.serialBase64,
    passphrase: passphrase ? String(passphrase).trim() : null,
    warnings,
  }
}

export async function readTanzaniaPrivateKeyPem(
  stationId: string,
  kind: TanzaniaCertificateKind = 'shared',
) {
  return (await resolveTanzaniaSigningBundle({ stationId, kind })).privateKeyPem
}

export async function readTanzaniaCertSerialBase64(
  stationId: string,
  kind: TanzaniaCertificateKind = 'shared',
) {
  return (await resolveTanzaniaSigningBundle({ stationId, kind }))
    .certSerialBase64
}
