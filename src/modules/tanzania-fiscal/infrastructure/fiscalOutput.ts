import type { TraReceiptPayload } from './traReceipt'
import type { TraZReportPayload } from './traZReport'
import { parseXmlTag } from './xml'

export type TanzaniaFiscalOutputKind =
  | 'tra_receipt'
  | 'tra_z_report'
  | 'tra_registration_update'
  | 'tra_status_change'

export type TanzaniaFiscalTextOutput = {
  kind: TanzaniaFiscalOutputKind
  contentType: 'text/plain; charset=utf-8'
  lines: string[]
  text: string
  metadata: Record<string, unknown>
}

export type TanzaniaFiscalStationHeader = {
  name?: string | null
  contactName?: string | null
  contactNumber?: string | null
  email?: string | null
  mobile?: string | null
  tin?: string | null
  vrn?: string | null
  serial?: string | null
  uin?: string | null
  taxOffice?: string | null
  street?: string | null
  city?: string | null
  country?: string | null
}

export type TanzaniaReceiptOutputInput = {
  payload: Pick<
    TraReceiptPayload,
    | 'receiptNo'
    | 'dailyCount'
    | 'globalCount'
    | 'znum'
    | 'receiptVerificationNo'
    | 'verificationCode'
    | 'verificationUrl'
    | 'xml'
    | 'unsignedXml'
    | 'items'
    | 'totals'
    | 'payments'
    | 'vatTotals'
  >
  station?: TanzaniaFiscalStationHeader | null
  transaction?: Record<string, any> | null
  customer?: Record<string, any> | null
  copy?: boolean
}

export type TanzaniaZReportOutputInput = {
  payload: Pick<
    TraZReportPayload,
    | 'reportDate'
    | 'znum'
    | 'reportNo'
    | 'xml'
    | 'unsignedXml'
    | 'totals'
    | 'payments'
    | 'vatTotals'
    | 'changes'
  >
  station?: TanzaniaFiscalStationHeader | null
}

const DEFAULT_WIDTH = 48

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function maybeLine(label: string, value: unknown) {
  const text = clean(value)
  return text ? `${label}: ${text}` : null
}

function money(value: unknown, precision = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return clean(value) || '0.00'
  return n.toFixed(precision).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',')
}

function leftRight(left: string, right: unknown, width = DEFAULT_WIDTH) {
  const cleanLeft = clean(left)
  const cleanRight = clean(right)
  const gap = Math.max(1, width - cleanLeft.length - cleanRight.length)
  return `${cleanLeft}${' '.repeat(gap)}${cleanRight}`
}

function divider(width = DEFAULT_WIDTH) {
  return '-'.repeat(width)
}

function toIsoDate(value?: Date | string | null) {
  if (value instanceof Date) return value.toISOString()
  if (value) return new Date(value).toISOString()
  return new Date().toISOString()
}

function output(
  kind: TanzaniaFiscalOutputKind,
  lines: string[],
  metadata: Record<string, unknown>,
): TanzaniaFiscalTextOutput {
  const normalizedLines = lines
    .filter((line) => line != null)
    .map((line) => String(line))
  return {
    kind,
    contentType: 'text/plain; charset=utf-8',
    lines: normalizedLines,
    text: `${normalizedLines.join('\n')}\n`,
    metadata,
  }
}

function stationHeaderLines(station?: TanzaniaFiscalStationHeader | null) {
  const lines: string[] = []
  const name = clean(station?.name)
  if (name) lines.push(name.toUpperCase())
  const contactName = maybeLine('CONTACT', station?.contactName)
  const contactNumber = maybeLine('NUMBER', station?.contactNumber)
  const email = maybeLine('EMAIL', station?.email)
  for (const line of [contactName, contactNumber, email]) {
    if (line) lines.push(line)
  }
  if (lines.length) lines.push(divider())

  const address = [station?.street, station?.city, station?.country]
    .map(clean)
    .filter(Boolean)
    .join(', ')
  for (const line of [
    maybeLine('MOBILE', station?.mobile),
    maybeLine('TIN', station?.tin),
    maybeLine('VRN', station?.vrn),
    maybeLine('SERIAL', station?.serial),
    maybeLine('UIN', station?.uin),
    maybeLine('TAX OFFICE', station?.taxOffice),
    maybeLine('ADDRESS', address),
  ]) {
    if (line) lines.push(line)
  }
  if (lines.length && lines.at(-1) !== divider()) lines.push(divider())
  return lines
}

function xmlDate(xml: string) {
  return parseXmlTag(xml, 'DATE') ?? parseXmlTag(xml, 'RCT_DATE')
}

function xmlTime(xml: string) {
  return parseXmlTag(xml, 'TIME') ?? parseXmlTag(xml, 'RCT_TIME')
}

