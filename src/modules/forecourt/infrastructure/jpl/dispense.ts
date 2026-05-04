export type DispenseAuthorizeMode =
  | 'standard'
  | 'preset'
  | 'extended'
  | 'prepare_transaction'

export type PumpErrorGuidance = {
  category:
    | 'controller_lock'
    | 'price_or_grade'
    | 'tank_or_delivery'
    | 'communication'
    | 'hardware'
    | 'operator_action'
    | 'unknown'
  operatorMessage: string
  recommendedAction: string
  needsAdminIntervention: boolean
}

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

export const resolveDispenseAuthorizeMode = (
  action: string,
  payload?: Record<string, unknown> | null,
): DispenseAuthorizeMode => {
  const normalized = normalizeText(action)
  const data = payload ?? {}

  if (
    normalized.includes('prepare') ||
    normalized.includes('prepay') ||
    data['StartLimit_e'] != null ||
    data['startLimit_e'] != null ||
    data['AuthorizePars'] != null ||
    data['authorizePars'] != null
  ) {
    if (normalized.includes('prepare') || normalized.includes('prepay')) {
      return 'prepare_transaction'
    }
  }

  if (
    normalized.includes('preset') ||
    data['PresetType'] != null ||
    data['presetType'] != null ||
    data['MoneyPresetLimit'] != null ||
    data['moneyPresetLimit'] != null ||
    data['VolumePresetLimit'] != null ||
    data['volumePresetLimit'] != null ||
    data['VoidPresetLimit'] != null ||
    data['voidPresetLimit'] != null
  ) {
    return 'preset'
  }

  if (
    normalized.includes('extended') ||
    data['AuthorizePars'] != null ||
    data['authorizePars'] != null
  ) {
    return 'extended'
  }

  return 'standard'
}

export const buildFpStatusSubCodePreference = (
  preferredSubCode?: string | null,
) => {
  const requested = String(preferredSubCode ?? '03H')
    .trim()
    .toUpperCase()
  return [requested, '03H', '02H', '01H', '00H'].filter(
    (value, index, list) => value && list.indexOf(value) === index,
  )
}

export const derivePumpErrorGuidance = (args: {
  errorCode?: string | null
  errorName?: string | null
  pumpErrorCode?: string | null
  severity?: 'warning' | 'error' | null
}): PumpErrorGuidance => {
  const name = normalizeText(args.errorName)
  const pumpCode = normalizeText(args.pumpErrorCode)
  const code = normalizeText(args.errorCode)

  if (
    name.includes('lock') ||
    name.includes('preauthorized') ||
    name.includes('authorized') ||
    pumpCode.includes('lock')
  ) {
    return {
      category: 'controller_lock',
      operatorMessage:
        'The fuelling point is locked or reserved by the controller/POS workflow.',
      recommendedAction:
        'Confirm which POS owns the transaction, then unlock or clear the transaction before retrying.',
      needsAdminIntervention: args.severity !== 'warning',
    }
  }

  if (
    name.includes('price') ||
    name.includes('grade') ||
    name.includes('preset') ||
    pumpCode.includes('price') ||
    pumpCode.includes('grade')
  ) {
    return {
      category: 'price_or_grade',
      operatorMessage:
        'The fuelling point rejected the request because grade, price, or preset data is not acceptable in its current state.',
      recommendedAction:
        'Refresh pump status, verify active grades and prices, then resend the authorization with the correct preset/grade restrictions.',
      needsAdminIntervention: false,
    }
  }

  if (
    name.includes('tank') ||
    name.includes('delivery') ||
    name.includes('wetstock') ||
    pumpCode.includes('tank') ||
    pumpCode.includes('delivery') ||
    code === '49' ||
    code === '50' ||
    code === '51' ||
    code === '52'
  ) {
    return {
      category: 'tank_or_delivery',
      operatorMessage:
        'The fuelling point is blocked by a tank, delivery, or inventory-related condition.',
      recommendedAction:
        'Check the linked tank status and delivery workflow, resolve alarms or low-stock conditions, then reset/reauthorize the pump if needed.',
      needsAdminIntervention: true,
    }
  }

  if (
    name.includes('offline') ||
    name.includes('comm') ||
    name.includes('protocol') ||
    pumpCode.includes('offline') ||
    pumpCode.includes('comm') ||
    pumpCode.includes('protocol')
  ) {
    return {
      category: 'communication',
      operatorMessage:
        'Communication with the dispenser or protocol bridge is degraded.',
      recommendedAction:
        'Verify pump online status, forecourt controller connectivity, and protocol adapter health before retrying the command.',
      needsAdminIntervention: true,
    }
  }

  if (
    name.includes('pump') ||
    name.includes('motor') ||
    name.includes('nozzle') ||
    name.includes('encoder') ||
    pumpCode.startsWith('sp') ||
    pumpCode.startsWith('hw')
  ) {
    return {
      category: 'hardware',
      operatorMessage: 'The dispenser reported a hardware-side pump fault.',
      recommendedAction:
        'Inspect the dispenser locally, acknowledge the hardware alarm, and use reset only after the physical condition has been checked.',
      needsAdminIntervention: true,
    }
  }

  if (args.severity === 'warning') {
    return {
      category: 'operator_action',
      operatorMessage:
        'The fuelling point reported a warning condition that may still allow local recovery.',
      recommendedAction:
        'Review the latest pump state and retry only after confirming the warning is understood.',
      needsAdminIntervention: false,
    }
  }

  return {
    category: 'unknown',
    operatorMessage: 'The fuelling point reported an unmapped error condition.',
    recommendedAction:
      'Read the raw DOMS error payload and controller logs, then follow the site recovery procedure before retrying.',
    needsAdminIntervention: true,
  }
}
