'use client'

import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import {
  buildTraEndpointDetails,
  EWURA_DEFAULT_API_SOURCE_ID,
  EWURA_PRODUCTION_BASE_URL,
  TRA_PRODUCTION_BASE_URL,
} from '@/src/modules/tanzania-fiscal/infrastructure/defaults'

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

type RegistrationAction = 'tra' | 'ewura' | null

const DEFAULT_TRA_CONFIG: AnyRecord = {
  baseUrl: TRA_PRODUCTION_BASE_URL,
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
  rawResponse: '',
  httpStatus: '',
  taxcodes: {
    codea: '18',
    codeb: '0',
    codec: '0',
    coded: '0',
    codee: '0',
  },
}

const DEFAULT_EWURA_CONFIG: AnyRecord = {
  baseUrl: EWURA_PRODUCTION_BASE_URL,
  TranId: '1',
  APISourceId: EWURA_DEFAULT_API_SOURCE_ID,
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
    raw: '',
  },
}

const textValue = (value: unknown) => String(value ?? '')

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

async function readJsonResponse(response: Response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok === false) {
    const errorRecord =
      body?.error && typeof body.error === 'object' ? body.error : null
    const message =
      (typeof errorRecord?.message === 'string' && errorRecord.message) ||
      (typeof body?.error === 'string' && body.error) ||
      (typeof body?.message === 'string' && body.message) ||
      `Request failed: ${response.status}`
    const requestId =
      typeof errorRecord?.requestId === 'string'
        ? errorRecord.requestId.trim()
        : ''
    throw new Error(
      requestId ? `${message} (Support code: ${requestId})` : message,
    )
  }
  return body
}

