import type { CountryDataset } from './types'
import { KE_DATASET } from './KE'
import { TZ_DATASET } from './TZ'

export type BundledCountryDataset = {
  countryCode: string
  countryName: string
  currencyCode?: string
  timezone?: string
  defaultLanguageCode?: string
  dataset: CountryDataset
}

export const BUNDLED_COUNTRY_DATASETS: BundledCountryDataset[] = [
  {
    countryCode: 'KE',
    countryName: 'Kenya',
    currencyCode: 'KES',
    timezone: 'Africa/Nairobi',
    defaultLanguageCode: 'en',
    dataset: KE_DATASET,
  },
  {
    countryCode: 'TZ',
    countryName: 'Tanzania',
    currencyCode: 'TZS',
    timezone: 'Africa/Dar_es_Salaam',
    defaultLanguageCode: 'en',
    dataset: TZ_DATASET,
  },
]
