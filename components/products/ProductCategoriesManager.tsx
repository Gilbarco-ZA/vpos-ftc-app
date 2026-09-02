'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { RuntimeImage } from '@/components/ui/runtime-image'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Select } from '@/components/ui/select'
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

type StatusFilter = 'all' | 'active' | 'inactive'

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

const revokeBlobPreview = (preview: string | null | undefined) => {
  if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
}

export function ProductCategoriesManager({
  onSaved,
}: {
  onSaved?: () => void
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ProductCategory[]>([])
  const [draft, setDraft] = useState<DraftCategory>(EMPTY_DRAFT)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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

  const load = useCallback(async () => {
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
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Failed to load categories',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    return () => revokeBlobPreview(draft.imagePreview)
  }, [draft.imagePreview])

  const resetDraft = useCallback(() => {
    setDraft((current) => {
      revokeBlobPreview(current.imagePreview)
      return EMPTY_DRAFT
    })
    setError(null)
  }, [])

  const startEdit = (item: ProductCategory) => {
    setDraft((current) => {
      revokeBlobPreview(current.imagePreview)
      return {
        id: item.id,
        code: item.code || '',
        name: item.name || '',
        description: item.description || '',
        icon: item.icon || '',
        sortOrder: String(item.sortOrder ?? 0),
        isActive: item.isActive ?? true,
        image: null,
        imagePreview: item.imagePath || null,
      }
    })
    setError(null)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
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
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Failed to save category',
      )
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: ProductCategory) => {
    if (!window.confirm(`Delete category “${item.name}”?`)) return

    try {
      setDeletingId(item.id)
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
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Failed to delete category',
      )
    } finally {
      setDeletingId(null)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'active' && item.isActive !== false) ||
          (statusFilter === 'inactive' && item.isActive === false)
        const matchesSearch =
          !normalizedSearch ||
          [item.name, item.code, item.description]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(normalizedSearch),
            )
        return matchesStatus && matchesSearch
      }),
    [items, normalizedSearch, statusFilter],
  )

  const activeCount = items.filter((item) => item.isActive !== false).length
  const assignedProductCount = items.reduce(
    (total, item) => total + Number(item.productCount ?? 0),
    0,
  )

  return (
    <div className="space-y-6">
      <CsrfBootstrap onToken={setCsrfToken} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-card">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Total categories
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
            {items.length}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-card">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Active categories
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
            {activeCount}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-card">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Assigned products
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
            {assignedProductCount}
          </div>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] shadow-card">
          <div className="flex flex-col gap-4 border-b border-[var(--border-default)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                Existing categories
              </h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Search, review assignments, and select a category to edit.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={resetDraft}>
              New category
            </Button>
          </div>

          <div className="grid gap-3 border-b border-[var(--border-default)] p-5 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, code, or description"
                aria-label="Search product categories"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              aria-label="Filter categories by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>

          <div className="space-y-3 p-5">
            {loading ? (
              <div className="rounded-xl border border-dashed border-[var(--border-default)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                Loading categories…
              </div>
            ) : null}

            {!loading && filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-default)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                {items.length === 0
                  ? 'No categories yet. Create one to start shaping the POS catalog.'
                  : 'No categories match the current filters.'}
              </div>
            ) : null}

            {filteredItems.map((item) => {
              const selected = draft.id === item.id
              return (
                <article
                  key={item.id}
                  className={
                    'rounded-xl border p-4 transition-colors ' +
                    (selected
                      ? 'border-[var(--neon-cyan)] bg-[color-mix(in_srgb,var(--neon-cyan)_6%,var(--surface-card))]'
                      : 'border-[var(--border-default)] bg-[var(--surface-muted)]')
                  }
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] text-lg">
                        {item.imagePath ? (
                          <RuntimeImage
                            src={item.imagePath}
                            alt=""
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
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {item.name}
                          </h4>
                          <Badge
                            variant={
                              item.isActive === false ? 'neutral' : 'success'
                            }
                            dot
                          >
                            {item.isActive === false ? 'Inactive' : 'Active'}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span>Code: {item.code || 'Not set'}</span>
                          <span>{item.productCount ?? 0} products</span>
                          <span>Sort order: {item.sortOrder ?? 0}</span>
                        </div>
                        {item.description ? (
                          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant={selected ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => startEdit(item)}
                      >
                        {selected ? 'Editing' : 'Edit'}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deletingId === item.id || !csrfToken}
                        onClick={() => void remove(item)}
                      >
                        {deletingId === item.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] shadow-card xl:sticky xl:top-6">
          <div className="border-b border-[var(--border-default)] p-5">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {draft.id ? 'Edit category' : 'Create category'}
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Configure the category identity, POS presentation, and ordering.
            </p>
          </div>

          <form className="space-y-5 p-5" onSubmit={save}>
            <CsrfHiddenInput token={csrfToken} />

            <FormField label="Name">
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Beverages"
                required
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Code">
                <Input
                  value={draft.code}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
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
                    setDraft((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </FormField>
            </div>

            <FormField label="Description">
              <Textarea
                rows={4}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Describe how this category should be used in the POS catalog."
              />
            </FormField>

            <FormField
              label="Icon"
              helpText="Stored as a Lucide icon name for a consistent POS presentation."
            >
              <div className="space-y-2">
                <SearchableSelect
                  value={draft.icon}
                  onChange={(nextValue) =>
                    setDraft((current) => ({
                      ...current,
                      icon: nextValue,
                    }))
                  }
                  placeholder="Select icon"
                  searchPlaceholder="Search icons"
                  emptyText="No matching icons"
                  options={iconSelectOptions}
                  renderOption={(option) => (
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)]">
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
                        <span className="truncate">{selectedOption.label}</span>
                      )
                    ) : (
                      <span className="truncate">Select icon</span>
                    )
                  }
                />
                {draft.icon ? (
                  <div className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)]">
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

            <FormField
              label="Image"
              helpText="PNG, JPEG, SVG, or WebP. The image takes precedence over the icon."
            >
              <Input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                className="h-auto p-2"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setDraft((current) => {
                    revokeBlobPreview(current.imagePreview)
                    return {
                      ...current,
                      image: file,
                      imagePreview: file
                        ? URL.createObjectURL(file)
                        : current.imagePreview,
                    }
                  })
                }}
              />
            </FormField>

            {draft.imagePreview ? (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
                <RuntimeImage
                  src={draft.imagePreview}
                  alt="Category preview"
                  className="h-20 w-20 rounded-xl object-cover"
                />
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    POS preview
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    This image will be displayed ahead of the selected icon.
                  </div>
                </div>
              </div>
            ) : null}

            <label className="flex items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-[var(--border-default)]"
              />
              <span>
                <span className="block font-medium text-[var(--text-primary)]">
                  Active category
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                  Inactive categories remain available for administration but
                  can be hidden from operational product selection.
                </span>
              </span>
            </label>

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-default)] pt-5 sm:flex-row sm:justify-end">
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
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
