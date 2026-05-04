'use client'

import { useEffect, useMemo, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type ForecourtSettingsForm = {
  jplOperationMode: 'unsupervised' | 'supervised'
  jplHost: string
  jplPort: number
  jplPosId: string
  jplAccessCode: string
  jplCountryCode: string
  jplPosVersionId: string
  jplUnsolicitedDrSeconds: number
  jplHeartbeatIntervalMs: number
  jplDeadConnectionTimeoutMs: number
  jplExpectedMinVersion: string
  jplUnsolicitedFlags: string
  jplUnsolicitedMfdrFlags: string
  jplStatusUpdateCode: number
  jplBootstrapSnapshotEnabled: boolean
  bufferWarnDepthSup: number
  bufferCritDepthSup: number
  bufferWarnAgeMinSup: number
  bufferCritAgeMinSup: number
  bufferWarnDepthUnsup: number
  bufferCritDepthUnsup: number
  bufferWarnAgeMinUnsup: number
  bufferCritAgeMinUnsup: number
}

const normalizeOperationMode = (
  value: unknown,
): ForecourtSettingsForm['jplOperationMode'] => {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'supervised'
    ? 'supervised'
    : 'unsupervised'
}

const toForm = (data: any): ForecourtSettingsForm => ({
  jplOperationMode: normalizeOperationMode(data?.jplOperationMode),
  jplHost: String(data?.jplHost ?? '127.0.0.1'),
  jplPort: Number(data?.jplPort ?? 8888),
  jplPosId: String(data?.jplPosId ?? '01'),
  jplAccessCode: String(data?.jplAccessCode ?? 'POS'),
  jplCountryCode: String(data?.jplCountryCode ?? '1'),
  jplPosVersionId: String(data?.jplPosVersionId ?? '470-02-1.08'),
  jplUnsolicitedDrSeconds: Number(data?.jplUnsolicitedDrSeconds ?? 5),
  jplHeartbeatIntervalMs: Number(data?.jplHeartbeatIntervalMs ?? 15000),
  jplDeadConnectionTimeoutMs: Number(data?.jplDeadConnectionTimeoutMs ?? 30000),
  jplExpectedMinVersion: String(data?.jplExpectedMinVersion ?? '470-02-1.07'),
  jplUnsolicitedFlags: Array.isArray(data?.jplUnsolicitedFlags)
    ? data.jplUnsolicitedFlags.join(',')
    : String(
        data?.jplUnsolicitedFlags ??
          'UNSO_INSTSTA_1,UNSO_TRBUFSTA_3,UNSO_TGSTA_1,UNSO_DELIVSTA_1,UNSO_PRISTA_1',
      ),
  jplUnsolicitedMfdrFlags: Array.isArray(data?.jplUnsolicitedMfdrFlags)
    ? data.jplUnsolicitedMfdrFlags.join(',')
    : String(data?.jplUnsolicitedMfdrFlags ?? 'UNSO_FPSTA_3'),
  jplStatusUpdateCode: Number(data?.jplStatusUpdateCode ?? 3),
  jplBootstrapSnapshotEnabled: Boolean(
    data?.jplBootstrapSnapshotEnabled ?? true,
  ),
  bufferWarnDepthSup: Number(data?.bufferWarnDepthSup ?? 2),
  bufferCritDepthSup: Number(data?.bufferCritDepthSup ?? 5),
  bufferWarnAgeMinSup: Number(data?.bufferWarnAgeMinSup ?? 5),
  bufferCritAgeMinSup: Number(data?.bufferCritAgeMinSup ?? 15),
  bufferWarnDepthUnsup: Number(data?.bufferWarnDepthUnsup ?? 1),
  bufferCritDepthUnsup: Number(data?.bufferCritDepthUnsup ?? 3),
  bufferWarnAgeMinUnsup: Number(data?.bufferWarnAgeMinUnsup ?? 2),
  bufferCritAgeMinUnsup: Number(data?.bufferCritAgeMinUnsup ?? 10),
})

export default function ForecourtSettingsCard() {
  const [settings, setSettings] = useState<ForecourtSettingsForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [legacyMode, setLegacyMode] = useState<string | null>(null)

  const load = async () => {
    setError(null)
    const res = await fetch('/api/admin/setup/forecourt-settings', {
      cache: 'no-store',
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j?.error?.message || j?.error || `HTTP ${res.status}`)
      return
    }
    const data = (j?.data ?? j) as any
    const currentMode = String(data?.mode ?? 'jpl_tcp')
      .trim()
      .toLowerCase()
    setLegacyMode(currentMode === 'jpl_tcp' ? null : currentMode)
    setSettings(toForm(data))
  }

  useEffect(() => {
    safeAsync(load(), 'forecourtSettings.load')
  }, [])

  const canSave = useMemo(() => {
    if (busy) return false
    if (!settings) return false
    return true
  }, [busy, settings])

  const save = async () => {
    if (!settings || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    setTestResult(null)
    setTestError(null)

    try {
      const payload = {
        mode: 'jpl_tcp',
        ...settings,
      }

      const res = await fetch('/api/admin/setup/forecourt-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(j?.error?.message || j?.error || `HTTP ${res.status}`)
      }

      const data = (j?.data ?? j) as any
      setLegacyMode(null)
      setSettings(toForm(data))

      const msg =
        j?.meta?.message ||
        'Saved. Restart the FTC server process to apply connection changes.'
      setNotice(msg)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const testJplSettings = async () => {
    if (!settings || testBusy) return
    setTestBusy(true)
    setTestError(null)
    setTestResult(null)
    setNotice(null)

    try {
      const res = await fetch('/api/admin/setup/test-jpl-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.ok === false) {
        const details = j?.error?.details?.message
          ? ` (${j.error.details.message})`
          : ''
        throw new Error(
          `${j?.error?.message || j?.error || `HTTP ${res.status}`}${details}`,
        )
      }
      setTestResult(j?.data ?? j)
    } catch (e: any) {
      setTestError(e?.message || String(e))
    } finally {
      setTestBusy(false)
    }
  }

  const update = <K extends keyof ForecourtSettingsForm>(
    key: K,
    value: ForecourtSettingsForm[K],
  ) => setSettings((s) => (s ? { ...s, [key]: value } : s))

  return (
    <Card className="space-y-3 p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          0b) Forecourt connection (required)
        </h2>
        <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
          This setup path is now JPL-only. Production deployments do not rely on
          filesystem environment variables; the values saved here override the
          server defaults through{' '}
          <code className="rounded bg-[var(--surface-hover)] px-1">
            station_kv
          </code>
          .
        </p>
      </div>

      {legacyMode ? (
        <Alert
          variant={STATUS_VARIANT.INFO}
          title="Legacy forecourt mode detected"
        >
          This station is currently configured for{' '}
          <code className="rounded bg-[var(--surface-hover)] px-1">
            {legacyMode}
          </code>
          . The setup UI no longer exposes legacy modes. Saving this form will
          move the station onto{' '}
          <code className="rounded bg-[var(--surface-hover)] px-1">
            jpl_tcp
          </code>
          .
        </Alert>
      ) : null}

      <div className="rounded border bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
        <div className="font-semibold text-[var(--text-primary)]">
          Runtime target
        </div>
        <div className="mt-1">
          <code className="rounded bg-[var(--surface-card)] px-1">jpl_tcp</code>{' '}
          is the active and supported forecourt runtime.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <div className="text-sm font-semibold">JPL TCP host</div>
          <Input
            value={settings?.jplHost ?? ''}
            placeholder="127.0.0.1"
            onChange={(e) => update('jplHost', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">JPL TCP port</div>
          <Input
            value={String(settings?.jplPort ?? '')}
            placeholder="8888"
            onChange={(e) => update('jplPort', Number(e.target.value || 0))}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">JPL POS ID</div>
          <Input
            value={settings?.jplPosId ?? ''}
            placeholder="01"
            onChange={(e) => update('jplPosId', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Operation mode</div>
          <Select
            value={settings?.jplOperationMode ?? 'unsupervised'}
            onChange={(e) =>
              update('jplOperationMode', normalizeOperationMode(e.target.value))
            }
          >
            <option value="unsupervised">Unsupervised</option>
            <option value="supervised">Supervised</option>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">JPL access code</div>
          <Input
            value={settings?.jplAccessCode ?? ''}
            placeholder="POS"
            onChange={(e) => update('jplAccessCode', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">JPL country code</div>
          <Input
            value={settings?.jplCountryCode ?? ''}
            placeholder="1"
            onChange={(e) => update('jplCountryCode', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            JPL unsolicited DR seconds
          </div>
          <Input
            value={String(settings?.jplUnsolicitedDrSeconds ?? '')}
            placeholder="5"
            onChange={(e) =>
              update('jplUnsolicitedDrSeconds', Number(e.target.value || 0))
            }
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            JPL heartbeat interval (ms)
          </div>
          <Input
            value={String(settings?.jplHeartbeatIntervalMs ?? '')}
            placeholder="15000"
            onChange={(e) =>
              update('jplHeartbeatIntervalMs', Number(e.target.value || 0))
            }
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            JPL dead connection timeout (ms)
          </div>
          <Input
            value={String(settings?.jplDeadConnectionTimeoutMs ?? '')}
            placeholder="30000"
            onChange={(e) =>
              update('jplDeadConnectionTimeoutMs', Number(e.target.value || 0))
            }
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            JPL expected minimum version
          </div>
          <Input
            value={settings?.jplExpectedMinVersion ?? ''}
            placeholder="470-02-1.07"
            onChange={(e) => update('jplExpectedMinVersion', e.target.value)}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="text-sm font-semibold">
            Unsolicited subscription flags
          </div>
          <Input
            value={settings?.jplUnsolicitedFlags ?? ''}
            placeholder="UNSO_INSTSTA_1,UNSO_TRBUFSTA_3,UNSO_TGSTA_1,UNSO_DELIVSTA_1,UNSO_PRISTA_1"
            onChange={(e) => update('jplUnsolicitedFlags', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">MFDR subscription flags</div>
          <Input
            value={settings?.jplUnsolicitedMfdrFlags ?? ''}
            placeholder="UNSO_FPSTA_3"
            onChange={(e) => update('jplUnsolicitedMfdrFlags', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Status update code</div>
          <Input
            value={String(settings?.jplStatusUpdateCode ?? '')}
            placeholder="3"
            onChange={(e) =>
              update('jplStatusUpdateCode', Number(e.target.value || 0))
            }
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Bootstrap snapshot</div>
          <Select
            value={
              settings?.jplBootstrapSnapshotEnabled ? 'enabled' : 'disabled'
            }
            onChange={(e) =>
              update(
                'jplBootstrapSnapshotEnabled',
                e.target.value === 'enabled',
              )
            }
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <div className="text-sm font-semibold">Warn depth (supervised)</div>
          <Input
            value={String(settings?.bufferWarnDepthSup ?? '')}
            onChange={(e) =>
              update('bufferWarnDepthSup', Number(e.target.value || 0))
            }
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Critical depth (supervised)
          </div>
          <Input
            value={String(settings?.bufferCritDepthSup ?? '')}
            onChange={(e) =>
              update('bufferCritDepthSup', Number(e.target.value || 0))
            }
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Warn age min (supervised)</div>
          <Input
            value={String(settings?.bufferWarnAgeMinSup ?? '')}
            onChange={(e) =>
              update('bufferWarnAgeMinSup', Number(e.target.value || 0))
            }
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Critical age min (supervised)
          </div>
          <Input
            value={String(settings?.bufferCritAgeMinSup ?? '')}
            onChange={(e) =>
              update('bufferCritAgeMinSup', Number(e.target.value || 0))
            }
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Warn depth (unsupervised)</div>
          <Input
            value={String(settings?.bufferWarnDepthUnsup ?? '')}
            onChange={(e) =>
              update('bufferWarnDepthUnsup', Number(e.target.value || 0))
            }
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Critical depth (unsupervised)
          </div>
          <Input
            value={String(settings?.bufferCritDepthUnsup ?? '')}
            onChange={(e) =>
              update('bufferCritDepthUnsup', Number(e.target.value || 0))
            }
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Warn age min (unsupervised)
          </div>
          <Input
            value={String(settings?.bufferWarnAgeMinUnsup ?? '')}
            onChange={(e) =>
              update('bufferWarnAgeMinUnsup', Number(e.target.value || 0))
            }
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Critical age min (unsupervised)
          </div>
          <Input
            value={String(settings?.bufferCritAgeMinUnsup ?? '')}
            onChange={(e) =>
              update('bufferCritAgeMinUnsup', Number(e.target.value || 0))
            }
          />
        </div>
      </div>

      {error ? (
        <Alert variant={STATUS_VARIANT.ERROR} title="Save failed">
          {error}
        </Alert>
      ) : null}

      {notice ? (
        <Alert variant={STATUS_VARIANT.SUCCESS} title="Saved">
          {notice}
        </Alert>
      ) : null}

      {testError ? (
        <Alert variant={STATUS_VARIANT.ERROR} title="JPL settings test failed">
          {testError}
        </Alert>
      ) : null}

      {testResult ? (
        <Alert
          variant={
            testResult.warning ? STATUS_VARIANT.WARN : STATUS_VARIANT.SUCCESS
          }
          title={
            testResult.warning
              ? 'JPL logon passed with warnings'
              : 'JPL settings verified'
          }
        >
          Connected to {testResult.host}:{testResult.port} and accepted access
          code {testResult.acceptedAccessCode}. Status updates:{' '}
          {testResult.statusUpdateOk ? 'OK' : 'check failed'}; pump snapshot:{' '}
          {testResult.fpStatusOk ? 'OK' : 'check failed'}.
          {testResult.warning ? ` ${testResult.warning}` : ''}
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          disabled={!settings || testBusy || busy}
          onClick={testJplSettings}
        >
          {testBusy ? 'Testing…' : 'Test JPL settings'}
        </Button>
        <Button disabled={!canSave} onClick={save}>
          {busy ? 'Saving…' : 'Save forecourt settings'}
        </Button>
      </div>
    </Card>
  )
}
