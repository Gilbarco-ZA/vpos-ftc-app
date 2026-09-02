export type TankGaugeAlarmKey =
  | 'highLevel'
  | 'highHighLevel'
  | 'lowLevel'
  | 'lowLowLevel'
  | 'highWater'
  | 'tankLeak'
  | 'tankDataMissing'
  | 'highHighWater'
  | 'ticketedDeliveryDataLost'
  | 'deliveryDataLost'
  | 'otherAlarm'

export type TankGaugeAlarmSeverity = 'warning' | 'critical' | 'unknown'

export type NormalizedTankGaugeAlarm = {
  key: TankGaugeAlarmKey
  bitName: string
  bitValue: number
  code: string
  label: string
  severity: TankGaugeAlarmSeverity
  active: boolean
  text?: string
  protocolId?: string
}

export type NormalizedTankGaugeAlarmStatus = {
  rawValue: number | null
  active: NormalizedTankGaugeAlarm[]
  all: NormalizedTankGaugeAlarm[]
  texts: Array<{
    code?: string
    protocolId?: string
    text?: string
  }>
}

export type NormalizedTankGaugeData = {
  tgId: string
  flags: {
    online: boolean
    alarmActive: boolean
    errorActive: boolean
    ticketedDeliveryInProgress: boolean
    ticketedDeliveryDataReady: boolean
    deliveryInProgress: boolean
    deliveryDataReady: boolean
    allInventoryDataReady: boolean
  }
  tankId?: string
  productCode?: string
  groupId?: string
  gaugeType?: string
  productLevel: number | null
  waterLevel: number | null
  totalObservedVolume: number | null
  waterVolume: number | null
  grossObservedVolume: number | null
  grossStandardVolume: number | null
  availableRoom: number | null
  averageTemperatureC: number | null
  lastUpdatedAt: string | null
  maxSafeFillCapacity: number | null
  shellCapacity: number | null
  productMass: number | null
  productDensity: number | null
  productTcDensity: number | null
  densityProbeTemperatureC: number | null
  sludgeLevel: number | null
  oilSeparatorOilThickness: number | null
  oilSeparatorOilVolume: number | null
  tempSensor1C: number | null
  tempSensor2C: number | null
  tempSensor3C: number | null
  pressure: number | null
  adjustedVolume: number | null
  adjustedTcVolume: number | null
  deliveredVolume: number | null
  deliveredTcVolume: number | null
  deliveredMass: number | null
  deliveredQuantity: number | null
  inflowControlMode?: string
  rawItems: Record<string, unknown>
  raw: Record<string, unknown>
}

export type NormalizedTankDeliveryData = {
  tgId?: string
  posId?: string
  deliveryReportSeqNo?: string
  tankDeliverySeqNo?: string
  productCode?: string
  deliveredVolume: number | null
  deliveredTcVolume: number | null
  deliveredMass: number | null
  deliveredQuantity: number | null
  adjustedVolumeSigned: number | null
  adjustedTcVolumeSigned: number | null
  saleVolumeDuringDelivery: number | null
  deliveryTemperatureC: number | null
  startDateAndTime?: string
  stopDateAndTime?: string
  startProductVolume: number | null
  startProductTcVolume: number | null
  startWaterVolume: number | null
  startTemperatureC: number | null
  startProductMass: number | null
  startProductDensity: number | null
  startProductTcDensity: number | null
  stopProductVolume: number | null
  stopProductTcVolume: number | null
  stopWaterVolume: number | null
  stopTemperatureC: number | null
  stopProductMass: number | null
  stopProductDensity: number | null
  stopProductTcDensity: number | null
  clearTarget?: {
    tgId: string
    tankDeliverySeqNo: string
    deliveryReportSeqNo?: string
    posId?: string
  }
  rawItems: Record<string, unknown>
  raw: Record<string, unknown>
}

export type NormalizedSiteDeliveryStatus = {
  deliveryReportSeqNo?: string
  status:
    | 'idle'
    | 'starting_marked'
    | 'in_progress'
    | 'finishing_marked'
    | 'data_ready'
  flags: {
    siteDeliveryStartingMarked: boolean
    siteDeliveryInProgress: boolean
    siteDeliveryFinishingMarked: boolean
    siteDeliveryDataReady: boolean
    siteTicketedDeliveryDataReady: boolean
    siteTicketedDeliveryInProgress: boolean
  }
  tgIds: string[]
  tankDeliveries: string[]
  tankTicketedDeliveries: string[]
  readyTgIds: string[]
  clearCandidates: Array<{
    tgId: string
    deliveryReportSeqNo?: string
  }>
  raw: Record<string, unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {}

const getAny = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  }
  return undefined
}

