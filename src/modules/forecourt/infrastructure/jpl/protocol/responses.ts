import {
  normalizeDigitalIoSnapshot,
  normalizePricePoleError,
  normalizePricePoleSnapshot,
  normalizeSensorSnapshot,
  normalizeVendingError,
  normalizeVendingSnapshot,
  normalizeVendingTotals,
} from '@/src/modules/forecourt/infrastructure/jpl/optionalModules'
import {
  normalizeDigitalIoStatusPayload,
  normalizeFpErrorPayload,
  normalizeFpFuellingDataPayload,
  normalizeFpInfoPayload,
  normalizeFpStatusPayload,
  normalizePpErrorPayload,
  normalizePpStatusPayload,
  normalizeSensorStatusPayload,
  normalizeSiteDeliveryStatusPayload,
  normalizeTankDeliveryDataPayload,
  normalizeTgDataPayload,
  normalizeTgStatusPayload,
  normalizeVendingErrorPayload,
  normalizeVendingStatusPayload,
  normalizeWashErrorPayload,
  normalizeWashStatusPayload,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'
import {
  mapRejectEnvelope,
  normalizeJplInboundEnvelope,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import {
  isEmptyDomsBackOfficeRecord,
  normalizeDomsBackOfficeRecord,
  normalizeDomsServiceMessageRecord,
} from '@/src/modules/forecourt/infrastructure/jpl/specialRecords'
import {
  normalizeJplWashStatusBuffer,
  normalizeJplWashTransaction,
} from '@/src/modules/forecourt/infrastructure/jpl/washTransactions'

export type ParsedDomsResponseFamily =
  | 'connection'
  | 'forecourt'
  | 'dispense'
  | 'wetstock'
  | 'price'
  | 'wash'
  | 'digital_io'
  | 'sensor'
  | 'vending'
  | 'special_record'
  | 'client_backup'
  | 'maintenance'
  | 'reject'
  | 'unknown'

export type ParsedDomsResponse = {
  family: ParsedDomsResponseFamily
  name: string
  subCode?: string
  solicited?: boolean
  correlationId?: unknown
  entityType?: string
  entityId?: string
  status: 'ok' | 'warning' | 'error' | 'ack' | 'empty' | 'unknown'
  summary: string
  normalized: Record<string, unknown>
  raw: Record<string, unknown>
  children?: ParsedDomsResponse[]
}

type ParserContext = {
  stationId?: string
}

type Parser = (envelope: any, context: ParserContext) => ParsedDomsResponse

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const trim = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || undefined
}

const enumLabel = (value: unknown) => {
  const object = asObject(value)
  const enumObject = asObject(object.enum)
  const rawValue = trim(object.value)
  if (rawValue) {
    const match = Object.entries(enumObject).find(
      ([, entry]) => String(entry).trim() === rawValue,
    )
    if (match?.[0]) return match[0]
  }
  return trim(Object.keys(enumObject)[0])
}

const enumValue = (value: unknown) => trim(asObject(value).value ?? value)

const bitValue = (value: unknown, ...keys: string[]) => {
  const object = asObject(value)
  const bits = asObject(object.bits)
  return keys.some((key) => Boolean(bits[key] ?? object[key]))
}

const base = (
  envelope: any,
  patch: Omit<
    ParsedDomsResponse,
    'name' | 'subCode' | 'solicited' | 'correlationId' | 'raw'
  >,
): ParsedDomsResponse => ({
  name: String(envelope.name ?? ''),
  subCode: trim(envelope.subCode),
  solicited: envelope.solicited,
  correlationId: envelope.correlationId,
  raw: asObject(envelope.data),
  ...patch,
})

const ackParser =
  (family: ParsedDomsResponseFamily, summary: string): Parser =>
  (envelope) =>
    base(envelope, {
      family,
      status: 'ack',
      summary,
      normalized: {},
    })

const parseFcStatus: Parser = (envelope) => {
  const data = asObject(envelope.data)
  const flags1 = asObject(data.FcStatus1Flags)
  const flags2 = asObject(data.FcStatus2Flags)
  const normalized = {
    fallbackMode: bitValue(flags1, 'FallbackMode'),
    pumpTotalsReady: bitValue(flags1, 'PumpTotalsReady'),
    installationDataReceived: bitValue(flags1, 'InstallationDataReceived'),
    storedTransactionsDisabled: bitValue(flags1, 'OpWithStoredTransDisabled'),
    serviceMessageReady: bitValue(flags2, 'ServiceMsgReady'),
    unsolicitedStatusUpdateOn: bitValue(flags2, 'UnsolicitedStatusUpdateOn'),
    hardwareSoftwareIncompatibility: bitValue(
      flags2,
      'HwSwIncompatibilityWithinFc',
    ),
    rtcError: bitValue(flags2, 'RtcError'),
    backOfficeRecordExists: bitValue(flags2, 'BackOfficeRecordExists'),
  }
  const status =
    normalized.hardwareSoftwareIncompatibility || normalized.rtcError
      ? 'error'
      : normalized.fallbackMode ||
          normalized.serviceMessageReady ||
          normalized.backOfficeRecordExists
        ? 'warning'
        : 'ok'

  return base(envelope, {
    family: 'forecourt',
    entityType: 'forecourt-controller',
    status,
    summary:
      status === 'ok'
        ? 'Forecourt controller status is normal.'
        : 'Forecourt controller requires operator review.',
    normalized,
  })
}

const parseFcInstallStatus: Parser = (envelope) => {
  const data = asObject(envelope.data)
  return base(envelope, {
    family: 'forecourt',
    entityType: 'installation',
    status: 'ok',
    summary: 'Forecourt installation status snapshot received.',
    normalized: {
      installStatus: data,
      deviceGroups: Object.keys(data).filter((key) =>
        /list|status|devices/i.test(key),
      ),
    },
  })
}

const parsePosConnectionStatus: Parser = (envelope) => {
  const connections = asArray(asObject(envelope.data).Connections)
  const normalized = connections.map((connection) => ({
    posDeviceType:
      enumLabel(connection?.PosDeviceType) ??
      enumValue(connection?.PosDeviceType),
    connType:
      enumLabel(connection?.ConnType) ?? enumValue(connection?.ConnType),
    connAddress: connection?.ConnAddress,
    serverPortNo: connection?.ServerPortNo,
    online: bitValue(connection?.ConnStatus, 'online'),
    raw: connection,
  }))
  return base(envelope, {
    family: 'connection',
    entityType: 'pos-connection',
    status: normalized.some((entry) => entry.online) ? 'ok' : 'warning',
    summary: `${normalized.length} POS-side connection record(s) received.`,
    normalized: { connections: normalized },
  })
}

const parsePssPeripheralsStatus: Parser = (envelope) => {
  const peripherals = asArray(asObject(envelope.data).Peripherals)
  const normalized = peripherals.map((peripheral) => ({
    peripheralType:
      enumLabel(peripheral?.PeripheralType) ??
      enumValue(peripheral?.PeripheralType),
    connType:
      enumLabel(peripheral?.ConnType) ?? enumValue(peripheral?.ConnType),
    connAddress: peripheral?.ConnAddress,
    serverPortNo: peripheral?.ServerPortNo,
    online: bitValue(peripheral?.PeripheralStatus, 'is_online'),
    error: bitValue(peripheral?.PeripheralStatus, 'is_in_error_state'),
    warning: bitValue(peripheral?.PeripheralStatus, 'is_in_warning_state'),
    raw: peripheral,
  }))
  return base(envelope, {
    family: 'connection',
    entityType: 'pss-peripheral',
    status: normalized.some((entry) => entry.error)
      ? 'error'
      : normalized.some((entry) => entry.warning || entry.online === false)
        ? 'warning'
        : 'ok',
    summary: `${normalized.length} PSS peripheral record(s) received.`,
    normalized: { peripherals: normalized },
  })
}

const parsePumpStatus: Parser = (envelope) => {
  const normalized = normalizeFpStatusPayload(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'dispense',
    entityType: 'fuelling-point',
    entityId: normalized.fpId,
    status:
      normalized.flags?.isInErrorState || normalized.flags?.isEstopped
        ? 'error'
        : normalized.flags?.isOnline === false
          ? 'warning'
          : 'ok',
    summary: `Fuelling point ${normalized.fpId ?? 'unknown'} status ${normalized.mainState ?? 'unknown'}.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parsePumpInfo: Parser = (envelope) => {
  const normalized = normalizeFpInfoPayload(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'dispense',
    entityType: 'fuelling-point-info',
    entityId: normalized.fpId,
    status: 'ok',
    summary: `Fuelling point ${normalized.fpId ?? 'unknown'} information snapshot received.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parsePumpFuellingData: Parser = (envelope) => {
  const normalized = normalizeFpFuellingDataPayload(
    envelope.data,
    envelope.subCode,
  )
  return base(envelope, {
    family: 'dispense',
    entityType: 'fuelling-data',
    entityId: normalized.fpId,
    status: 'ok',
    summary: `Fuelling data for fuelling point ${normalized.fpId ?? 'unknown'} received.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parsePumpError: Parser = (envelope) => {
  const normalized = normalizeFpErrorPayload(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'dispense',
    entityType: 'fuelling-point-error',
    entityId: normalized.fpId,
    status: normalized.severity === 'warning' ? 'warning' : 'error',
    summary: `Fuelling point ${normalized.fpId ?? 'unknown'} error ${normalized.errorCode ?? normalized.errorName ?? 'unknown'}.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parseTankStatus: Parser = (envelope) => {
  const normalized = normalizeTgStatusPayload(envelope.data, envelope.subCode)
  const activeCount = Array.isArray(normalized.activeAlarms)
    ? normalized.activeAlarms.length
    : 0
  return base(envelope, {
    family: 'wetstock',
    entityType: 'tank-gauge',
    entityId: normalized.tgId,
    status: normalized.flags?.errorActive
      ? 'error'
      : normalized.flags?.alarmActive || activeCount > 0
        ? 'warning'
        : 'ok',
    summary: `Tank gauge ${normalized.tgId ?? 'unknown'} status ${normalized.mainState ?? 'unknown'}.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parseTankData: Parser = (envelope) => {
  const normalized = normalizeTgDataPayload(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'wetstock',
    entityType: 'tank-gauge-data',
    entityId: trim((normalized as any).tgId),
    status: 'ok',
    summary: `Tank gauge data for ${trim((normalized as any).tgId) ?? 'unknown'} received.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parseSiteDeliveryStatus: Parser = (envelope) => {
  const normalized = normalizeSiteDeliveryStatusPayload(
    envelope.data,
    envelope.subCode,
  )
  return base(envelope, {
    family: 'wetstock',
    entityType: 'site-delivery-status',
    status: normalized.readyTgIds?.length ? 'warning' : 'ok',
    summary: `${normalized.readyTgIds?.length ?? 0} tank delivery clear candidate(s) detected.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parseTankDeliveryData: Parser = (envelope) => {
  const normalized = normalizeTankDeliveryDataPayload(
    envelope.data,
    envelope.subCode,
  )
  return base(envelope, {
    family: 'wetstock',
    entityType: 'tank-delivery-data',
    entityId: normalized.tgId,
    status: normalized.clearTarget ? 'warning' : 'ok',
    summary: `Tank delivery data for tank gauge ${normalized.tgId ?? 'unknown'} received.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parsePricePoleStatus: Parser = (envelope) => {
  const normalized = normalizePpStatusPayload(envelope.data, envelope.subCode)
  const snapshot = normalizePricePoleSnapshot(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'price',
    entityType: 'price-pole',
    entityId: normalized.ppId,
    status:
      snapshot?.severity === 'error'
        ? 'error'
        : snapshot?.severity === 'warning'
          ? 'warning'
          : 'ok',
    summary: `Price pole ${normalized.ppId ?? 'unknown'} status ${normalized.mainState ?? 'unknown'}.`,
    normalized: { ...normalized, snapshot } as Record<string, unknown>,
  })
}

const parsePricePoleError: Parser = (envelope) => {
  const normalized = normalizePpErrorPayload(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'price',
    entityType: 'price-pole-error',
    entityId: normalized.ppId,
    status: 'error',
    summary: `Price pole ${normalized.ppId ?? 'unknown'} error ${normalized.errorCode ?? normalized.errorName ?? 'unknown'}.`,
    normalized: {
      ...normalized,
      error: normalizePricePoleError(envelope.data, envelope.subCode),
    } as Record<string, unknown>,
  })
}

const parseWashStatus: Parser = (envelope) => {
  const normalized = normalizeWashStatusPayload(envelope.data, envelope.subCode)
  const bufferEntries = normalizeJplWashStatusBuffer(
    envelope.data,
    envelope.subCode,
  )
  return base(envelope, {
    family: 'wash',
    entityType: 'wash-point',
    entityId: normalized.wpId,
    status:
      normalized.flags?.errorState || normalized.flags?.emergencyStopped
        ? 'error'
        : bufferEntries.length
          ? 'warning'
          : 'ok',
    summary: `Wash point ${normalized.wpId ?? 'unknown'} status ${normalized.mainState ?? 'unknown'}.`,
    normalized: { ...normalized, bufferEntries } as Record<string, unknown>,
  })
}

const parseWashTransaction: Parser = (envelope) => {
  const normalized = normalizeJplWashTransaction(
    envelope.data,
    envelope.subCode,
  )
  return base(envelope, {
    family: 'wash',
    entityType: 'wash-transaction',
    entityId: normalized.wpId,
    status: normalized.clearRequest ? 'warning' : 'error',
    summary: `Wash transaction ${normalized.transSeqNo ?? 'unknown'} for wash point ${normalized.wpId ?? 'unknown'} received.`,
    normalized: normalized as unknown as Record<string, unknown>,
  })
}

const parseWashError: Parser = (envelope) => {
  const normalized = normalizeWashErrorPayload(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'wash',
    entityType: 'wash-point-error',
    entityId: normalized.wpId,
    status: 'error',
    summary: `Wash point ${normalized.wpId ?? 'unknown'} error ${normalized.errorCode ?? normalized.errorName ?? 'unknown'}.`,
    normalized: normalized as Record<string, unknown>,
  })
}

const parseDigitalIoStatus: Parser = (envelope) => {
  const normalized = normalizeDigitalIoStatusPayload(
    envelope.data,
    envelope.subCode,
  )
  const snapshot = normalizeDigitalIoSnapshot(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'digital_io',
    entityType: 'digital-io-pin',
    entityId: normalized.diopId,
    status:
      snapshot?.severity === 'error'
        ? 'error'
        : snapshot?.severity === 'warning'
          ? 'warning'
          : 'ok',
    summary: `Digital I/O pin ${normalized.diopId ?? 'unknown'} status received.`,
    normalized: { ...normalized, snapshot } as Record<string, unknown>,
  })
}

const parseSensorStatus: Parser = (envelope) => {
  const normalized = normalizeSensorStatusPayload(
    envelope.data,
    envelope.subCode,
  )
  const snapshot = normalizeSensorSnapshot(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'sensor',
    entityType: 'sensor',
    entityId: normalized.sensorId,
    status:
      snapshot?.severity === 'error'
        ? 'error'
        : snapshot?.severity === 'warning'
          ? 'warning'
          : 'ok',
    summary: `Sensor ${normalized.sensorId ?? 'unknown'} status ${normalized.mainState ?? 'unknown'}.`,
    normalized: { ...normalized, snapshot } as Record<string, unknown>,
  })
}

const parseVendingStatus: Parser = (envelope) => {
  const normalized = normalizeVendingStatusPayload(
    envelope.data,
    envelope.subCode,
  )
  const snapshot = normalizeVendingSnapshot(envelope.data, envelope.subCode)
  return base(envelope, {
    family: 'vending',
    entityType: 'vending-machine',
    entityId: normalized.vmId,
    status:
      snapshot?.severity === 'error'
        ? 'error'
        : snapshot?.severity === 'warning'
          ? 'warning'
          : 'ok',
    summary: `Vending machine ${normalized.vmId ?? 'unknown'} status ${normalized.mainState ?? 'unknown'}.`,
    normalized: { ...normalized, snapshot } as Record<string, unknown>,
  })
}

const parseVendingError: Parser = (envelope) => {
  const normalized = normalizeVendingErrorPayload(
    envelope.data,
    envelope.subCode,
  )
  return base(envelope, {
    family: 'vending',
    entityType: 'vending-machine-error',
    entityId: normalized.vmId,
    status: 'error',
    summary: `Vending machine ${normalized.vmId ?? 'unknown'} error ${normalized.errorCode ?? normalized.errorName ?? 'unknown'}.`,
    normalized: {
      ...normalized,
      error: normalizeVendingError(envelope.data, envelope.subCode),
    } as Record<string, unknown>,
  })
}

const parseVendingTotals: Parser = (envelope) => {
  const totals = normalizeVendingTotals(envelope.data)
  return base(envelope, {
    family: 'vending',
    entityType: 'vending-totals',
    entityId: totals?.vmId,
    status: totals ? 'ok' : 'empty',
    summary: totals
      ? `Vending totals for machine ${totals.vmId} received.`
      : 'Empty vending totals response received.',
    normalized: { totals } as Record<string, unknown>,
  })
}

const parseServiceMessage: Parser = (envelope, context) => {
  const data = asObject(envelope.data)
  const record = normalizeDomsServiceMessageRecord({
    stationId: context.stationId ?? 'unknown',
    seqNo: data.FcServiceMsgSeqNo,
    message: data.FcServiceMsg,
    payload: data,
  })
  return base(envelope, {
    family: 'special_record',
    entityType: 'fc-service-message',
    entityId: record.seqNo,
    status: record.message ? 'warning' : 'empty',
    summary: record.message
      ? `Forecourt service message ${record.seqNo ?? 'unknown'} received.`
      : 'Empty forecourt service message response received.',
    normalized: record as unknown as Record<string, unknown>,
  })
}

const parseBackOfficeRecord: Parser = (envelope, context) => {
  const record = normalizeDomsBackOfficeRecord({
    stationId: context.stationId ?? 'unknown',
    subCode: envelope.subCode ?? '00H',
    payload: asObject(envelope.data),
  })
  const empty = isEmptyDomsBackOfficeRecord(record)
  return base(envelope, {
    family: 'special_record',
    entityType: 'back-office-record',
    entityId: record.seqNo,
    status: empty ? 'empty' : 'warning',
    summary: empty
      ? 'No Back Office Record is currently available.'
      : `Back Office Record ${record.seqNo ?? 'unknown'} (${record.formatId ?? 'unknown format'}) received.`,
    normalized: { ...record, empty } as unknown as Record<string, unknown>,
  })
}

const parseReject: Parser = (envelope) => {
  const reject = mapRejectEnvelope(envelope)
  return base(envelope, {
    family: 'reject',
    entityType: 'jpl-reject',
    status: 'error',
    summary:
      reject.rejectInfo ||
      `JPL reject ${reject.rejectCode ?? 'unknown'} received.`,
    normalized: reject as Record<string, unknown>,
  })
}

const responseParsers: Record<string, Parser> = {
  jpl: (envelope) =>
    base(envelope, {
      family: 'connection',
      entityType: 'jpl-welcome',
      status: 'ok',
      summary: `JPL welcome/version ${trim(envelope.data?.version) ?? 'unknown'} received.`,
      normalized: { version: trim(envelope.data?.version) },
    }),
  heartbeat: (envelope) =>
    base(envelope, {
      family: 'connection',
      entityType: 'heartbeat',
      status: 'ok',
      summary: 'JPL heartbeat received.',
      normalized: {},
    }),
  RejectMessage_resp: parseReject,
  FcStatus_resp: parseFcStatus,
  FcInstallStatus_resp: parseFcInstallStatus,
  FcPriceSetStatus_resp: (envelope) =>
    base(envelope, {
      family: 'price',
      entityType: 'price-set-status',
      status: 'ok',
      summary: 'Forecourt price-set status received.',
      normalized: asObject(envelope.data),
    }),
  FcOperationModeStatus_resp: (envelope) =>
    base(envelope, {
      family: 'forecourt',
      entityType: 'operation-mode',
      status: 'ok',
      summary: 'Forecourt operation mode status received.',
      normalized: asObject(envelope.data),
    }),
  PosConnectionStatus_resp: parsePosConnectionStatus,
  PssPeripheralsStatus_resp: parsePssPeripheralsStatus,
  FpStatus_resp: parsePumpStatus,
  FpInfo_resp: parsePumpInfo,
  FpFuellingData_resp: parsePumpFuellingData,
  FpErrorMsg_resp: parsePumpError,
  FpGradeTotals_resp: (envelope) =>
    base(envelope, {
      family: 'dispense',
      entityType: 'fuelling-point-grade-totals',
      entityId: trim(envelope.data?.FpId),
      status: 'ok',
      summary: `Fuelling point ${trim(envelope.data?.FpId) ?? 'unknown'} grade totals received.`,
      normalized: asObject(envelope.data),
    }),
  PumpGradeTotals_resp: (envelope) =>
    base(envelope, {
      family: 'dispense',
      entityType: 'pump-grade-totals',
      entityId: trim(envelope.data?.FpId),
      status: 'ok',
      summary: `Pump grade totals for ${trim(envelope.data?.FpId) ?? 'unknown'} received.`,
      normalized: asObject(envelope.data),
    }),
  PumpGradeBlendTotals_resp: (envelope) =>
    base(envelope, {
      family: 'dispense',
      entityType: 'pump-grade-blend-totals',
      entityId: trim(envelope.data?.FpId),
      status: 'ok',
      summary: `Pump blend totals for ${trim(envelope.data?.FpId) ?? 'unknown'} received.`,
      normalized: asObject(envelope.data),
    }),
  FbTotals_resp: (envelope) =>
    base(envelope, {
      family: 'dispense',
      entityType: 'fallback-totals',
      entityId: trim(envelope.data?.FpId),
      status: 'warning',
      summary: `Fallback totals for ${trim(envelope.data?.FpId) ?? 'unknown'} received.`,
      normalized: asObject(envelope.data),
    }),
  FpSupTrans_resp: (envelope) =>
    base(envelope, {
      family: 'dispense',
      entityType: 'supervised-transaction',
      entityId: trim(envelope.data?.FpId),
      status: 'warning',
      summary: `Supervised transaction ${trim(envelope.data?.TransSeqNo) ?? 'unknown'} received.`,
      normalized: asObject(envelope.data),
    }),
  FpUnSupTrans_resp: (envelope) =>
    base(envelope, {
      family: 'dispense',
      entityType: 'unsupervised-transaction',
      entityId: trim(envelope.data?.FpId),
      status: 'warning',
      summary: `Unsupervised transaction ${trim(envelope.data?.TransSeqNo) ?? 'unknown'} received.`,
      normalized: asObject(envelope.data),
    }),
  TgStatus_resp: parseTankStatus,
  TgData_resp: parseTankData,
  TankControlStatus_resp: (envelope) =>
    base(envelope, {
      family: 'wetstock',
      entityType: 'tank-control-status',
      entityId: trim(envelope.data?.TankId),
      status: 'ok',
      summary: 'Tank control status received.',
      normalized: asObject(envelope.data),
    }),
  SiteDeliveryStatus_resp: parseSiteDeliveryStatus,
  TankDeliveryData_resp: parseTankDeliveryData,
  PpStatus_resp: parsePricePoleStatus,
  PpErrorMsg_resp: parsePricePoleError,
  WpStatus_resp: parseWashStatus,
  WpUnSupTrans_resp: parseWashTransaction,
  WpErrorMsg_resp: parseWashError,
  DiopStatus_resp: parseDigitalIoStatus,
  SensorStatus_resp: parseSensorStatus,
  VmStatus_resp: parseVendingStatus,
  VmDrystockTotals_resp: parseVendingTotals,
  VmErrorMsg_resp: parseVendingError,
  FcServiceMsg_resp: parseServiceMessage,
  BackOfficeRecord_resp: parseBackOfficeRecord,
  ClientData_resp: (envelope) =>
    base(envelope, {
      family: 'client_backup',
      entityType: 'client-data',
      status: 'ok',
      summary: `${asArray(envelope.data?.ClientData).length} client-data byte(s) received.`,
      normalized: asObject(envelope.data),
    }),
}

const ackResponseNames = [
  'open_Fp_resp',
  'close_Fp_resp',
  'authorize_Fp_resp',
  'prepare_Trans_resp',
  'cancel_FpAuth_resp',
  'estop_Fp_resp',
  'cancel_FpEstop_resp',
  'reset_Fp_resp',
  'clear_FpError_resp',
  'unlock_FpSupTrans_resp',
  'clear_FpSupTrans_resp',
  'unlock_FpUnSupTrans_resp',
  'clear_FpUnSupTrans_resp',
  'open_TankController_resp',
  'close_TankController_resp',
  'block_Tank_resp',
  'unblock_Tank_resp',
  'start_DeliveryProcess_resp',
  'stop_DeliveryProcess_resp',
  'mark_DeliveryStarting_resp',
  'mark_DeliveryFinished_resp',
  'clear_TankDeliveryData_resp',
  'clear_TgError_resp',
  'reset_Tg_resp',
  'change_DynamicTankData_resp',
  'open_Pp_resp',
  'close_Pp_resp',
  'clear_PpError_resp',
  'reset_Pp_resp',
  'prepare_WpAuth_resp',
  'authorize_Wp_resp',
  'cancel_WpAuth_resp',
  'stop_Wp_resp',
  'cancel_WpStop_resp',
  'clear_WpError_resp',
  'reset_Wp_resp',
  'unlock_WpUnSupTrans_resp',
  'clear_WpUnSupTrans_resp',
  'change_DiopOutput_resp',
  'open_Vm_resp',
  'close_Vm_resp',
  'clear_VmError_resp',
  'reset_Vm_resp',
  'change_FcDateAndTime_resp',
  'change_FcOperationModeNo_resp',
  'change_FcStatusUpdateMode_resp',
  'clear_FcServiceMsg_resp',
  'store_BackOfficeRecord_resp',
  'clear_BackOfficeRecord_resp',
  'store_ClientData_resp',
]

for (const name of ackResponseNames) {
  responseParsers[name] = ackParser(
    name.includes('Tank') || name.includes('Tg')
      ? 'wetstock'
      : name.includes('Wp')
        ? 'wash'
        : name.includes('Pp') || name.includes('Price')
          ? 'price'
          : name.includes('Vm')
            ? 'vending'
            : name.includes('Diop')
              ? 'digital_io'
              : name.includes('BackOffice') || name.includes('Service')
                ? 'special_record'
                : name.includes('ClientData')
                  ? 'client_backup'
                  : 'dispense',
    `${name.replace(/_resp$/, '')} acknowledged by DOMS/PSS.`,
  )
}

export const supportedJplResponseNames = () =>
  Object.keys(responseParsers).sort((a, b) => a.localeCompare(b))

export const parseDomsJplResponse = (
  message: unknown,
  context: ParserContext = {},
): ParsedDomsResponse => {
  const envelope = normalizeJplInboundEnvelope(message)

  if (envelope.name === 'MultiMessage_resp') {
    const children = asArray(envelope.data?.messages).map((entry) =>
      parseDomsJplResponse(entry, context),
    )
    const worst = children.some((child) => child.status === 'error')
      ? 'error'
      : children.some((child) => child.status === 'warning')
        ? 'warning'
        : children.some((child) => child.status === 'empty')
          ? 'empty'
          : 'ok'
    return base(envelope, {
      family: children[0]?.family ?? 'unknown',
      entityType: 'multi-message',
      status: worst,
      summary: `${children.length} DOMS/JPL child message(s) parsed from MultiMessage_resp.`,
      normalized: {
        childCount: children.length,
        childNames: children.map((child) => child.name),
        status: worst,
      },
      children,
    })
  }

  const parser = responseParsers[envelope.name]
  if (parser) return parser(envelope, context)

  return base(envelope, {
    family: 'unknown',
    status: 'unknown',
    summary: `No typed parser is registered for ${envelope.name}.`,
    normalized: asObject(envelope.data),
  })
}

export const parseDomsJplResponses = (
  messages: unknown[],
  context: ParserContext = {},
) => messages.map((message) => parseDomsJplResponse(message, context))

export const summarizeParsedDomsResponses = (
  responses: ParsedDomsResponse[],
) => {
  const flattened = responses.flatMap(
    (response) => response.children ?? [response],
  )
  const byStatus = flattened.reduce<Record<string, number>>((acc, response) => {
    acc[response.status] = (acc[response.status] ?? 0) + 1
    return acc
  }, {})
  const byFamily = flattened.reduce<Record<string, number>>((acc, response) => {
    acc[response.family] = (acc[response.family] ?? 0) + 1
    return acc
  }, {})

  return {
    total: flattened.length,
    byStatus,
    byFamily,
    errors: flattened.filter((response) => response.status === 'error'),
    warnings: flattened.filter((response) => response.status === 'warning'),
  }
}
