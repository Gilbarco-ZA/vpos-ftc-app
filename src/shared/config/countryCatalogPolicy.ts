import type { DatasetType } from '@/src/shared/server/config/countryDatasets'

export const LEGACY_COUNTRY_CONFIG_TABLES = {
  cfg_tax_types: {
    datasetType: 'taxTypes',
    includesRate: true,
  },
  cfg_product_class_codes: {
    datasetType: 'productClassCodes',
    includesRate: false,
  },
  cfg_product_type_codes: {
    datasetType: 'productTypeCodes',
    includesRate: false,
  },
  cfg_credit_note_reasons: {
    datasetType: 'creditNoteReasons',
    includesRate: false,
  },
  cfg_pack_sizes: {
    datasetType: 'packagingUnits',
    includesRate: false,
  },
  cfg_units_of_measure: {
    datasetType: 'quantityUnits',
    includesRate: false,
  },
} as const satisfies Record<
  string,
  { datasetType: DatasetType; includesRate: boolean }
>

export type LegacyCountryConfigTable = keyof typeof LEGACY_COUNTRY_CONFIG_TABLES

export const COUNTRY_CATALOG_COMPATIBILITY_VIEWS = {
  cfg_tax_types: 'country_catalog_cfg_tax_types_compat',
  cfg_product_class_codes: 'country_catalog_cfg_product_class_codes_compat',
  cfg_product_type_codes: 'country_catalog_cfg_product_type_codes_compat',
  cfg_credit_note_reasons: 'country_catalog_cfg_credit_note_reasons_compat',
  cfg_pack_sizes: 'country_catalog_cfg_pack_sizes_compat',
  cfg_units_of_measure: 'country_catalog_cfg_units_of_measure_compat',
} as const satisfies Record<LegacyCountryConfigTable, string>

export const normalizeCountryCatalogCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

export const isValidCountryCatalogCode = (value: unknown) =>
  /^[A-Z]{2,3}$/.test(normalizeCountryCatalogCode(value))

export const getLegacyCountryConfigMapping = (
  table: string,
): (typeof LEGACY_COUNTRY_CONFIG_TABLES)[LegacyCountryConfigTable] | null =>
  Object.prototype.hasOwnProperty.call(LEGACY_COUNTRY_CONFIG_TABLES, table)
    ? LEGACY_COUNTRY_CONFIG_TABLES[table as LegacyCountryConfigTable]
    : null
