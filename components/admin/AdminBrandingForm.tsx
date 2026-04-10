'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Branding = {
  primary_color?: string | null
  secondary_color?: string | null
  station_display_name?: string | null
  receipt_header_text?: string | null
  receipt_footer_text?: string | null
  logo_path?: string | null
}

export const AdminBrandingForm = () => {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initial, setInitial] = useState<Branding | null>(null)
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)

  const previewLogoSrc = useMemo(() => {
    return logoPreviewUrl || initial?.logo_path || null
  }, [initial?.logo_path, logoPreviewUrl])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        setError(null)
        const res = await fetch('/api/admin/branding', { cache: 'no-store' })
        const j = await res.json().catch(() => ({}))
        if (!cancelled) {
          setInitial((j?.data as Branding) ?? null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load branding')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedLogoFile) {
      setLogoPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedLogoFile)
    setLogoPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedLogoFile])

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setSelectedLogoFile(file)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const formData = new FormData(event.currentTarget)
      const res = await fetch('/api/admin/branding', {
        method: 'POST',
        body: formData,
      })
      const j = await res.json().catch(() => ({}))

      if (!res.ok || j?.ok === false || j?.success === false) {
        throw new Error(j?.error?.message || 'Failed to save branding')
      }

      router.replace('/admin/branding')
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Failed to save branding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      encType="multipart/form-data"
      className="space-y-4"
    >
      <CsrfBootstrap onToken={setCsrfToken} />
      <CsrfHiddenInput token={csrfToken} />

      {error ? <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="Station display name">
          <Input
            name="stationDisplayName"
            defaultValue={initial?.station_display_name ?? ''}
            placeholder="Station display name"
          />
        </FormField>
        <FormField label="Primary color" helpText="Used across the app UI.">
          <Input
            name="primaryColor"
            type="color"
            defaultValue={initial?.primary_color ?? '#111827'}
            className="h-11"
          />
        </FormField>
        <FormField
          label="Secondary color"
          helpText="Used for gradients and supporting accents."
        >
          <Input
            name="secondaryColor"
            type="color"
            defaultValue={initial?.secondary_color ?? '#64748b'}
            className="h-11"
          />
        </FormField>
        <FormField
          label="Logo file"
          helpText="PNG, JPG, or SVG. Shown in the app and on receipts."
        >
          <div className="space-y-2">
            <Input
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              className="h-auto p-2"
              onChange={handleLogoChange}
            />
            {previewLogoSrc ? (
              <div className="space-y-2 rounded-2xl border border-border bg-surface-muted p-3">
                <div className="text-xs font-medium text-[var(--text-secondary)]">
                  {selectedLogoFile ? 'New logo preview' : 'Current logo'}
                </div>
                <div className="flex items-center gap-3">
                  <img
                    src={previewLogoSrc}
                    alt={
                      selectedLogoFile
                        ? 'Selected station logo preview'
                        : 'Current station logo'
                    }
                    className="h-16 w-16 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] object-contain p-2"
                  />
                  <div className="text-xs text-[var(--text-muted)]">
                    {selectedLogoFile
                      ? `Selected file: ${selectedLogoFile.name}`
                      : `Current logo: ${String(initial?.logo_path).split('/').pop()}`}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </FormField>
      </div>

      <FormField
        label="Receipt header text"
        helpText="Printed above the receipt details. Branding colors are ignored on mono laser prints."
      >
        <Textarea
          name="receiptHeaderText"
          defaultValue={initial?.receipt_header_text ?? ''}
          placeholder="Receipt header text"
          rows={3}
        />
      </FormField>
      <FormField
        label="Receipt footer text"
        helpText="Printed below the fiscal details and QR code."
      >
        <Textarea
          name="receiptFooterText"
          defaultValue={initial?.receipt_footer_text ?? ''}
          placeholder="Receipt footer text"
          rows={3}
        />
      </FormField>

      <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-[var(--text-secondary)]">
        App colors and logo update the overall UI immediately. Receipt printing
        stays monochrome-friendly, while the configured logo, header, and footer
        remain included on the printout.
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--text-muted)]">
          {loading
            ? 'Loading current settings…'
            : 'Changes apply immediately to this station.'}
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!csrfToken || saving}
          title={!csrfToken ? 'Loading CSRF token…' : undefined}
        >
          {saving ? 'Saving…' : 'Save Branding'}
        </Button>
      </div>
    </form>
  )
}
