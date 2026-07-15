import {
  normalizeJplSiteDeliveryStatus,
  normalizeJplTankAlarmStatus,
  normalizeJplTankDeliveryData,
  normalizeJplTankGaugeData,
} from '@/src/shared/doms/tankGaugeProtocol'
import {
  extractNozzleNumber,
  mapJplMainState,
} from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'

import { derivePumpErrorGuidance } from '@/src/modules/forecourt/infrastructure/jpl/dispense'

const asObject = (value: any) =>
  value && typeof value === 'object' ? value : {}

export const enumLabel = (value: any) => {
  if (!value || typeof value !== 'object') return undefined
  const entries = Object.entries(value?.enum ?? {})
  if (!entries.length) return undefined
  return String(entries[0]?.[0] ?? '').trim() || undefined
}

const bitValue = (value: any, key: string) =>
  Boolean(value?.bits?.[key] ?? value?.[key])

const stringOrUndefined = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || undefined
}

const arrayOfStrings = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => stringOrUndefined((entry as any)?.value ?? entry))
        .filter(Boolean)
    : []

export const normalizeFpStatusPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  const supplementary = asObject(data?.FpSupplStatusPars)
  const subStates = asObject(data?.FpSubStates)
  const subStates2 = asObject(supplementary?.FpSubStates2)
  const subStates3 = asObject(supplementary?.FpSubStates3)
  const subStates4 = asObject(supplementary?.FpSubStates4)

  return {
    fpId: stringOrUndefined(data?.FpId),
    subCode: stringOrUndefined(subCode),
    smId: stringOrUndefined(data?.SmId),
    mainState:
      enumLabel(data?.FpMainState) ??
      stringOrUndefined(data?.FpMainState?.value),
    nozzleState: mapJplMainState(data?.FpMainState),
    lockId: stringOrUndefined(data?.FpLockId),
    gradeId: stringOrUndefined(data?.FcGradeId),
    nozzleId: stringOrUndefined(supplementary?.NozzleId),
    nozzleNumber:
      extractNozzleNumber(supplementary) ?? extractNozzleNumber(data),
    operationModeNo: data?.FpOperationModeNo,
    availableGrades: arrayOfStrings(supplementary?.FpAvailableGrades),
    availableSms: arrayOfStrings(supplementary?.FpAvailableSms),
    permittedGrades: arrayOfStrings(supplementary?.FpPermittedGrades),
    descriptor: {
      isCarWashMachine: bitValue(data?.FpDescriptor, 'FpIsACarWashMachine'),
      isScreenWashDispenser: bitValue(
        data?.FpDescriptor,
        'FpIsAScreenWashDispenser',
      ),
    },
    flags: {
      isLockedByPos: bitValue(subStates, 'IsLockedByPos'),
      isSupervised: bitValue(subStates, 'IsSupervised'),
      isOnline: bitValue(subStates, 'IsOnline'),
      isEstopped: bitValue(subStates, 'IsEstopped'),
      hasFreeBuffer: bitValue(subStates, 'HasFreeBuffer'),
      isInErrorState: bitValue(subStates, 'IsInErrorState'),
      hasActiveGrades: bitValue(subStates, 'HasActiveGrades'),
      isPreset: bitValue(subStates, 'IsPreset'),
      pumpTotalsReady: bitValue(subStates2, 'pump_totals_ready'),
      vrmAlarm: bitValue(
        subStates2,
        'VRM_alarm_on_one_or_more_nozzles_(timer_running)',
      ),
      vrmError: bitValue(subStates2, 'VRM_error_on_one_or_more_nozzles'),
      pumpInManualMode: bitValue(subStates2, 'Pump_in_manual_mode'),
      pricesLocked: bitValue(subStates2, 'Prices_locked'),
      nozzleHasTagReader: bitValue(subStates2, 'Nozzle_has_a_tag_reader'),
      fuellingHalted: bitValue(subStates2, 'Fuelling_halted'),
      totalsInSync: bitValue(subStates2, 'totals_in_sync'),
      presetReached: bitValue(subStates4, 'Preset_reached_in_fuelling'),
      fuellingWithoutProgress: bitValue(
        subStates4,
        'Fuelling_without_progress',
      ),
      doorAlarm: bitValue(subStates4, 'Door_alarm'),
    },
    supplementary: {
      subStates2: supplementary?.FpSubStates2,
      subStates3: supplementary?.FpSubStates3,
      subStates4: supplementary?.FpSubStates4,
      currentFlowRate: supplementary?.CurrentFlowRate,
      currentFuelTemperature: supplementary?.CurrentFuelTemperature,
      fuellingDataVol_e: stringOrUndefined(supplementary?.FuellingDataVol_e),
      fuellingDataMon_e: stringOrUndefined(supplementary?.FuellingDataMon_e),
      attendantAccountId: stringOrUndefined(supplementary?.AttendantAccountId),
      pgId: stringOrUndefined(supplementary?.PgId),
      nozzleTagReaderId: stringOrUndefined(supplementary?.NozzleTagReaderId),
      rawSubStates3: supplementary?.FpSubStates3,
    },
    raw: data,
  }
}