function customerLines(customer?: Record<string, any> | null) {
  const lines: string[] = []
  const name = clean(
    customer?.customerName ??
      customer?.buyer_name ??
      customer?.buyerName ??
      customer?.name,
  )
  const idType = clean(customer?.customerIdType ?? customer?.idType)
  const id = clean(
    customer?.customerId ?? customer?.tin ?? customer?.pin ?? customer?.id,
  )
  const mobile = clean(
    customer?.customerMobile ??
      customer?.customerMobileNo ??
      customer?.mobile ??
      customer?.phone,
  )

  for (const line of [
    maybeLine('CUSTOMER NAME', name),
    maybeLine('CUSTOMER ID TYPE', idType),
    maybeLine('CUSTOMER ID', id),
    maybeLine('CUSTOMER MOBILE', mobile),
  ]) {
    if (line) lines.push(line)
  }
  if (lines.length) lines.push(divider())
  return lines
}

export function renderTraReceiptOutput(
  args: TanzaniaReceiptOutputInput,
): TanzaniaFiscalTextOutput {
  const payload = args.payload
  const date =
    xmlDate(payload.unsignedXml || payload.xml) ?? clean(args.transaction?.date)
  const time =
    xmlTime(payload.unsignedXml || payload.xml) ?? clean(args.transaction?.time)
  const pumpNumber = clean(
    args.transaction?.pumpNumber ??
      args.transaction?.pump_number ??
      args.transaction?.fpId,
  )
  const nozzleNumber = clean(
    args.transaction?.nozzleNumber ??
      args.transaction?.nozzle_number ??
      args.transaction?.nozzleId,
  )
  const paymentMethod = clean(
    payload.payments?.[0]?.type ??
      args.transaction?.paymentType ??
      args.transaction?.payment_type,
  )

  const lines = [
    ...stationHeaderLines(args.station),
    args.copy ? 'TRA FISCAL RECEIPT COPY' : 'TRA FISCAL RECEIPT',
    divider(),
    ...customerLines(args.customer),
    leftRight('RECEIPT NUMBER:', payload.globalCount),
    leftRight('TRA RCT NUM:', payload.receiptNo),
    leftRight('Z NUMBER:', `${payload.dailyCount}/${payload.znum}`),
    leftRight('RECEIPT DATE:', date),
    leftRight('RECEIPT TIME:', time),
    pumpNumber || nozzleNumber
      ? leftRight(
          'PUMP / NOZZLE:',
          `${pumpNumber || '-'} / ${nozzleNumber || '-'}`,
        )
      : null,
    divider(),
    'ITEMS',
    divider(),
    ...payload.items.map((item) => {
      const qty = Number.isFinite(Number(item.quantity))
        ? Number(item.quantity).toFixed(2)
        : clean(item.quantity)
      return leftRight(
        `${clean(item.description).toUpperCase()} ${qty}`,
        money(item.price, 0),
      )
    }),
    divider(),
    leftRight('TOTAL EXCL TAX:', money(payload.totals.totalExcludingTax)),
    leftRight('DISCOUNT:', money(payload.totals.discount)),
    leftRight(
      'TOTAL TAX:',
      money(
        Number(payload.totals.totalIncludingTax) -
          Number(payload.totals.totalExcludingTax),
      ),
    ),
    divider(),
    leftRight('TOTAL INCL TAX:', money(payload.totals.totalIncludingTax)),
    leftRight('PAYMENT METHOD:', paymentMethod),
    divider(),
    'VAT REPORT',
    divider(),
    ...payload.vatTotals.flatMap((vatTotal) => [
      `VAT ${vatTotal.vatRateText}`,
      leftRight('TURNOVER:', money(vatTotal.turnover)),
      leftRight('NETT AMOUNT:', money(vatTotal.nettAmount)),
      leftRight('TAX AMOUNT:', money(vatTotal.taxAmount)),
    ]),
    divider(),
    'RECEIPT VERIFICATION CODE',
    payload.verificationCode,
    payload.verificationUrl,
    divider(),
  ].filter((line): line is string => line != null)

  return output('tra_receipt', lines, {
    receiptNo: payload.receiptNo,
    dailyCount: payload.dailyCount,
    globalCount: payload.globalCount,
    znum: payload.znum,
    receiptVerificationNo: payload.receiptVerificationNo,
    verificationCode: payload.verificationCode,
    verificationUrl: payload.verificationUrl,
    copy: Boolean(args.copy),
  })
}

