export type CustomerSummary = {
  id: string
  buyerName: string
  tin: string
  buyerType?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  contactMobile?: string | null
  country?: string | null
  odometer?: string | null
  vehicleRegNr?: string | null
  paymentType?: string | null
  lastSeenAt?: string | null
  deletedAt?: string | null
}

export type CustomerListResult = {
  rows: CustomerSummary[]
  page: number
  pageSize: number
  total: number
}
