import { createHash } from 'node:crypto'

export type OptionalDomsDeviceFamily =
  | 'price_pole'
  | 'digital_io'
  | 'sensor'
  | 'vending'

export type OptionalDomsSeverity = 'ok' | 'info' | 'warning' | 'error'

export type NormalizedOptionalDeviceSnapshot = {
  family: OptionalDomsDeviceFamily
  deviceId: string
  sourceMessage: string
  sourceSubCode?: string
  mainState?: string
  stateCode?: string
  operationalStatus: 'online' | 'offline' | 'error' | 'alarm' | 'unknown'
  severity: OptionalDomsSeverity
  online?: boolean
  errorActive?: boolean
  alarmActive?: boolean
  lockId?: string
  protocolId?: string
  label?: string
  status: Record<string, unknown>
  flags: Record<string, unknown>
  alarms: unknown[]
  payloadJson: Record<string, unknown>
  sourceHash: string
}

export type NormalizedOptionalDeviceError = {
  family: OptionalDomsDeviceFamily
  deviceId: string
  sourceMessage: string
  sourceSubCode?: string
  errorCode?: string
  errorName?: string
  errorText?: string
  errorDateAndTime?: string
  protocolId?: string
  severity: OptionalDomsSeverity
  payloadJson: Record<string, unknown>
  sourceHash: string
}

export type NormalizedVendingTotals = {
  vmId: string
  vmTotalType?: string
  vmTotalTypeLabel?: string
  grandCountTotal?: string
  grandMoneyTotal?: string
  totalsInfo: Record<string, unknown>
  items: unknown[]
  payloadJson: Record<string, unknown>
  sourceHash: string
}

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : []

const trim = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || undefined
}

const enumLabel = (value: unknown) => {
  const entries = Object.entries(asObject(asObject(value).enum))
  return trim(entries[0]?.[0])
}

const enumValue = (value: unknown) => trim(asObject(value).value ?? value)

const bitsOf = (value: unknown) => asObject(asObject(value).bits)

const bitValue = (value: unknown, ...keys: string[]) => {
  const bits = bitsOf(value)
  return keys.some((key) => Boolean(bits[key] ?? asObject(value)[key]))
}

const stableSort = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableSort)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableSort(entry)]),
  )
}

export const hashOptionalModulePayload = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stableSort(value ?? null)))
    .digest('hex')

const severityFrom = (input: {
  online?: boolean
  errorActive?: boolean
  alarmActive?: boolean
  mainState?: string
}): OptionalDomsSeverity => {
  const state = String(input.mainState ?? '').toLowerCase()
  if (input.errorActive || state.includes('error')) return 'error'
  if (input.alarmActive || state.includes('alarm')) return 'warning'
  if (input.online === false || state.includes('closed')) return 'info'
  return 'ok'
}

const operationalStatusFrom = (input: {
  online?: boolean
  errorActive?: boolean
  alarmActive?: boolean
  mainState?: string
}): NormalizedOptionalDeviceSnapshot['operationalStatus'] => {
  const state = String(input.mainState ?? '').toLowerCase()
  if (input.errorActive || state.includes('error')) return 'error'
  if (input.alarmActive || state.includes('alarm')) return 'alarm'
  if (input.online === true || state.includes('active')) return 'online'
  if (input.online === false || state.includes('closed')) return 'offline'
  return 'unknown'
}

const buildSnapshot = (input: {
  family: OptionalDomsDeviceFamily
  deviceId?: string
  sourceMessage: string
  sourceSubCode?: string
  mainState?: string
  stateCode?: string
  online?: boolean
  errorActive?: boolean
  alarmActive?: boolean
  lockId?: string
  protocolId?: string
  label?: string
  status?: Record<string, unknown>
  flags?: Record<string, unknown>
  alarms?: unknown[]
  payload: Record<string, unknown>
}): NormalizedOptionalDeviceSnapshot | null => {
  const deviceId = trim(input.deviceId)
  if (!deviceId) return null

  const severity = severityFrom(input)
  return {
    family: input.family,
    deviceId,
    sourceMessage: input.sourceMessage,
    sourceSubCode: trim(input.sourceSubCode),
    mainState: trim(input.mainState),
    stateCode: trim(input.stateCode),
    operationalStatus: operationalStatusFrom(input),
    severity,
    online: input.online,
    errorActive: input.errorActive,
    alarmActive: input.alarmActive,
    lockId: trim(input.lockId),
    protocolId: trim(input.protocolId),
    label: trim(input.label),
    status: input.status ?? {},
    flags: input.flags ?? {},
    alarms: input.alarms ?? [],
    payloadJson: input.payload,
    sourceHash: hashOptionalModulePayload({
      family: input.family,
      deviceId,
      sourceMessage: input.sourceMessage,
      sourceSubCode: input.sourceSubCode,
      payload: input.payload,
    }),
  }
}