const unwrapEnvelope = (payload: unknown): Record<string, unknown> => {
  const source = asRecord(payload)
  const data = source.data ?? asRecord(source.payload).data ?? source.payload
  return asRecord(data ?? source)
}

const toStringOrUndefined = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || undefined
}

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return toNumberOrNull(value.value)
  }
  const parsed = Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}

const toScaledNumberOrNull = (
  value: unknown,
  divisor: number,
): number | null => {
  const parsed = toNumberOrNull(value)
  return parsed === null ? null : parsed / divisor
}

const decodeTankLevel = (value: unknown) => toScaledNumberOrNull(value, 10)
const decodeTankVolume = (value: unknown) => toScaledNumberOrNull(value, 100)
const decodeTankMass = (value: unknown) => toScaledNumberOrNull(value, 10)
const decodeTankQuantity = (value: unknown) => toScaledNumberOrNull(value, 100)
const decodePressure = (value: unknown) => toScaledNumberOrNull(value, 10)

const toRawValue = (value: unknown) => {
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value
  }
  return value
}

const normalizeCode = (value: unknown, width = 4) => {
  const raw = String(toRawValue(value) ?? '')
    .trim()
    .toUpperCase()
  if (!raw) return undefined
  const stripped = raw.endsWith('H') ? raw.slice(0, -1) : raw
  if (!/^[0-9A-F]+$/.test(stripped)) return raw
  return `${stripped.padStart(width, '0')}H`
}

export const normalizeId2 = (value: unknown): string | undefined => {
  const raw = String(toRawValue(value) ?? '').replace(/\D/g, '')
  if (!raw) return undefined
  return raw.padStart(2, '0')
}

type FcDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const parseFcDateTimeParts = (value: unknown): FcDateTimeParts | null => {
  const raw = String(value ?? '').replace(/\D/g, '')
  if (raw.length !== 14 || raw === '00000000000000') return null
  const parts = {
    year: Number(raw.slice(0, 4)),
    month: Number(raw.slice(4, 6)),
    day: Number(raw.slice(6, 8)),
    hour: Number(raw.slice(8, 10)),
    minute: Number(raw.slice(10, 12)),
    second: Number(raw.slice(12, 14)),
  }
  const probe = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  )
  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() + 1 !== parts.month ||
    probe.getUTCDate() !== parts.day ||
    probe.getUTCHours() !== parts.hour ||
    probe.getUTCMinutes() !== parts.minute ||
    probe.getUTCSeconds() !== parts.second
  ) {
    return null
  }
  return parts
}

const localDateTimePartsAt = (
  date: Date,
  timeZone: string,
): FcDateTimeParts => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

const utcLikeMillis = (parts: FcDateTimeParts) =>
  Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

const sameDateTimeParts = (left: FcDateTimeParts, right: FcDateTimeParts) =>
  left.year === right.year &&
  left.month === right.month &&
  left.day === right.day &&
  left.hour === right.hour &&
  left.minute === right.minute &&
  left.second === right.second

export const parseFcDateAndTime = (
  value: unknown,
  timeZone?: string | null,
): string | null => {
  const target = parseFcDateTimeParts(value)
  if (!target) return null

  const zone = String(timeZone ?? '').trim()
  if (!zone || zone.toUpperCase() === 'UTC') {
    return new Date(utcLikeMillis(target)).toISOString()
  }

  try {
    let candidate = utcLikeMillis(target)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const rendered = localDateTimePartsAt(new Date(candidate), zone)
      const correction = utcLikeMillis(target) - utcLikeMillis(rendered)
      candidate += correction
      if (correction === 0) break
    }
    const date = new Date(candidate)
    return sameDateTimeParts(localDateTimePartsAt(date, zone), target)
      ? date.toISOString()
      : null
  } catch {
    return null
  }
}

