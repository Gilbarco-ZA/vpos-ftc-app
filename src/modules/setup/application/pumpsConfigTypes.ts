export type PumpsConfig = {
  pumps: Array<{
    pumpId: string
    pumpNumber?: string | number | null
    domsFpId?: string | number | null
    physicalAddress?: string | number | null
    deviceSubAddress?: string | number | null
    pssPortNo?: string | number | null
    endpointHost?: string | null
    endpointPort?: string | number | null
    nozzles: Array<{
      nozzleId: string
      tankId: string
      domsGradeOptionId?: string | number | null
      domsGradeId?: string | number | null
      domsTankId?: string | number | null
      domsTankIds?: Array<string | number> | null
    }>
  }>
}
