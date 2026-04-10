'use client'

import { useEffect, useMemo, useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

import {
  CATEGORY_ICON_OPTIONS,
  CategoryIconChip,
  CategoryIconGlyph,
  getCategoryIconLabel,
} from './category-icons'

type ProductCategory = {
  id: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  imagePath?: string | null
  sortOrder?: number | null
  isActive?: boolean | null
  productCount?: number | null
}

type DraftCategory = {
  id?: string | null
  code: string
  name: string
  description: string
  icon: string
  sortOrder: string
  isActive: boolean
  image: File | null
  imagePreview: string | null
}

const EMPTY_DRAFT: DraftCategory = {
  id: null,
  code: '',
  name: '',
  description: '',
  icon: '',
  sortOrder: '0',
  isActive: true,
  image: null,
  imagePreview: null,
}

export function ProductCategoriesSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ProductCategory[]>([])
  const [draft, setDraft] = useState<DraftCategory>(EMPTY_DRAFT)

  const imagePreview = useMemo(
    () => draft.imagePreview || null,
    [draft.imagePreview],
  )

  const iconSelectOptions = useMemo(
    () => [
      {
        value: '',
        label: 'No icon',
        secondaryText: 'Use the uploaded image or the default fallback icon.',
        searchText: 'none empty clear default no icon',
      },
      ...CATEGORY_ICON_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        secondaryText: option.keywords || null,
        searchText:
          `${option.value} ${option.label} ${option.keywords ?? ''}`.trim(),
      })),
    ],
    [],
  )

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/product-categories?includeInactive=true', {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message || 'Failed to load categories')
      }
      setItems(Array.isArray(body?.data) ? body.data : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    load()
  }, [open])

  const resetDraft = () => setDraft(EMPTY_DRAFT)

  const startEdit = (item: ProductCategory) => {
    setDraft({
      id: item.id,
      code: item.code || '',
      name: item.name || '',
      description: item.description || '',
      icon: item.icon || '',
      sortOrder: String(item.sortOrder ?? 0),
      isActive: item.isActive ?? true,
      image: null,
      imagePreview: item.imagePath || null,
    })
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Category name is required')
      return
    }

    try {
      setSaving(true)
      setError(null)
      const formData = new FormData()
      formData.set('csrf_token', csrfToken)
      formData.set('name', draft.name)
      formData.set('code', draft.code)
      formData.set('description', draft.description)
      formData.set('icon', draft.icon)
      formData.set('sortOrder', draft.sortOrder)
      formData.set('isActive', String(draft.isActive))
      if (draft.image) formData.set('image', draft.image)

      const url = draft.id
        ? `/api/product-categories/${encodeURIComponent(draft.id)}`
        : '/api/product-categories'
      const method = draft.id ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'x-csrf-token': csrfToken,
        },
        body: formData,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message || 'Failed to save category')
      }

      await load()
      resetDraft()
      onSaved?.()
    } catch (err: any) {
      setError(err?.message || 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: ProductCategory) => {
    if (!window.confirm(`Delete category “${item.name}”?`)) return
    try {
      setError(null)
      const res = await fetch(
        `/api/product-categories/${encodeURIComponent(item.id)}`,
        {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ csrf_token: csrfToken }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message || 'Failed to delete category')
      }
      await load()
      if (draft.id === item.id) resetDraft()
      onSaved?.()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete category')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-dvh max-w-3xl flex-col p-0">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Product categories</SheetTitle>
          <SheetDescription>
            Create POS-ready categories with icons or images, then assign them
            to products from the product form.
          </SheetDescription>
        </SheetHeader>

        <CsrfBootstrap onToken={setCsrfToken} />

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="min-h-0 overflow-y-auto border-r px-6 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Existing categories
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {loading ? 'Loading…' : `${items.length} categories`}
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={resetDraft}>
                New category
              </Button>
            </div>

            {error ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-[var(--surface-card)] p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-muted text-lg">
                        {item.imagePath ? (
                          <img
                            src={item.imagePath}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <CategoryIconGlyph
                            icon={item.icon}
                            fallback="ShoppingBasket"
                            className="h-5 w-5"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {item.name}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {item.code} • {item.productCount ?? 0} products
                        </div>
                        {item.description ? (
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">
                            {item.description}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => startEdit(item)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => remove(item)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {!loading && items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  No categories yet. Create one to start shaping the POS
                  catalog.
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <form className="space-y-4" onSubmit={save}>
              <CsrfHiddenInput token={csrfToken} />
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {draft.id ? 'Edit category' : 'New category'}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  Codes are optional. Pick a Lucide icon for consistent POS
                  visuals. Existing emoji values still render if you already
                  have them saved.
                </div>
              </div>

              <FormField label="Name">
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Beverages"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Code">
                  <Input
                    value={draft.code}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        code: event.target.value,
                      }))
                    }
                    placeholder="BEVERAGES"
                  />
                </FormField>
                <FormField label="Sort order">
                  <Input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        sortOrder: event.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </FormField>
              </div>

              <FormField label="Description">
                <Textarea
                  rows={3}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Displayed in the provisional POS product browser."
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  label="Icon"
                  helpText="Stored as a Lucide icon name for the future POS UI."
                >
                  <div className="space-y-2">
                    <SearchableSelect
                      value={draft.icon}
                      onChange={(nextValue) =>
                        setDraft((prev) => ({ ...prev, icon: nextValue }))
                      }
                      placeholder="Select icon"
                      searchPlaceholder="Search icon"
                      emptyText="No matching icons"
                      options={iconSelectOptions}
                      renderOption={(option) => (
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-muted">
                            {option.value ? (
                              <CategoryIconGlyph
                                icon={option.value}
                                className="h-4 w-4"
                              />
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">
                                —
                              </span>
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {option.label}
                            </div>
                            {option.secondaryText ? (
                              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                                {option.secondaryText}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                      renderValue={(selectedOption) =>
                        selectedOption ? (
                          selectedOption.value ? (
                            <CategoryIconChip
                              icon={selectedOption.value}
                              label={selectedOption.label}
                              className="min-w-0"
                            />
                          ) : (
                            <span className="truncate">
                              {selectedOption.label}
                            </span>
                          )
                        ) : (
                          <span className="truncate">Select icon</span>
                        )
                      }
                    />
                    {draft.icon ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-3 py-2 text-sm text-[var(--text-secondary)]">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-[var(--surface-card)]">
                          <CategoryIconGlyph
                            icon={draft.icon}
                            className="h-4 w-4"
                          />
                        </span>
                        <div>
                          <div className="font-medium text-[var(--text-primary)]">
                            {getCategoryIconLabel(draft.icon)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {draft.icon}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </FormField>
                <FormField label="Image">
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                    className="h-auto p-2"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setDraft((prev) => ({
                        ...prev,
                        image: file,
                        imagePreview: file
                          ? URL.createObjectURL(file)
                          : prev.imagePreview,
                      }))
                    }}
                  />
                </FormField>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-border"
                />
                Active category
              </label>

              {imagePreview ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-muted p-3">
                  <img
                    src={imagePreview}
                    alt="Category preview"
                    className="h-16 w-16 rounded-2xl object-cover"
                  />
                  <div className="text-xs text-[var(--text-muted)]">
                    POS preview image
                  </div>
                </div>
              ) : null}

              <SheetFooter>
                <Button type="button" variant="secondary" onClick={resetDraft}>
                  Reset
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving || !csrfToken}
                >
                  {saving
                    ? 'Saving…'
                    : draft.id
                      ? 'Save category'
                      : 'Create category'}
                </Button>
              </SheetFooter>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