export const normalizePricePoleSnapshot = (
  payload: unknown,
  subCode?: string,
) => {
  const data = asObject(payload)
  const subStates = data.PpSubStates
  const mainState = enumLabel(data.PpMainState) ?? enumValue(data.PpMainState)
  const flags = {
    online: bitValue(subStates, 'PricePoleOnline', 'Online', 'IsOnline'),
    errorActive: bitValue(
      subStates,
      'PricePoleErrorActive',
      'ErrorActive',
      'Error',
    ),
  }

  return buildSnapshot({
    family: 'price_pole',
    deviceId: data.PpId,
    sourceMessage: 'PpStatus_resp',
    sourceSubCode: subCode,
    mainState,
    stateCode: enumValue(data.PpMainState),
    online: flags.online,
    errorActive: flags.errorActive,
    lockId: data.PpLockId,
    label: data.PpName ?? data.PpText,
    status: {
      mainState,
      pricePoleOperationModeNo: data.PpOperationModeNo,
    },
    flags,
    alarms: asArray(data.ActivePpAlarms ?? data.PpAlarms),
    payload: data,
  })
}

export const normalizeDigitalIoSnapshot = (
  payload: unknown,
  subCode?: string,
) => {
  const data = asObject(payload)
  const parameters = asObject(data.DiopStatusParameters ?? data.DiopStatusPars)
  const statusValue =
    data.DiopStatus ??
    data.DiopState ??
    parameters.DiopStatus ??
    parameters.State
  const flags = {
    inputActive: Boolean(
      parameters.InputActive ?? parameters.IsInputActive ?? parameters.Input,
    ),
    outputActive: Boolean(
      parameters.OutputActive ?? parameters.IsOutputActive ?? parameters.Output,
    ),
    online: Boolean(parameters.IsOnline ?? parameters.Online ?? true),
  }

  return buildSnapshot({
    family: 'digital_io',
    deviceId: data.DiopId ?? data.PinId,
    sourceMessage: 'DiopStatus_resp',
    sourceSubCode: subCode,
    mainState: trim(statusValue) ?? 'status_available',
    stateCode: trim(statusValue),
    online: flags.online,
    status: {
      statusValue,
      parameters,
    },
    flags,
    payload: data,
  })
}

export const normalizeSensorSnapshot = (payload: unknown, subCode?: string) => {
  const data = asObject(payload)
  const subStates = data.SensorSubStates
  const alarms = asArray(data.ActiveSensorAlarms)
  const mainState =
    enumLabel(data.SensorMainState) ?? enumValue(data.SensorMainState)
  const flags = {
    online: bitValue(subStates, 'IsOnline', 'Online'),
    errorActive: String(mainState ?? '')
      .toLowerCase()
      .includes('error'),
    alarmActive: alarms.length > 0,
  }

  return buildSnapshot({
    family: 'sensor',
    deviceId: data.SensorId,
    sourceMessage: 'SensorStatus_resp',
    sourceSubCode: subCode,
    mainState,
    stateCode: enumValue(data.SensorMainState),
    online: flags.online,
    errorActive: flags.errorActive,
    alarmActive: flags.alarmActive,
    protocolId: data.PssExtProtocolId,
    label: data.SensorName,
    status: {
      mainState,
      sensorName: data.SensorName,
    },
    flags,
    alarms,
    payload: data,
  })
}

export const normalizeVendingSnapshot = (
  payload: unknown,
  subCode?: string,
) => {
  const data = asObject(payload)
  const subStates = data.VmSubStates
  const alarms = asArray(data.ActiveVmAlarms)
  const mainState = enumLabel(data.VmMainState) ?? enumValue(data.VmMainState)
  const flags = {
    online: bitValue(subStates, 'VendingMachineOnline', 'Online', 'IsOnline'),
    hasFreeBuffer: bitValue(subStates, 'HasFreeBuffer', 'FreeBuffer'),
    totalizersReady: bitValue(subStates, 'TotalizersReady'),
    errorActive: bitValue(subStates, 'Error', 'ErrorActive'),
    alarmActive: alarms.length > 0,
  }

  return buildSnapshot({
    family: 'vending',
    deviceId: data.VmId,
    sourceMessage: 'VmStatus_resp',
    sourceSubCode: subCode,
    mainState,
    stateCode: enumValue(data.VmMainState),
    online: flags.online,
    errorActive: flags.errorActive,
    alarmActive: flags.alarmActive,
    lockId: data.VmLockId,
    label: data.FcDrystockNumber,
    status: {
      mainState,
      fcDrystockNumber: data.FcDrystockNumber,
      additional: data.VmAdditionalStatusPars ?? {},
    },
    flags,
    alarms,
    payload: data,
  })
}

