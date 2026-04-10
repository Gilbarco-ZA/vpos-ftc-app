import type { ActionStatus, SimPumpState } from '@/src/shared/status/ui'

export type { ForecourtConnectionPayload } from '@/src/modules/forecourt/types'

export type PumpDetail = {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  hasNozzleSelector: boolean
  pumpNumber: number
}

export type TankOption = {
  id: string
  name: string
  productName: string
  productCode: string
}

export type NozzleItem = {
  id: string
  nozzleNumber: number
  tankId: string
  tankName: string
  productName: string
  productCode: string
}

export type NozzleResponse = {
  nozzles: NozzleItem[]
}

export type TankListResponse = {
  tanks: Array<{
    id: string
    name: string
    productName: string
    productCode: string
  }>
}

export type NozzleFormState = {
  id?: string
  nozzleNumber: string
  tankId: string
}

export type NozzleFormErrors = Partial<Record<keyof NozzleFormState, string>>

export type StatusMessage = {
  type: ActionStatus
  message: string
}

export type PumpDetailClientProps = {
  pump: PumpDetail
  stationId: string
}

export type SimPump = {
  id: number
  online: boolean
  authorized: boolean
  state: SimPumpState
  gradeSelected: 1 | 2 | 3 | null
}

export type SimSnapshot = {
  pumps: SimPump[]
}
