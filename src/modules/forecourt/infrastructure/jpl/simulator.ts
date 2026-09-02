import { readFileSync } from 'node:fs'
import * as net from 'node:net'
import * as tls from 'node:tls'

import {
  JPL_ETX,
  JPL_STX,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/framing'

type JsonObject = Record<string, unknown>

export type DomsJplSimulatorScenario =
  | 'minimal'
  | 'readiness'
  | 'transaction-recovery'
  | 'wetstock'
  | 'optional-modules'
  | 'full'

export type DomsJplSimulatorEnvelope = {
  name: string
  subCode: string
  data: JsonObject
  solicited?: boolean
  correlationId?: unknown
}

export type DomsJplSimulatorConfig = {
  host?: string
  port?: number
  secure?: boolean
  tlsCertPath?: string
  tlsKeyPath?: string
  scenario?: DomsJplSimulatorScenario
  heartbeatMs?: number
  heartbeatsEnabled?: boolean
  welcomeVersion?: string
  fcCount?: number
  tankCount?: number
  pricePoleCount?: number
  washPointCount?: number
  sensorCount?: number
  vendingCount?: number
  posId?: string
  countryCode?: string
  verbose?: boolean
  echoCorrelationId?: boolean
}

export type DomsJplDecodedFrame = {
  message: DomsJplSimulatorEnvelope | null
  error?: string
  raw: Buffer<ArrayBufferLike>
}

export type DomsJplFrameExtraction = {
  frames: DomsJplDecodedFrame[]
  remainder: Buffer<ArrayBufferLike>
}

type SimulatorSocket = net.Socket | tls.TLSSocket

type SimulatorTransaction = {
  fpId: string
  posId: string
  transSeqNo: string
  transPars: JsonObject
  money: string
  vol: string
}

type SimulatorWashTransaction = {
  wpId: string
  posId: string
  transSeqNo: string
  money: string
  transPars: JsonObject
}

type SimulatorBackOfficeRecord = {
  borSeqNo: string
  borFormatId: string
  borData: string
}

type SimulatorServiceMessage = {
  fcServiceMsgSeqNo: string
  fcServiceMsg: string
}

type SimulatorState = {
  serviceMessages: SimulatorServiceMessage[]
  backOfficeRecords: SimulatorBackOfficeRecord[]
  supervisedTransactions: SimulatorTransaction[]
  unsupervisedTransactions: SimulatorTransaction[]
  washTransactions: SimulatorWashTransaction[]
  deliveryReports: Array<{ tgId: string; tankDeliverySeqNo: string }>
}

const DEFAULT_WELCOME_VERSION = '470-02-1.07'
const DEFAULT_COUNTRY_CODE = '0710'
const DEFAULT_HEARTBEAT_MS = 20_000

const pad2 = (value: unknown, fallback = '01') => {
  const raw = String(value ?? '').trim()
  const selected = raw || fallback
  const numeric = Number(selected)
  if (!Number.isFinite(numeric)) return selected.padStart(2, '0').slice(-2)
  return String(Math.trunc(numeric)).padStart(2, '0')
}

const coerceCount = (value: unknown, fallback: number, max = 99) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

const rangeIds = (count: number) =>
  Array.from({ length: Math.max(0, count) }, (_, index) => pad2(index + 1))

const withSolicited = (
  request: DomsJplSimulatorEnvelope | undefined,
  response: Omit<DomsJplSimulatorEnvelope, 'solicited'>,
): DomsJplSimulatorEnvelope => ({
  ...response,
  solicited: true,
  ...(request?.correlationId !== undefined
    ? { correlationId: request.correlationId }
    : {}),
})

const enumValue = (label: string, value: string | number) => ({
  enum: { [label]: value },
  value,
})

const bitFlags = (value: number, bits: Record<string, number>) => ({
  value,
  bits,
})

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const OPERATIONAL_ACK_REQUESTS = new Set([
  'change_FcDateAndTime_req',
  'change_FcStatusUpdateMode_req',
  'change_FcPriceSet_req',
  'activate_FcPriceSet_req',
  'change_FcOperationMode_req',
  'open_Fp_req',
  'close_Fp_req',
  'authorize_Fp_req',
  'authorize_FpPreset_req',
  'authorize_FpExt_req',
  'prepare_FpExtTrans_req',
  'cancel_FpAuth_req',
  'stop_Fp_req',
  'reset_Fp_req',
  'change_FpOperationModeSet_req',
  'clear_FpError_req',
  'open_TankControl_req',
  'close_TankControl_req',
  'start_TankDelivery_req',
  'stop_TankDelivery_req',
  'block_Tank_req',
  'unblock_Tank_req',
  'clear_TankDeliveryData_req',
  'clear_TgError_req',
  'reset_Tg_req',
  'change_DynamicTankData_req',
  'open_Pp_req',
  'close_Pp_req',
  'reset_Pp_req',
  'clear_PpError_req',
  'open_Wp_req',
  'close_Wp_req',
  'prepare_authorize_Wp_req',
  'authorize_Wp_req',
  'cancel_WpAuth_req',
  'stop_Wp_req',
  'resume_Wp_req',
  'clear_WpError_req',
  'reset_Wp_req',
  'open_Vm_req',
  'close_Vm_req',
  'clear_VmError_req',
  'reset_Vm_req',
  'install_Dispenser_req',
  'install_Fp_req',
  'install_Tg_req',
  'install_Pp_req',
  'install_Wp_req',
  'install_Diop_req',
  'install_Sensor_req',
  'install_Vm_req',
  'clear_InstallData_req',
])

export const encodeDomsJplFrame = (
  message: DomsJplSimulatorEnvelope,
): Buffer<ArrayBufferLike> =>
  Buffer.concat([
    Buffer.from([JPL_STX]),
    Buffer.from(JSON.stringify(message), 'utf8'),
    Buffer.from([JPL_ETX]),
  ])

export const extractDomsJplFrames = (
  buffer: Buffer<ArrayBufferLike>,
): DomsJplFrameExtraction => {
  const frames: DomsJplDecodedFrame[] = []
  let cursor = 0

  while (cursor < buffer.length) {
    const stx = buffer.indexOf(JPL_STX, cursor)
    if (stx < 0) {
      return { frames, remainder: Buffer.alloc(0) }
    }

    const etx = buffer.indexOf(JPL_ETX, stx + 1)
    if (etx < 0) {
      return { frames, remainder: buffer.subarray(stx) }
    }

    const raw = buffer.subarray(stx, etx + 1)
    const jsonText = buffer.subarray(stx + 1, etx).toString('utf8')
    try {
      const parsed = JSON.parse(jsonText)
      const name = String(parsed?.name ?? '').trim()
      const subCode = String(parsed?.subCode ?? '').trim()
      const data = parsed?.data
      if (!name || !subCode || !data || typeof data !== 'object') {
        frames.push({
          message: null,
          error: 'JPL frame JSON is missing name, subCode, or data object',
          raw,
        })
      } else {
        frames.push({
          message: {
            name,
            subCode,
            data,
            ...(typeof parsed.solicited === 'boolean'
              ? { solicited: parsed.solicited }
              : {}),
            ...(parsed.correlationId !== undefined
              ? { correlationId: parsed.correlationId }
              : {}),
          },
          raw,
        })
      }
    } catch (err) {
      frames.push({
        message: null,
        error: err instanceof Error ? err.message : 'Invalid JPL frame JSON',
        raw,
      })
    }

    cursor = etx + 1
  }

  return { frames, remainder: Buffer.alloc(0) }
}

const defaultServiceMessages = (): SimulatorServiceMessage[] => [
  {
    fcServiceMsgSeqNo: '01',
    fcServiceMsg: '20260709 143000 04 02 POS connection offline recovered',
  },
]

const defaultBackOfficeRecords = (): SimulatorBackOfficeRecord[] => [
  {
    borSeqNo: '01',
    borFormatId: '51',
    borData:
      '<bor><type>client_store_format</type><amount>36328</amount></bor>',
  },
]

const defaultSupervisedTransactions = (): SimulatorTransaction[] => [
  {
    fpId: '01',
    posId: '01',
    transSeqNo: '0201',
    money: '0000036328',
    vol: '0000003040',
    transPars: {
      FcGradeId: '01',
      Price_e: '001195',
      Vol_e: '0000003040',
      Money_e: '0000036328',
    },
  },
]

const defaultUnsupervisedTransactions = (): SimulatorTransaction[] => [
  {
    fpId: '02',
    posId: '00',
    transSeqNo: '0301',
    money: '0000025000',
    vol: '0000002100',
    transPars: {
      FcGradeId: '02',
      Price_e: '001190',
      Vol_e: '0000002100',
      Money_e: '0000025000',
      EptId: '01',
      EptSeqNo: '0009',
      EptReceiptNo: '123456',
      MaskedPan: '411111******1111',
      CardLabel: 'VISA',
    },
  },
]

const defaultWashTransactions = (): SimulatorWashTransaction[] => [
  {
    wpId: '01',
    posId: '00',
    transSeqNo: '0401',
    money: '0000009500',
    transPars: {
      WpWashProgramId: '01',
      Money: '0000009500',
      WpTerminationStatus: enumValue('normal', '00H'),
    },
  },
]

const buildState = (scenario: DomsJplSimulatorScenario): SimulatorState => ({
  serviceMessages: scenario === 'minimal' ? [] : defaultServiceMessages(),
  backOfficeRecords: scenario === 'minimal' ? [] : defaultBackOfficeRecords(),
  supervisedTransactions:
    scenario === 'transaction-recovery' || scenario === 'full'
      ? defaultSupervisedTransactions()
      : [],
  unsupervisedTransactions:
    scenario === 'transaction-recovery' || scenario === 'full'
      ? defaultUnsupervisedTransactions()
      : [],
  washTransactions: scenario === 'full' ? defaultWashTransactions() : [],
  deliveryReports:
    scenario === 'wetstock' || scenario === 'full'
      ? [{ tgId: '01', tankDeliverySeqNo: '01' }]
      : [],
})

const normalizeConfig = (
  config: DomsJplSimulatorConfig = {},
): Required<
  Pick<
    DomsJplSimulatorConfig,
    | 'host'
    | 'port'
    | 'secure'
    | 'scenario'
    | 'heartbeatMs'
    | 'heartbeatsEnabled'
    | 'welcomeVersion'
    | 'fcCount'
    | 'tankCount'
    | 'pricePoleCount'
    | 'washPointCount'
    | 'sensorCount'
    | 'vendingCount'
    | 'posId'
    | 'countryCode'
    | 'verbose'
    | 'echoCorrelationId'
  >
> &
  Pick<DomsJplSimulatorConfig, 'tlsCertPath' | 'tlsKeyPath'> => {
  const scenario = config.scenario ?? 'full'
  return {
    host: config.host ?? '127.0.0.1',
    port: coerceCount(config.port, config.secure ? 8889 : 8888, 65535),
    secure: config.secure ?? false,
    tlsCertPath: config.tlsCertPath,
    tlsKeyPath: config.tlsKeyPath,
    scenario,
    heartbeatMs: Math.max(
      1,
      coerceCount(config.heartbeatMs, DEFAULT_HEARTBEAT_MS, 300_000),
    ),
    heartbeatsEnabled: config.heartbeatsEnabled ?? true,
    welcomeVersion: config.welcomeVersion ?? DEFAULT_WELCOME_VERSION,
    fcCount: coerceCount(config.fcCount, 2),
    tankCount: coerceCount(config.tankCount, scenario === 'minimal' ? 0 : 2),
    pricePoleCount: coerceCount(
      config.pricePoleCount,
      scenario === 'optional-modules' || scenario === 'full' ? 1 : 0,
    ),
    washPointCount: coerceCount(
      config.washPointCount,
      scenario === 'optional-modules' || scenario === 'full' ? 1 : 0,
    ),
    sensorCount: coerceCount(
      config.sensorCount,
      scenario === 'optional-modules' || scenario === 'full' ? 1 : 0,
    ),
    vendingCount: coerceCount(
      config.vendingCount,
      scenario === 'optional-modules' || scenario === 'full' ? 1 : 0,
    ),
    posId: pad2(config.posId ?? '01'),
    countryCode: String(config.countryCode ?? DEFAULT_COUNTRY_CODE),
    verbose: config.verbose ?? false,
    echoCorrelationId: config.echoCorrelationId ?? true,
  }
}

export class DomsJplSimulatorResponder {
  readonly config: ReturnType<typeof normalizeConfig>
  private readonly state: SimulatorState

  constructor(config: DomsJplSimulatorConfig = {}) {
    this.config = normalizeConfig(config)
    this.state = buildState(this.config.scenario)
  }

  welcome(): DomsJplSimulatorEnvelope {
    return {
      name: 'jpl',
      subCode: '00H',
      solicited: false,
      data: { version: this.config.welcomeVersion },
    }
  }

  heartbeat(): DomsJplSimulatorEnvelope {
    return {
      name: 'heartbeat',
      subCode: '00H',
      solicited: false,
      data: {},
    }
  }

  reject(
    request: DomsJplSimulatorEnvelope | undefined,
    reason: string,
    rejectValue = '01H',
  ): DomsJplSimulatorEnvelope {
    return withSolicited(request, {
      name: 'RejectMessage_resp',
      subCode: '01H',
      data: {
        RejectedExtendedMsgCode: '0000H',
        RejectedMsgSubc: request?.subCode ?? '00H',
        RejectCode: {
          enum: {
            unknown_MsgCode: '01H',
            syntax_error: '02H',
            access_error: '03H',
          },
          value: rejectValue,
        },
        RejectInfo: rejectValue,
        RejectInfoText: reason,
      },
    })
  }

  handleRequest(request: DomsJplSimulatorEnvelope): DomsJplSimulatorEnvelope[] {
    const data = request.data ?? {}
    const name = request.name

    if (name === 'heartbeat') return []
    if (name === 'FcLogon_req') return this.handleLogon(request)
    if (name === 'UtilEcho_req') {
      return [
        withSolicited(request, {
          name: 'UtilEcho_resp',
          subCode: request.subCode || '00H',
          data: { EchoData: data.EchoData ?? [] },
        }),
      ]
    }

    const direct = this.handleDirectStatusRequest(request)
    if (direct) return direct

    const transaction = this.handleTransactionRequest(request)
    if (transaction) return transaction

    const special = this.handleSpecialRecordRequest(request)
    if (special) return special

    const writeAck = this.handleOperationalAck(request)
    if (writeAck) return [writeAck]

    return [this.reject(request, `Unsupported simulator request: ${name}`)]
  }

  startupUnsolicited(): DomsJplSimulatorEnvelope[] {
    const messages: DomsJplSimulatorEnvelope[] = [
      this.fcStatus(false),
      this.multiFpStatus(false),
    ]

    if (this.config.tankCount > 0) {
      messages.push(
        this.multiTgStatus(false),
        this.tankControlStatus('00'),
        this.siteDeliveryStatus(false),
      )
    }
    if (this.config.pricePoleCount > 0) {
      messages.push(
        ...rangeIds(this.config.pricePoleCount).map((id) =>
          this.ppStatus(id, false),
        ),
      )
    }
    if (this.config.washPointCount > 0) {
      messages.push(
        ...rangeIds(this.config.washPointCount).map((id) =>
          this.wpStatus(id, false),
        ),
      )
    }
    if (this.config.sensorCount > 0) {
      messages.push(
        ...rangeIds(this.config.sensorCount).map((id) =>
          this.sensorStatus(id, false),
        ),
      )
    }
    if (this.config.vendingCount > 0) {
      messages.push(
        ...rangeIds(this.config.vendingCount).map((id) =>
          this.vmStatus(id, false),
        ),
      )
    }

    return messages
  }

  private handleLogon(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope[] {
    return [
      withSolicited(request, {
        name: 'FcLogon_resp',
        subCode: request.subCode || '00H',
        data: {
          CountryCode: this.config.countryCode,
          FcHwType: 1,
          FcHwVersionNo: '00000001',
          FcSwType: 1,
          FcSwVersionNo: '00000001',
          FcSwDate: '20260709',
          FcSwBlocks: [
            {
              FcSwMainBlockId: '01',
              FcSwSubBlockId: '01',
              FcSwBlockReleaseNo: '0001',
              FcSwBlockCheckCode: '0001H',
            },
          ],
          UnsolMessages: [
            { ExtMsgCode: '0010H', MsgSubc: '03H' },
            { ExtMsgCode: '0040H', MsgSubc: '02H' },
            { ExtMsgCode: '0001H', MsgSubc: '00H' },
          ],
        },
      }),
      ...this.startupUnsolicited(),
    ]
  }

  private handleDirectStatusRequest(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope[] | null {
    const data = request.data ?? {}
    switch (request.name) {
      case 'FcStatus_req':
        return [this.fcStatus(true, request)]
      case 'FcInstallStatus_req':
        return [this.fcInstallStatus(request)]
      case 'PosConnectionStatus_req':
        return [this.posConnectionStatus(request)]
      case 'PssPeripheralsStatus_req':
        return [this.pssPeripheralStatus(request)]
      case 'FpStatus_req': {
        const fpId = pad2(data.FpId, '00')
        return fpId === '00'
          ? [this.multiFpStatus(true, request)]
          : [this.fpStatus(fpId, true, request)]
      }
      case 'FpInfo_req':
        return [this.fpInfo(pad2(data.FpId), request)]
      case 'FpFuellingData_req':
        return [this.fpFuellingData(pad2(data.FpId), request)]
      case 'FpErrorMsg_req':
        return [this.fpError(pad2(data.FpId), request)]
      case 'TgStatus_req': {
        const tgId = pad2(data.TgId, '00')
        return tgId === '00'
          ? [this.multiTgStatus(true, request)]
          : [this.tgStatus(tgId, true, request)]
      }
      case 'TgData_req':
        return [this.tgData(pad2(data.TgId), request)]
      case 'TgErrorMsg_req':
        return [this.tgError(pad2(data.TgId), request)]
      case 'TankControlStatus_req':
        return [this.tankControlStatus(pad2(data.TankId, '00'), request)]
      case 'SiteDeliveryStatus_req':
        return [this.siteDeliveryStatus(true, request)]
      case 'TankDeliveryData_req':
        return [this.tankDeliveryData(pad2(data.TgId), request)]
      case 'PpStatus_req':
        return [this.ppStatus(pad2(data.PpId), true, request)]
      case 'PpErrorMsg_req':
        return [this.ppError(pad2(data.PpId), request)]
      case 'WpStatus_req':
        return [this.wpStatus(pad2(data.WpId), true, request)]
      case 'WpErrorMsg_req':
        return [this.wpError(pad2(data.WpId), request)]
      case 'DiopStatus_req':
        return [this.diopStatus(pad2(data.DiopId), request)]
      case 'SensorStatus_req':
        return [this.sensorStatus(pad2(data.SensorId), true, request)]
      case 'VmStatus_req':
        return [this.vmStatus(pad2(data.VmId), true, request)]
      case 'VmErrorMsg_req':
        return [this.vmError(pad2(data.VmId), request)]
      case 'VmDrystockTotals_req':
        return [this.vmTotals(pad2(data.VmId), request)]
      case 'FcDateAndTime_req':
        return [
          withSolicited(request, {
            name: 'FcDateAndTime_resp',
            subCode: '00H',
            data: {
              FcDateAndTime: '20260709143000',
              LastDateAndTimeSetting: '20260709140000',
            },
          }),
        ]
      case 'FcOperationModeStatus_req':
        return [
          withSolicited(request, {
            name: 'FcOperationModeStatus_resp',
            subCode: '00H',
            data: { FcOperationModeNo: 0 },
          }),
        ]
      case 'FcPriceSetStatus_req':
        return [
          withSolicited(request, {
            name: 'FcPriceSetStatus_resp',
            subCode: request.subCode || '01H',
            data: { FcPriceSetStatus: enumValue('NoPendingPriceSet', '00H') },
          }),
        ]
      default:
        return null
    }
  }

  private handleTransactionRequest(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope[] | null {
    const data = request.data ?? {}
    if (request.name === 'FpSupTrans_req') {
      const fpId = pad2(data.FpId)
      const transaction =
        this.state.supervisedTransactions.find(
          (entry) => entry.fpId === fpId,
        ) ?? this.state.supervisedTransactions[0]
      return [this.fpTransaction('FpSupTrans_resp', transaction, request)]
    }

    if (request.name === 'FpUnSupTrans_req') {
      const fpId = pad2(data.FpId)
      const transaction =
        this.state.unsupervisedTransactions.find(
          (entry) => entry.fpId === fpId,
        ) ?? this.state.unsupervisedTransactions[0]
      return [this.fpTransaction('FpUnSupTrans_resp', transaction, request)]
    }

    if (request.name === 'WpUnSupTrans_req') {
      const wpId = pad2(data.WpId)
      const transaction =
        this.state.washTransactions.find((entry) => entry.wpId === wpId) ??
        this.state.washTransactions[0]
      if (!transaction) {
        return [
          withSolicited(request, {
            name: 'WpUnSupTrans_resp',
            subCode: '00H',
            data: { WpId: wpId, TransSeqNo: '0000', TransPars: {} },
          }),
        ]
      }
      return [
        withSolicited(request, {
          name: 'WpUnSupTrans_resp',
          subCode: '00H',
          data: {
            WpId: transaction.wpId,
            PosId: transaction.posId,
            TransSeqNo: transaction.transSeqNo,
            Money: transaction.money,
            TransPars: clone(transaction.transPars),
          },
        }),
      ]
    }

    if (
      request.name === 'clear_FpSupTrans_req' ||
      request.name === 'clear_FpUnSupTrans_req' ||
      request.name === 'unlock_FpSupTrans_req' ||
      request.name === 'unlock_FpUnSupTrans_req'
    ) {
      return [
        withSolicited(request, {
          name: request.name.replace('_req', '_resp'),
          subCode: request.subCode || '00H',
          data: { FpId: pad2(data.FpId) },
        }),
      ]
    }

    if (
      request.name === 'clear_WpUnSupTrans_req' ||
      request.name === 'unlock_WpUnSupTrans_req'
    ) {
      return [
        withSolicited(request, {
          name: request.name.replace('_req', '_resp'),
          subCode: request.subCode || '00H',
          data: { WpId: pad2(data.WpId) },
        }),
      ]
    }

    return null
  }

  private handleSpecialRecordRequest(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope[] | null {
    const data = request.data ?? {}
    if (request.name === 'FcServiceMsg_req') {
      const next = this.state.serviceMessages[0]
      return [
        withSolicited(request, {
          name: 'FcServiceMsg_resp',
          subCode: '00H',
          data: next
            ? {
                FcServiceMsgSeqNo: next.fcServiceMsgSeqNo,
                FcServiceMsg: next.fcServiceMsg,
              }
            : { FcServiceMsgSeqNo: '00', FcServiceMsg: '' },
        }),
      ]
    }

    if (request.name === 'clear_FcServiceMsg_req') {
      const seq = pad2(data.FcServiceMsgSeqNo, '00')
      this.state.serviceMessages.splice(
        0,
        this.state.serviceMessages.filter(
          (entry) => Number(entry.fcServiceMsgSeqNo) <= Number(seq),
        ).length,
      )
      return [
        withSolicited(request, {
          name: 'clear_FcServiceMsg_resp',
          subCode: '00H',
          data: {
            FcServiceLogStatus: bitFlags(
              this.state.serviceMessages.length ? 1 : 0,
              this.state.serviceMessages.length
                ? { ServiceMessageReady: 1 }
                : {},
            ),
          },
        }),
      ]
    }

    if (request.name === 'BackOfficeRecord_req') {
      const next = this.state.backOfficeRecords[0]
      return [
        withSolicited(request, {
          name: 'BackOfficeRecord_resp',
          subCode: request.subCode || '02H',
          data: next
            ? {
                BorSeqNo: next.borSeqNo,
                BorFormatId: enumValue('Client_store_format', next.borFormatId),
                BorData: next.borData,
              }
            : {
                BorSeqNo: '00',
                BorFormatId: enumValue('Client_store_format', '51'),
                BorData: '',
              },
        }),
      ]
    }

    if (request.name === 'clear_BackOfficeRecord_req') {
      const seq = pad2(data.BorSeqNo, '00')
      this.state.backOfficeRecords.splice(
        0,
        this.state.backOfficeRecords.filter(
          (entry) => Number(entry.borSeqNo) <= Number(seq),
        ).length,
      )
      return [
        withSolicited(request, {
          name: 'clear_BackOfficeRecord_resp',
          subCode: '00H',
          data: {
            BorBufferStatus: bitFlags(
              this.state.backOfficeRecords.length ? 1 : 0,
              this.state.backOfficeRecords.length ? { BufferNotEmpty: 1 } : {},
            ),
          },
        }),
      ]
    }

    if (request.name === 'ClientData_req') {
      return [
        withSolicited(request, {
          name: 'ClientData_resp',
          subCode: '00H',
          data: { ClientData: ['56H', '50H', '4FH', '53H'] },
        }),
      ]
    }

    if (
      request.name === 'store_BackOfficeRecord_req' ||
      request.name === 'store_ClientData_req'
    ) {
      return [
        withSolicited(request, {
          name: request.name.replace('_req', '_resp'),
          subCode: request.subCode || '00H',
          data:
            request.name === 'store_BackOfficeRecord_req'
              ? { BorSeqNo: pad2(this.state.backOfficeRecords.length + 1) }
              : {},
        }),
      ]
    }

    return null
  }

  private handleOperationalAck(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope | null {
    if (!OPERATIONAL_ACK_REQUESTS.has(request.name)) return null
    const data = request.data ?? {}
    const responseName = request.name.replace('_req', '_resp')
    const responseData: JsonObject = {}

    for (const key of [
      'FpId',
      'TgId',
      'TankId',
      'PpId',
      'WpId',
      'DiopId',
      'SensorId',
      'VmId',
      'BorSeqNo',
      'FcServiceMsgSeqNo',
    ]) {
      if (data[key] !== undefined) responseData[key] = data[key]
    }

    return withSolicited(request, {
      name: responseName,
      subCode: request.subCode || '00H',
      data: responseData,
    })
  }

  private fcStatus(
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    const flags1 = this.config.scenario === 'readiness' ? 4 : 0
    const flags2 =
      (this.state.serviceMessages.length ? 1 : 0) |
      2 |
      (this.state.backOfficeRecords.length ? 32 : 0)
    return {
      ...(request
        ? withSolicited(request, {
            name: 'FcStatus_resp',
            subCode: '00H',
            data: {},
          })
        : {}),
      name: 'FcStatus_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        FcStatus1Flags: bitFlags(flags1, flags1 ? { FallbackMode: 4 } : {}),
        FcStatus2Flags: bitFlags(flags2, {
          ...(this.state.serviceMessages.length ? { ServiceMsgReady: 1 } : {}),
          UnsolicitedStatusUpdateOn: 2,
          ...(this.state.backOfficeRecords.length
            ? { BackOfficeRecordExists: 32 }
            : {}),
        }),
        FcServiceMode: enumValue('Normal', '00H'),
      },
    }
  }

  private fcInstallStatus(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    return withSolicited(request, {
      name: 'FcInstallStatus_resp',
      subCode: request.subCode || '00H',
      data: {
        InstalledFps: rangeIds(this.config.fcCount),
        InstalledTgs: rangeIds(this.config.tankCount),
        InstalledPricePoles: rangeIds(this.config.pricePoleCount),
        InstalledWashPoints: rangeIds(this.config.washPointCount),
        InstalledSensors: rangeIds(this.config.sensorCount),
        InstalledVms: rangeIds(this.config.vendingCount),
      },
    })
  }

  private posConnectionStatus(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    return withSolicited(request, {
      name: 'PosConnectionStatus_resp',
      subCode: '00H',
      data: {
        Connections: [
          {
            PosDeviceType: enumValue('Doms_POS_Protocol_Client', '01H'),
            ConnType: enumValue('TCP/IP', 2),
            ConnAddress: Number(this.config.posId),
            ServerPortNo: this.config.port,
            ConnStatus: bitFlags(4, { online: 4 }),
          },
        ],
      },
    })
  }

  private pssPeripheralStatus(
    request: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    return withSolicited(request, {
      name: 'PssPeripheralsStatus_resp',
      subCode: '00H',
      data: {
        Peripherals: [
          {
            PeripheralType: enumValue('PSS_Flash_Memory_Module', '01H'),
            ConnType: enumValue('TCP/IP', 2),
            ConnAddress: 1,
            ServerPortNo: this.config.port,
            PeripheralStatus: bitFlags(4, { is_online: 4 }),
          },
        ],
      },
    })
  }

  private multiFpStatus(
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    return {
      name: 'MultiMessage_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        messages: rangeIds(this.config.fcCount)
          .map((fpId) => this.fpStatus(fpId, solicited).data)
          .map((data, index) => ({
            name: 'FpStatus_resp',
            subCode: '00H',
            data: {
              ...data,
              FpId: pad2(index + 1),
            },
          })),
      },
    }
  }

  private fpStatus(
    fpId: string,
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    const hasSup = this.state.supervisedTransactions.some(
      (entry) => entry.fpId === fpId,
    )
    const hasUnsup = this.state.unsupervisedTransactions.some(
      (entry) => entry.fpId === fpId,
    )
    return {
      name: 'FpStatus_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        FpId: fpId,
        SmId: '01',
        FpMainState: enumValue('Idle', '01H'),
        FpSubStates: bitFlags(86, {
          IsSupervised: 2,
          IsOnline: 4,
          HasFreeBuffer: 16,
          HasActiveGrades: 64,
        }),
        FpLockId: '00',
        FpTransBufferStatus: bitFlags((hasSup ? 1 : 0) | (hasUnsup ? 2 : 0), {
          ...(hasSup ? { HasSupervisedTransaction: 1 } : {}),
          ...(hasUnsup ? { HasUnsupervisedTransaction: 2 } : {}),
        }),
      },
    }
  }

  private fpInfo(fpId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'FpInfo_resp',
      subCode: '01H',
      data: {
        FpId: fpId,
        FpInfoPars: {
          FpGradeIds: ['01', '02'],
          FpDisplayText: `Pump ${Number(fpId)}`,
        },
      },
    })
  }

  private fpFuellingData(fpId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'FpFuellingData_resp',
      subCode: request.subCode || '01H',
      data: { FpId: fpId, Vol: '0000000000', Money: '0000000000' },
    })
  }

  private fpError(fpId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'FpErrorMsg_resp',
      subCode: '00H',
      data: { FpId: fpId, FpErrorCode: '00', FpErrorMsg: '' },
    })
  }

  private fpTransaction(
    responseName: 'FpSupTrans_resp' | 'FpUnSupTrans_resp',
    transaction: SimulatorTransaction | undefined,
    request: DomsJplSimulatorEnvelope,
  ) {
    const fpId = pad2(request.data.FpId)
    if (!transaction) {
      return withSolicited(request, {
        name: responseName,
        subCode: '00H',
        data: { FpId: fpId, TransSeqNo: '0000', TransPars: {} },
      })
    }

    return withSolicited(request, {
      name: responseName,
      subCode: '00H',
      data: {
        FpId: transaction.fpId,
        PosId: transaction.posId,
        TransSeqNo: transaction.transSeqNo,
        Money: transaction.money,
        Vol: transaction.vol,
        TransPars: clone(transaction.transPars),
      },
    })
  }

  private multiTgStatus(
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    return {
      name: 'MultiMessage_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        messages: rangeIds(this.config.tankCount).map((tgId) => ({
          name: 'TgStatus_resp',
          subCode: '00H',
          data: this.tgStatus(tgId, solicited).data,
        })),
      },
    }
  }

  private tgStatus(
    tgId: string,
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    return {
      name: 'TgStatus_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        TgId: tgId,
        TgMainState: enumValue('Idle', '01H'),
        TgSubStates: bitFlags(4, { TankGaugeOnline: 4 }),
        TgAlarmCode: enumValue('NoAlarm', '00H'),
      },
    }
  }

  private tgData(tgId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'TgData_resp',
      subCode: '00H',
      data: {
        TgId: tgId,
        TankData: {
          FcProductId: '01',
          ProductName: 'Diesel',
          TankVolume: '000001250000',
          ProductVolume: '000000950000',
          ProductTcVolume: '000000948500',
          Ullage: '000000300000',
          WaterVolume: '000000000500',
          ProductLevel: '0000014500',
          WaterLevel: '0000000010',
          ProductTemperature: '000215',
          ProductDensity: '0008300',
          TankCapacity: '000001500000',
        },
      },
    })
  }

  private tgError(tgId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'TgErrorMsg_resp',
      subCode: '00H',
      data: { TgId: tgId, TgErrorCode: '00', TgErrorMsg: '' },
    })
  }

  private tankControlStatus(
    tankId: string,
    request?: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    const response: DomsJplSimulatorEnvelope = {
      name: 'TankControlStatus_resp',
      subCode: '00H',
      solicited: request !== undefined,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        TankId: tankId,
        TankControlMainState: enumValue('Idle', '01H'),
        TankControlSubStates: bitFlags(4, { is_online: 4 }),
      },
    }

    return response
  }

  private siteDeliveryStatus(
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ): DomsJplSimulatorEnvelope {
    return {
      name: 'SiteDeliveryStatus_resp',
      subCode: '01H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        DeliveryStatus: enumValue(
          this.state.deliveryReports.length ? 'DeliveryDataReady' : 'Idle',
          this.state.deliveryReports.length ? '02H' : '00H',
        ),
        TankDeliveries: this.state.deliveryReports.map((report) => ({
          TgId: report.tgId,
          TankDeliverySeqNo: report.tankDeliverySeqNo,
        })),
      },
    }
  }

  private tankDeliveryData(tgId: string, request: DomsJplSimulatorEnvelope) {
    const seq =
      this.state.deliveryReports.find((report) => report.tgId === tgId)
        ?.tankDeliverySeqNo ?? '00'
    return withSolicited(request, {
      name: 'TankDeliveryData_resp',
      subCode: '00H',
      data: {
        TgId: tgId,
        TankDeliverySeqNo: seq,
        DeliveryReportSeqNo: seq,
        TankDeliveryData: {
          DeliveredVolume: '000000180000',
          DeliveredTcVolume: '000000179500',
          DeliveredMass: '0000149000',
          SaleVolumeDuringDelivery: '000000003000',
          StartProductVolume: '000000770000',
          StopProductVolume: '000000950000',
          StartProductDensity: '0008295',
          StopProductDensity: '0008300',
          StartProductTemperature: '000210',
          StopProductTemperature: '000215',
        },
      },
    })
  }

  private ppStatus(
    ppId: string,
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ) {
    return {
      name: 'PpStatus_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        PpId: ppId,
        PpMainState: enumValue('Open', '01H'),
        PpSubStates: bitFlags(4, { IsOnline: 4 }),
      },
    }
  }

  private ppError(ppId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'PpErrorMsg_resp',
      subCode: '00H',
      data: { PpId: ppId, PpErrorCode: '00', PpErrorMsg: '' },
    })
  }

  private wpStatus(
    wpId: string,
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ) {
    const transaction = this.state.washTransactions.find(
      (entry) => entry.wpId === wpId,
    )
    return {
      name: 'WpStatus_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        WpId: wpId,
        WpMainState: enumValue('Idle', '01H'),
        WpSubStates: bitFlags(4, { IsOnline: 4 }),
        WpUnSupTransBuffer: transaction
          ? {
              PosId: transaction.posId,
              TransSeqNo: transaction.transSeqNo,
              Money: transaction.money,
            }
          : undefined,
      },
    }
  }

  private wpError(wpId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'WpErrorMsg_resp',
      subCode: '00H',
      data: { WpId: wpId, WpErrorCode: '00', WpErrorMsg: '' },
    })
  }

  private diopStatus(diopId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'DiopStatus_resp',
      subCode: '00H',
      data: {
        DiopId: diopId,
        DiopStatus: bitFlags(4, { IsOnline: 4 }),
        DiopInputState: 0,
        DiopOutputState: 0,
      },
    })
  }

  private sensorStatus(
    sensorId: string,
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ) {
    return {
      name: 'SensorStatus_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        SensorId: sensorId,
        SensorStatus: bitFlags(4, { IsOnline: 4 }),
        SensorAlarms: [],
      },
    }
  }

  private vmStatus(
    vmId: string,
    solicited: boolean,
    request?: DomsJplSimulatorEnvelope,
  ) {
    return {
      name: 'VmStatus_resp',
      subCode: '00H',
      solicited,
      ...(request?.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
      data: {
        VmId: vmId,
        VmMainState: enumValue('Idle', '01H'),
        VmSubStates: bitFlags(4, { IsOnline: 4 }),
        VmAlarms: [],
      },
    }
  }

  private vmError(vmId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'VmErrorMsg_resp',
      subCode: '00H',
      data: { VmId: vmId, VmErrorCode: '00', VmErrorMsg: '' },
    })
  }

  private vmTotals(vmId: string, request: DomsJplSimulatorEnvelope) {
    return withSolicited(request, {
      name: 'VmDrystockTotals_resp',
      subCode: '00H',
      data: {
        VmId: vmId,
        VmTotalType: request.data.VmTotalType ?? '01H',
        VmTotals: [{ VmProductId: '01', VmProductQuantity: '0000000012' }],
      },
    })
  }
}