export const decodeSignedTemperature = (value: unknown): number | null => {
  if (!isRecord(value)) {
    const direct = toNumberOrNull(value)
    return direct === null ? null : direct / 10
  }

  const temp = toNumberOrNull(
    getAny(value, ['Temperature', 'TempValue', 'value', 'Value']),
  )
  if (temp === null) return null

  const sign = String(
    asRecord(getAny(value, ['FcSign', 'Sign'])).value ??
      getAny(value, ['FcSign', 'Sign']) ??
      '00H',
  ).toUpperCase()

  const signed = temp / 10
  return sign === '80H' || sign === '-' || sign === '-1' ? -signed : signed
}

const toIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) =>
      normalizeId2(
        isRecord(entry)
          ? (getAny(entry, ['TgId', 'TankId', 'id', 'value']) ?? entry)
          : entry,
      ),
    )
    .filter((entry): entry is string => Boolean(entry))
}

const bitActive = (source: unknown, names: string[]) => {
  const value = asRecord(source)
  const bits = asRecord(value.bits)
  for (const name of names) {
    if (Boolean(bits[name] ?? value[name])) return true
  }
  return false
}

const alarmDefinitions: Array<{
  key: TankGaugeAlarmKey
  names: string[]
  bitValue: number
  code: string
  label: string
  severity: TankGaugeAlarmSeverity
}> = [
  {
    key: 'highLevel',
    names: ['HighLevelAlarm'],
    bitValue: 1,
    code: '0001H',
    label: 'High level alarm',
    severity: 'warning',
  },
  {
    key: 'highHighLevel',
    names: ['HighHighLevelAlarm'],
    bitValue: 2,
    code: '0002H',
    label: 'High high level alarm',
    severity: 'critical',
  },
  {
    key: 'lowLevel',
    names: ['LowLevelAlarm'],
    bitValue: 4,
    code: '0003H',
    label: 'Low level alarm',
    severity: 'warning',
  },
  {
    key: 'lowLowLevel',
    names: ['LowLowLevelAlarm'],
    bitValue: 8,
    code: '0004H',
    label: 'Low low level alarm',
    severity: 'critical',
  },
  {
    key: 'highWater',
    names: ['HighWaterAlarm'],
    bitValue: 16,
    code: '0005H',
    label: 'High water alarm',
    severity: 'warning',
  },
  {
    key: 'tankLeak',
    names: ['TankLeakAlarm'],
    bitValue: 32,
    code: '0006H',
    label: 'Tank leak alarm',
    severity: 'critical',
  },
  {
    key: 'tankDataMissing',
    names: ['TankDataMissingAlarm'],
    bitValue: 64,
    code: '0007H',
    label: 'Tank data missing alarm',
    severity: 'critical',
  },
  {
    key: 'highHighWater',
    names: ['HighHighWaterAlarm'],
    bitValue: 128,
    code: '0008H',
    label: 'High high water alarm',
    severity: 'critical',
  },
  {
    key: 'ticketedDeliveryDataLost',
    names: ['TicketedDeliveryDataLost'],
    bitValue: 8192,
    code: '000EH',
    label: 'Ticketed delivery data lost',
    severity: 'warning',
  },
  {
    key: 'deliveryDataLost',
    names: ['DeliveryDataLost'],
    bitValue: 16384,
    code: '000FH',
    label: 'Delivery data lost',
    severity: 'warning',
  },
  {
    key: 'otherAlarm',
    names: ['OtherAlarm'],
    bitValue: 32768,
    code: '0011H',
    label: 'Other alarm',
    severity: 'unknown',
  },
]

const normalizeAlarmTextCode = (record: Record<string, unknown>) => {
  const direct = normalizeCode(record.TgAlarmCode, 4)
  if (direct) return direct

  const alarmNo = normalizeCode(record.TgAlarmNo, 4)
  if (!alarmNo) return undefined

  const alarmNoNumeric = Number.parseInt(alarmNo.replace(/H$/, ''), 16)
  if (!Number.isFinite(alarmNoNumeric)) return alarmNo

  return (
    alarmDefinitions.find(
      (definition) => definition.bitValue === alarmNoNumeric,
    )?.code ?? alarmNo
  )
}

const normalizeAlarmTexts = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => {
        const record = asRecord(entry)
        return {
          code: normalizeAlarmTextCode(record),
          protocolId: normalizeId2(record.TgProtocolId),
          text: toStringOrUndefined(record.TgAlarmTxt),
        }
      })
    : []

