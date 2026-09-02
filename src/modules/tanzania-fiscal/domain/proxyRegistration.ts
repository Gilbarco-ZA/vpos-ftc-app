export type TanzaniaTraRegistrationInput = {
  tin?: unknown
  serialNumber?: unknown
  certSerial?: unknown
  privateKeyBase64?: unknown
  publicKeyBase64?: unknown
  password?: unknown
  licenseKey?: unknown
}

export type TanzaniaTraKeyMaterial = {
  certSerial: string
  privateKeyBase64: string
  publicKeyBase64: string
}

export type TanzaniaTraProxyRegistrationPayload = {
  tin: string
  serialNumber: string
  certSerial: string
  privateKeyBase64: string
  publicKeyBase64: string
  password: string
  licenseKey: string
}

export type TanzaniaEwuraRegistrationInput = {
  retailStationName?: unknown
  ewuraLicenseNo?: unknown
  regionName?: unknown
  districtName?: unknown
  wardName?: unknown
  zone?: unknown
  contactPersonEmailAddress?: unknown
  contactPersonPhone?: unknown
  contactEmail?: unknown
  contactPhone?: unknown
}

export type TanzaniaEwuraProxyRegistrationPayload = {
  retailStationName: string
  ewuraLicenseNo: string
  regionName: string
  districtName: string
  wardName: string
  zone: string
  contactPersonEmailAddress: string
  contactPersonPhone: string
}

export const isTanzaniaRegistrationResponseSuccess = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true
  return (value as { error?: unknown }).error !== true
}

const clean = (value: unknown) => String(value ?? '').trim()

const required = (value: unknown, label: string) => {
  const normalized = clean(value)
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

const requiredBase64 = (value: unknown, label: string) => {
  const normalized = required(value, label)
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw new Error(`${label} must be Base64 encoded`)
  }
  return normalized
}

export const buildTanzaniaTraProxyRegistrationPayload = (args: {
  input: TanzaniaTraRegistrationInput
  keyMaterial?: Partial<TanzaniaTraKeyMaterial>
}): TanzaniaTraProxyRegistrationPayload => ({
  tin: required(args.input.tin, 'TRA TIN'),
  serialNumber: required(args.input.serialNumber, 'TRA serial number'),
  certSerial: requiredBase64(
    args.input.certSerial ?? args.keyMaterial?.certSerial,
    'TRA certificate serial',
  ),
  privateKeyBase64: requiredBase64(
    args.input.privateKeyBase64 ?? args.keyMaterial?.privateKeyBase64,
    'TRA private key',
  ),
  publicKeyBase64: requiredBase64(
    args.input.publicKeyBase64 ?? args.keyMaterial?.publicKeyBase64,
    'TRA public key',
  ),
  password: required(args.input.password, 'TRA password'),
  licenseKey: required(args.input.licenseKey, 'TRA licence key'),
})

export const buildTanzaniaEwuraProxyRegistrationPayload = (
  input: TanzaniaEwuraRegistrationInput,
): TanzaniaEwuraProxyRegistrationPayload => ({
  retailStationName: required(
    input.retailStationName,
    'EWURA retail station name',
  ),
  ewuraLicenseNo: required(input.ewuraLicenseNo, 'EWURA licence number'),
  regionName: required(input.regionName, 'EWURA region'),
  districtName: required(input.districtName, 'EWURA district'),
  wardName: required(input.wardName, 'EWURA ward'),
  zone: required(input.zone, 'EWURA zone'),
  contactPersonEmailAddress: required(
    input.contactPersonEmailAddress ?? input.contactEmail,
    'EWURA contact email',
  ),
  contactPersonPhone: required(
    input.contactPersonPhone ?? input.contactPhone,
    'EWURA contact phone',
  ),
})