export const normalizeFpInfoPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  const items = asObject(data?.FpInfoItems)
  return {
    fpId: stringOrUndefined(data?.FpId),
    subCode: stringOrUndefined(subCode),
    gradePrices: Array.isArray(items?.FpGradePrices) ? items.FpGradePrices : [],
    gradePricesExtended: Array.isArray(items?.FpGradePrices_e)
      ? items.FpGradePrices_e
      : [],
    transReturnData: Array.isArray(items?.FpTransReturnData)
      ? items.FpTransReturnData
      : [],
    transReturnData2: Array.isArray(items?.FpTransReturnData2)
      ? items.FpTransReturnData2
      : [],
    raw: data,
  }
}

export const normalizeFpFuellingDataPayload = (
  payload: any,
  subCode?: string,
) => {
  const data = asObject(payload)
  return {
    fpId: stringOrUndefined(data?.FpId),
    subCode: stringOrUndefined(subCode),
    volume: stringOrUndefined(data?.Vol),
    money: stringOrUndefined(data?.Money),
    volumeExtended: stringOrUndefined(data?.Vol_e),
    moneyExtended: stringOrUndefined(data?.Money_e),
    raw: data,
  }
}

export const normalizeTgStatusPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  const subStates = asObject(data?.TgSubStates)
  const alarmStatus = normalizeJplTankAlarmStatus(data)
  return {
    tgId: stringOrUndefined(data?.TgId),
    subCode: stringOrUndefined(subCode),
    mainState:
      enumLabel(data?.TgMainState) ??
      stringOrUndefined(data?.TgMainState?.value),
    flags: {
      online:
        bitValue(subStates, 'TankGaugeOnline') ||
        bitValue(subStates, 'TankGaugeOnLine'),
      alarmActive: bitValue(subStates, 'TankGaugeAlarmActive'),
      errorActive: bitValue(subStates, 'TankGaugeErrorActive'),
      ticketedDeliveryInProgress: bitValue(
        subStates,
        'TicketedDeliveryInProgress',
      ),
      ticketedDeliveryDataReady: bitValue(
        subStates,
        'TicketedDeliveryDataReady',
      ),
      deliveryInProgress: bitValue(subStates, 'DeliveryInProgress'),
      deliveryDataReady:
        bitValue(subStates, 'DeliveryDataReady') ||
        bitValue(subStates, 'DelvieryDataReady'),
      allInventoryDataReady: bitValue(
        subStates,
        'AllAvailableInventoryDataReady',
      ),
    },
    alarms: Object.fromEntries(
      alarmStatus.all.map((alarm) => [alarm.key, alarm.active]),
    ),
    activeAlarms: alarmStatus.active,
    alarmTexts: alarmStatus.texts,
    alarmStatus,
    raw: data,
  }
}

export const normalizeTgDataPayload = (payload: any, subCode?: string) => {
  const normalized = normalizeJplTankGaugeData(payload)
  if (!normalized) {
    return {
      tgId: undefined,
      subCode: stringOrUndefined(subCode),
      raw: asObject(payload),
    }
  }

  return {
    ...normalized,
    subCode: stringOrUndefined(subCode),
  }
}

export const normalizeSiteDeliveryStatusPayload = (
  payload: any,
  subCode?: string,
) => {
  const normalized = normalizeJplSiteDeliveryStatus(payload)
  return {
    subCode: stringOrUndefined(subCode),
    deliveryReportSeqNo: normalized.deliveryReportSeqNo,
    status: normalized.status,
    flags: normalized.flags,
    tgIds: normalized.tgIds,
    tankDeliveries: normalized.tankDeliveries,
    tankTicketedDeliveries: normalized.tankTicketedDeliveries,
    readyTgIds: normalized.readyTgIds,
    clearCandidates: normalized.clearCandidates,
    raw: normalized.raw,
  }
}

