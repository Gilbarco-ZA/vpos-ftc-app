export type PriceEntry = {
  productId?: string
  gradeId?: string
  priceGroupId?: string
  price: string
}

export type PriceBank = {
  fcPriceSetId: string
  fcPriceGroupIds: string[]
  fcGradeIds: string[]
  fcPriceGroups: string[][]
  fcPriceSetDateAndTime?: string
  userId?: string
}

export type ChangePriceSetPayload = {
  userId: string
  fcPriceSetId: string
  fcPriceGroupIds: string[]
  fcGradeIds: string[]
  fcPriceGroups: string[][]
  activationAt: string
}

export type ChangePriceSetOptions = {
  requirePreservePendingQueue?: boolean
}

export type PriceSetStatusResult = {
  response: any
  usedSubCode?: string
  usedName?: string
  supportsPendingQueue: boolean
}

export type PriceSetResult = {
  response: any
  usedSubCode?: string
  usedName?: string
}

export type ChangePriceSetResult = PriceSetResult & {
  preservesPendingQueue: boolean
}

export type PricingCommandDeps = {
  readPriceSetStatus?: (
    client: any,
    timeoutMs: number,
  ) => Promise<PriceSetStatusResult>
  readCurrentPriceSet?: (
    client: any,
    timeoutMs: number,
  ) => Promise<PriceSetResult>
  readSpecificPriceSet?: (
    client: any,
    timeoutMs: number,
    fcPriceSetId: string,
    activationAt: string,
  ) => Promise<PriceSetResult>
  changePriceSet?: (
    client: any,
    timeoutMs: number,
    payload: ChangePriceSetPayload,
    options?: ChangePriceSetOptions,
  ) => Promise<ChangePriceSetResult>
  clearPendingPriceSet?: (
    client: any,
    timeoutMs: number,
    fcPriceSetId: string,
    activationAt: string,
  ) => Promise<PriceSetResult>
}

export type ResolvedPricingCommandDeps = Required<PricingCommandDeps>