export class DomsJplSimulatorServer {
  private readonly responder: DomsJplSimulatorResponder
  private server: net.Server | tls.Server | null = null
  private readonly sockets = new Set<SimulatorSocket>()
  private readonly buffers = new Map<SimulatorSocket, Buffer<ArrayBufferLike>>()
  private readonly heartbeatTimers = new Map<SimulatorSocket, NodeJS.Timeout>()
  private heartbeatsPaused = false
  private totalConnections = 0
  private receivedMessages = 0
  private receivedHeartbeats = 0
  private forcedDisconnects = 0

  constructor(config: DomsJplSimulatorConfig = {}) {
    this.responder = new DomsJplSimulatorResponder(config)
  }

  get config() {
    return this.responder.config
  }

  getStats() {
    return {
      activeConnections: this.sockets.size,
      totalConnections: this.totalConnections,
      receivedMessages: this.receivedMessages,
      receivedHeartbeats: this.receivedHeartbeats,
      forcedDisconnects: this.forcedDisconnects,
      heartbeatsPaused: this.heartbeatsPaused,
      heartbeatsEnabled: this.config.heartbeatsEnabled,
    }
  }

  disconnectClients(): number {
    const sockets = [...this.sockets]
    this.forcedDisconnects += sockets.length
    for (const socket of sockets) socket.destroy()
    return sockets.length
  }

