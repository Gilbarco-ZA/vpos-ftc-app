import { query } from '@/src/platform/db/postgres'
import {
  getSiteConfigurationPublic,
  updateRegistrationCountryViaProxy,
} from '@/src/shared/proxy/client'
import {
  getCountryDatasetSummary,
  isSupportedCountryCode,
} from '@/src/shared/server/config/countryDatasets'
import { KV_KEYS } from '@/src/shared/setup/keys'
import { getRegistrationStatusViaProxy } from '@/src/shared/setup/proxy'
import { kvGet, kvGetMany, kvSet } from '@/src/shared/storage/stationKv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type SiteProfile = {
  siteName: string
  taxNumber?: string
  address?: string
  country?: string
  currency?: string
  timezone?: string
}

export type SiteSyncResult = {
  ok: boolean
  status?: number
  error?: string
  profile?: SiteProfile
  needsCountry?: boolean
  country?: string | null
}

const normalizeString = (value: unknown) => String(value || '').trim()
const pickString = (...values: unknown[]) =>
  values.map(normalizeString).find(Boolean) || ''
const normalizeCountry = (value: string) => value.trim().toUpperCase()

const proxyErrorMessage = (data: any, fallback: string) => {
  const value = data?.error?.message || data?.message || data?.error
  return typeof value === 'string' && value.trim() ? value : fallback
}

const registrationCountryFrom = (payload: any) =>
  pickString(
    payload?.countryCode,
    payload?.countryId,
    payload?.country_code,
    payload?.country_id,
    payload?.identity?.countryCode,
    payload?.identity?.countryId,
    payload?.identity?.country,
  )

const syncCountryToProxy = async (stationId: string, country: string) => {
  const result = await updateRegistrationCountryViaProxy(stationId, country)
  if (!result.ok) {
    throw new Error(
      String(
        proxyErrorMessage(
          result.data,
          'Failed to synchronize the country to vpos-proxy',
        ),
      ),
    )
  }
}

const extractSiteProfile = (payload: any): SiteProfile | null => {
  if (!payload) return null
  const source =
    payload?.data ??
    payload?.site ??
    payload?.siteProfile ??
    payload?.site_profile ??
    payload?.configuration ??
    payload
  if (!source || typeof source !== 'object') return null
  const siteName = pickString(
    source.siteName,
    source.SiteName,
    source.name,
    source.stationName,
    source.station_name,
    source.site,
    source.Site,
    source.businessName,
    source.business_name,
    source.companyName,
    source.company_name,
  )
  if (!siteName) return null
  return {
    siteName,
    taxNumber:
      pickString(
        source.taxNumber,
        source.tax_number,
        source.taxId,
        source.tax_id,
        source.taxpayerId,
        source.tin,
        source.TIN,
      ) || undefined,
    address:
      pickString(
        source.address,
        source.siteAddress,
        source.location,
        source.addressLine,
        source.address_line,
      ) || undefined,
    country:
      pickString(source.country, source.countryCode, source.country_code) ||
      undefined,
    currency:
      pickString(source.currency, source.currencyCode, source.currency_code) ||
      undefined,
    timezone:
      pickString(
        source.timezone,
        source.timeZone,
        source.time_zone,
        source.tz,
      ) || undefined,
  }
}

const persistSiteProfile = async (stationId: string, profile: SiteProfile) => {
  const existingProfile = await kvGet<SiteProfile>(
    stationId,
    KV_KEYS.SITE_PROFILE,
  )
  const normalizedCountry = profile.country
    ? normalizeCountry(profile.country)
    : existingProfile?.country
      ? normalizeCountry(existingProfile.country)
      : ''
  const normalizedTimezone = profile.timezone?.trim() || ''
  const address = profile.address?.trim() || ''
  try {
    await query(
      `UPDATE fuel_stations SET name = COALESCE(NULLIF($2, ''), name), address = COALESCE(NULLIF($3, ''), address), country = COALESCE(NULLIF($4, ''), country), timezone = COALESCE(NULLIF($5, ''), timezone), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [
        stationId,
        profile.siteName,
        address,
        normalizedCountry,
        normalizedTimezone,
      ],
    )
  } catch (err: any) {
    const msg = String(err?.message || '')
    const missingTimezone =
      msg.includes('timezone') &&
      (msg.includes('does not exist') ||
        msg.includes('column') ||
        msg.includes('unknown'))
    if (!missingTimezone) throw err
    await query(
      `UPDATE fuel_stations SET name = COALESCE(NULLIF($2, ''), name), address = COALESCE(NULLIF($3, ''), address), country = COALESCE(NULLIF($4, ''), country), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [stationId, profile.siteName, address, normalizedCountry],
    )
  }
  if (normalizedCountry === 'TZ') {
    await query(
      `UPDATE station_settings
       SET auto_print_receipts = TRUE,
           fiscalization_engine = 'TZ',
           fiscalization_transport = 'proxy',
           updated_at = NOW()
       WHERE station_id = $1`,
      [stationId],
    )
  } else if (normalizedCountry) {
    await query(
      `UPDATE station_settings
       SET fiscalization_transport = 'proxy', updated_at = NOW()
       WHERE station_id = $1`,
      [stationId],
    )
  }

  const stored: SiteProfile = {
    ...profile,
    country: normalizedCountry || undefined,
    timezone: normalizedTimezone || undefined,
    address: address || undefined,
  }
  await Promise.all([
    kvSet(stationId, KV_KEYS.SITE_PROFILE, stored),
    kvSet(stationId, KV_KEYS.SETUP_STEP, 'site'),
    kvSet(stationId, KV_KEYS.SETUP_UPDATED_AT, new Date().toISOString()),
  ])
  return stored
}

