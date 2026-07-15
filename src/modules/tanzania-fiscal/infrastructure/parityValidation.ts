import { dateParts, parseXmlTag } from './xml'

export type XmlShapeIssueSeverity = 'error' | 'warning'

export type XmlShapeIssue = {
  severity: XmlShapeIssueSeverity
  code: string
  message: string
  path?: string
}

export type XmlShapeValidation = {
  ok: boolean
  issues: XmlShapeIssue[]
  presentPaths: string[]
  normalizedXml: string
}

export type TanzaniaReceiptCounterLedgerEntry = {
  transactionId?: string | null
  receiptNo: number
  globalCount: number
  dailyCount: number
  znum: string
  fiscalizedAt?: string | Date | null
}

export type TanzaniaCounterLedgerValidation = {
  ok: boolean
  issues: XmlShapeIssue[]
  byZnum: Record<
    string,
    {
      receiptCount: number
      minDailyCount: number | null
      maxDailyCount: number | null
      minGlobalCount: number | null
      maxGlobalCount: number | null
    }
  >
}

export type TanzaniaZReportBoundaryValidation = {
  ok: boolean
  issues: XmlShapeIssue[]
  includedReceiptCount: number
  lastGlobalCount: number | null
  lastDailyCount: number | null
}

export type EwuraPayloadShape = 'registration' | 'sales' | 'inventory'

const TRA_RECEIPT_REQUIRED_PATHS = [
  'EFDMS',
  'EFDMS.RCT',
  'EFDMS.RCT.DATE',
  'EFDMS.RCT.TIME',
  'EFDMS.RCT.TIN',
  'EFDMS.RCT.REGID',
  'EFDMS.RCT.EFDSERIAL',
  'EFDMS.RCT.CUSTIDTYPE',
  'EFDMS.RCT.RCTNUM',
  'EFDMS.RCT.DC',
  'EFDMS.RCT.GC',
  'EFDMS.RCT.ZNUM',
  'EFDMS.RCT.RCTVNUM',
  'EFDMS.RCT.ITEMS',
  'EFDMS.RCT.ITEMS.ITEM',
  'EFDMS.RCT.ITEMS.ITEM.ID',
  'EFDMS.RCT.ITEMS.ITEM.DESC',
  'EFDMS.RCT.ITEMS.ITEM.QTY',
  'EFDMS.RCT.ITEMS.ITEM.TAXCODE',
  'EFDMS.RCT.ITEMS.ITEM.AMT',
  'EFDMS.RCT.TOTALS',
  'EFDMS.RCT.TOTALS.TOTALTAXEXCL',
  'EFDMS.RCT.TOTALS.TOTALTAXINCL',
  'EFDMS.RCT.TOTALS.DISCOUNT',
  'EFDMS.RCT.PAYMENTS',
  'EFDMS.RCT.PAYMENTS.PMTTYPE',
  'EFDMS.RCT.PAYMENTS.PMTAMOUNT',
  'EFDMS.RCT.VATTOTALS',
  'EFDMS.RCT.VATTOTALS.VATRATE',
  'EFDMS.RCT.VATTOTALS.NETTAMOUNT',
  'EFDMS.RCT.VATTOTALS.TAXAMOUNT',
  'EFDMS.EFDMSSIGNATURE',
]

