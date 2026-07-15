type AnyRecord = Record<string, any>

export type JplUnattendedReceiptCapture = {
  eptReceiptFormatId?: string
  eptReceiptItems?: AnyRecord
  externalPaymentReference?: string
  eptId?: string
  eptSeqNo?: string
  receiptNo?: string
  tillType?: string
  tillSeqNo?: string
  selectedDeviceId?: string
  cardLabel?: string
  cardPanMasked?: string
  validationResult?: string
  posSeqRejectCode?: string
  receiptJson?: AnyRecord
  paymentJson?: AnyRecord
  warnings: string[]
  hasReceiptData: boolean
}

const SENSITIVE_KEY_PATTERN =
  /(pan|cardnumber|card_number|track|pin|cvv|cvc|encrypted|token|key|password|secret)/i

const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}

const trimOrUndefined = (value: unknown): string | undefined => {
  const text = String(value ?? '').trim()
  return text || undefined
}

const enumValue = (value: unknown): string | undefined => {
  const record = asRecord(value)
  return trimOrUndefined(record.value ?? value)
}

const pickFirst = (source: AnyRecord, keys: string[]) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  }
  return undefined
}

const pickNestedFirst = (sources: AnyRecord[], keys: string[]) => {
  for (const source of sources) {
    const value = pickFirst(source, keys)
    if (value != null && String(value).trim() !== '') return value
  }
  return undefined
}

export const maskCardPan = (value: unknown): string | undefined => {
  const raw = trimOrUndefined(value)
  if (!raw) return undefined

  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return '***'

  return `${digits.slice(0, 6)}******${digits.slice(-4)}`
}

export const redactJplSensitivePaymentData = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => redactJplSensitivePaymentData(entry))
  }

  if (!value || typeof value !== 'object') return value

  const redacted: AnyRecord = {}
  for (const [key, entry] of Object.entries(value as AnyRecord)) {
    if (/cardname/i.test(key)) {
      redacted[key] = trimOrUndefined(entry)
      continue
    }

    if (/cardnumber/i.test(key) || /pan/i.test(key)) {
      redacted[key] = maskCardPan(entry) ?? '***'
      continue
    }

    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = '[redacted]'
      continue
    }

    redacted[key] = redactJplSensitivePaymentData(entry)
  }

  return redacted
}

export const resolveJplEptReceiptItems = (txData: AnyRecord) => {
  const transPars = asRecord(txData.TransPars ?? txData.transPars)
  const paymentParameters = asRecord(
    txData.PaymentParameters ?? txData.paymentParameters,
  )

  return asRecord(
    txData.EptReceiptItems ??
      txData.eptReceiptItems ??
      transPars.EptReceiptItems ??
      transPars.eptReceiptItems ??
      paymentParameters.EptReceiptItems ??
      paymentParameters.eptReceiptItems,
  )
}

const resolveTillSequence = (items: AnyRecord) =>
  asRecord(items.TillSequenceNumber ?? items.tillSequenceNumber)

const buildExternalPaymentReference = (parts: {
  eptId?: string
  eptSeqNo?: string
  receiptNo?: string
  selectedDeviceId?: string
  tillSeqNo?: string
}) => {
  const tokens = [
    parts.eptId ? `EPT:${parts.eptId}` : null,
    parts.eptSeqNo ? `SEQ:${parts.eptSeqNo}` : null,
    parts.receiptNo ? `RCP:${parts.receiptNo}` : null,
    parts.selectedDeviceId ? `DEV:${parts.selectedDeviceId}` : null,
    parts.tillSeqNo ? `TILL:${parts.tillSeqNo}` : null,
  ].filter(Boolean)

  return tokens.length ? tokens.join('|') : undefined
}

