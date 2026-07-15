export type DomsServiceRouteSeverity =
  | 'info'
  | 'warning'
  | 'critical'
  | 'unknown'

export type DomsServiceRouteStatus =
  | 'auto_ack'
  | 'needs_review'
  | 'escalated'
  | 'ignored'

export type DomsServiceMessageClassification = {
  serviceCode?: string | null
  routeKey: string
  routeLabel: string
  severity: DomsServiceRouteSeverity
  routeStatus: DomsServiceRouteStatus
  summary: string
}

export type DomsBackOfficeProcessingStatus =
  | 'pending'
  | 'buffered'
  | 'processed'
  | 'ignored'
  | 'failed'

export type DomsBackOfficeRecordClassification = {
  recordKind: string
  recordLabel: string
  processingStatus: DomsBackOfficeProcessingStatus
  summary: string
  shouldReplay: boolean
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const rawEnumValue = (value: unknown) => {
  const record = asRecord(value)
  const enumValue = record.value
  if (enumValue != null) return String(enumValue).trim()
  return String(value ?? '').trim()
}

const normalizedText = (value: unknown) => String(value ?? '').trim()

const SERVICE_CODE_MAP: Record<
  string,
  {
    routeKey: string
    routeLabel: string
    severity: DomsServiceRouteSeverity
    routeStatus: DomsServiceRouteStatus
  }
> = {
  '01': {
    routeKey: 'forecourt_event',
    routeLabel: 'Forecourt event',
    severity: 'info',
    routeStatus: 'auto_ack',
  },
  '02': {
    routeKey: 'device_warning',
    routeLabel: 'Device warning',
    severity: 'warning',
    routeStatus: 'needs_review',
  },
  '03': {
    routeKey: 'device_error',
    routeLabel: 'Device error',
    severity: 'critical',
    routeStatus: 'escalated',
  },
  '04': {
    routeKey: 'pos_connection',
    routeLabel: 'POS connection status',
    severity: 'warning',
    routeStatus: 'needs_review',
  },
}

const SERVICE_TEXT_RULES: Array<{
  pattern: RegExp
  routeKey: string
  routeLabel: string
  severity: DomsServiceRouteSeverity
  routeStatus: DomsServiceRouteStatus
}> = [
  {
    pattern: /offline|disconnect|lost|not\s+online/i,
    routeKey: 'connectivity_fault',
    routeLabel: 'Connectivity fault',
    severity: 'warning',
    routeStatus: 'needs_review',
  },
  {
    pattern: /error|fault|fail|incompatible|ram|rtc/i,
    routeKey: 'forecourt_fault',
    routeLabel: 'Forecourt fault',
    severity: 'critical',
    routeStatus: 'escalated',
  },
  {
    pattern: /service|maintenance|calibrat|total/i,
    routeKey: 'maintenance_event',
    routeLabel: 'Maintenance event',
    severity: 'info',
    routeStatus: 'auto_ack',
  },
  {
    pattern: /printer|peripheral|memory/i,
    routeKey: 'peripheral_event',
    routeLabel: 'Peripheral event',
    severity: 'warning',
    routeStatus: 'needs_review',
  },
]

const extractServiceCode = (
  message: unknown,
  payload?: Record<string, unknown> | null,
) => {
  const explicit =
    asRecord(payload ?? {}).FcServiceMsgCode ??
    asRecord(payload ?? {}).ServiceMsgCode ??
    asRecord(payload ?? {}).serviceCode
  const explicitText = normalizedText(explicit)
  if (explicitText) return explicitText.replace(/H$/i, '').padStart(2, '0')

  const text = normalizedText(message)
  const legacyMatch = text.match(/^\d{8}\s+\d{6}\s+([0-9A-Fa-f]{2})\b/)
  if (legacyMatch) return legacyMatch[1].toUpperCase()
  return null
}

export const classifyDomsServiceMessage = (input: {
  seqNo?: string
  message?: string
  payloadJson?: Record<string, unknown> | null
}): DomsServiceMessageClassification => {
  const message = normalizedText(input.message)
  const serviceCode = extractServiceCode(message, input.payloadJson)
  const fromCode = serviceCode ? SERVICE_CODE_MAP[serviceCode] : undefined

  if (!message && !serviceCode) {
    return {
      serviceCode: null,
      routeKey: 'empty_service_message',
      routeLabel: 'Empty service message',
      severity: 'info',
      routeStatus: 'ignored',
      summary: 'Empty DOMS service-log slot.',
    }
  }

  if (fromCode) {
    return {
      serviceCode,
      ...fromCode,
      summary: `${fromCode.routeLabel}${serviceCode ? ` (${serviceCode})` : ''}: ${message || 'no message text'}`,
    }
  }

  const matched = SERVICE_TEXT_RULES.find((rule) => rule.pattern.test(message))
  if (matched) {
    return {
      serviceCode,
      routeKey: matched.routeKey,
      routeLabel: matched.routeLabel,
      severity: matched.severity,
      routeStatus: matched.routeStatus,
      summary: `${matched.routeLabel}: ${message || 'no message text'}`,
    }
  }

  return {
    serviceCode,
    routeKey: 'unknown_service_message',
    routeLabel: 'Unknown service message',
    severity: 'unknown',
    routeStatus: 'needs_review',
    summary: message || 'Unclassified DOMS service-log message.',
  }
}

const BOR_FORMATS: Record<
  string,
  { recordKind: string; recordLabel: string; replay: boolean }
> = {
  '01': {
    recordKind: 'fc_transaction_record',
    recordLabel: 'Forecourt transaction record',
    replay: true,
  },
  '02': {
    recordKind: 'banksys_balance_record',
    recordLabel: 'Banksys balance record',
    replay: true,
  },
  '03': {
    recordKind: 'banksys_sequence_cancel_record',
    recordLabel: 'Banksys sequence cancel record',
    replay: true,
  },
  '04': {
    recordKind: 'banksys_bna_transaction_record',
    recordLabel: 'Banksys BNA transaction record',
    replay: true,
  },
  '05': {
    recordKind: 'xml_back_office_record',
    recordLabel: 'XML back-office record',
    replay: true,
  },
  '06': {
    recordKind: 'end_of_day_record',
    recordLabel: 'End-of-day record',
    replay: true,
  },
  '07': {
    recordKind: 'parallel_automation_record',
    recordLabel: 'Parallel automation record',
    replay: true,
  },
  '50': {
    recordKind: 'total_france_record',
    recordLabel: 'TOTAL France record',
    replay: true,
  },
  '51': {
    recordKind: 'client_store_record',
    recordLabel: 'Client store record',
    replay: true,
  },
}

const normalizeBorFormatId = (value: unknown) => {
  const raw = rawEnumValue(value).replace(/H$/i, '')
  if (!raw) return ''
  return /^\d+$/.test(raw) ? raw.padStart(2, '0') : raw.toUpperCase()
}

export const classifyDomsBackOfficeRecord = (input: {
  seqNo?: string
  formatId?: string
  subCode?: string
  payloadJson?: Record<string, unknown> | null
  borData?: string | null
  borLength?: number | null
}): DomsBackOfficeRecordClassification => {
  const formatId = normalizeBorFormatId(input.formatId)
  const payload = asRecord(input.payloadJson)
  const hasData = Boolean(
    normalizedText(input.borData) ||
    Number(input.borLength ?? payload.BorLength ?? payload.BorLen ?? 0) > 0,
  )

  if (!input.seqNo || !hasData) {
    return {
      recordKind: 'empty_back_office_record',
      recordLabel: 'Empty back-office record slot',
      processingStatus: 'ignored',
      summary: 'Empty DOMS back-office buffer slot.',
      shouldReplay: false,
    }
  }

  const known = BOR_FORMATS[formatId]
  if (known) {
    return {
      recordKind: known.recordKind,
      recordLabel: known.recordLabel,
      processingStatus: 'pending',
      summary: `${known.recordLabel} ${input.seqNo ?? ''}`.trim(),
      shouldReplay: known.replay,
    }
  }

  return {
    recordKind: 'unknown_back_office_record',
    recordLabel: 'Unknown back-office record',
    processingStatus: 'pending',
    summary:
      `Unknown BOR format ${formatId || 'n/a'} ${input.seqNo ?? ''}`.trim(),
    shouldReplay: true,
  }
}