export const normalizeTankDeliveryDataPayload = (
  payload: any,
  subCode?: string,
) => {
  const normalized = normalizeJplTankDeliveryData(payload)
  return {
    tgId: normalized.tgId,
    posId: normalized.posId,
    subCode: stringOrUndefined(subCode),
    deliveryReportSeqNo: normalized.deliveryReportSeqNo,
    tankDeliverySeqNo: normalized.tankDeliverySeqNo,
    productCode: normalized.productCode,
    deliveredVol:
      stringOrUndefined(normalized.rawItems.TankDeliveredVol) ??
      (normalized.deliveredVolume == null
        ? undefined
        : String(normalized.deliveredVolume)),
    deliveredTcVol:
      stringOrUndefined(normalized.rawItems.TankDeliveredTcVol) ??
      (normalized.deliveredTcVolume == null
        ? undefined
        : String(normalized.deliveredTcVolume)),
    deliveredMass:
      stringOrUndefined(normalized.rawItems.TankDeliveredMass) ??
      (normalized.deliveredMass == null
        ? undefined
        : String(normalized.deliveredMass)),
    deliveredQuantity: normalized.deliveredQuantity,
    adjustedVolumeSigned: normalized.adjustedVolumeSigned,
    adjustedTcVolumeSigned: normalized.adjustedTcVolumeSigned,
    saleVolumeDuringDelivery: normalized.saleVolumeDuringDelivery,
    deliveryTemperatureC: normalized.deliveryTemperatureC,
    startDateAndTime: normalized.startDateAndTime,
    stopDateAndTime: normalized.stopDateAndTime,
    startProductVolume: normalized.startProductVolume,
    startProductTcVolume: normalized.startProductTcVolume,
    startWaterVolume: normalized.startWaterVolume,
    startTemperatureC: normalized.startTemperatureC,
    startProductMass: normalized.startProductMass,
    startProductDensity: normalized.startProductDensity,
    startProductTcDensity: normalized.startProductTcDensity,
    stopProductVolume: normalized.stopProductVolume,
    stopProductTcVolume: normalized.stopProductTcVolume,
    stopWaterVolume: normalized.stopWaterVolume,
    stopTemperatureC: normalized.stopTemperatureC,
    stopProductMass: normalized.stopProductMass,
    stopProductDensity: normalized.stopProductDensity,
    stopProductTcDensity: normalized.stopProductTcDensity,
    clearTarget: normalized.clearTarget,
    rawItems: normalized.rawItems,
    raw: normalized.raw,
  }
}

const warningFpErrorCodes = new Set(['49', '50', '51', '52'])

export const normalizeFpErrorPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  const errorValue = stringOrUndefined(
    data?.FpErrorCode?.value ?? data?.FpErrorCode,
  )
  const errorName = enumLabel(data?.FpErrorCode)
  const severity = warningFpErrorCodes.has(
    String(errorValue ?? '').padStart(2, '0'),
  )
    ? 'warning'
    : 'error'
  const guidance = derivePumpErrorGuidance({
    errorCode: errorValue,
    errorName,
    pumpErrorCode: stringOrUndefined(data?.PumpErrorCode),
    severity,
  })

  return {
    fpId: stringOrUndefined(data?.FpId),
    subCode: stringOrUndefined(subCode),
    errorCode: errorValue,
    errorName,
    errorDateAndTime: stringOrUndefined(data?.FpErrorDateAndTime),
    pumpProtocolId: stringOrUndefined(data?.PumpProtocolId),
    pumpErrorCode: stringOrUndefined(data?.PumpErrorCode),
    severity,
    guidance,
    raw: data,
  }
}

export const normalizePpStatusPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  const subStates = asObject(data?.PpSubStates)
  return {
    ppId: stringOrUndefined(data?.PpId),
    subCode: stringOrUndefined(subCode),
    mainState:
      enumLabel(data?.PpMainState) ??
      stringOrUndefined(data?.PpMainState?.value),
    flags: {
      online: bitValue(subStates, 'PricePoleOnline'),
      errorActive: bitValue(subStates, 'PricePoleErrorActive'),
    },
    raw: data,
  }
}

