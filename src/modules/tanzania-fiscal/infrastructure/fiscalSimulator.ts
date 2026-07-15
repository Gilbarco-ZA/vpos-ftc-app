import { parseXmlTag, xmlEscape, xmlTag } from './xml'

export type TanzaniaSimulatorTank = {
  id: string
  product: 'UNLEADED' | 'PETROL' | 'DIESEL' | 'KEROSENE' | string
  capacity: number
  currentVolume: number
  price: number
}

export type TanzaniaFiscalSimulatorConfig = {
  timezone?: string
  operatorTin?: string
  operatorVrn?: string
  operatorName?: string
  retailStationName?: string
  receiptCode?: string
  traSerialNo?: string
  traRegId?: string
  ewuraLicenseNo?: string
  regionName?: string
  districtName?: string
  wardName?: string
  contactEmail?: string
  contactPhone?: string
  tanks?: TanzaniaSimulatorTank[]
  seed?: number
}

export type TanzaniaFiscalSimulatorState = {
  transactionId: number
  dailyCounter: number
  globalCounter: number
  znum: string
  tankLevels: Record<string, number>
  completedTransactions: number
  startedAt: string
  config: Required<Omit<TanzaniaFiscalSimulatorConfig, 'tanks'>> & {
    tanks: TanzaniaSimulatorTank[]
  }
}

export type TanzaniaSimulatorSale = {
  id: string
  transaction_date_time: string
  total_amount: number
  payment_type: string
  fuel_type: string
  volume: number
  pump_number: number
  nozzle_number: number
  lines: Array<{
    id: string
    description: string
    quantity: number
    amount: number
    line_total: number
    mapped_tax_code: string
  }>
}

const DEFAULT_TANKS: TanzaniaSimulatorTank[] = [
  {
    id: '1',
    product: 'UNLEADED',
    capacity: 20000,
    currentVolume: 12000,
    price: 3200,
  },
  {
    id: '2',
    product: 'DIESEL',
    capacity: 20000,
    currentVolume: 14000,
    price: 3100,
  },
]

function getSimulatorReceiptVerificationNo(
  receiptCode: string | null | undefined,
  receiptNo: number | string,
) {
  const code = String(receiptCode || '').trim()
  return code ? `${code}${receiptNo}` : String(receiptNo)
}

function getSimulatorVerificationCode(
  rctvnum: string,
  receiptTime?: string | null,
) {
  const cleanTime = String(receiptTime || '').trim()
  return cleanTime ? `${rctvnum}_${cleanTime.replace(/:/g, '')}` : rctvnum
}

function getSimulatorVerificationUrl(
  rctvnum: string,
  receiptTime?: string | null,
) {
  return `https://virtual.tra.go.tz/efdmsRctVerify/${getSimulatorVerificationCode(rctvnum, receiptTime)}`
}

