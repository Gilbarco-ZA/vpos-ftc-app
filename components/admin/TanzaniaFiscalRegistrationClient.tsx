'use client'

import { useEffect, useMemo, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

type AnyRecord = Record<string, any>

type RegistrationPayload = {
  station?: AnyRecord | null
  isTanzania?: boolean
  stationSettings?: AnyRecord
  signing?: AnyRecord
  traConfig?: AnyRecord
  traRegistration?: AnyRecord
  ewuraConfig?: AnyRecord
  ewuraRegistration?: AnyRecord
  routeSwitchSafety?: AnyRecord
}

const DEFAULT_TRA_CONFIG: AnyRecord = {
  baseUrl: '',
  taxIdNo: '',
  certKey: '',
  customerIdType: '6',
  routingKey: 'vfdrct',
  certSerial: '',
  vatRate: 0.18,
}

const DEFAULT_TRA_REGISTRATION: AnyRecord = {
  status: 'PENDING',
  registeredAt: '',
  ackcode: '',
  ackmsg: '',
  regid: '',
  serial: '',
  uin: '',
  tin: '',
  vrn: '',
  mobile: '',
  address: '',
  street: '',
  city: '',
  country: 'TANZANIA',
  name: '',
  receiptcode: '',
  region: '',
  routingkey: 'vfdrct',
  gc: '',
  taxoffice: '',
  username: '',
  password: '',
  tokenpath: 'vfdtoken',
  taxcodes: {
    codea: '18',
    codeb: '0',
    codec: '0',
    coded: '0',
  },
}

const DEFAULT_EWURA_CONFIG: AnyRecord = {
  baseUrl: '',
  TranId: '1',
  APISourceId: '',
  RetailStationName: '',
  EWURALicenseNo: '',
  OperatorTin: '',
  OperatorVrn: '',
  OperatorName: '',
  LicenseeTraSerialNo: '',
  RegionName: '',
  DistrictName: '',
  WardName: '',
  Zone: '',
  ContactPersonEmailAddress: '',
  ContactPersonPhone: '',
}

const DEFAULT_EWURA_REGISTRATION: AnyRecord = {
  status: 'PENDING',
  registeredAt: '',
  response: {
    transactionId: '',
    requestName: '',
    code: '',
    message: '',
  },
}

const STATUS_OPTIONS = ['PENDING', 'REGISTERED', 'ACTIVE', 'FAILED', 'UNKNOWN']

const textValue = (value: unknown) => String(value ?? '')

type FiscalizationTransport = 'proxy' | 'local_tz'

function normalizeTransport(value: unknown): FiscalizationTransport {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'local_tz'
    ? 'local_tz'
    : 'proxy'
}

function mergeDefaults(defaults: AnyRecord, value?: AnyRecord) {
  const output: AnyRecord = { ...defaults, ...(value ?? {}) }
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (
      defaultValue &&
      typeof defaultValue === 'object' &&
      !Array.isArray(defaultValue)
    ) {
      output[key] = { ...defaultValue, ...(value?.[key] ?? {}) }
    }
  }
  return output
}

async function jsonFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  })
  const data = await safeAsync(res.json(), 'tanzaniaFiscal.parseJson')
  if (!res.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      `Request failed: ${res.status}`
    throw new Error(String(message))
  }
  return data
}

const TextField = ({
  label,
  value,
  onChange,
  required,
  type = 'text',
  helpText,
}: {
  label: string
  value: unknown
  onChange: (value: string) => void
  required?: boolean
  type?: string
  helpText?: string
}) => (
  <FormField label={label} required={required} helpText={helpText}>
    <Input
      type={type}
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  </FormField>
)

const StatusField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (value: string) => void
}) => (
  <FormField label={label}>
    <Select
      value={textValue(value)}
      onChange={(event) => onChange(event.target.value)}
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </Select>
  </FormField>
)

function InfoPill({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]">
        {textValue(value) || 'Not configured'}
      </div>
    </div>
  )
}