export const normalizePpErrorPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  return {
    ppId: stringOrUndefined(data?.PpId),
    subCode: stringOrUndefined(subCode),
    errorCode: stringOrUndefined(data?.PpErrorCode?.value ?? data?.PpErrorCode),
    errorName: enumLabel(data?.PpErrorCode),
    errorDateAndTime: stringOrUndefined(data?.PpErrorDateAndTime),
    raw: data,
  }
}

export const normalizeWashStatusPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  const subStates = asObject(data?.WpSubStates)
  return {
    wpId: stringOrUndefined(data?.WpId),
    subCode: stringOrUndefined(subCode),
    smId: stringOrUndefined(data?.WpSmId),
    lockId: stringOrUndefined(data?.WpLockId),
    washId: stringOrUndefined(data?.FcWashId),
    mainState:
      enumLabel(data?.WpMainState) ??
      stringOrUndefined(data?.WpMainState?.value),
    flags: {
      lockedByPos: bitValue(subStates, 'Locked_by_POS'),
      haltedByPss: bitValue(subStates, 'Halted_By_PSS'),
      online: bitValue(subStates, 'Online'),
      stopped: bitValue(subStates, 'Stopped'),
      freeBuffer:
        bitValue(subStates, 'Free-buffer') || bitValue(subStates, 'FreeBuffer'),
      errorState:
        bitValue(subStates, 'Error-State') || bitValue(subStates, 'ErrorState'),
      emergencyStopped: bitValue(subStates, 'Emergency_Stopped'),
      machineUndefined: bitValue(subStates, 'Machine_in_undefined_state'),
    },
    additional: data?.AdditionalWpStatusPars ?? null,
    unsupervisedBuffer: data?.WpTransInUnsBuffer ?? null,
    raw: data,
  }
}

export const normalizeWashErrorPayload = (payload: any, subCode?: string) => {
  const data = asObject(payload)
  return {
    wpId: stringOrUndefined(data?.WpId),
    subCode: stringOrUndefined(subCode),
    errorCode: stringOrUndefined(data?.WpErrorCode?.value ?? data?.WpErrorCode),
    errorName: enumLabel(data?.WpErrorCode),
    errorDateAndTime: stringOrUndefined(data?.WpErrorDateAndTime),
    raw: data,
  }
}

export const normalizeDigitalIoStatusPayload = (
  payload: any,
  subCode?: string,
) => {
  const data = asObject(payload)
  const parameters = data?.DiopStatusParameters ?? data?.DiopStatusPars ?? null
  return {
    diopId: stringOrUndefined(data?.DiopId),
    subCode: stringOrUndefined(subCode),
    parameters,
    raw: data,
  }
}

export const normalizeSensorStatusPayload = (
  payload: any,
  subCode?: string,
) => {
  const data = asObject(payload)
  return {
    sensorId: stringOrUndefined(data?.SensorId),
    subCode: stringOrUndefined(subCode),
    mainState:
      enumLabel(data?.SensorMainState) ??
      stringOrUndefined(data?.SensorMainState?.value),
    status: data?.SensorStatus ?? data?.SensorStatusParameters ?? null,
    alarms: data?.SensorAlarms ?? data?.SensorAlarmStatus ?? null,
    raw: data,
  }
}

export const normalizeVendingStatusPayload = (
  payload: any,
  subCode?: string,
) => {
  const data = asObject(payload)
  const subStates = asObject(data?.VmSubStates)
  return {
    vmId: stringOrUndefined(data?.VmId),
    subCode: stringOrUndefined(subCode),
    mainState:
      enumLabel(data?.VmMainState) ??
      stringOrUndefined(data?.VmMainState?.value),
    flags: {
      online:
        bitValue(subStates, 'VendingMachineOnline') ||
        bitValue(subStates, 'Online'),
      errorActive:
        bitValue(subStates, 'VendingMachineErrorActive') ||
        bitValue(subStates, 'ErrorActive'),
    },
    raw: data,
  }
}

export const normalizeVendingErrorPayload = (
  payload: any,
  subCode?: string,
) => {
  const data = asObject(payload)
  return {
    vmId: stringOrUndefined(data?.VmId),
    subCode: stringOrUndefined(subCode),
    errorCode: stringOrUndefined(data?.VmErrorCode?.value ?? data?.VmErrorCode),
    errorName: enumLabel(data?.VmErrorCode),
    errorDateAndTime: stringOrUndefined(data?.VmErrorDateAndTime),
    raw: data,
  }
}