const resolveBootstrapSiteName = async (stationId: string) => {
  const kvValues = await kvGetMany<any>(stationId, [
    KV_KEYS.SITE_PROFILE,
    'proxy.identity',
    'vpos.device.data',
  ])
  const existing = kvValues[KV_KEYS.SITE_PROFILE] as SiteProfile | null
  const fromExisting = existing?.siteName?.trim() || ''
  if (fromExisting) return fromExisting
  const identity = kvValues['proxy.identity']
  const fromIdentity = String(identity?.siteName || '').trim()
  if (fromIdentity) return fromIdentity
  const device = kvValues['vpos.device.data']
  const fromDevice = String(device?.deviceName || '').trim()
  if (fromDevice) return fromDevice
  try {
    const reg = await getRegistrationStatusViaProxy(stationId)
    if (reg.ok && reg.data) {
      const payload = (reg.data as any)?.data ?? reg.data
      const fromLive = pickString(
        payload?.identity?.siteName,
        payload?.deviceSettings?.deviceName,
      )
      if (fromLive) return fromLive
    }
  } catch {}
  return 'Unknown Site'
}

const persistMinimalSiteProfile = async (
  stationId: string,
  partial: Partial<SiteProfile> & { siteName?: string },
) => {
  const siteName =
    String(partial.siteName || '').trim() ||
    (await resolveBootstrapSiteName(stationId))
  const country = partial.country
    ? normalizeCountry(String(partial.country))
    : undefined
  const timezone = normalizeString(partial.timezone) || undefined
  const currency = normalizeString(partial.currency) || undefined
  const stored = await persistSiteProfile(stationId, {
    siteName,
    taxNumber: partial.taxNumber,
    address: partial.address,
    country,
    timezone,
    currency,
  })
  await kvSet(stationId, 'setup.siteProfilePending', true)
  return stored
}

export async function getSiteProfile(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  return (
    (await kvGet<SiteProfile>(normalizedStationId, KV_KEYS.SITE_PROFILE)) ||
    null
  )
}

export async function saveSiteProfile(
  stationId: string,
  body: Record<string, unknown>,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const siteName = pickString((body as any)?.siteName, (body as any)?.name)
  if (!siteName) throw new Error('siteName is required')
  const country =
    pickString((body as any)?.country, (body as any)?.countryCode) || undefined
  if (country) {
    const normalizedCountry = normalizeCountry(country)
    if (!(await isSupportedCountryCode(normalizedCountry))) {
      throw new Error('Unsupported country')
    }
    await syncCountryToProxy(normalizedStationId, normalizedCountry)
  }
  return await persistSiteProfile(normalizedStationId, {
    siteName,
    taxNumber:
      pickString((body as any)?.taxNumber, (body as any)?.tax_number) ||
      undefined,
    address: pickString((body as any)?.address) || undefined,
    country,
    currency:
      pickString((body as any)?.currency, (body as any)?.currencyCode) ||
      undefined,
    timezone:
      pickString((body as any)?.timezone, (body as any)?.timeZone) || undefined,
  })
}