export function TanzaniaFiscalRegistrationClient() {
  const [payload, setPayload] = useState<RegistrationPayload | null>(null)
  const [traConfig, setTraConfig] = useState<AnyRecord>(DEFAULT_TRA_CONFIG)
  const [traRegistration, setTraRegistration] = useState<AnyRecord>(
    DEFAULT_TRA_REGISTRATION,
  )
  const [ewuraConfig, setEwuraConfig] =
    useState<AnyRecord>(DEFAULT_EWURA_CONFIG)
  const [ewuraRegistration, setEwuraRegistration] = useState<AnyRecord>(
    DEFAULT_EWURA_REGISTRATION,
  )
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [fiscalizationTransport, setFiscalizationTransport] =
    useState<FiscalizationTransport>('local_tz')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isTanzania = payload?.isTanzania === true

  const load = async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const res = await jsonFetch('/api/admin/tanzania-fiscal', {
        cache: 'no-store' as any,
      })
      const data = (res?.data ?? {}) as RegistrationPayload
      setPayload(data)
      setTraConfig(mergeDefaults(DEFAULT_TRA_CONFIG, data.traConfig))
      setTraRegistration(
        mergeDefaults(DEFAULT_TRA_REGISTRATION, data.traRegistration),
      )
      setEwuraConfig(mergeDefaults(DEFAULT_EWURA_CONFIG, data.ewuraConfig))
      setEwuraRegistration(
        mergeDefaults(DEFAULT_EWURA_REGISTRATION, data.ewuraRegistration),
      )
      setFiscalizationTransport(
        normalizeTransport(
          data.stationSettings?.fiscalizationTransport ?? 'local_tz',
        ),
      )
      setPrivateKeyPem('')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message ?? String(e)))
  }, [])

  const setTraConfigValue = (key: string, value: string) => {
    setTraConfig((current) => ({ ...current, [key]: value }))
  }

  const setTraRegistrationValue = (key: string, value: string) => {
    setTraRegistration((current) => ({ ...current, [key]: value }))
  }

  const setTraTaxCodeValue = (key: string, value: string) => {
    setTraRegistration((current) => ({
      ...current,
      taxcodes: { ...(current.taxcodes ?? {}), [key]: value },
    }))
  }

  const setEwuraConfigValue = (key: string, value: string) => {
    setEwuraConfig((current) => ({ ...current, [key]: value }))
  }

  const setEwuraRegistrationValue = (key: string, value: string) => {
    setEwuraRegistration((current) => ({ ...current, [key]: value }))
  }

  const setEwuraResponseValue = (key: string, value: string) => {
    setEwuraRegistration((current) => ({
      ...current,
      response: { ...(current.response ?? {}), [key]: value },
    }))
  }

  const copyTraToEwura = () => {
    setEwuraConfig((current) => ({
      ...current,
      OperatorTin: textValue(traRegistration.tin || traConfig.taxIdNo),
      OperatorVrn: textValue(traRegistration.vrn),
      OperatorName: textValue(traRegistration.name),
      RetailStationName: textValue(
        current.RetailStationName ||
          traRegistration.name ||
          payload?.station?.name,
      ),
      LicenseeTraSerialNo: textValue(
        traRegistration.serial || traConfig.certKey,
      ),
      RegionName: textValue(current.RegionName || traRegistration.region),
    }))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await jsonFetch('/api/admin/tanzania-fiscal', {
        method: 'POST',
        body: JSON.stringify({
          fiscalizationTransport,
          traConfig,
          traRegistration,
          ewuraConfig,
          ewuraRegistration,
          signing: { privateKeyPem },
        }),
      })
      const data = (res?.data ?? {}) as RegistrationPayload
      setPayload(data)
      setTraConfig(mergeDefaults(DEFAULT_TRA_CONFIG, data.traConfig))
      setTraRegistration(
        mergeDefaults(DEFAULT_TRA_REGISTRATION, data.traRegistration),
      )
      setEwuraConfig(mergeDefaults(DEFAULT_EWURA_CONFIG, data.ewuraConfig))
      setEwuraRegistration(
        mergeDefaults(DEFAULT_EWURA_REGISTRATION, data.ewuraRegistration),
      )
      setPrivateKeyPem('')
      setNotice('Tanzania fiscal registration details saved to the database.')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const selectedRouteSwitchSafety =
    payload?.routeSwitchSafety?.[fiscalizationTransport] ??
    payload?.routeSwitchSafety?.selected ??
    null
  const routeSwitchBlockers = Array.isArray(selectedRouteSwitchSafety?.blockers)
    ? selectedRouteSwitchSafety.blockers
    : []
  const routeSwitchWarnings = Array.isArray(selectedRouteSwitchSafety?.warnings)
    ? selectedRouteSwitchSafety.warnings
    : []
  const cloudCutoverChecklist = Array.isArray(
    selectedRouteSwitchSafety?.cloudCutoverChecklist,
  )
    ? selectedRouteSwitchSafety.cloudCutoverChecklist
    : Array.isArray(payload?.routeSwitchSafety?.cloudCutoverChecklist)
      ? payload.routeSwitchSafety.cloudCutoverChecklist
      : []

  const pageStatus = useMemo(() => {
    if (!payload) return null
    return {
      country: payload.station?.country ?? 'Not configured',
      engine: payload.stationSettings?.fiscalizationEngine ?? 'mock',
      route:
        payload.stationSettings?.fiscalizationRoute ??
        payload.stationSettings?.fiscalizationTransport ??
        fiscalizationTransport,
      requestedRoute:
        payload.stationSettings?.fiscalizationTransport ??
        fiscalizationTransport,
      signing: payload.signing?.privateKeyConfigured ? 'Configured' : 'Missing',
      vatRate:
        traConfig.vatRate ??
        payload.stationSettings?.vatRateTz ??
        'Not configured',
    }
  }, [payload, traConfig.vatRate, fiscalizationTransport])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert> : null}
      {notice ? <Alert variant={STATUS_VARIANT.SUCCESS}>{notice}</Alert> : null}

      {!isTanzania ? (
        <Alert variant={STATUS_VARIANT.WARN} title="Tanzania station required">
          This setup page only saves TRA and EWURA production registration
          details when the current station country is Tanzania. Current country:{' '}
          {textValue(payload?.station?.country) || 'not configured'}.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Station fiscal status</CardTitle>
          <CardDescription>
            These values are read from the station DB records that fiscalization
            uses at runtime. Environment variables remain developer-only
            fallback values and are not required for production packages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {saving ? (
            <LoadingOverlay label="Saving Tanzania fiscal registration..." />
          ) : null}
          <div className="grid gap-3 md:grid-cols-5">
            <InfoPill label="Country" value={pageStatus?.country} />
            <InfoPill label="Fiscal engine" value={pageStatus?.engine} />
            <InfoPill
              label="Requested route"
              value={pageStatus?.requestedRoute}
            />
            <InfoPill label="Active route" value={pageStatus?.route} />
            <InfoPill label="Signing key" value={pageStatus?.signing} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField
              label="Fiscalization route safety switch"
              helpText="Local Tanzania sends directly to TRA/EWURA from this station. Proxy/cloud sends fiscalization payloads to the configured proxy/cloud service."
            >
              <Select
                value={fiscalizationTransport}
                onChange={(event) =>
                  setFiscalizationTransport(
                    normalizeTransport(event.target.value),
                  )
                }
                disabled={!isTanzania || saving}
              >
                <option value="local_tz">Local Tanzania fiscalization</option>
                <option value="proxy">Proxy/cloud fiscalization</option>
              </Select>
            </FormField>
            <InfoPill label="VAT rate" value={pageStatus?.vatRate} />
          </div>
          {payload?.stationSettings?.fiscalizationRouteReason ? (
            <Alert variant={STATUS_VARIANT.WARN} title="Route guard active">
              {payload.stationSettings.fiscalizationRouteReason}
            </Alert>
          ) : null}
          {selectedRouteSwitchSafety ? (
            <div className="space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Route switch safety
                </div>
                <div className="text-sm text-[var(--text-muted)]">
                  Target: {fiscalizationTransport}. Allowed:{' '}
                  {selectedRouteSwitchSafety.allowed ? 'yes' : 'no'}; blockers:{' '}
                  {routeSwitchBlockers.length}; warnings:{' '}
                  {routeSwitchWarnings.length}.
                </div>
              </div>
              {routeSwitchBlockers.length ? (
                <Alert
                  variant={STATUS_VARIANT.ERROR}
                  title="Route switch blocked"
                >
                  <ul className="list-disc space-y-1 pl-5">
                    {routeSwitchBlockers.slice(0, 5).map((issue: AnyRecord) => (
                      <li key={textValue(issue.code)}>
                        {textValue(issue.message)}
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
              {!routeSwitchBlockers.length && routeSwitchWarnings.length ? (
                <Alert
                  variant={STATUS_VARIANT.WARN}
                  title="Route switch warnings"
                >
                  <ul className="list-disc space-y-1 pl-5">
                    {routeSwitchWarnings.slice(0, 5).map((issue: AnyRecord) => (
                      <li key={textValue(issue.code)}>
                        {textValue(issue.message)}
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
              {cloudCutoverChecklist.length ? (
                <div className="text-sm text-[var(--text-muted)]">
                  <div className="mb-1 font-medium text-[var(--text-primary)]">
                    Cutover checklist
                  </div>
                  <ol className="list-decimal space-y-1 pl-5">
                    {cloudCutoverChecklist.slice(0, 7).map((item: string) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          ) : null}
          {fiscalizationTransport === 'local_tz' ? (
            <Alert variant={STATUS_VARIANT.WARN} title="Local Tanzania mode">
              Transactions for this station will be claimed by the local TZ
              fiscalization worker and the proxy worker must skip normal
              transaction fiscalization for this station.
            </Alert>
          ) : (
            <Alert variant={STATUS_VARIANT.INFO} title="Proxy/cloud mode">
              Transactions for this station will be claimed by the proxy/cloud
              fiscalization worker. Use this when the cloud service is ready to
              fiscalize Tanzania transactions.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TRA device and endpoint configuration</CardTitle>
          <CardDescription>
            Persist the device-level TRA values previously kept in
            fiscal.config.json, plus the endpoint used by the DB-backed FTC
            fiscalization worker.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextField
            label="TRA base URL"
            value={traConfig.baseUrl}
            onChange={(v) => setTraConfigValue('baseUrl', v)}
            required
          />
          <TextField
            label="Tax ID No / TIN"
            value={traConfig.taxIdNo}
            onChange={(v) => setTraConfigValue('taxIdNo', v)}
            required
          />
          <TextField
            label="Certificate key / VFD serial"
            value={traConfig.certKey}
            onChange={(v) => setTraConfigValue('certKey', v)}
            required
          />
          <TextField
            label="Customer ID type"
            value={traConfig.customerIdType}
            onChange={(v) => setTraConfigValue('customerIdType', v)}
          />
          <TextField
            label="Routing key"
            value={traConfig.routingKey}
            onChange={(v) => setTraConfigValue('routingKey', v)}
          />
          <TextField
            label="Certificate serial header"
            value={traConfig.certSerial}
            onChange={(v) => setTraConfigValue('certSerial', v)}
            helpText="Optional when the certificate artifact can provide it."
          />
          <TextField
            label="VAT rate"
            type="number"
            value={traConfig.vatRate}
            onChange={(v) => setTraConfigValue('vatRate', v)}
            helpText="Use 0.18 for 18%, or 18 if the site stores tax rates as whole percentages."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TRA registration response</CardTitle>
          <CardDescription>
            Values returned by TRA registration. The runtime reads these from
            fiscal_registration instead of the old fiscal.registration.json
            file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatusField
              label="Status"
              value={traRegistration.status}
              onChange={(v) => setTraRegistrationValue('status', v)}
            />
            <TextField
              label="Registered at"
              value={traRegistration.registeredAt}
              onChange={(v) => setTraRegistrationValue('registeredAt', v)}
              helpText="ISO timestamp, optional."
            />
            <TextField
              label="ACK code"
              value={traRegistration.ackcode}
              onChange={(v) => setTraRegistrationValue('ackcode', v)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="ACK message"
              value={traRegistration.ackmsg}
              onChange={(v) => setTraRegistrationValue('ackmsg', v)}
            />
            <TextField
              label="VFD registration ID"
              value={traRegistration.regid}
              onChange={(v) => setTraRegistrationValue('regid', v)}
              required
            />
            <TextField
              label="VFD serial"
              value={traRegistration.serial}
              onChange={(v) => setTraRegistrationValue('serial', v)}
              required
            />
            <TextField
              label="UIN"
              value={traRegistration.uin}
              onChange={(v) => setTraRegistrationValue('uin', v)}
            />
            <TextField
              label="TIN"
              value={traRegistration.tin}
              onChange={(v) => setTraRegistrationValue('tin', v)}
              required
            />
            <TextField
              label="VRN"
              value={traRegistration.vrn}
              onChange={(v) => setTraRegistrationValue('vrn', v)}
            />
            <TextField
              label="Mobile"
              value={traRegistration.mobile}
              onChange={(v) => setTraRegistrationValue('mobile', v)}
            />
            <TextField
              label="Address"
              value={traRegistration.address}
              onChange={(v) => setTraRegistrationValue('address', v)}
            />
            <TextField
              label="Street"
              value={traRegistration.street}
              onChange={(v) => setTraRegistrationValue('street', v)}
            />
            <TextField
              label="City"
              value={traRegistration.city}
              onChange={(v) => setTraRegistrationValue('city', v)}
            />
            <TextField
              label="Country"
              value={traRegistration.country}
              onChange={(v) => setTraRegistrationValue('country', v)}
            />
            <TextField
              label="Registered name"
              value={traRegistration.name}
              onChange={(v) => setTraRegistrationValue('name', v)}
              required
            />
            <TextField
              label="Receipt code"
              value={traRegistration.receiptcode}
              onChange={(v) => setTraRegistrationValue('receiptcode', v)}
              required
            />
            <TextField
              label="Region"
              value={traRegistration.region}
              onChange={(v) => setTraRegistrationValue('region', v)}
            />
            <TextField
              label="Routing key"
              value={traRegistration.routingkey}
              onChange={(v) => setTraRegistrationValue('routingkey', v)}
            />
            <TextField
              label="Global counter"
              value={traRegistration.gc}
              onChange={(v) => setTraRegistrationValue('gc', v)}
            />
            <TextField
              label="Tax office"
              value={traRegistration.taxoffice}
              onChange={(v) => setTraRegistrationValue('taxoffice', v)}
            />
            <TextField
              label="TRA username"
              value={traRegistration.username}
              onChange={(v) => setTraRegistrationValue('username', v)}
            />
            <TextField
              label="TRA password"
              type="password"
              value={traRegistration.password}
              onChange={(v) => setTraRegistrationValue('password', v)}
            />
            <TextField
              label="Token path"
              value={traRegistration.tokenpath}
              onChange={(v) => setTraRegistrationValue('tokenpath', v)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <TextField
              label="Tax code A"
              value={traRegistration.taxcodes?.codea}
              onChange={(v) => setTraTaxCodeValue('codea', v)}
            />
            <TextField
              label="Tax code B"
              value={traRegistration.taxcodes?.codeb}
              onChange={(v) => setTraTaxCodeValue('codeb', v)}
            />
            <TextField
              label="Tax code C"
              value={traRegistration.taxcodes?.codec}
              onChange={(v) => setTraTaxCodeValue('codec', v)}
            />
            <TextField
              label="Tax code D"
              value={traRegistration.taxcodes?.coded}
              onChange={(v) => setTraTaxCodeValue('coded', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EWURA registration request</CardTitle>
          <CardDescription>
            This mirrors the file-based EWURA setup form and stores the request
            values in ewura_config for sales and inventory report submission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={copyTraToEwura} type="button">
              Copy TRA values into EWURA
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="EWURA base URL"
              value={ewuraConfig.baseUrl}
              onChange={(v) => setEwuraConfigValue('baseUrl', v)}
              required
            />
            <TextField
              label="TranId"
              value={ewuraConfig.TranId}
              onChange={(v) => setEwuraConfigValue('TranId', v)}
            />
            <TextField
              label="API source ID"
              value={ewuraConfig.APISourceId}
              onChange={(v) => setEwuraConfigValue('APISourceId', v)}
              required
            />
            <TextField
              label="Retail station name"
              value={ewuraConfig.RetailStationName}
              onChange={(v) => setEwuraConfigValue('RetailStationName', v)}
              required
            />
            <TextField
              label="EWURA license no"
              value={ewuraConfig.EWURALicenseNo}
              onChange={(v) => setEwuraConfigValue('EWURALicenseNo', v)}
              required
            />
            <TextField
              label="Operator TIN"
              value={ewuraConfig.OperatorTin}
              onChange={(v) => setEwuraConfigValue('OperatorTin', v)}
              required
            />
            <TextField
              label="Operator VRN"
              value={ewuraConfig.OperatorVrn}
              onChange={(v) => setEwuraConfigValue('OperatorVrn', v)}
            />
            <TextField
              label="Operator name"
              value={ewuraConfig.OperatorName}
              onChange={(v) => setEwuraConfigValue('OperatorName', v)}
              required
            />
            <TextField
              label="Licensee TRA serial no"
              value={ewuraConfig.LicenseeTraSerialNo}
              onChange={(v) => setEwuraConfigValue('LicenseeTraSerialNo', v)}
              required
            />
            <TextField
              label="Region"
              value={ewuraConfig.RegionName}
              onChange={(v) => setEwuraConfigValue('RegionName', v)}
              required
            />
            <TextField
              label="District"
              value={ewuraConfig.DistrictName}
              onChange={(v) => setEwuraConfigValue('DistrictName', v)}
              required
            />
            <TextField
              label="Ward"
              value={ewuraConfig.WardName}
              onChange={(v) => setEwuraConfigValue('WardName', v)}
              required
            />
            <TextField
              label="Zone"
              value={ewuraConfig.Zone}
              onChange={(v) => setEwuraConfigValue('Zone', v)}
              required
            />
            <TextField
              label="Contact email"
              type="email"
              value={ewuraConfig.ContactPersonEmailAddress}
              onChange={(v) =>
                setEwuraConfigValue('ContactPersonEmailAddress', v)
              }
              required
            />
            <TextField
              label="Contact phone"
              value={ewuraConfig.ContactPersonPhone}
              onChange={(v) => setEwuraConfigValue('ContactPersonPhone', v)}
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EWURA registration response</CardTitle>
          <CardDescription>
            Store the EWURA registration result returned after the site is
            registered with EWURA.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <StatusField
            label="Status"
            value={ewuraRegistration.status}
            onChange={(v) => setEwuraRegistrationValue('status', v)}
          />
          <TextField
            label="Registered at"
            value={ewuraRegistration.registeredAt}
            onChange={(v) => setEwuraRegistrationValue('registeredAt', v)}
          />
          <TextField
            label="Transaction ID"
            value={ewuraRegistration.response?.transactionId}
            onChange={(v) => setEwuraResponseValue('transactionId', v)}
          />
          <TextField
            label="Request name"
            value={ewuraRegistration.response?.requestName}
            onChange={(v) => setEwuraResponseValue('requestName', v)}
          />
          <TextField
            label="Response code"
            value={ewuraRegistration.response?.code}
            onChange={(v) => setEwuraResponseValue('code', v)}
          />
          <TextField
            label="Response message"
            value={ewuraRegistration.response?.message}
            onChange={(v) => setEwuraResponseValue('message', v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signing key</CardTitle>
          <CardDescription>
            Optional. Paste a PEM private key only when the site signing key
            needs to be stored or rotated. The key is written to
            secure_artifacts and is never returned by this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Private key PEM">
            <Textarea
              className="h-48 font-mono text-xs"
              value={privateKeyPem}
              onChange={(event) => setPrivateKeyPem(event.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----"
            />
          </FormField>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-3 shadow-elevated">
        <Button variant="secondary" onClick={load} disabled={saving}>
          Refresh
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || !isTanzania}
        >
          {saving ? 'Saving...' : 'Save Tanzania fiscal setup'}
        </Button>
      </div>
    </div>
  )
}