export function renderTraZReportOutput(
  args: TanzaniaZReportOutputInput,
): TanzaniaFiscalTextOutput {
  const payload = args.payload
  const date = xmlDate(payload.unsignedXml || payload.xml) ?? payload.reportDate
  const time = xmlTime(payload.unsignedXml || payload.xml) ?? ''

  const lines = [
    ...stationHeaderLines(args.station),
    'TRA DAILY Z REPORT',
    divider(),
    leftRight('DATE:', date),
    leftRight('TIME:', time),
    leftRight('CURRENT Z:', payload.znum),
    leftRight('REPORT NO:', payload.reportNo),
    divider(),
    leftRight('DISCOUNTS:', money(payload.totals.discounts)),
    leftRight('SURCHARGES:', money(payload.totals.surcharges)),
    leftRight('TICKETS VOID:', payload.totals.ticketsVoid),
    leftRight('TICKETS VOID TOTAL:', money(payload.totals.ticketsVoidTotal)),
    leftRight('CORRECTIONS:', money(payload.totals.corrections)),
    leftRight('FISCAL RECEIPTS:', payload.totals.ticketsFiscal),
    leftRight('NON-FISCAL RECEIPTS:', payload.totals.ticketsNonFiscal),
    divider(),
    'PAYMENTS REPORT',
    divider(),
    ...payload.payments.map((payment) =>
      leftRight(`${payment.type}:`, money(payment.amount)),
    ),
    leftRight('TOTAL:', money(payload.totals.dailyTotalAmount)),
    divider(),
    'VAT REPORT',
    divider(),
    ...payload.vatTotals.flatMap((vatTotal) => [
      `VAT ${vatTotal.vatRateText}`,
      leftRight('TURNOVER:', money(vatTotal.turnover)),
      leftRight('NETT AMOUNT:', money(vatTotal.nettAmount)),
      leftRight('TAX AMOUNT:', money(vatTotal.taxAmount)),
    ]),
    divider(),
    leftRight('DAILY TOTAL AMOUNT:', money(payload.totals.dailyTotalAmount)),
    leftRight('GROSS:', money(payload.totals.gross)),
    leftRight('VAT CHANGE NO:', payload.changes.vatChangeNo),
    leftRight('HEADER CHANGE NO:', payload.changes.headChangeNo),
    divider(),
  ]

  return output('tra_z_report', lines, {
    reportDate: payload.reportDate,
    znum: payload.znum,
    reportNo: payload.reportNo,
  })
}

function shallowDiff(
  oldValue: Record<string, any>,
  newValue: Record<string, any>,
) {
  const keys = Array.from(
    new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})]),
  ).sort()
  return keys
    .filter((key) => clean(oldValue?.[key]) !== clean(newValue?.[key]))
    .map((key) => ({
      key,
      oldValue: oldValue?.[key],
      newValue: newValue?.[key],
    }))
}

export function renderTraRegistrationUpdateOutput(args: {
  oldRegistration: Record<string, any>
  newRegistration: Record<string, any>
  changedAt?: Date | string | null
}): TanzaniaFiscalTextOutput {
  const changedAt = toIsoDate(args.changedAt)
  const diff = shallowDiff(args.oldRegistration, args.newRegistration)
  const lines = [
    'TRA REGISTRATION CHANGED',
    leftRight('DATE:', changedAt),
    divider(),
    ...(diff.length
      ? diff.flatMap((entry) => [
          `OLD ${entry.key.toUpperCase()}: ${clean(entry.oldValue)}`,
          `NEW ${entry.key.toUpperCase()}: ${clean(entry.newValue)}`,
          divider(),
        ])
      : ['NO REGISTRATION CHANGES DETECTED', divider()]),
  ]
  return output('tra_registration_update', lines, {
    changedAt,
    changedFields: diff.map((entry) => entry.key),
  })
}

export function renderTraStatusOutput(args: {
  oldStatus?: Record<string, any> | null
  newStatus: Record<string, any>
  changedAt?: Date | string | null
}): TanzaniaFiscalTextOutput {
  const changedAt = toIsoDate(args.changedAt)
  const oldStatus = args.oldStatus ?? {}
  const newStatus = args.newStatus ?? {}
  const lines = [
    'TRA CONTROL STATUS CHANGE',
    leftRight('DATE:', changedAt),
    divider(),
    leftRight('OLD ACKCODE:', oldStatus.ackcode ?? oldStatus.ACKCODE ?? ''),
    leftRight('OLD ACKMSG:', oldStatus.ackmsg ?? oldStatus.ACKMSG ?? ''),
    leftRight('NEW ACKCODE:', newStatus.ackcode ?? newStatus.ACKCODE ?? ''),
    leftRight('NEW ACKMSG:', newStatus.ackmsg ?? newStatus.ACKMSG ?? ''),
    divider(),
  ]
  return output('tra_status_change', lines, {
    changedAt,
    oldAckcode: oldStatus.ackcode ?? oldStatus.ACKCODE ?? null,
    newAckcode: newStatus.ackcode ?? newStatus.ACKCODE ?? null,
  })
}