const TRA_ZREPORT_REQUIRED_PATHS = [
  'EFDMS',
  'EFDMS.ZREPORT',
  'EFDMS.ZREPORT.DATE',
  'EFDMS.ZREPORT.TIME',
  'EFDMS.ZREPORT.HEADER',
  'EFDMS.ZREPORT.HEADER.LINE',
  'EFDMS.ZREPORT.VRN',
  'EFDMS.ZREPORT.TIN',
  'EFDMS.ZREPORT.TAXOFFICE',
  'EFDMS.ZREPORT.REGID',
  'EFDMS.ZREPORT.ZNUMBER',
  'EFDMS.ZREPORT.EFDSERIAL',
  'EFDMS.ZREPORT.REGISTRATIONDATE',
  'EFDMS.ZREPORT.USER',
  'EFDMS.ZREPORT.SIMIMSI',
  'EFDMS.ZREPORT.TOTALS',
  'EFDMS.ZREPORT.TOTALS.DAILYTOTALAMOUNT',
  'EFDMS.ZREPORT.TOTALS.GROSS',
  'EFDMS.ZREPORT.TOTALS.CORRECTIONS',
  'EFDMS.ZREPORT.TOTALS.DISCOUNTS',
  'EFDMS.ZREPORT.TOTALS.SURCHARGES',
  'EFDMS.ZREPORT.TOTALS.TICKETSVOID',
  'EFDMS.ZREPORT.TOTALS.TICKETSVOIDTOTAL',
  'EFDMS.ZREPORT.TOTALS.TICKETSFISCAL',
  'EFDMS.ZREPORT.TOTALS.TICKETSNONFISCAL',
  'EFDMS.ZREPORT.VATTOTALS',
  'EFDMS.ZREPORT.VATTOTALS.VATRATE',
  'EFDMS.ZREPORT.VATTOTALS.NETTAMOUNT',
  'EFDMS.ZREPORT.VATTOTALS.TAXAMOUNT',
  'EFDMS.ZREPORT.PAYMENTS',
  'EFDMS.ZREPORT.PAYMENTS.PMTTYPE',
  'EFDMS.ZREPORT.PAYMENTS.PMTAMOUNT',
  'EFDMS.ZREPORT.CHANGES',
  'EFDMS.ZREPORT.CHANGES.VATCHANGENUM',
  'EFDMS.ZREPORT.CHANGES.HEADCHANGENUM',
  'EFDMS.ZREPORT.ERRORS',
  'EFDMS.ZREPORT.FWVERSION',
  'EFDMS.ZREPORT.FWCHECKSUM',
  'EFDMS.EFDMSSIGNATURE',
]

const EWURA_REQUIRED_PATHS: Record<EwuraPayloadShape, string[]> = {
  registration: [
    'NPGIS',
    'NPGIS.RetailStationRegistration',
    'NPGIS.RetailStationRegistration.TranId',
    'NPGIS.RetailStationRegistration.APISourceId',
    'NPGIS.RetailStationRegistration.EWURALicenseNo',
    'NPGIS.RetailStationRegistration.RetailStationName',
    'NPGIS.RetailStationRegistration.OperatorTin',
    'NPGIS.RetailStationRegistration.OperatorName',
    'NPGIS.RetailStationRegistration.LicenseeTraSerialNo',
    'NPGIS.RetailStationRegistration.RegionName',
    'NPGIS.RetailStationRegistration.DistrictName',
    'NPGIS.RetailStationRegistration.WardName',
    'NPGIS.VendorSignature',
  ],
  sales: [
    'NPGIS',
    'NPGIS.RetailerSaleTransaction',
    'NPGIS.RetailerSaleTransaction.TranId',
    'NPGIS.RetailerSaleTransaction.APISourceId',
    'NPGIS.RetailerSaleTransaction.EWURALicenseNo',
    'NPGIS.RetailerSaleTransaction.RctVerificationCode',
    'NPGIS.RetailerSaleTransaction.RctDate',
    'NPGIS.RetailerSaleTransaction.RctTime',
    'NPGIS.RetailerSaleTransaction.OperatorTin',
    'NPGIS.RetailerSaleTransaction.RetailStationName',
    'NPGIS.RetailerSaleTransaction.TraSerialNo',
    'NPGIS.RetailerSaleTransaction.ProductName',
    'NPGIS.RetailerSaleTransaction.UnitPrice',
    'NPGIS.RetailerSaleTransaction.Volume',
    'NPGIS.RetailerSaleTransaction.Amount',
    'NPGIS.RetailerSaleTransaction.DiscountAmount',
    'NPGIS.RetailerSaleTransaction.AmountNew',
    'NPGIS.VendorSignature',
  ],
  inventory: [
    'NPGIS',
    'NPGIS.StationDaySummaryReport',
    'NPGIS.StationDaySummaryReport.TranId',
    'NPGIS.StationDaySummaryReport.APISourceId',
    'NPGIS.StationDaySummaryReport.EWURALicenseNo',
    'NPGIS.StationDaySummaryReport.RetailStationName',
    'NPGIS.StationDaySummaryReport.SerialNo',
    'NPGIS.StationDaySummaryReport.ReportId',
    'NPGIS.StationDaySummaryReport.ReportNo',
    'NPGIS.StationDaySummaryReport.StartDate',
    'NPGIS.StationDaySummaryReport.EndDate',
    'NPGIS.StationDaySummaryReport.CountOfTrasactions',
    'NPGIS.StationDaySummaryReport.TotalAmount',
    'NPGIS.StationDaySummaryReport.TotalNetAmount',
    'NPGIS.StationDaySummaryReport.TotalVolume',
    'NPGIS.StationDaySummaryReport.TankInventory',
    'NPGIS.StationDaySummaryReport.TankInventory.Tank',
    'NPGIS.VendorSignature',
  ],
}

