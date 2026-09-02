'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type Language = {
  id: string
  code: string
  name: string
  nativeName?: string | null
  direction: 'ltr' | 'rtl'
  isDefault: boolean
  isActive: boolean
  sortOrder: number
}

type FormState = {
  code: string
  name: string
  nativeName: string
  direction: 'ltr' | 'rtl'
  isDefault: boolean
  isActive: boolean
  sortOrder: number
}

const emptyForm: FormState = {
  code: '',
  name: '',
  nativeName: '',
  direction: 'ltr',
  isDefault: false,
  isActive: true,
  sortOrder: 0,
}

const readPayload = (json: any) => json?.data ?? json ?? {}

export default function LanguagesClient({ children }: { children: ReactNode }) {
  const [csrfToken, setCsrfToken] = useState('')
  const [languages, setLanguages] = useState<Language[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sortedLanguages = useMemo(
    () =>
      [...languages].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [languages],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/languages', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      const payload = readPayload(json)
      if (!res.ok)
        throw new Error(
          payload?.error?.message ||
            payload?.message ||
            'Failed to load languages',
        )
      setLanguages(Array.isArray(payload.languages) ? payload.languages : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load languages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const editLanguage = (language: Language) => {
    setForm({
      code: language.code,
      name: language.name,
      nativeName: language.nativeName || '',
      direction: language.direction,
      isDefault: language.isDefault,
      isActive: language.isActive,
      sortOrder: language.sortOrder,
    })
    setMessage(null)
    setError(null)
  }

  const save = async () => {
    if (!csrfToken) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/languages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'upsert',
          ...form,
        }),
      })
      const json = await res.json().catch(() => ({}))
      const payload = readPayload(json)
      if (!res.ok)
        throw new Error(
          json?.error?.message || payload?.message || 'Failed to save language',
        )
      setLanguages(Array.isArray(payload.languages) ? payload.languages : [])
      setForm(emptyForm)
      setMessage('Language saved')
    } catch (err: any) {
      setError(err?.message || 'Failed to save language')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (language: Language) => {
    if (!csrfToken) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/languages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'set-active',
          code: language.code,
          isActive: !language.isActive,
        }),
      })
      const json = await res.json().catch(() => ({}))
      const payload = readPayload(json)
      if (!res.ok)
        throw new Error(
          json?.error?.message ||
            payload?.message ||
            'Failed to update language',
        )
      setLanguages(Array.isArray(payload.languages) ? payload.languages : [])
      setMessage('Language updated')
    } catch (err: any) {
      setError(err?.message || 'Failed to update language')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <CsrfBootstrap onToken={setCsrfToken} />
      {children}

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Available languages</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-[var(--text-secondary)]">
                Loading languages…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Direction</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLanguages.map((language) => (
                      <tr
                        key={language.code}
                        className="border-t border-border"
                      >
                        <td className="px-3 py-3 font-mono text-xs">
                          {language.code}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-[var(--text-primary)]">
                            {language.name}
                          </div>
                          {language.nativeName ? (
                            <div className="text-xs text-[var(--text-muted)]">
                              {language.nativeName}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          {language.direction.toUpperCase()}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            {language.isDefault ? (
                              <Badge variant="success">Default</Badge>
                            ) : null}
                            <Badge
                              variant={language.isActive ? 'info' : 'neutral'}
                            >
                              {language.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => editLanguage(language)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={saving || language.isDefault}
                              onClick={() => toggleActive(language)}
                            >
                              {language.isActive ? 'Disable' : 'Enable'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {form.code ? 'Edit language' : 'Add language'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              label="Language code"
              helpText="Use a BCP-47 style code such as en, sw, fr, or pt-BR."
            >
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="en"
              />
            </FormField>
            <FormField label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="English"
              />
            </FormField>
            <FormField label="Native name">
              <Input
                value={form.nativeName}
                onChange={(e) =>
                  setForm({ ...form, nativeName: e.target.value })
                }
                placeholder="English"
              />
            </FormField>
            <FormField label="Text direction">
              <Select
                value={form.direction}
                onChange={(e) =>
                  setForm({
                    ...form,
                    direction: e.target.value === 'rtl' ? 'rtl' : 'ltr',
                  })
                }
              >
                <option value="ltr">Left to right</option>
                <option value="rtl">Right to left</option>
              </Select>
            </FormField>
            <FormField label="Sort order">
              <Input
                type="number"
                value={String(form.sortOrder)}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: Number(e.target.value || 0) })
                }
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm({
                    ...form,
                    isDefault: e.target.checked,
                    isActive: e.target.checked ? true : form.isActive,
                  })
                }
              />
              Set as default language
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={saving || !csrfToken}
                onClick={save}
              >
                {saving ? 'Saving…' : 'Save language'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => setForm(emptyForm)}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
