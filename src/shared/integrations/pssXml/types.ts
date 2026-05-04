export type PssXmlGrade = {
  id: string
  name: string
}

export type PssXmlPriceGroup = {
  id: string
  /** gradeId -> raw price value from PSS XML */
  pricesByGradeId: Record<string, number>
}

export type PssXmlProduct = {
  id: string
  name?: string
  color?: string
}

export type PssXmlTank = {
  id: string
  productId?: string | null
}

export type PssXmlGradeOption = {
  id: string
  gradeId?: string | null
  tankId?: string | null
  parts?: string | null
}

export type PssXmlFuellingPoint = {
  id: string
  /** DOMS/PSS port number used for transport grouping. Not unique enough to identify a pump by itself. */
  pssPortNo?: number | null
  /** TCP/IP endpoint used to reach the dispenser controller. Transport only; do not use as pump identity. */
  ipAddress?: string | null
  tcpUdpPortNo?: number | null
  /** Stable per-controller sub-address used by DOMS to differentiate fuelling points sharing an IP. */
  deviceSubAddress?: number | null
  /** grade options correspond to hoses/nozzles on the fuelling point */
  gradeOptions: PssXmlGradeOption[]
}

export type PssXmlConfig = {
  grades: PssXmlGrade[]
  priceGroups: PssXmlPriceGroup[]
  products: PssXmlProduct[]
  tanks: PssXmlTank[]
  fuellingPoints: PssXmlFuellingPoint[]
}

/**
 * Maps PSS IDs (from the XML) to DB UUIDs created/used during import.
 * Stored in station_kv so export can convert DB mappings back to PSS IDs.
 */
export type PssXmlIdMap = {
  version: 1
  sourcePath?: string
  sourceChecksum?: string
  importedAt?: string

  /** PSS Grade ID -> products.id (uuid) */
  productDbIdByGradeId: Record<string, string>

  /** PSS Tank ID -> tanks.id (uuid) */
  tankDbIdByTankId: Record<string, string>

  /** PSS FuellingPoint ID -> pumps.id (uuid) */
  pumpDbIdByFpId?: Record<string, string>

  /** PSS FuellingPoint ID + GradeOption ID -> nozzles.id (uuid) */
  nozzleDbIdByFpIdGradeOptionId?: Record<string, string>
}