function issue(
  severity: XmlShapeIssueSeverity,
  code: string,
  message: string,
  path?: string,
): XmlShapeIssue {
  return { severity, code, message, path }
}

export function normalizeFiscalXmlForComparison(xml: string): string {
  return String(xml || '')
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<EFDMSSIGNATURE>[\s\S]*?<\/EFDMSSIGNATURE>/gi,
      '<EFDMSSIGNATURE>__SIGNATURE__</EFDMSSIGNATURE>',
    )
    .replace(
      /<VendorSignature>[\s\S]*?<\/VendorSignature>/gi,
      '<VendorSignature>__SIGNATURE__</VendorSignature>',
    )
    .replace(
      /<EwuraSignature>[\s\S]*?<\/EwuraSignature>/gi,
      '<EwuraSignature>__SIGNATURE__</EwuraSignature>',
    )
    .replace(/<([A-Za-z0-9_:-]+)\s*\/\s*>/g, '<$1></$1>')
    .replace(/[\n\r\t]/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function collectXmlPaths(xml: string): string[] {
  const normalized = normalizeFiscalXmlForComparison(xml)
  const tagPattern =
    /<\s*(\/)?\s*([A-Za-z_][A-Za-z0-9_:-]*)(?:\s[^>]*)?(\/)?\s*>/g
  const stack: string[] = []
  const paths = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(normalized))) {
    const closing = Boolean(match[1])
    const name = match[2]
    const selfClosing = Boolean(match[3])

    if (!name.startsWith('?') && !name.startsWith('!')) {
      if (closing) {
        const index = stack.lastIndexOf(name)
        if (index >= 0) stack.splice(index)
      } else {
        const path = [...stack, name].join('.')
        paths.add(path)
        if (!selfClosing) stack.push(name)
      }
    }
  }

  return Array.from(paths).sort()
}

export function validateXmlShape(args: {
  xml: string
  requiredPaths: string[]
  label: string
  warnings?: XmlShapeIssue[]
}): XmlShapeValidation {
  const normalizedXml = normalizeFiscalXmlForComparison(args.xml)
  const presentPaths = collectXmlPaths(args.xml)
  const present = new Set(presentPaths)
  const issues = [...(args.warnings ?? [])]

  for (const path of args.requiredPaths) {
    if (!present.has(path)) {
      issues.push(
        issue(
          'error',
          'missing_xml_path',
          `${args.label} is missing required XML path ${path}`,
          path,
        ),
      )
    }
  }

  return {
    ok: !issues.some((item) => item.severity === 'error'),
    issues,
    presentPaths,
    normalizedXml,
  }
}

function numericTag(xml: string, tag: string): number | null {
  const value = parseXmlTag(xml, tag)
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function validateTraReceiptCounterTags(xml: string): XmlShapeIssue[] {
  const issues: XmlShapeIssue[] = []
  const rctNum = numericTag(xml, 'RCTNUM')
  const gc = numericTag(xml, 'GC')
  const dc = numericTag(xml, 'DC')

  if (rctNum !== null && gc !== null && rctNum !== gc) {
    issues.push(
      issue(
        'error',
        'rctnum_gc_mismatch',
        'TRA receipt RCTNUM must match GC for vpos-fiscal-tz-compatible VFD receipts.',
        'EFDMS.RCT.RCTNUM',
      ),
    )
  }

  if (dc !== null && dc <= 0) {
    issues.push(
      issue(
        'error',
        'invalid_daily_count',
        'TRA receipt DC must be a positive daily counter.',
        'EFDMS.RCT.DC',
      ),
    )
  }

  return issues
}

export function compareTraReceiptXmlToFiscalTzShape(xml: string) {
  return validateXmlShape({
    xml,
    label: 'TRA receipt XML',
    requiredPaths: TRA_RECEIPT_REQUIRED_PATHS,
    warnings: validateTraReceiptCounterTags(xml),
  })
}

export function compareTraZReportXmlToFiscalTzShape(xml: string) {
  return validateXmlShape({
    xml,
    label: 'TRA z-report XML',
    requiredPaths: TRA_ZREPORT_REQUIRED_PATHS,
  })
}

export function compareEwuraXmlToFiscalTzShape(
  xml: string,
  type: EwuraPayloadShape,
) {
  return validateXmlShape({
    xml,
    label: `EWURA ${type} XML`,
    requiredPaths: EWURA_REQUIRED_PATHS[type],
  })
}

function positiveInteger(value: unknown) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function counterKey(entry: TanzaniaReceiptCounterLedgerEntry) {
  return `${entry.receiptNo}:${entry.globalCount}:${entry.dailyCount}:${entry.znum}`
}

function uniqueFiscalEntries(entries: TanzaniaReceiptCounterLedgerEntry[]) {
  const seen = new Set<string>()
  const unique: TanzaniaReceiptCounterLedgerEntry[] = []
  for (const entry of entries) {
    const key = counterKey(entry)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(entry)
    }
  }
  return unique
}

