import type { DatasetType } from '@/src/shared/server/config/countryDatasets'

import {
  getDefaultTaxTypeForCountry,
  listActiveCountryCatalogRows,
} from '@/src/shared/server/config/countryCatalog'

const listActive = async (countryCode: string, datasetType: DatasetType) =>
  await listActiveCountryCatalogRows({ countryCode, datasetType })

/** @deprecated Prefer the typed country-catalog adapters directly. */
export const getTaxTypes = async (countryCode: string) =>
  await listActive(countryCode, 'taxTypes')

/** @deprecated Prefer the typed country-catalog adapters directly. */
export const getDefaultTaxType = async (countryCode: string) =>
  await getDefaultTaxTypeForCountry(countryCode)

/** @deprecated Prefer the typed country-catalog adapters directly. */
export const getProductClassCodes = async (countryCode: string) =>
  await listActive(countryCode, 'productClassCodes')

/** @deprecated Prefer the typed country-catalog adapters directly. */
export const getProductTypeCodes = async (countryCode: string) =>
  await listActive(countryCode, 'productTypeCodes')

/** @deprecated Prefer the typed country-catalog adapters directly. */
export const getCreditNoteReasons = async (countryCode: string) =>
  await listActive(countryCode, 'creditNoteReasons')

/** @deprecated Prefer the typed country-catalog adapters directly. */
export const getPackSizes = async (countryCode: string) =>
  await listActive(countryCode, 'packagingUnits')

/** @deprecated Prefer the typed country-catalog adapters directly. */
export const getUnitsOfMeasure = async (countryCode: string) =>
  await listActive(countryCode, 'quantityUnits')