export const normalizeJplTankAlarmStatus = (
  payload: unknown,
): NormalizedTankGaugeAlarmStatus => {
  const data = unwrapEnvelope(payload)
  const alarmStatus = getAny(data, ['TgAlarmStatus', 'AlarmStatus'])
  const texts = normalizeAlarmTexts(getAny(data, ['TgAlarmTxts', 'AlarmTexts']))
  const textByCode = new Map(
    texts
      .filter((entry) => entry.code)
      .map((entry) => [String(entry.code), entry]),
  )

  const all = alarmDefinitions.map((definition) => {
    const active = bitActive(alarmStatus, definition.names)
    const text = textByCode.get(definition.code)
    return {
      key: definition.key,
      bitName: definition.names[0],
      bitValue: definition.bitValue,
      code: definition.code,
      label: definition.label,
      severity: definition.severity,
      active,
      text: text?.text,
      protocolId: text?.protocolId,
    }
  })

  return {
    rawValue: toNumberOrNull(asRecord(alarmStatus).value),
    active: all.filter((entry) => entry.active),
    all,
    texts,
  }
}

export const normalizeJplTankGaugeData = (
  payload: unknown,
  options: { timeZone?: string | null } = {},
): NormalizedTankGaugeData | null => {
  const data = unwrapEnvelope(payload)
  const items = asRecord(
    getAny(data, ['TankDataItems', 'TgDataItems', 'TankData', 'items']) ?? data,
  )
  const tgId = normalizeId2(getAny(data, ['TgId', 'TankId']))
  if (!tgId) return null

  const subStates = getAny(data, ['TgSubStates', 'TankGaugeSubStates'])

  return {
    tgId,
    flags: {
      online:
        bitActive(subStates, ['TankGaugeOnline']) ||
        bitActive(subStates, ['TankGaugeOnLine']),
      alarmActive: bitActive(subStates, ['TankGaugeAlarmActive']),
      errorActive: bitActive(subStates, ['TankGaugeErrorActive']),
      ticketedDeliveryInProgress: bitActive(subStates, [
        'TicketedDeliveryInProgress',
      ]),
      ticketedDeliveryDataReady: bitActive(subStates, [
        'TicketedDeliveryDataReady',
      ]),
      deliveryInProgress: bitActive(subStates, ['DeliveryInProgress']),
      deliveryDataReady:
        bitActive(subStates, ['DeliveryDataReady']) ||
        bitActive(subStates, ['DelvieryDataReady']),
      allInventoryDataReady: bitActive(subStates, [
        'AllAvailableInventoryDataReady',
      ]),
    },
    tankId: normalizeId2(getAny(items, ['TankId']) ?? getAny(data, ['TankId'])),
    productCode: toStringOrUndefined(
      getAny(items, ['TgProductCode', 'ProductCode']) ?? data.TgProductCode,
    ),
    groupId: toStringOrUndefined(getAny(items, ['TankGroupId'])),
    gaugeType: toStringOrUndefined(getAny(items, ['TankGaugeType'])),
    productLevel: decodeTankLevel(getAny(items, ['TankProductLevel'])),
    waterLevel: decodeTankLevel(getAny(items, ['TankWaterLevel'])),
    totalObservedVolume: decodeTankVolume(
      getAny(items, ['TankTotalObservedVol']),
    ),
    waterVolume: decodeTankVolume(getAny(items, ['TankWaterVol'])),
    grossObservedVolume: decodeTankVolume(
      getAny(items, ['TankGrossObservedVol']),
    ),
    grossStandardVolume: decodeTankVolume(getAny(items, ['TankGrossStdVol'])),
    availableRoom: decodeTankVolume(getAny(items, ['TankAvailableRoom'])),
    averageTemperatureC: decodeSignedTemperature(
      getAny(items, ['TankAverageTemp']),
    ),
    lastUpdatedAt: parseFcDateAndTime(
      getAny(items, ['TankDataLastUpdateDateAndTime']),
      options.timeZone,
    ),
    maxSafeFillCapacity: decodeTankVolume(
      getAny(items, ['TankMaxSafeFillCapacity']),
    ),
    shellCapacity: decodeTankVolume(getAny(items, ['TankShellCapacity'])),
    productMass: decodeTankMass(getAny(items, ['TankProductMass'])),
    productDensity: toNumberOrNull(getAny(items, ['TankProductDensity'])),
    productTcDensity: toNumberOrNull(getAny(items, ['TankProductTcDensity'])),
    densityProbeTemperatureC: decodeSignedTemperature(
      getAny(items, ['TankDensityProbeTemp']),
    ),
    sludgeLevel: decodeTankLevel(getAny(items, ['TankSludgeLevel'])),
    oilSeparatorOilThickness: decodeTankLevel(
      getAny(items, ['TankOilSepOilThickness']),
    ),
    oilSeparatorOilVolume: decodeTankVolume(
      getAny(items, ['TankOilSepOilVolume']),
    ),
    tempSensor1C: decodeSignedTemperature(getAny(items, ['TankTempSensor1'])),
    tempSensor2C: decodeSignedTemperature(getAny(items, ['TankTempSensor2'])),
    tempSensor3C: decodeSignedTemperature(getAny(items, ['TankTempSensor3'])),
    pressure: decodePressure(getAny(items, ['TankPressure'])),
    adjustedVolume: decodeTankVolume(getAny(items, ['TankAdjustedVolume'])),
    adjustedTcVolume: decodeTankVolume(getAny(items, ['TankAdjustedTCVolume'])),
    deliveredVolume: decodeTankVolume(getAny(items, ['TankDeliveredVol'])),
    deliveredTcVolume: decodeTankVolume(getAny(items, ['TankDeliveredTcVol'])),
    deliveredMass: decodeTankMass(getAny(items, ['TankDeliveredMass'])),
    deliveredQuantity: decodeTankQuantity(
      getAny(items, ['TankDeliveredQuantity']),
    ),
    inflowControlMode: toStringOrUndefined(
      getAny(items, ['TankInflowControlMode']),
    ),
    rawItems: items,
    raw: data,
  }
}