function summarizeDay(entries: TanzaniaReceiptCounterLedgerEntry[]) {
  const fiscalEntries = uniqueFiscalEntries(entries)
  if (!fiscalEntries.length) {
    return {
      receiptCount: 0,
      minDailyCount: null,
      maxDailyCount: null,
      minGlobalCount: null,
      maxGlobalCount: null,
    }
  }

  return {
    receiptCount: fiscalEntries.length,
    minDailyCount: Math.min(...fiscalEntries.map((entry) => entry.dailyCount)),
    maxDailyCount: Math.max(...fiscalEntries.map((entry) => entry.dailyCount)),
    minGlobalCount: Math.min(
      ...fiscalEntries.map((entry) => entry.globalCount),
    ),
    maxGlobalCount: Math.max(
      ...fiscalEntries.map((entry) => entry.globalCount),
    ),
  }
}

export function buildTanzaniaFiscalDayKey(
  value: unknown,
  timezone = 'Africa/Dar_es_Salaam',
) {
  return dateParts(value, timezone).compactDate
}

export function validateTanzaniaReceiptCounterLedger(
  entries: TanzaniaReceiptCounterLedgerEntry[],
): TanzaniaCounterLedgerValidation {
  const issues: XmlShapeIssue[] = []
  const byTransaction = new Map<string, TanzaniaReceiptCounterLedgerEntry>()
  const byGlobalCount = new Map<number, TanzaniaReceiptCounterLedgerEntry>()
  const byCounterTuple = new Map<string, TanzaniaReceiptCounterLedgerEntry>()
  const byZnumEntries = new Map<string, TanzaniaReceiptCounterLedgerEntry[]>()

  for (const [index, entry] of entries.entries()) {
    const path = `entries.${index}`
    const receiptNo = positiveInteger(entry.receiptNo)
    const globalCount = positiveInteger(entry.globalCount)
    const dailyCount = positiveInteger(entry.dailyCount)
    const znum = String(entry.znum || '').trim()

    if (!receiptNo) {
      issues.push(
        issue(
          'error',
          'invalid_receipt_no',
          'Receipt number must be a positive integer.',
          path,
        ),
      )
    }
    if (!globalCount) {
      issues.push(
        issue(
          'error',
          'invalid_global_count',
          'Global count must be a positive integer.',
          path,
        ),
      )
    }
    if (!dailyCount) {
      issues.push(
        issue(
          'error',
          'invalid_daily_count',
          'Daily count must be a positive integer.',
          path,
        ),
      )
    }
    if (!/^\d{8}$/.test(znum)) {
      issues.push(
        issue(
          'error',
          'invalid_znum',
          'ZNUM must use the YYYYMMDD fiscal-day key.',
          path,
        ),
      )
    }
    if (receiptNo && globalCount && receiptNo !== globalCount) {
      issues.push(
        issue(
          'error',
          'receipt_global_mismatch',
          'Receipt number must match global count to preserve TRA RCTNUM/GC behavior.',
          path,
        ),
      )
    }

    if (entry.transactionId) {
      const txKey = String(entry.transactionId)
      const previous = byTransaction.get(txKey)
      if (previous && counterKey(previous) !== counterKey(entry)) {
        issues.push(
          issue(
            'error',
            'transaction_counter_reallocated',
            `Transaction ${txKey} has multiple receipt counter tuples; retries must reuse the original counters.`,
            path,
          ),
        )
      } else if (!previous) {
        byTransaction.set(txKey, entry)
      }
    }

    if (globalCount) {
      const previous = byGlobalCount.get(globalCount)
      if (previous && previous.transactionId !== entry.transactionId) {
        issues.push(
          issue(
            'error',
            'global_count_reused',
            `Global count ${globalCount} is reused by multiple fiscal receipts.`,
            path,
          ),
        )
      } else if (!previous) {
        byGlobalCount.set(globalCount, entry)
      }
    }

    const tuple = counterKey(entry)
    const previousTuple = byCounterTuple.get(tuple)
    if (previousTuple && previousTuple.transactionId !== entry.transactionId) {
      issues.push(
        issue(
          'error',
          'counter_tuple_reused',
          `Counter tuple ${tuple} is reused by multiple transactions.`,
          path,
        ),
      )
    } else if (!previousTuple) {
      byCounterTuple.set(tuple, entry)
    }

    if (znum) {
      const dayEntries = byZnumEntries.get(znum) ?? []
      dayEntries.push(entry)
      byZnumEntries.set(znum, dayEntries)
    }
  }

  const sorted = [...entries]
    .filter((entry) => positiveInteger(entry.globalCount))
    .sort((a, b) => a.globalCount - b.globalCount)

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!
    const current = sorted[index]!
    if (current.globalCount > previous.globalCount + 1) {
      issues.push(
        issue(
          'warning',
          'global_count_gap',
          `Global count jumps from ${previous.globalCount} to ${current.globalCount}; this may be expected after legacy imports but should be reviewed.`,
        ),
      )
    }
  }

  const byZnum: TanzaniaCounterLedgerValidation['byZnum'] = {}
  for (const [znum, dayEntries] of byZnumEntries.entries()) {
    const dailyCounts = new Map<number, TanzaniaReceiptCounterLedgerEntry>()
    for (const entry of dayEntries) {
      const previous = dailyCounts.get(entry.dailyCount)
      const sameRetry =
        previous?.transactionId &&
        entry.transactionId &&
        previous.transactionId === entry.transactionId &&
        counterKey(previous) === counterKey(entry)
      if (previous && !sameRetry) {
        issues.push(
          issue(
            'error',
            'daily_count_reused',
            `Daily count ${entry.dailyCount} is reused for fiscal day ${znum}.`,
            `znum.${znum}`,
          ),
        )
      } else if (!previous) {
        dailyCounts.set(entry.dailyCount, entry)
      }
    }

    byZnum[znum] = summarizeDay(dayEntries)
    if (byZnum[znum]!.minDailyCount !== 1) {
      issues.push(
        issue(
          'warning',
          'daily_count_does_not_start_at_one',
          `Fiscal day ${znum} does not start at DC=1 in the provided ledger; review imported or filtered data before closing the day.`,
          `znum.${znum}`,
        ),
      )
    }
  }

  return {
    ok: !issues.some((item) => item.severity === 'error'),
    issues,
    byZnum,
  }
}

