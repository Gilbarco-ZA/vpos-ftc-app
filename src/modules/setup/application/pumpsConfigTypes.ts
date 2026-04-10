export type PumpsConfig = {
  pumps: Array<{
    pumpId: string
    nozzles: Array<{
      nozzleId: string
      tankId: string
    }>
  }>
}
