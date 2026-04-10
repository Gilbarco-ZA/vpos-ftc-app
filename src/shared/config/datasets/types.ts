export type BaseRow = {
  code: string
  name: string
  description?: string | null
  sortOrder?: number
  isActive?: boolean
}

export type TaxRow = BaseRow & {
  rate: number
}

export type CountryDataset = {
  taxTypes: TaxRow[]
  productClassCodes: BaseRow[]
  productTypeCodes: BaseRow[]
  creditNoteReasons: BaseRow[]
  packagingUnits: BaseRow[]
  quantityUnits: BaseRow[]
}
