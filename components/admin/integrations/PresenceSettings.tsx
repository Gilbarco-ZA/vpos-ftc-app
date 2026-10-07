'use client'

import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { safeAsync } from '@/src/shared/utils/safeAsync'

type PresenceConfig = {
  presenceUrl: string
  filePath: string
}

export function PresenceSettings() {
  const [presenceUrl, setPresenceUrl] = useState('')
  const [filePath, setFilePath] = useState('')
  const [csrf, setCsrf] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [csrfRes, configRes] = await Promise.all([
        fetch('/api/security/csrf', { cache: 'no-store' }),
        fetch('/api/admin/config/presence', { cache: 'no-store' }),
      ])
      const csrfJson = await csrfRes.json().catch(() => ({}))
      if (typeof csrfJson?.token === 'string') setCsrf(csrfJson.token)

      const configJson = await configRes.json().catch(() => ({}))
      if (!configRes.ok) throw configJson
      const data = (configJson?.data ?? {}) as PresenceConfig
      setPresenceUrl(data.presenceUrl ?? '')
      setFilePath(data.filePath ?? '')
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      safeAsync(load(), 'presenceSettings.load')
    })
  }, [load])

  const save = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch('/api/admin/config/presence', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          csrf_token: csrf,
          presenceUrl: presenceUrl.trim(),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw body

      const data = (body?.data ?? {}) as PresenceConfig
      setPresenceUrl(data.presenceUrl ?? '')
      setFilePath(data.filePath ?? '')
      setNotice(
        data.presenceUrl
          ? 'Presence URL saved. The remote client will pick up the shared file automatically.'
          : 'Presence URL cleared.',
      )
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remote presence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Configure the HTTP or HTTPS SignalR presence hub used by the VPOS
          remote client for authenticated heartbeats.
        </p>

        {error ? (
          <ErrorDetails
            title="Unable to update remote presence"
            message="Check the URL and try again."
            error={error}
          />
        ) : null}

        {notice ? (
          <p className="text-sm text-[var(--text-secondary)]">{notice}</p>
        ) : null}

        <Input
          value={presenceUrl}
          onChange={(event) => setPresenceUrl(event.target.value)}
          placeholder="https://ec2-13-246-19-190.af-south-1.compute.amazonaws.com/hubs/vpos-presence"
          disabled={loading || busy}
        />

        {filePath ? (
          <p className="text-xs text-[var(--text-muted)]">
            Shared file: <code>{filePath}</code>
          </p>
        ) : null}

        <Button
          variant="primary"
          onClick={save}
          disabled={loading || busy || !csrf}
        >
          {busy ? 'Saving…' : 'Save presence URL'}
        </Button>
      </CardContent>
    </Card>
  )
}