function todayCompact(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function lcg(seed: number) {
  return (seed * 48271) % 0x7fffffff
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function defaultConfig(config: TanzaniaFiscalSimulatorConfig = {}) {
  return {
    timezone: config.timezone || 'Africa/Dar_es_Salaam',
    operatorTin: config.operatorTin || '100000001',
    operatorVrn: config.operatorVrn || '40000001A',
    operatorName: config.operatorName || 'FTC SIMULATOR OPERATOR',
    retailStationName:
      config.retailStationName || 'FTC TANZANIA SIMULATOR STATION',
    receiptCode: config.receiptCode || 'SIM',
    traSerialNo: config.traSerialNo || 'SIMTRA001',
    traRegId: config.traRegId || 'SIMREG001',
    ewuraLicenseNo: config.ewuraLicenseNo || 'EWURA-SIM-001',
    regionName: config.regionName || 'Dar es Salaam',
    districtName: config.districtName || 'Ilala',
    wardName: config.wardName || 'Kisutu',
    contactEmail: config.contactEmail || 'simulator@example.invalid',
    contactPhone: config.contactPhone || '+255000000000',
    seed: Number.isFinite(Number(config.seed)) ? Number(config.seed) : 1,
    tanks: (config.tanks?.length ? config.tanks : DEFAULT_TANKS).map(
      (tank) => ({ ...tank }),
    ),
  }
}

export function createTanzaniaFiscalSimulatorState(
  args: {
    config?: TanzaniaFiscalSimulatorConfig
    now?: Date
  } = {},
): TanzaniaFiscalSimulatorState {
  const config = defaultConfig(args.config)
  return {
    transactionId: 1,
    dailyCounter: 1,
    globalCounter: 1,
    znum: todayCompact(args.now),
    tankLevels: Object.fromEntries(
      config.tanks.map((tank) => [tank.id, tank.currentVolume]),
    ),
    completedTransactions: 0,
    startedAt: (args.now ?? new Date()).toISOString(),
    config,
  }
}

export function buildTanzaniaSimulatorSale(args: {
  state: TanzaniaFiscalSimulatorState
  now?: Date
  paymentType?: string
  tankId?: string
  volume?: number
}): TanzaniaSimulatorSale {
  const state = args.state
  state.config.seed = lcg(state.config.seed)
  const tank =
    state.config.tanks.find((candidate) => candidate.id === args.tankId) ??
    state.config.tanks[state.config.seed % state.config.tanks.length]
  const volume = round(args.volume ?? 5 + (state.config.seed % 3500) / 100, 2)
  const amount = round(volume * Number(tank.price), 2)
  const id = String(state.transactionId).padStart(6, '0')
  const now = args.now ?? new Date()

  state.transactionId += 1
  state.dailyCounter += 1
  state.globalCounter += 1
  state.completedTransactions += 1
  state.tankLevels[tank.id] = round(
    Math.max(
      0,
      Number(state.tankLevels[tank.id] ?? tank.currentVolume) - volume,
    ),
    2,
  )

  return {
    id,
    transaction_date_time: now.toISOString(),
    total_amount: amount,
    payment_type: args.paymentType || 'CASH',
    fuel_type: tank.product,
    volume,
    pump_number: Number(tank.id) || 1,
    nozzle_number: 1,
    lines: [
      {
        id: '1',
        description: tank.product,
        quantity: volume,
        amount: tank.price,
        line_total: amount,
        mapped_tax_code: 'A',
      },
    ],
  }
}

function responseXml(root: string, values: Record<string, unknown>) {
  return `<?xml version="1.0" encoding="UTF-8"?><${root}>${Object.entries(
    values,
  )
    .map(([key, value]) => xmlTag(key, value))
    .join('')}</${root}>`
}

export function buildSimulatedTraTokenResponse() {
  return {
    status: 200,
    headers: {
      ackcode: '7',
      ackmsg: 'Token generated successfully',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      access_token: 'simulated-tra-token',
      token_type: 'bearer',
      expires_in: 3600,
    }),
  }
}

export function buildSimulatedTraRegistrationResponse(
  config: TanzaniaFiscalSimulatorConfig = {},
) {
  const cfg = defaultConfig(config)
  return responseXml('EFDMSRESP', {
    ACKCODE: '0',
    ACKMSG: 'Registration successful',
    REGID: cfg.traRegId,
    TIN: cfg.operatorTin,
    VRN: cfg.operatorVrn,
    SERIAL: cfg.traSerialNo,
    RECEIPTCODE: cfg.receiptCode,
    ROUTINGKEY: 'vfdrct',
    TAXOFFICE: cfg.districtName,
  })
}

export function buildSimulatedTraReceiptResponse(
  args: {
    receiptXml?: string | null
    receiptCode?: string | null
    receiptNo?: number | string | null
    receiptTime?: string | null
  } = {},
) {
  const receiptNo =
    args.receiptNo ?? parseXmlTag(args.receiptXml || '', 'RCTNUM') ?? '1'
  const receiptCode = args.receiptCode ?? 'SIM'
  const rctvnum =
    parseXmlTag(args.receiptXml || '', 'RCTVNUM') ??
    getSimulatorReceiptVerificationNo(receiptCode, receiptNo)
  const receiptTime =
    args.receiptTime ?? parseXmlTag(args.receiptXml || '', 'TIME') ?? null
  return responseXml('EFDMSRESP', {
    ACKCODE: '0',
    ACKMSG: 'Receipt accepted',
    RCTNUM: receiptNo,
    RCTVNUM: rctvnum,
    VERIFICATIONCODE: getSimulatorVerificationCode(rctvnum, receiptTime),
    VERIFICATIONURL: getSimulatorVerificationUrl(rctvnum, receiptTime),
  })
}

export function buildSimulatedTraZReportResponse(
  args: { znumber?: string | null; zReportXml?: string | null } = {},
) {
  return responseXml('EFDMSRESP', {
    ACKCODE: '0',
    ACKMSG: 'Z report accepted',
    ZNUMBER:
      args.znumber ??
      parseXmlTag(args.zReportXml || '', 'ZNUMBER') ??
      todayCompact(),
  })
}

export function buildSimulatedEwuraResponse(args: {
  requestName: string
  transactionId?: string | number | null
  code?: string | number | null
  message?: string | null
}) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><NPGIS><Response>` +
    xmlTag('RequestName', args.requestName) +
    xmlTag('Code', args.code ?? '200') +
    xmlTag('Message', args.message ?? 'Accepted') +
    xmlTag('TranId', args.transactionId ?? 'SIM-EWURA-1') +
    `</Response><EwuraSignature>${xmlEscape('SIMULATED')}</EwuraSignature></NPGIS>`
  )
}

export function createTanzaniaFiscalSimulatorFetch(
  args: {
    config?: TanzaniaFiscalSimulatorConfig
  } = {},
): typeof fetch {
  return async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''

    if (/vfdtoken$/i.test(url)) {
      const token = buildSimulatedTraTokenResponse()
      return new Response(token.body, {
        status: token.status,
        headers: token.headers,
      })
    }

    if (/vfdregreq$/i.test(url)) {
      return new Response(buildSimulatedTraRegistrationResponse(args.config), {
        status: 200,
        headers: { 'content-type': 'Application/xml' },
      })
    }

    if (/efdmsrctinfo$/i.test(url)) {
      return new Response(
        buildSimulatedTraReceiptResponse({ receiptXml: body }),
        {
          status: 200,
          headers: { 'content-type': 'Application/xml' },
        },
      )
    }

    if (/efdmszreport$/i.test(url)) {
      return new Response(
        buildSimulatedTraZReportResponse({ zReportXml: body }),
        {
          status: 200,
          headers: { 'content-type': 'Application/xml' },
        },
      )
    }

    if (/RegisterRetailStationRecords$/i.test(url)) {
      return new Response(
        buildSimulatedEwuraResponse({
          requestName: 'RegisterRetailStationRecords',
          transactionId: 'SIM-EWURA-REG',
        }),
        { status: 200, headers: { 'content-type': 'application/xml' } },
      )
    }

    if (/PostRetailSalesTran$/i.test(url)) {
      return new Response(
        buildSimulatedEwuraResponse({
          requestName: 'PostRetailSalesTran',
          transactionId: parseXmlTag(body, 'TranId') ?? 'SIM-EWURA-SALE',
        }),
        { status: 200, headers: { 'content-type': 'application/xml' } },
      )
    }

    if (/PostDailyStationInvSumTran$/i.test(url)) {
      return new Response(
        buildSimulatedEwuraResponse({
          requestName: 'PostDailyStationInvSumTran',
          transactionId: parseXmlTag(body, 'ReportId') ?? 'SIM-EWURA-REPORT',
        }),
        { status: 200, headers: { 'content-type': 'application/xml' } },
      )
    }

    return new Response('Not found', { status: 404 })
  }
}