export const normalizeJplSiteDeliveryStatus = (
  payload: unknown,
): NormalizedSiteDeliveryStatus => {
  const data = unwrapEnvelope(payload)
  const flags = getAny(data, ['DeliveryStatusFlags'])
  const normalizedFlags = {
    siteDeliveryStartingMarked: bitActive(flags, [
      'SiteDeliveryStartingMarked',
      'SiteDeliveryStartMarked',
    ]),
    siteDeliveryInProgress: bitActive(flags, ['SiteDeliveryInProgress']),
    siteDeliveryFinishingMarked: bitActive(flags, [
      'SiteDeliveryFinishingMarked',
      'SiteDeliveryFinishedMarked',
    ]),
    siteDeliveryDataReady: bitActive(flags, ['SiteDeliveryDataIsReady']),
    siteTicketedDeliveryDataReady: bitActive(flags, [
      'SiteTicketedDeliveryDataIsReady',
    ]),
    siteTicketedDeliveryInProgress: bitActive(flags, [
      'SiteTicketedDeliveryInProgress',
    ]),
  }

  const tankDeliveries = toIdList(data.TankDeliveries)
  const ticketedDeliveries = toIdList(data.TankTicketedDeliveries)
  const tgIds = Array.from(
    new Set([
      ...toIdList(data.TgId),
      ...toIdList(data.TgIds),
      ...tankDeliveries,
      ...ticketedDeliveries,
    ]),
  )
  const readyTgIds = Array.from(
    new Set([
      ...(normalizedFlags.siteDeliveryDataReady ? tankDeliveries : []),
      ...(normalizedFlags.siteTicketedDeliveryDataReady
        ? ticketedDeliveries
        : []),
    ]),
  )
  const deliveryReportSeqNo = normalizeId2(data.DeliveryReportSeqNo)

  const status: NormalizedSiteDeliveryStatus['status'] =
    normalizedFlags.siteDeliveryDataReady
      ? 'data_ready'
      : normalizedFlags.siteDeliveryFinishingMarked
        ? 'finishing_marked'
        : normalizedFlags.siteDeliveryInProgress
          ? 'in_progress'
          : normalizedFlags.siteDeliveryStartingMarked
            ? 'starting_marked'
            : 'idle'

  return {
    deliveryReportSeqNo,
    status,
    flags: normalizedFlags,
    tgIds,
    tankDeliveries,
    tankTicketedDeliveries: ticketedDeliveries,
    readyTgIds,
    clearCandidates: readyTgIds.map((tgId) => ({ tgId, deliveryReportSeqNo })),
    raw: data,
  }
}

