'use client'

import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
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
import { Textarea } from '@/components/ui/textarea'

type AnyRecord = Record<string, any>

type Props = {
  endpoint?: string
  compact?: boolean
  onComplete?: () => void
}

const DEFAULT_TRA: AnyRecord = {
  tin: '',
  serialNumber: '',
  password: '',
  licenseKey: '',
}

const MAX_TRA_CERTIFICATE_BYTES = 5 * 1024 * 1024

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error(`Failed to read ${file.name}`))
    })
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Failed to read ${file.name} as Base64`))
        return
      }

      const marker = 'base64,'
      const markerIndex = reader.result.indexOf(marker)
      if (markerIndex < 0) {
        reject(new Error(`Failed to convert ${file.name} to Base64`))
        return
      }

      resolve(reader.result.slice(markerIndex + marker.length))
    })
    reader.readAsDataURL(file)
  })

const DEFAULT_EWURA: AnyRecord = {
  retailStationName: '',
  ewuraLicenseNo: '',
  regionName: '',
  districtName: '',
  wardName: '',
  zone: '',
  contactPersonEmailAddress: '',
  contactPersonPhone: '',
}

const messageFrom = (body: any, fallback: string) =>
  body?.error?.message || body?.message || body?.error || fallback

const ResultPanel = ({
  label,
  value,
  rows = 8,
}: {
  label: string
  value: unknown
  rows?: number
}) => {
  if (!value) return null
  return (
    <FormField label={label}>
      <Textarea
        value={JSON.stringify(value, null, 2)}
        readOnly
        rows={rows}
        className="font-mono text-xs"
      />
    </FormField>
  )
}

export function TanzaniaProxyRegistrationClient({
  endpoint = '/api/admin/tanzania-fiscal/proxy-registration',
  compact = false,
  onComplete,
}: Props) {
  const [tra, setTra] = useState<AnyRecord>(DEFAULT_TRA)
  const [ewura, setEwura] = useState<AnyRecord>(DEFAULT_EWURA)
  const [traResult, setTraResult] = useState<AnyRecord | null>(null)
  const [ewuraResult, setEwuraResult] = useState<AnyRecord | null>(null)
  const [certificateFileName, setCertificateFileName] = useState('')
  const [certificateBase64, setCertificateBase64] = useState('')
  const [certificatePassphrase, setCertificatePassphrase] = useState('')
  const [certificateBusy, setCertificateBusy] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState<'load' | 'save' | 'tra' | 'ewura' | null>(
    'load',
  )
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy('load')
    setError(null)
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(messageFrom(body, 'Failed to load Tanzania setup'))
      }
      const data = body?.data ?? body
      const configuration = data?.configuration ?? {}
      setTra((current) => ({ ...current, ...(configuration?.tra || {}) }))
      setEwura((current) => ({ ...current, ...(configuration?.ewura || {}) }))
      setTraResult(data?.registration?.tra ?? null)
      setEwuraResult(data?.registration?.ewura ?? null)
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(null)
    }
  }, [endpoint])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const post = async (action: string, payload: AnyRecord) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ action, payload }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(messageFrom(body, `Failed to ${action}`))
    }
    return body?.data ?? body
  }

  const save = async () => {
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      await post('save', {
        tra: {
          tin: tra.tin,
          serialNumber: tra.serialNumber,
        },
        ewura,
      })
      setNotice('Tanzania TRA and EWURA registration details were saved.')
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(null)
    }
  }

  const registerTra = async () => {
    if (!certificateBase64) {
      setError('Select the TRA .pfx or .p12 certificate package first.')
      return
    }

    setBusy('tra')
    setError(null)
    setNotice(null)
    try {
      const data = await post('register-tra', {
        tin: tra.tin,
        serialNumber: tra.serialNumber,
        password: tra.password,
        licenseKey: tra.licenseKey,
        certificateBase64,
        certificatePassphrase,
      })
      setTraResult({ ok: true, data })
      setTra((current) => ({
        ...current,
        password: '',
        licenseKey: '',
      }))
      setCertificateFileName('')
      setCertificateBase64('')
      setCertificatePassphrase('')
      setNotice('TRA registration was submitted through vpos-proxy.')
      if (ewuraResult?.ok) onComplete?.()
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(null)
    }
  }

  const handleCertificate = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''

    if (!file) {
      setCertificateFileName('')
      setCertificateBase64('')
      return
    }

    setError(null)
    if (file.size > MAX_TRA_CERTIFICATE_BYTES) {
      setCertificateFileName('')
      setCertificateBase64('')
      setError('TRA certificate package must be 5 MB or smaller.')
      return
    }

    setCertificateBusy(true)
    try {
      const encoded = await readFileAsBase64(file)
      setCertificateFileName(file.name)
      setCertificateBase64(encoded)
    } catch (reason: any) {
      setCertificateFileName('')
      setCertificateBase64('')
      setError(reason?.message || String(reason))
    } finally {
      setCertificateBusy(false)
    }
  }

  const registerEwura = async () => {
    setBusy('ewura')
    setError(null)
    setNotice(null)
    try {
      const data = await post('register-ewura', ewura)
      setEwuraResult({ ok: true, data })
      setNotice('EWURA registration was submitted through vpos-proxy.')
      if (traResult?.ok) onComplete?.()
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(null)
    }
  }

  const content = (
    <div className="space-y-5">
      <CsrfBootstrap onToken={setCsrfToken} />
      <Alert variant={STATUS_VARIANT.INFO} title="Tanzania registration">
        TRA and EWURA are registered separately through vpos-proxy. The TRA
        certificate package is converted to Base64 in the browser and submitted
        only for registration; certificate and key material are not saved in the
        setup form.
      </Alert>
      {error ? (
        <Alert variant={STATUS_VARIANT.ERROR} title="Tanzania setup error">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant={STATUS_VARIANT.SUCCESS} title="Tanzania setup updated">
          {notice}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>TRA registration details</CardTitle>
          <CardDescription>
            Sent to TRA cloud registration contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="TIN" required>
              <Input
                value={String(tra.tin || '')}
                onChange={(event) =>
                  setTra((current) => ({ ...current, tin: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Serial number" required>
              <Input
                value={String(tra.serialNumber || '')}
                onChange={(event) =>
                  setTra((current) => ({
                    ...current,
                    serialNumber: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="TRA password" required>
              <Input
                type="password"
                value={String(tra.password || '')}
                onChange={(event) =>
                  setTra((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="TRA licence key" required>
              <Input
                type="password"
                value={String(tra.licenseKey || '')}
                onChange={(event) =>
                  setTra((current) => ({
                    ...current,
                    licenseKey: event.target.value,
                  }))
                }
                autoComplete="off"
              />
            </FormField>
            <FormField
              label="TRA certificate package"
              required
              helpText="Upload the .pfx or .p12 package supplied for the TRA device. The browser converts it to Base64 for submission; FTC derives the certificate serial and signing keys and does not persist the uploaded key material."
            >
              <Input
                type="file"
                accept=".pfx,.p12,application/x-pkcs12"
                onChange={(event) => void handleCertificate(event)}
                disabled={certificateBusy || busy !== null}
              />
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                {certificateBusy
                  ? 'Converting certificate to Base64…'
                  : certificateFileName
                    ? `Selected: ${certificateFileName}`
                    : 'No certificate selected.'}
              </div>
            </FormField>
            <FormField
              label="Certificate passphrase"
              helpText="Used only to import the PFX/P12 package; it is not saved with the station configuration."
            >
              <Input
                type="password"
                value={certificatePassphrase}
                onChange={(event) =>
                  setCertificatePassphrase(event.target.value)
                }
                autoComplete="new-password"
              />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={
                busy !== null ||
                certificateBusy ||
                !certificateBase64 ||
                !csrfToken
              }
              onClick={() => void registerTra()}
              className="gap-2"
            >
              {busy === 'tra' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              {busy === 'tra' ? 'Registering TRA…' : 'Register TRA'}
            </Button>
          </div>
          <ResultPanel
            label="Latest TRA proxy response"
            value={traResult}
            rows={compact ? 5 : 8}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EWURA registration details</CardTitle>
          <CardDescription>
            Sent EWURA cloud registration contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Retail station name', 'retailStationName', 'text'],
              ['EWURA licence number', 'ewuraLicenseNo', 'text'],
              ['Region', 'regionName', 'text'],
              ['District', 'districtName', 'text'],
              ['Ward', 'wardName', 'text'],
              ['Zone', 'zone', 'text'],
              ['Contact email', 'contactPersonEmailAddress', 'email'],
              ['Contact phone', 'contactPersonPhone', 'tel'],
            ].map(([label, key, type]) => (
              <FormField key={key} label={label} required>
                <Input
                  type={type}
                  value={String(ewura[key] || '')}
                  onChange={(event) =>
                    setEwura((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </FormField>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={busy !== null || !csrfToken}
              onClick={() => void registerEwura()}
              className="gap-2"
            >
              {busy === 'ewura' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {busy === 'ewura' ? 'Registering EWURA…' : 'Register EWURA'}
            </Button>
          </div>
          <ResultPanel
            label="Latest EWURA proxy response"
            value={ewuraResult}
            rows={compact ? 5 : 8}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null || !csrfToken}
          onClick={() => void save()}
        >
          {busy === 'save' ? 'Saving…' : 'Save registration details'}
        </Button>
      </div>
    </div>
  )

  return content
}

export default TanzaniaProxyRegistrationClient
