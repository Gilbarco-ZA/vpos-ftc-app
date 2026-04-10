import { mapRows, queryAll } from '@/src/platform/db/postgres'

type ConfigRow = {
  id: string
  code: string
  name: string
  description?: string | null
  rate?: number | null
  isActive: boolean
  sortOrder: number
}

const listActive = async (table: string) => {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id, code, name, description, is_active, sort_order
     FROM ${table}
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, name ASC`,
  )

  return mapRows<ConfigRow>(rows)
}

export const getTaxTypes = async () => {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id, code, name, description, rate, is_active, sort_order
     FROM cfg_tax_types
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, name ASC`,
  )

  return mapRows<ConfigRow>(rows)
}

export const getProductClassCodes = async () =>
  listActive('cfg_product_class_codes')

export const getProductTypeCodes = async () =>
  listActive('cfg_product_type_codes')

export const getCreditNoteReasons = async () =>
  listActive('cfg_credit_note_reasons')

export const getPackSizes = async () => listActive('cfg_pack_sizes')

export const getUnitsOfMeasure = async () => listActive('cfg_units_of_measure')