export const normalizeJplTankDeliveryData = (
  payload: unknown,
): NormalizedTankDeliveryData => {
  const data = unwrapEnvelope(payload)
  const items = asRecord(
    getAny(data, ['TankDeliveryDataItems', 'DeliveryDataItems', 'items']) ??
      data,
  )
  const tgId = normalizeId2(getAny(data, ['TgId', 'TankId']) ?? items.TgId)
  const tankDeliverySeqNo = normalizeId2(
    getAny(items, ['TankDeliverySeqNo']) ?? data.TankDeliverySeqNo,
  )
  const deliveryReportSeqNo = normalizeId2(
    getAny(data, ['DeliveryReportSeqNo']) ?? items.DeliveryReportSeqNo,
  )
  const posId = normalizeId2(data.PosId)

  const normalized: NormalizedTankDeliveryData = {
    tgId,
    posId,
    deliveryReportSeqNo,
    tankDeliverySeqNo,
    productCode: toStringOrUndefined(
      getAny(items, ['TgProductCode', 'ProductCode']) ?? data.TgProductCode,
    ),
    deliveredVolume: toNumberOrNull(getAny(items, ['TankDeliveredVol'])),
    deliveredTcVolume: toNumberOrNull(getAny(items, ['TankDeliveredTcVol'])),
    deliveredMass: toNumberOrNull(getAny(items, ['TankDeliveredMass'])),
    deliveredQuantity: toNumberOrNull(getAny(items, ['TankDeliveredQuantity'])),
    adjustedVolumeSigned: toNumberOrNull(
      getAny(items, ['TankDeliveryAdjustedVolumeSigned']),
    ),
    adjustedTcVolumeSigned: toNumberOrNull(
      getAny(items, ['TankDeliveryAdjustedTCVolumeSigned']),
    ),
    saleVolumeDuringDelivery: toNumberOrNull(
      getAny(items, ['TankDeliverySaleVolDuringDelivery']),
    ),
    deliveryTemperatureC: decodeSignedTemperature(
      getAny(items, ['TankDeliveryTemperature']),
    ),
    startDateAndTime: toStringOrUndefined(
      getAny(items, ['TankDeliveryStartDateAndTime']),
    ),
    stopDateAndTime: toStringOrUndefined(
      getAny(items, ['TankDeliveryStopDateAndTime']),
    ),
    startProductVolume: toNumberOrNull(
      getAny(items, ['TankDeliveryStartProdVol']),
    ),
    startProductTcVolume: toNumberOrNull(
      getAny(items, ['TankDeliveryStartProdTcVol']),
    ),
    startWaterVolume: toNumberOrNull(
      getAny(items, ['TankDeliveryStartWaterVol']),
    ),
    startTemperatureC: decodeSignedTemperature(
      getAny(items, ['TankDeliveryStartTemp']),
    ),
    startProductMass: toNumberOrNull(
      getAny(items, ['TankDeliveryStartProductMass']),
    ),
    startProductDensity: toNumberOrNull(
      getAny(items, ['TankDeliveryStartProductDensity']),
    ),
    startProductTcDensity: toNumberOrNull(
      getAny(items, ['TankDeliveryStartProductTCDensity']),
    ),
    stopProductVolume: toNumberOrNull(
      getAny(items, ['TankDeliveryStopProdVol']),
    ),
    stopProductTcVolume: toNumberOrNull(
      getAny(items, ['TankDeliveryStopProdTcVol']),
    ),
    stopWaterVolume: toNumberOrNull(
      getAny(items, ['TankDeliveryStopWaterVol']),
    ),
    stopTemperatureC: decodeSignedTemperature(
      getAny(items, ['TankDeliveryStopTemp']),
    ),
    stopProductMass: toNumberOrNull(
      getAny(items, ['TankDeliveryStopProductMass']),
    ),
    stopProductDensity: toNumberOrNull(
      getAny(items, ['TankDeliveryStopProductDensity']),
    ),
    stopProductTcDensity: toNumberOrNull(
      getAny(items, ['TankDeliveryStopProductTCDensity']),
    ),
    rawItems: items,
    raw: data,
  }

  if (tgId && tankDeliverySeqNo) {
    normalized.clearTarget = {
      tgId,
      tankDeliverySeqNo,
      deliveryReportSeqNo,
      posId,
    }
  }

  return normalized
}