export const extractJplUnattendedReceiptCapture = (
  txDataInput: unknown,
): JplUnattendedReceiptCapture => {
  const txData = asRecord(txDataInput)
  const transPars = asRecord(txData.TransPars ?? txData.transPars)
  const paymentParameters = asRecord(
    txData.PaymentParameters ?? txData.paymentParameters,
  )
  const receiptItems = resolveJplEptReceiptItems(txData)
  const tillSequence = resolveTillSequence(receiptItems)
  const sources = [receiptItems, paymentParameters, transPars, txData]

  const eptReceiptFormatId = trimOrUndefined(
    pickNestedFirst(sources, ['EptReceiptFormatId', 'eptReceiptFormatId']),
  )
  const eptId = trimOrUndefined(pickNestedFirst(sources, ['EptId', 'eptId']))
  const eptSeqNo = trimOrUndefined(
    pickNestedFirst(sources, ['EptSeqNo', 'eptSeqNo']),
  )
  const receiptNo = trimOrUndefined(
    pickNestedFirst(sources, ['ReceiptNo', 'receiptNo']),
  )
  const selectedDeviceId = trimOrUndefined(
    pickNestedFirst(sources, ['SelectedDeviceId', 'selectedDeviceId']),
  )
  const tillType = trimOrUndefined(
    tillSequence.TillType ?? tillSequence.tillType,
  )
  const tillSeqNo = trimOrUndefined(
    tillSequence.TillSeqNo ?? tillSequence.tillSeqNo,
  )
  const cardLabel = trimOrUndefined(
    receiptItems.CardNamePan ??
      receiptItems.CardName1Suppl ??
      receiptItems.CardName2Suppl,
  )
  const cardPanMasked =
    maskCardPan(
      receiptItems.CardNumberPan ??
        receiptItems.CardNumber1Suppl ??
        receiptItems.CardNumber2Suppl,
    ) ?? undefined
  const validationResult = enumValue(
    receiptItems.EptSeqValidationResult ?? receiptItems.eptSeqValidationResult,
  )
  const posSeqRejectCode = trimOrUndefined(
    receiptItems.PosSeqRejectCode ?? receiptItems.posSeqRejectCode,
  )

  const externalPaymentReference =
    trimOrUndefined(
      pickNestedFirst(sources, [
        'ExternalPaymentReference',
        'externalPaymentReference',
        'PaymentReference',
        'paymentReference',
        'AuthId',
        'authId',
      ]),
    ) ??
    buildExternalPaymentReference({
      eptId,
      eptSeqNo,
      receiptNo,
      selectedDeviceId,
      tillSeqNo,
    })

  const sanitizedItems = asRecord(
    redactJplSensitivePaymentData(receiptItems) as AnyRecord,
  )
  const hasReceiptItems = Object.keys(receiptItems).length > 0
  const warnings = [
    !eptReceiptFormatId && hasReceiptItems
      ? 'Missing EptReceiptFormatId for unattended receipt clear.'
      : null,
    !hasReceiptItems
      ? 'Missing EptReceiptItems for unattended receipt clear.'
      : null,
    !eptSeqNo && !receiptNo && !externalPaymentReference
      ? 'Missing EPT sequence, receipt number, and external payment reference.'
      : null,
  ].filter(Boolean) as string[]

  const receiptJson = hasReceiptItems
    ? {
        formatId: eptReceiptFormatId ?? null,
        items: sanitizedItems,
        warnings,
      }
    : undefined

  const paymentJson = {
    externalPaymentReference: externalPaymentReference ?? null,
    eptId: eptId ?? null,
    eptSeqNo: eptSeqNo ?? null,
    receiptNo: receiptNo ?? null,
    tillType: tillType ?? null,
    tillSeqNo: tillSeqNo ?? null,
    selectedDeviceId: selectedDeviceId ?? null,
    cardLabel: cardLabel ?? null,
    cardPanMasked: cardPanMasked ?? null,
    validationResult: validationResult ?? null,
    posSeqRejectCode: posSeqRejectCode ?? null,
    warnings,
  }

  return {
    eptReceiptFormatId,
    eptReceiptItems: hasReceiptItems ? sanitizedItems : undefined,
    externalPaymentReference,
    eptId,
    eptSeqNo,
    receiptNo,
    tillType,
    tillSeqNo,
    selectedDeviceId,
    cardLabel,
    cardPanMasked,
    validationResult,
    posSeqRejectCode,
    receiptJson,
    paymentJson,
    warnings,
    hasReceiptData: Boolean(eptReceiptFormatId && hasReceiptItems),
  }
}

export const buildUnattendedClearPayload = (args: {
  txData: unknown
  posId: string
}) => {
  const txData = asRecord(args.txData)
  const capture = extractJplUnattendedReceiptCapture(txData)

  return {
    ...txData,
    PosId: args.posId,
    ...(capture.eptReceiptFormatId
      ? { EptReceiptFormatId: capture.eptReceiptFormatId }
      : {}),
    ...(Object.keys(resolveJplEptReceiptItems(txData)).length
      ? { EptReceiptItems: resolveJplEptReceiptItems(txData) }
      : {}),
    _domsUnattendedReceiptCapture: capture,
  }
}
