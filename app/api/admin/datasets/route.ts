import { queryOne } from '@/src/platform/db/postgres'
import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'
import {
  DATASET_TYPES,
  DatasetType,
  listCountryDatasetRows,
  listCountryDatasetSummaries,
  setCountryDatasetActive,
  upsertCountryDataset,
  upsertCountryDatasetRow,
} from '@/src/shared/server/config/countryDatasets'
import { seedCountryConfig } from '@/src/shared/server/config/seedCountryConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  action?: 'import-country-dataset' | 'upsert-row' | 'set-country-active'
  csrf_token?: string
  csrfToken?: string
  countryCode?: string
  countryName?: string
  currencyCode?: string | null
  timezone?: string | null
  defaultLanguageCode?: string | null
  isActive?: boolean
  isSystem?: boolean
  source?: string | null
  version?: number
  dataset?: any
  datasetType?: DatasetType
  id?: string | null
  code?: string
  name?: string
  description?: string | null
  rate?: number | null
  sortOrder?: number
}

const refreshSeededConfigIfCurrent = async (countryCode: string) => {
  const normalized = String(countryCode || '')
    .trim()
    .toUpperCase()
  if (!normalized) return
  const seeded = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'CONFIG_SEEDED_COUNTRY'`,
  )
  if (String(seeded?.value || '').toUpperCase() === normalized) {
    await seedCountryConfig(normalized, { force: true })
  }
}

const parseDatasetType = (value: string | null): DatasetType => {
  const datasetType = String(value || DATASET_TYPES[0]) as DatasetType
  return DATASET_TYPES.includes(datasetType) ? datasetType : DATASET_TYPES[0]
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req) => {
    const url = new URL(req.url)
    const countries = await listCountryDatasetSummaries()
    const countryCode = String(
      url.searchParams.get('country') || countries[0]?.countryCode || '',
    ).toUpperCase()
    const datasetType = parseDatasetType(url.searchParams.get('datasetType'))
    const rows = countryCode
      ? await listCountryDatasetRows({ countryCode, datasetType })
      : []

    return ok({
      countries,
      datasetTypes: DATASET_TYPES,
      selected: { countryCode, datasetType },
      rows,
    })
  },
})

export const POST = defineMutationRoute<Body>({
  roles: ['administrator'],
  handler: async (_req, { body }) => {
    if (body.action === 'set-country-active') {
      return ok({
        countries: await setCountryDatasetActive(
          String(body.countryCode || ''),
          Boolean(body.isActive),
        ),
      })
    }

    if (body.action === 'upsert-row') {
      const targetCountryCode = String(body.countryCode || '')
      const rows = await upsertCountryDatasetRow({
        id: body.id ?? null,
        countryCode: targetCountryCode,
        datasetType: parseDatasetType(String(body.datasetType || '')),
        code: String(body.code || ''),
        name: String(body.name || ''),
        description: body.description ?? null,
        rate: body.rate == null ? null : Number(body.rate),
        isActive: body.isActive ?? true,
        sortOrder: Number(body.sortOrder ?? 0),
      })
      await refreshSeededConfigIfCurrent(targetCountryCode)
      return ok({ rows })
    }

    const targetCountryCode = String(body.countryCode || '')
    const country = await upsertCountryDataset({
      countryCode: targetCountryCode,
      countryName: String(body.countryName || ''),
      currencyCode: body.currencyCode ?? null,
      timezone: body.timezone ?? null,
      defaultLanguageCode: body.defaultLanguageCode ?? 'en',
      isActive: body.isActive ?? true,
      isSystem: body.isSystem ?? false,
      source: body.source ?? 'admin-import',
      version: Number(body.version ?? 1),
      dataset: body.dataset,
    })

    await refreshSeededConfigIfCurrent(targetCountryCode)
    return ok({ country, countries: await listCountryDatasetSummaries() })
  },
})
