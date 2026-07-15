'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type DatasetType =
  | 'taxTypes'
  | 'productClassCodes'
  | 'productTypeCodes'
  | 'creditNoteReasons'
  | 'packagingUnits'
  | 'quantityUnits'

type DatasetCountry = {
  countryCode: string
  countryName: string
  currencyCode?: string | null
  timezone?: string | null
  defaultLanguageCode?: string | null
  isActive: boolean
  isSystem: boolean
  rowCount: number
  updatedAt?: string | null
}

type DatasetRow = {
  id: string
  countryCode: string
  datasetType: DatasetType
  code: string
  name: string
  description?: string | null
  rate?: number | null
  isActive: boolean
  sortOrder: number
}

type RowForm = {
  id?: string | null
  code: string
  name: string
  description: string
  rate: string
  isActive: boolean
  sortOrder: number
}

const DATASET_LABELS: Record<DatasetType, string> = {
  taxTypes: 'Tax types',
  productClassCodes: 'Product class codes',
  productTypeCodes: 'Product type codes',
  creditNoteReasons: 'Credit note reasons',
  packagingUnits: 'Packaging units',
  quantityUnits: 'Units of measure',
}

const emptyRow: RowForm = {
  id: null,
  code: '',
  name: '',
  description: '',
  rate: '',
  isActive: true,
  sortOrder: 0,
}

const exampleImport = `{
  "countryCode": "UG",
  "countryName": "Uganda",
  "currencyCode": "UGX",
  "timezone": "Africa/Kampala",
  "defaultLanguageCode": "en",
  "dataset": {
    "taxTypes": [{ "code": "A", "name": "Standard VAT", "rate": 18, "sortOrder": 1 }],
    "productClassCodes": [{ "code": "FUEL", "name": "Fuel products", "sortOrder": 1 }],
    "productTypeCodes": [{ "code": "PETROL", "name": "Petrol", "sortOrder": 1 }],
    "creditNoteReasons": [{ "code": "RETURN", "name": "Returned goods", "sortOrder": 1 }],
    "packagingUnits": [{ "code": "1", "name": "1 L", "sortOrder": 1 }],
    "quantityUnits": [{ "code": "L", "name": "Litres", "sortOrder": 1 }]
  }
}`

const readPayload = (json: any) => json?.data ?? json ?? {}

