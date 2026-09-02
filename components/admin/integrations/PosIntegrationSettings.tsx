'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type PosBackend = 'none' | 'jpl' | 'ppx' | 'ligo' | 'namos'

type State = {
  backend: PosBackend
  jpl: any
  ppx: any
  ligo: any
  namos: any
}

type Option = { value: string; label: string }

const emptyState: State = {
  backend: 'none',
  jpl: {
    host: '',
    appId: 'VPOS',
    countryCode: 'ZA',
    enabledApcs: ['apc1'],
    timeoutMs: 10000,
    posId: 1,
    fpOperationModeNo: 1,
    portOverrides: { apc1: '', apc2: '' },
  },
  ppx: {
    baseUrl: '',
    timeoutMs: 10000,
    apiKey: '',
    healthPath: '/api/healthz',
    commandPath: '/pos/command',
  },
  ligo: { baseUrl: '', timeoutMs: 10000, apiKey: '' },
  namos: { baseUrl: '', timeoutMs: 10000, apiKey: '' },
}

const readOptions = (payload: any): Option[] => {
  const options = payload?.data?.options ?? payload?.options ?? []
  return Array.isArray(options) ? options : []
}

const asArray = (value: unknown) => (Array.isArray(value) ? value : [])

export default function PosIntegrationSettings() {
  const [csrf, setCsrf] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [state, setState] = useState<State>(emptyState)
  const [backendOptions, setBackendOptions] = useState<Option[]>([])

  const load = useCallback(async () => {
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const [csrfRes, cfgRes, backendsRes] = await Promise.all([
        fetch('/api/security/csrf', { cache: 'no-store' }),
        fetch('/api/admin/integrations/pos', { cache: 'no-store' }),
        fetch('/api/config/pos-backends', { cache: 'no-store' }),
      ])

      const csrfJson = await csrfRes.json().catch(() => ({}))
      if (typeof csrfJson?.token === 'string') setCsrf(csrfJson.token)

      const cfgJson = await cfgRes.json().catch(() => ({}))
      const data = cfgJson?.data ?? cfgJson
      const jplData = data?.jpl ?? {}
      const rawBackend = data?.backend
      const inferredBackend = rawBackend ?? (jplData?.host ? 'jpl' : 'none')

      setBackendOptions(readOptions(await backendsRes.json().catch(() => ({}))))

      setState((prev) => ({
        ...prev,
        backend: inferredBackend as PosBackend,
        jpl: {
          ...prev.jpl,
          ...jplData,
          enabledApcs: asArray(jplData?.enabledApcs).length
            ? jplData.enabledApcs
            : prev.jpl.enabledApcs,
          portOverrides: {
            ...prev.jpl.portOverrides,
            ...(jplData?.portOverrides ?? {}),
          },
        },
        ppx: data?.ppx ?? prev.ppx,
        ligo: data?.ligo ?? prev.ligo,
        namos: data?.namos ?? prev.namos,
      }))
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      safeAsync(load(), 'posIntegration.load')
    })
  }, [load])

  const backendHelp = useMemo(() => {
    if (state.backend === 'jpl') {
      return 'JPL uses the DOMS POS Protocol over the forecourt TCP connection.'
    }
    if (state.backend === 'ligo' || state.backend === 'namos') {
      return 'Note: Ligo/Namos are currently stubbed in this build (commands will not execute against the real POS).'
    }
    if (state.backend === 'ppx') {
      return 'PPX is enabled via HTTP dispatch (health + command endpoints).'
    }
    return 'No external POS integration selected.'
  }, [state.backend])

  const save = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const payload: any = {
        csrf_token: csrf,
        backend: state.backend,
      }
      if (state.backend === 'jpl') payload.jpl = state.jpl
      if (state.backend === 'ppx') payload.ppx = state.ppx
      if (state.backend === 'ligo') payload.ligo = state.ligo
      if (state.backend === 'namos') payload.namos = state.namos

      const res = await fetch('/api/admin/integrations/pos', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? 'Failed to save POS integration')
      setNotice('POS integration saved')
      const data = j?.data ?? {}
      setState((prev) => ({
        ...prev,
        backend: (data?.backend ?? prev.backend) as PosBackend,
      }))
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const renderCommon = (
    node: any,
    setNode: (n: any) => void,
    extra?: ReactNode,
  ) => {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          placeholder="Base URL (e.g., http://127.0.0.1:9000)"
          value={node?.baseUrl ?? ''}
          onChange={(e) => setNode({ ...node, baseUrl: e.target.value })}
        />
        <Input
          placeholder="Timeout ms (e.g., 10000)"
          value={String(node?.timeoutMs ?? '')}
          onChange={(e) => setNode({ ...node, timeoutMs: e.target.value })}
        />
        <Input
          placeholder="API key (optional)"
          value={node?.apiKey ?? ''}
          onChange={(e) => setNode({ ...node, apiKey: e.target.value })}
        />
        {extra ? <div className="md:col-span-3">{extra}</div> : null}
      </div>
    )
  }

  const renderJpl = () => {
    const enabledApcs = new Set(asArray(state.jpl?.enabledApcs))

    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          placeholder="JPL host (e.g., 127.0.0.1)"
          value={state.jpl?.host ?? ''}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: { ...s.jpl, host: e.target.value },
            }))
          }
        />
        <Input
          placeholder="App ID (e.g., VPOS)"
          value={state.jpl?.appId ?? ''}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: { ...s.jpl, appId: e.target.value },
            }))
          }
        />
        <Input
          placeholder="Country code (e.g., ZA)"
          value={state.jpl?.countryCode ?? ''}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: { ...s.jpl, countryCode: e.target.value },
            }))
          }
        />
        <Input
          placeholder="Timeout ms"
          value={String(state.jpl?.timeoutMs ?? '')}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: { ...s.jpl, timeoutMs: e.target.value },
            }))
          }
        />
        <Input
          placeholder="POS ID"
          value={String(state.jpl?.posId ?? '')}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: { ...s.jpl, posId: e.target.value },
            }))
          }
        />
        <Input
          placeholder="FP operation mode no"
          value={String(state.jpl?.fpOperationModeNo ?? '')}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: {
                ...s.jpl,
                fpOperationModeNo: e.target.value,
              },
            }))
          }
        />
        <div className="rounded-lg border border-border p-3 md:col-span-3">
          <div className="mb-2 text-sm font-medium">Enabled APCs</div>
          <div className="flex flex-wrap gap-4 text-sm">
            {['apc1', 'apc2'].map((apc) => {
              const checked = enabledApcs.has(apc)
              return (
                <label key={apc} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(asArray(state.jpl?.enabledApcs))
                      if (e.target.checked) next.add(apc)
                      else next.delete(apc)
                      setState((s) => ({
                        ...s,
                        jpl: {
                          ...s.jpl,
                          enabledApcs: Array.from(next),
                        },
                      }))
                    }}
                  />
                  <span className="uppercase">{apc}</span>
                </label>
              )
            })}
          </div>
        </div>
        <Input
          placeholder="APC1 port override (optional)"
          value={String(state.jpl?.portOverrides?.apc1 ?? '')}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: {
                ...s.jpl,
                portOverrides: {
                  ...s.jpl.portOverrides,
                  apc1: e.target.value,
                },
              },
            }))
          }
        />
        <Input
          placeholder="APC2 port override (optional)"
          value={String(state.jpl?.portOverrides?.apc2 ?? '')}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              jpl: {
                ...s.jpl,
                portOverrides: {
                  ...s.jpl.portOverrides,
                  apc2: e.target.value,
                },
              },
            }))
          }
        />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>POS Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">{backendHelp}</p>

        {error ? (
          <ErrorDetails
            title="Unable to load POS integration"
            message="Check your connection and try again."
            error={error}
          />
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            className="md:col-span-2"
            value={state.backend}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                backend: e.target.value as PosBackend,
              }))
            }
            disabled={loading}
          >
            {backendOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Button
            variant="primary"
            onClick={save}
            disabled={busy || !csrf || loading}
          >
            {busy ? 'Saving…' : 'Save POS Integration'}
          </Button>
        </div>

        {state.backend === 'jpl' ? renderJpl() : null}

        {state.backend === 'ppx'
          ? renderCommon(
              state.ppx,
              (n) => setState((s) => ({ ...s, ppx: n })),
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input
                  placeholder="Health path (default /api/healthz)"
                  value={state.ppx?.healthPath ?? ''}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      ppx: { ...s.ppx, healthPath: e.target.value },
                    }))
                  }
                />
                <Input
                  className="md:col-span-2"
                  placeholder="Command path (default /pos/command)"
                  value={state.ppx?.commandPath ?? ''}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      ppx: { ...s.ppx, commandPath: e.target.value },
                    }))
                  }
                />
              </div>,
            )
          : null}

        {state.backend === 'ligo'
          ? renderCommon(state.ligo, (n) =>
              setState((s) => ({ ...s, ligo: n })),
            )
          : null}

        {state.backend === 'namos'
          ? renderCommon(state.namos, (n) =>
              setState((s) => ({ ...s, namos: n })),
            )
          : null}
      </CardContent>
    </Card>
  )
}