export function validateTanzaniaZReportBoundary(args: {
  entries: TanzaniaReceiptCounterLedgerEntry[]
  znum: string
  zReportGlobalCount?: number | null
  zReportDailyCount?: number | null
}): TanzaniaZReportBoundaryValidation {
  const znum = String(args.znum || '').trim()
  const dayEntries = uniqueFiscalEntries(
    args.entries.filter((entry) => String(entry.znum) === znum),
  ).sort((a, b) => a.globalCount - b.globalCount)
  const ledger = validateTanzaniaReceiptCounterLedger(dayEntries)
  const issues = [...ledger.issues]
  const last = dayEntries.at(-1) ?? null

  if (!/^\d{8}$/.test(znum)) {
    issues.push(
      issue(
        'error',
        'invalid_znum',
        'Z-report boundary ZNUM must use YYYYMMDD.',
        'znum',
      ),
    )
  }

  if (dayEntries.length === 0) {
    issues.push(
      issue(
        'warning',
        'empty_fiscal_day',
        `No fiscal receipts are present for ZNUM ${znum}; an empty z-report should be explicitly approved.`,
        'znum',
      ),
    )
  }

  if (
    args.zReportGlobalCount != null &&
    last &&
    Number(args.zReportGlobalCount) < last.globalCount
  ) {
    issues.push(
      issue(
        'error',
        'zreport_global_count_behind_receipts',
        'Z-report global count is behind the last receipt global count for the fiscal day.',
        'zReportGlobalCount',
      ),
    )
  }

  if (
    args.zReportDailyCount != null &&
    last &&
    Number(args.zReportDailyCount) !== last.dailyCount
  ) {
    issues.push(
      issue(
        'error',
        'zreport_daily_count_mismatch',
        'Z-report daily fiscal ticket count must match the last receipt daily count for the fiscal day.',
        'zReportDailyCount',
      ),
    )
  }

  return {
    ok: !issues.some((item) => item.severity === 'error'),
    issues,
    includedReceiptCount: dayEntries.length,
    lastGlobalCount: last?.globalCount ?? null,
    lastDailyCount: last?.dailyCount ?? null,
  }
}
