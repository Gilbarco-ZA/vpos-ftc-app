export type NozzleState = 'nozzle_up' | 'auth' | 'nozzle_down' | 'idle' | string

export type PumpNozzle = {
  nozzleId: string
  fuelType?: string
  state: NozzleState
  updatedAt: number
}

export type PumpHealth = 'online' | 'offline' | 'unknown'

export type PumpState = {
  pumpId: string
  nozzles: PumpNozzle[]
  updatedAt: number
  lastSeenAt: number | null
  health: PumpHealth
}

export type PumpStateSnapshot = {
  stationId: string
  pumps: PumpState[]
  updatedAt: number
}