const buildError = (input: {
  family: OptionalDomsDeviceFamily
  deviceId?: string
  sourceMessage: string
  sourceSubCode?: string
  errorCode?: string
  errorName?: string
  errorText?: string
  errorDateAndTime?: string
  protocolId?: string
  severity?: OptionalDomsSeverity
  payload: Record<string, unknown>
}): NormalizedOptionalDeviceError | null => {
  const deviceId = trim(input.deviceId)
  if (!deviceId) return null
  const errorCode = trim(input.errorCode)
  const errorName = trim(input.errorName)
  const errorText = trim(input.errorText)
  if (!errorCode && !errorName && !errorText) return null

  return {
    family: input.family,
    deviceId,
    sourceMessage: input.sourceMessage,
    sourceSubCode: trim(input.sourceSubCode),
    errorCode,
    errorName,
    errorText,
    errorDateAndTime: trim(input.errorDateAndTime),
    protocolId: trim(input.protocolId),
    severity: input.severity ?? 'error',
    payloadJson: input.payload,
    sourceHash: hashOptionalModulePayload({
      family: input.family,
      deviceId,
      sourceMessage: input.sourceMessage,
      sourceSubCode: input.sourceSubCode,
      errorCode,
      errorName,
      errorText,
      payload: input.payload,
    }),
  }
}

export const normalizePricePoleError = (payload: unknown, subCode?: string) => {
  const data = asObject(payload)
  return buildError({
    family: 'price_pole',
    deviceId: data.PpId,
    sourceMessage: 'PpErrorMsg_resp',
    sourceSubCode: subCode,
    errorCode: enumValue(data.PpErrorCode),
    errorName: enumLabel(data.PpErrorCode),
    errorDateAndTime: data.PpErrorDateAndTime,
    errorText: data.PpErrorTxt ?? data.PpErrorText,
    payload: data,
  })
}

export const normalizeVendingError = (payload: unknown, subCode?: string) => {
  const data = asObject(payload)
  return buildError({
    family: 'vending',
    deviceId: data.VmId,
    sourceMessage: 'VmErrorMsg_resp',
    sourceSubCode: subCode,
    errorCode: enumValue(data.VmErrorCode),
    errorName: enumLabel(data.VmErrorCode),
    errorDateAndTime: data.VmErrorDateAndTime,
    protocolId: data.PssExtProtocolId,
    errorText: data.VmErrorTxt ?? data.VmErrorText,
    payload: data,
  })
}

export const extractSensorAlarmErrors = (
  payload: unknown,
  subCode?: string,
): NormalizedOptionalDeviceError[] => {
  const data = asObject(payload)
  const sensorId = trim(data.SensorId)
  if (!sensorId) return []

  return asArray(data.ActiveSensorAlarms)
    .map((alarm: any) =>
      buildError({
        family: 'sensor',
        deviceId: sensorId,
        sourceMessage: 'SensorStatus_resp',
        sourceSubCode: subCode,
        errorCode: Array.isArray(alarm?.SensorAlarmCode)
          ? alarm.SensorAlarmCode.join(',')
          : alarm?.SensorAlarmCode,
        errorName: alarm?.SensorAlarmName,
        errorDateAndTime: alarm?.SensorAlarmDateAndTime,
        protocolId: data.PssExtProtocolId,
        severity: 'warning',
        payload: { sensor: data, alarm },
      }),
    )
    .filter(Boolean) as NormalizedOptionalDeviceError[]
}

export const extractVendingAlarmErrors = (
  payload: unknown,
  subCode?: string,
): NormalizedOptionalDeviceError[] => {
  const data = asObject(payload)
  const vmId = trim(data.VmId)
  if (!vmId) return []

  return asArray(data.ActiveVmAlarms)
    .map((alarm: any) =>
      buildError({
        family: 'vending',
        deviceId: vmId,
        sourceMessage: 'VmStatus_resp',
        sourceSubCode: subCode,
        errorCode: Array.isArray(alarm?.VmAlarmCode)
          ? alarm.VmAlarmCode.join(',')
          : alarm?.VmAlarmCode,
        errorName: alarm?.VmAlarmName,
        severity: 'warning',
        payload: { vending: data, alarm },
      }),
    )
    .filter(Boolean) as NormalizedOptionalDeviceError[]
}

export const normalizeVendingTotals = (
  payload: unknown,
): NormalizedVendingTotals | null => {
  const data = asObject(payload)
  const vmId = trim(data.VmId)
  if (!vmId) return null

  return {
    vmId,
    vmTotalType: enumValue(data.VmTotalType),
    vmTotalTypeLabel: enumLabel(data.VmTotalType),
    grandCountTotal: trim(data.VmGrandCountTotal),
    grandMoneyTotal: trim(data.VmGrandMoneyTotal),
    totalsInfo: asObject(data.VmDrystockTotalsInfo),
    items: asArray(data.VmDrystockItems),
    payloadJson: data,
    sourceHash: hashOptionalModulePayload({
      message: 'VmDrystockTotals_resp',
      vmId,
      payload: data,
    }),
  }
}