const TextField = ({
  label,
  value,
  onChange,
  required,
  type = 'text',
  helpText,
  readOnly = false,
}: {
  label: string
  value: unknown
  onChange?: (value: string) => void
  required?: boolean
  type?: string
  helpText?: string
  readOnly?: boolean
}) => (
  <FormField label={label} required={required} helpText={helpText}>
    <Input
      type={type}
      value={textValue(value)}
      readOnly={readOnly}
      onChange={(event) => onChange?.(event.target.value)}
      className={readOnly ? 'bg-[var(--surface-muted)]' : undefined}
    />
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
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [certificatePassphrase, setCertificatePassphrase] = useState('')
  const [skipSigningForDebug, setSkipSigningForDebug] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [registrationAction, setRegistrationAction] =
    useState<RegistrationAction>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const hydrate = useCallback((data: RegistrationPayload) => {
    setPayload(data)
    setTraConfig(mergeDefaults(DEFAULT_TRA_CONFIG, data.traConfig))
    setTraRegistration(
      mergeDefaults(DEFAULT_TRA_REGISTRATION, data.traRegistration),
    )
    setEwuraConfig(mergeDefaults(DEFAULT_EWURA_CONFIG, data.ewuraConfig))
    setEwuraRegistration(
      mergeDefaults(DEFAULT_EWURA_REGISTRATION, data.ewuraRegistration),
    )
    setSkipSigningForDebug(data.signing?.skipSigningForDebug === true)
  }, [])

  const load = useCallback(
    async (resetMessages = true) => {
      setLoading(true)
      if (resetMessages) {
        setError(null)
        setNotice(null)
      }
      try {
        const response = await fetch('/api/admin/tanzania-fiscal', {
          cache: 'no-store',
        })
        const body = await readJsonResponse(response)
        hydrate((body?.data ?? {}) as RegistrationPayload)
      } catch (loadError: any) {
        setError(loadError?.message ?? String(loadError))
      } finally {
        setLoading(false)
      }
    },
    [hydrate],
  )

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const traEndpoints = useMemo(
    () => buildTraEndpointDetails(traConfig.baseUrl || TRA_PRODUCTION_BASE_URL),
    [traConfig.baseUrl],
  )

  const selectedRouteSafety =
    payload?.routeSwitchSafety?.proxy ??
    payload?.routeSwitchSafety?.selected ??
    null
  const routeBlockers = Array.isArray(selectedRouteSafety?.blockers)
    ? selectedRouteSafety.blockers
    : []
  const routeWarnings = Array.isArray(selectedRouteSafety?.warnings)
    ? selectedRouteSafety.warnings
    : []

  const renderRouteIssues = (issues: unknown[]) => (
    <ul className="space-y-2">
      {issues.map((issue, index) => {
        const issueRecord =
          issue && typeof issue === 'object'
            ? (issue as Record<string, unknown>)
            : null
        const message =
          typeof issue === 'string'
            ? issue
            : typeof issueRecord?.message === 'string'
              ? issueRecord.message
              : 'Fiscalization route safety check failed.'
        const code =
          typeof issueRecord?.code === 'string' ? issueRecord.code : ''

        return (
          <li key={`${code || 'route-issue'}-${index}`}>
            <div>{message}</div>
            {code ? (
              <div className="mt-0.5 font-mono text-xs opacity-80">{code}</div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )

  const setTraConfigValue = (key: string, value: string) => {
    setTraConfig((current) => ({ ...current, [key]: value }))
  }

  const setEwuraConfigValue = (key: string, value: string) => {
    setEwuraConfig((current) => ({ ...current, [key]: value }))
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
      const response = await fetch('/api/admin/tanzania-fiscal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fiscalizationTransport: 'proxy',
          traConfig,
          traRegistration,
          ewuraConfig,
          ewuraRegistration,
          signing: { skipSigningForDebug },
        }),
      })
      const body = await readJsonResponse(response)
      hydrate((body?.data ?? {}) as RegistrationPayload)
      setNotice('Tanzania fiscal configuration saved.')
    } catch (saveError: any) {
      setError(saveError?.message ?? String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const registerWithTra = async () => {
    setRegistrationAction('tra')
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.set('baseUrl', textValue(traConfig.baseUrl))
      form.set('taxIdNo', textValue(traConfig.taxIdNo))
      form.set('certKey', textValue(traConfig.certKey))
      form.set('customerIdType', textValue(traConfig.customerIdType || '6'))
      form.set('routingKey', textValue(traConfig.routingKey || 'vfdrct'))
      form.set('vatRate', textValue(traConfig.vatRate || 0.18))
      form.set('passphrase', certificatePassphrase)
      if (certificateFile) form.set('certificate', certificateFile)

      const response = await fetch('/api/admin/tanzania-fiscal/tra-register', {
        method: 'POST',
        body: form,
      })
      await readJsonResponse(response)
      setCertificateFile(null)
      setCertificatePassphrase('')
      setNotice(
        'TRA registration completed and the registration response was stored.',
      )
    } catch (registrationError: any) {
      setError(registrationError?.message ?? String(registrationError))
    } finally {
      await load(false)
      setRegistrationAction(null)
    }
  }

  const registerWithEwura = async () => {
    setRegistrationAction('ewura')
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(
        '/api/admin/tanzania-fiscal/ewura-register',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(ewuraConfig),
        },
      )
      await readJsonResponse(response)
      setNotice(
        'EWURA registration completed and the registration response was stored.',
      )
    } catch (registrationError: any) {
      setError(registrationError?.message ?? String(registrationError))
    } finally {
      await load(false)
      setRegistrationAction(null)
    }
  }

  const handleCertificate = (event: ChangeEvent<HTMLInputElement>) => {
    setCertificateFile(event.target.files?.[0] ?? null)
  }

  if (loading && !payload) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert
          variant={STATUS_VARIANT.ERROR}
          title="Tanzania fiscal setup error"
        >
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant={STATUS_VARIANT.SUCCESS} title="Configuration updated">
          {notice}
        </Alert>
      ) : null}
      {!payload?.isTanzania ? (
        <Alert variant={STATUS_VARIANT.WARN} title="Station is not Tanzania">
          The Tanzania fiscal route is only active when the station country is
          Tanzania.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tanzania cloud fiscalization route</CardTitle>
          <CardDescription>
            Tanzania transactions are sent to vpos-proxy, which routes them to
            the licensed Tanzania cloud fiscalization service. Direct local
            TRA/EWURA transaction fiscalization is retired.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <InfoPill label="Station" value={payload?.station?.name} />
            <InfoPill label="Country" value={payload?.station?.country} />
            <InfoPill label="Required transport" value="vpos-proxy" />
            <InfoPill
              label="Transaction route"
              value={payload?.stationSettings?.fiscalizationRoute}
            />
            <InfoPill
              label="Engine"
              value={payload?.stationSettings?.fiscalizationEngine}
            />
          </div>
          {routeBlockers.length ? (
            <Alert variant={STATUS_VARIANT.ERROR} title="Cloud route blocked">
              {renderRouteIssues(routeBlockers)}
            </Alert>
          ) : null}
          {routeWarnings.length ? (
            <Alert variant={STATUS_VARIANT.WARN} title="Cloud route warnings">
              {renderRouteIssues(routeWarnings)}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TRA device and endpoint configuration</CardTitle>
          <CardDescription>
            Mirrors the production vpos-console setup flow: enter the TIN and
            certificate key, upload the TRA PKCS#12/PFX package, then register
            the device. The private signing key and certificate serial are
            extracted and stored as encrypted secure artifacts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="TRA base URL"
              value={traConfig.baseUrl}
              onChange={(value) => setTraConfigValue('baseUrl', value)}
              required
              helpText="Production default from vpos-fiscal-tz."
            />
            <TextField
              label="Tax identification no"
              value={traConfig.taxIdNo}
              onChange={(value) => setTraConfigValue('taxIdNo', value)}
              required
            />
            <TextField
              label="Certificate key"
              value={traConfig.certKey}
              onChange={(value) => setTraConfigValue('certKey', value)}
              required
              helpText="TRA CERTKEY supplied for device registration."
            />
            <TextField
              label="Customer ID type"
              value={traConfig.customerIdType}
              onChange={(value) => setTraConfigValue('customerIdType', value)}
            />
            <TextField
              label="Routing key"
              value={traConfig.routingKey}
              onChange={(value) => setTraConfigValue('routingKey', value)}
            />
            <TextField
              label="VAT rate"
              type="number"
              value={traConfig.vatRate}
              onChange={(value) => setTraConfigValue('vatRate', value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <InfoPill
              label="Registration"
              value={traEndpoints.registrationUrl}
            />
            <InfoPill label="Token" value={traEndpoints.tokenUrl} />
            <InfoPill label="Receipt" value={traEndpoints.receiptUrl} />
            <InfoPill label="Z report" value={traEndpoints.zReportUrl} />
            <InfoPill
              label="Verification"
              value={traEndpoints.verificationUrl}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="TRA certificate package"
              required={!payload?.signing?.privateKeyConfigured}
              helpText="Upload the .pfx or .p12 package provided for the TRA device."
            >
              <Input
                type="file"
                accept=".pfx,.p12,application/x-pkcs12"
                onChange={handleCertificate}
              />
              {certificateFile ? (
                <div className="mt-2 text-xs text-[var(--text-muted)]">
                  Selected: {certificateFile.name}
                </div>
              ) : null}
            </FormField>
            <TextField
              label="Certificate passphrase"
              type="password"
              value={certificatePassphrase}
              onChange={setCertificatePassphrase}
              helpText="Used only to import the PFX; it is not retained in the UI."
            />
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={skipSigningForDebug}
                onChange={(event) =>
                  setSkipSigningForDebug(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--text-primary)]">
                  Skip TRA/EWURA signing for developer diagnostics
                </span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                  Persists the former TZ_FISCAL_SKIP_SIGNING behavior in the
                  station database. Keep this disabled on production sites;
                  signed payloads remain the required default.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <InfoPill
                label="Signing key"
                value={
                  payload?.signing?.privateKeyConfigured
                    ? 'Configured from TRA certificate'
                    : 'Not configured'
                }
              />
              <InfoPill
                label="Certificate serial header"
                value={traConfig.certSerial}
              />
            </div>
            <Button
              type="button"
              onClick={registerWithTra}
              disabled={registrationAction !== null || !payload?.isTanzania}
              className="gap-2"
            >
              {registrationAction === 'tra' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              {registrationAction === 'tra'
                ? 'Registering with TRA…'
                : 'Register / test with TRA'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TRA registration response</CardTitle>
          <CardDescription>
            Read-only values populated from the response returned by TRA after
            device registration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Status', 'status'],
              ['Registered at', 'registeredAt'],
              ['HTTP status', 'httpStatus'],
              ['ACK code', 'ackcode'],
              ['ACK message', 'ackmsg'],
              ['VFD registration ID', 'regid'],
              ['VFD serial', 'serial'],
              ['UIN', 'uin'],
              ['TIN', 'tin'],
              ['VRN', 'vrn'],
              ['Mobile', 'mobile'],
              ['Address', 'address'],
              ['Street', 'street'],
              ['City', 'city'],
              ['Country', 'country'],
              ['Registered name', 'name'],
              ['Receipt code', 'receiptcode'],
              ['Region', 'region'],
              ['Routing key', 'routingkey'],
              ['Global counter', 'gc'],
              ['Tax office', 'taxoffice'],
              ['TRA username', 'username'],
              ['TRA password', 'password'],
              ['Token path', 'tokenpath'],
            ].map(([label, key]) => (
              <TextField
                key={key}
                label={label}
                value={traRegistration[key]}
                readOnly
                type={key === 'password' ? 'password' : 'text'}
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {['codea', 'codeb', 'codec', 'coded', 'codee'].map((code) => (
              <TextField
                key={code}
                label={`Tax ${code.toUpperCase()}`}
                value={traRegistration.taxcodes?.[code]}
                readOnly
              />
            ))}
          </div>
          {traRegistration.rawResponse ? (
            <FormField label="Raw TRA response">
              <Textarea
                value={textValue(traRegistration.rawResponse)}
                readOnly
                rows={10}
                className="font-mono text-xs"
              />
            </FormField>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EWURA registration request</CardTitle>
          <CardDescription>
            Uses the production NPGIS registration endpoint and API source ID
            from vpos-fiscal-tz. The request is signed with the same TRA-derived
            private key stored above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={copyTraToEwura}>
              Copy TRA values into EWURA
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['EWURA base URL', 'baseUrl', true],
              ['TranId', 'TranId', false],
              ['API source ID', 'APISourceId', true],
              ['Retail station name', 'RetailStationName', true],
              ['EWURA license no', 'EWURALicenseNo', true],
              ['Operator TIN', 'OperatorTin', true],
              ['Operator VRN', 'OperatorVrn', false],
              ['Operator name', 'OperatorName', true],
              ['Licensee TRA serial no', 'LicenseeTraSerialNo', true],
              ['Region', 'RegionName', true],
              ['District', 'DistrictName', true],
              ['Ward', 'WardName', true],
              ['Zone', 'Zone', true],
              ['Contact email', 'ContactPersonEmailAddress', true],
              ['Contact phone', 'ContactPersonPhone', true],
            ].map(([label, key, required]) => (
              <TextField
                key={String(key)}
                label={String(label)}
                value={ewuraConfig[String(key)]}
                required={Boolean(required)}
                type={key === 'ContactPersonEmailAddress' ? 'email' : 'text'}
                onChange={(value) => setEwuraConfigValue(String(key), value)}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={registerWithEwura}
              disabled={registrationAction !== null || !payload?.isTanzania}
              className="gap-2"
            >
              {registrationAction === 'ewura' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {registrationAction === 'ewura'
                ? 'Registering with EWURA…'
                : 'Register with EWURA'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EWURA registration response</CardTitle>
          <CardDescription>
            Read-only response captured from the EWURA registration endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="Status"
              value={ewuraRegistration.status}
              readOnly
            />
            <TextField
              label="Registered at"
              value={ewuraRegistration.registeredAt}
              readOnly
            />
            <TextField
              label="Transaction ID"
              value={ewuraRegistration.response?.transactionId}
              readOnly
            />
            <TextField
              label="Request name"
              value={ewuraRegistration.response?.requestName}
              readOnly
            />
            <TextField
              label="Response code"
              value={ewuraRegistration.response?.code}
              readOnly
            />
            <TextField
              label="Response message"
              value={ewuraRegistration.response?.message}
              readOnly
            />
          </div>
          {ewuraRegistration.response?.raw ? (
            <FormField label="Raw EWURA response">
              <Textarea
                value={textValue(ewuraRegistration.response.raw)}
                readOnly
                rows={10}
                className="font-mono text-xs"
              />
            </FormField>
          ) : null}
        </CardContent>
      </Card>

      <div className="bg-[var(--surface-card)]/95 sticky bottom-4 z-10 flex justify-end rounded-xl border border-[var(--border-default)] p-4 shadow-lg backdrop-blur">
        <Button
          type="button"
          onClick={save}
          disabled={saving || registrationAction !== null}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {saving ? 'Saving…' : 'Save Tanzania fiscal configuration'}
        </Button>
      </div>
    </div>
  )
}

export default TanzaniaFiscalRegistrationClient