  pauseHeartbeats() {
    this.heartbeatsPaused = true
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer)
    this.heartbeatTimers.clear()
  }

  resumeHeartbeats() {
    if (!this.config.heartbeatsEnabled) return
    this.heartbeatsPaused = false
    for (const socket of this.sockets) this.startHeartbeatTimer(socket)
  }

  async start(): Promise<{ host: string; port: number; secure: boolean }> {
    if (this.server) {
      const address = this.server.address()
      return {
        host: this.config.host,
        port:
          typeof address === 'object' && address
            ? address.port
            : this.config.port,
        secure: this.config.secure,
      }
    }

    this.server = this.config.secure
      ? tls.createServer(
          {
            cert: this.config.tlsCertPath
              ? readFileSync(this.config.tlsCertPath)
              : undefined,
            key: this.config.tlsKeyPath
              ? readFileSync(this.config.tlsKeyPath)
              : undefined,
          },
          (socket) => this.attachSocket(socket),
        )
      : net.createServer((socket) => this.attachSocket(socket))

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(this.config.port, this.config.host, () => resolve())
    })

    const address = this.server.address()
    return {
      host: this.config.host,
      port:
        typeof address === 'object' && address
          ? address.port
          : this.config.port,
      secure: this.config.secure,
    }
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer)
    this.sockets.clear()
    this.buffers.clear()
    this.heartbeatTimers.clear()

    if (!this.server) return
    const server = this.server
    this.server = null
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private attachSocket(socket: SimulatorSocket) {
    this.sockets.add(socket)
    this.totalConnections += 1
    this.buffers.set(socket, Buffer.alloc(0))
    this.write(socket, this.responder.welcome())
    this.startHeartbeatTimer(socket)

    socket.on('data', (chunk) => this.handleData(socket, chunk))
    socket.on('close', () => this.detachSocket(socket))
    socket.on('error', () => this.detachSocket(socket))
  }

  private startHeartbeatTimer(socket: SimulatorSocket) {
    const existing = this.heartbeatTimers.get(socket)
    if (existing) clearInterval(existing)
    this.heartbeatTimers.delete(socket)
    if (
      !this.config.heartbeatsEnabled ||
      this.heartbeatsPaused ||
      socket.destroyed
    )
      return

    const timer = setInterval(() => {
      if (!socket.destroyed && !this.heartbeatsPaused) {
        this.write(socket, this.responder.heartbeat())
      }
    }, this.config.heartbeatMs)
    timer.unref?.()
    this.heartbeatTimers.set(socket, timer)
  }

  private detachSocket(socket: SimulatorSocket) {
    this.sockets.delete(socket)
    this.buffers.delete(socket)
    const timer = this.heartbeatTimers.get(socket)
    if (timer) clearInterval(timer)
    this.heartbeatTimers.delete(socket)
  }

  private handleData(socket: SimulatorSocket, chunk: Buffer<ArrayBufferLike>) {
    const previous = this.buffers.get(socket) ?? Buffer.alloc(0)
    const extracted = extractDomsJplFrames(Buffer.concat([previous, chunk]))
    this.buffers.set(socket, extracted.remainder)

    for (const frame of extracted.frames) {
      if (!frame.message) {
        this.write(
          socket,
          this.responder.reject(
            undefined,
            frame.error ?? 'Invalid JPL frame',
            '02H',
          ),
        )
        continue
      }

      if (this.config.verbose) {
        console.log(
          '[doms-jpl-simulator] request',
          frame.message.name,
          frame.message.subCode,
        )
      }

      this.receivedMessages += 1
      if (frame.message.name === 'heartbeat') this.receivedHeartbeats += 1

      const responses = this.responder.handleRequest(frame.message)
      for (const response of responses) this.write(socket, response)
    }
  }

  private write(socket: SimulatorSocket, message: DomsJplSimulatorEnvelope) {
    if (this.config.verbose) {
      console.log(
        '[doms-jpl-simulator] response',
        message.name,
        message.subCode,
      )
    }
    const outbound = this.config.echoCorrelationId
      ? message
      : (() => {
          const { correlationId: _correlationId, ...withoutCorrelationId } =
            message
          return withoutCorrelationId
        })()
    socket.write(encodeDomsJplFrame(outbound))
  }
}

export const createDomsJplSimulator = (config: DomsJplSimulatorConfig = {}) =>
  new DomsJplSimulatorServer(config)