export default function DatasetsClient({ children }: { children: ReactNode }) {
  const [csrfToken, setCsrfToken] = useState('')
  const [countries, setCountries] = useState<DatasetCountry[]>([])
  const [datasetTypes, setDatasetTypes] = useState<DatasetType[]>([])
  const [countryCode, setCountryCode] = useState('')
  const [datasetType, setDatasetType] = useState<DatasetType>('taxTypes')
  const [rows, setRows] = useState<DatasetRow[]>([])
  const [rowForm, setRowForm] = useState<RowForm>(emptyRow)
  const [importText, setImportText] = useState(exampleImport)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedCountry = useMemo(
    () =>
      countries.find((country) => country.countryCode === countryCode) || null,
    [countries, countryCode],
  )

  const load = async (nextCountry = countryCode, nextType = datasetType) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (nextCountry) params.set('country', nextCountry)
      if (nextType) params.set('datasetType', nextType)
      const res = await fetch(`/api/admin/datasets?${params.toString()}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      const payload = readPayload(json)
      if (!res.ok)
        throw new Error(
          json?.error?.message || payload?.message || 'Failed to load datasets',
        )
      const incomingCountries = Array.isArray(payload.countries)
        ? payload.countries
        : []
      const incomingTypes = Array.isArray(payload.datasetTypes)
        ? payload.datasetTypes
        : []
      setCountries(incomingCountries)
      setDatasetTypes(incomingTypes)
      const incomingCountry = String(
        payload.selected?.countryCode ||
          incomingCountries[0]?.countryCode ||
          '',
      )
      const incomingType = (payload.selected?.datasetType ||
        incomingTypes[0] ||
        'taxTypes') as DatasetType
      setCountryCode(incomingCountry)
      setDatasetType(incomingType)
      setRows(Array.isArray(payload.rows) ? payload.rows : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load datasets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('', 'taxTypes')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshSelection = async (
    nextCountry: string,
    nextType: DatasetType,
  ) => {
    setCountryCode(nextCountry)
    setDatasetType(nextType)
    setRowForm(emptyRow)
    await load(nextCountry, nextType)
  }

  const saveRow = async () => {
    if (!csrfToken || !countryCode || !datasetType) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'upsert-row',
          countryCode,
          datasetType,
          id: rowForm.id || null,
          code: rowForm.code,
          name: rowForm.name,
          description: rowForm.description || null,
          rate: datasetType === 'taxTypes' ? Number(rowForm.rate || 0) : null,
          isActive: rowForm.isActive,
          sortOrder: rowForm.sortOrder,
        }),
      })
      const json = await res.json().catch(() => ({}))
      const payload = readPayload(json)
      if (!res.ok)
        throw new Error(
          json?.error?.message ||
            payload?.message ||
            'Failed to save dataset row',
        )
      setRows(Array.isArray(payload.rows) ? payload.rows : [])
      setRowForm(emptyRow)
      setMessage('Dataset row saved')
    } catch (err: any) {
      setError(err?.message || 'Failed to save dataset row')
    } finally {
      setSaving(false)
    }
  }

  const importDataset = async () => {
    if (!csrfToken) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const parsed = JSON.parse(importText)
      const res = await fetch('/api/admin/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'import-country-dataset',
          ...parsed,
        }),
      })
      const json = await res.json().catch(() => ({}))
      const payload = readPayload(json)
      if (!res.ok)
        throw new Error(
          json?.error?.message ||
            payload?.message ||
            'Failed to import dataset',
        )
      const nextCountry = String(
        payload.country?.countryCode || parsed.countryCode || '',
      ).toUpperCase()
      await load(nextCountry, datasetType)
      setMessage('Country dataset imported')
    } catch (err: any) {
      setError(err?.message || 'Failed to import dataset')
    } finally {
      setSaving(false)
    }
  }

  const toggleCountry = async (country: DatasetCountry) => {
    if (!csrfToken) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'set-country-active',
          countryCode: country.countryCode,
          isActive: !country.isActive,
        }),
      })
      const json = await res.json().catch(() => ({}))
      const payload = readPayload(json)
      if (!res.ok)
        throw new Error(
          json?.error?.message ||
            payload?.message ||
            'Failed to update country dataset',
        )
      setCountries(Array.isArray(payload.countries) ? payload.countries : [])
      setMessage('Country dataset updated')
    } catch (err: any) {
      setError(err?.message || 'Failed to update country dataset')
    } finally {
      setSaving(false)
    }
  }

  const editRow = (row: DatasetRow) => {
    setRowForm({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description || '',
      rate: row.rate == null ? '' : String(row.rate),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    })
    setMessage(null)
    setError(null)
  }

  return (
    <div className="space-y-6">
      <CsrfBootstrap onToken={setCsrfToken} />
      {children}

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Countries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {countries.map((country) => (
              <div
                key={country.countryCode}
                className="rounded-lg border border-border p-3"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    void refreshSelection(country.countryCode, datasetType)
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-[var(--text-primary)]">
                      {country.countryName}
                    </div>
                    <Badge variant={country.isActive ? 'info' : 'neutral'}>
                      {country.countryCode}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {country.currencyCode || 'No currency'} · {country.rowCount}{' '}
                    rows
                  </div>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={saving}
                  onClick={() => toggleCountry(country)}
                >
                  {country.isActive ? 'Disable for setup' : 'Enable for setup'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dataset rows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Country">
                  <Select
                    value={countryCode}
                    onChange={(e) =>
                      void refreshSelection(e.target.value, datasetType)
                    }
                  >
                    {countries.map((country) => (
                      <option
                        key={country.countryCode}
                        value={country.countryCode}
                      >
                        {country.countryName} ({country.countryCode})
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Dataset type">
                  <Select
                    value={datasetType}
                    onChange={(e) =>
                      void refreshSelection(
                        countryCode,
                        e.target.value as DatasetType,
                      )
                    }
                  >
                    {datasetTypes.map((type) => (
                      <option key={type} value={type}>
                        {DATASET_LABELS[type] || type}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              {selectedCountry ? (
                <Alert variant="info">
                  Setup country choices are now driven by active records in this
                  table, not by the old hard-coded KE/TZ route.
                </Alert>
              ) : null}

              <div className="grid gap-3 rounded-lg border border-border bg-surface-muted p-3 md:grid-cols-2 xl:grid-cols-5">
                <FormField label="Code">
                  <Input
                    value={rowForm.code}
                    onChange={(e) =>
                      setRowForm({ ...rowForm, code: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Name">
                  <Input
                    value={rowForm.name}
                    onChange={(e) =>
                      setRowForm({ ...rowForm, name: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Description">
                  <Input
                    value={rowForm.description}
                    onChange={(e) =>
                      setRowForm({ ...rowForm, description: e.target.value })
                    }
                  />
                </FormField>
                {datasetType === 'taxTypes' ? (
                  <FormField label="Rate">
                    <Input
                      type="number"
                      value={rowForm.rate}
                      onChange={(e) =>
                        setRowForm({ ...rowForm, rate: e.target.value })
                      }
                    />
                  </FormField>
                ) : null}
                <FormField label="Sort order">
                  <Input
                    type="number"
                    value={String(rowForm.sortOrder)}
                    onChange={(e) =>
                      setRowForm({
                        ...rowForm,
                        sortOrder: Number(e.target.value || 0),
                      })
                    }
                  />
                </FormField>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] md:col-span-2 xl:col-span-1">
                  <input
                    type="checkbox"
                    checked={rowForm.isActive}
                    onChange={(e) =>
                      setRowForm({ ...rowForm, isActive: e.target.checked })
                    }
                  />
                  Active
                </label>
                <div className="flex gap-2 md:col-span-2 xl:col-span-5">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={saving || !csrfToken}
                    onClick={saveRow}
                  >
                    {saving ? 'Saving…' : 'Save row'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => setRowForm(emptyRow)}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  Loading dataset rows…
                </div>
              ) : (
                <div className="max-h-[520px] overflow-auto rounded-lg border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-surface-card text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Rate</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-3 py-3 font-mono text-xs">
                            {row.code}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-[var(--text-primary)]">
                              {row.name}
                            </div>
                            {row.description ? (
                              <div className="text-xs text-[var(--text-muted)]">
                                {row.description}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">{row.rate ?? '—'}</td>
                          <td className="px-3 py-3">
                            <Badge variant={row.isActive ? 'info' : 'neutral'}>
                              {row.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => editRow(row)}
                            >
                              Edit
                            </Button>
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
              <CardTitle>Import country dataset</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Paste a complete country dataset JSON document. Importing
                upserts the country and all known dataset rows.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="min-h-72 w-full rounded-lg border border-border bg-surface-page p-3 font-mono text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
              />
              <Button
                type="button"
                variant="primary"
                disabled={saving || !csrfToken}
                onClick={importDataset}
              >
                {saving ? 'Importing…' : 'Import dataset'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