export const syncSiteProfileFromProxy = async (
  stationId: string,
): Promise<SiteSyncResult> => {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const result = await getSiteConfigurationPublic()
  if (!result.ok) {
    try {
      const reg = await getRegistrationStatusViaProxy(normalizedStationId)
      if (reg.ok && reg.data) {
        const payload = (reg.data as any)?.data ?? reg.data
        const identity = payload?.identity ?? {}
        const deviceSettings = payload?.deviceSettings ?? {}
        const seeded = await persistMinimalSiteProfile(normalizedStationId, {
          siteName: pickString(identity?.siteName, deviceSettings?.deviceName),
          country: registrationCountryFrom(payload),
          timezone: pickString(identity?.timezone),
          currency: pickString(identity?.currencyCode, identity?.currency),
        })
        const normalizedCountry = seeded.country
          ? normalizeCountry(seeded.country)
          : ''
        const needsCountry =
          !normalizedCountry ||
          !(await isSupportedCountryCode(normalizedCountry))
        await kvSet(normalizedStationId, 'setup.needsCountry', needsCountry)
        return {
          ok: true,
          profile: seeded,
          needsCountry,
          country: normalizedCountry || null,
        }
      }
    } catch {}

    const existing = await kvGet<SiteProfile>(
      normalizedStationId,
      KV_KEYS.SITE_PROFILE,
    )
    const siteName = existing?.siteName?.trim() || ''
    if (siteName) {
      await kvSet(normalizedStationId, 'setup.siteProfilePending', true)
      const normalizedCountry = existing?.country
        ? normalizeCountry(existing.country)
        : ''
      const needsCountry =
        !normalizedCountry || !(await isSupportedCountryCode(normalizedCountry))
      await kvSet(normalizedStationId, 'setup.needsCountry', needsCountry)
      return {
        ok: true,
        profile: existing || undefined,
        needsCountry,
        country: normalizedCountry || null,
      }
    }

    return {
      ok: false,
      status: result.status,
      error:
        (result.data as any)?.message ||
        (result.data as any)?.error ||
        'Failed to fetch site configuration from proxy',
    }
  }

  const profile = extractSiteProfile(result.data)
  if (!profile)
    return {
      ok: false,
      status: 502,
      error: 'Site configuration is missing required fields',
    }
  let effectiveProfile = profile
  try {
    const registration =
      await getRegistrationStatusViaProxy(normalizedStationId)
    const payload = (registration.data as any)?.data ?? registration.data
    const proxyCountry = registration.ok ? registrationCountryFrom(payload) : ''
    if (proxyCountry && (await isSupportedCountryCode(proxyCountry))) {
      // The proxy country reflects the effective country selected during
      // registration. Prefer it over stale or incomplete site configuration.
      effectiveProfile = { ...profile, country: proxyCountry }
    }
  } catch {}

  const profileCountry = effectiveProfile.country
    ? normalizeCountry(effectiveProfile.country)
    : ''
  if (profileCountry && (await isSupportedCountryCode(profileCountry))) {
    try {
      await syncCountryToProxy(normalizedStationId, profileCountry)
    } catch (error) {
      return {
        ok: false,
        status: 502,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to synchronize site country to vpos-proxy',
      }
    }
  }

  const stored = await persistSiteProfile(normalizedStationId, effectiveProfile)
  const normalizedCountry = stored.country
    ? normalizeCountry(stored.country)
    : ''
  const needsCountry =
    !normalizedCountry || !(await isSupportedCountryCode(normalizedCountry))
  await kvSet(normalizedStationId, 'setup.needsCountry', needsCountry)
  return {
    ok: true,
    profile: stored,
    needsCountry,
    country: normalizedCountry || null,
  }
}

export async function setSiteCountry(stationId: string, country: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const normalizedCountry = normalizeCountry(country)
  if (!(await isSupportedCountryCode(normalizedCountry))) {
    throw new Error('Unsupported country')
  }

  await syncCountryToProxy(normalizedStationId, normalizedCountry)

  const existing =
    (await kvGet<SiteProfile>(normalizedStationId, KV_KEYS.SITE_PROFILE)) ||
    null

  const siteName =
    existing?.siteName?.trim() ||
    (await resolveBootstrapSiteName(normalizedStationId))

  const countryMetadata = await getCountryDatasetSummary(normalizedCountry)
  const stored = await persistSiteProfile(normalizedStationId, {
    siteName,
    taxNumber: existing?.taxNumber,
    address: existing?.address,
    currency: existing?.currency || countryMetadata?.currencyCode || undefined,
    timezone: existing?.timezone || countryMetadata?.timezone || undefined,
    country: normalizedCountry,
  })

  await kvSet(normalizedStationId, 'setup.needsCountry', false)

  return {
    ok: true,
    siteProfile: stored,
    needsCountry: false,
    country: normalizedCountry,
  }
}
