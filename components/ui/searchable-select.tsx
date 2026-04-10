import type { ReactNode } from 'react'
import {
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { cx } from '@/src/shared/utils/cx'

export type SearchableSelectOption = {
  value: string
  label: string
  secondaryText?: string | null
  searchText?: string | null
}

export type SearchableSelectProps = {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  disabled?: boolean
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  renderOption?: (
    option: SearchableSelectOption,
    isSelected: boolean,
  ) => ReactNode
  renderValue?: (selectedOption: SearchableSelectOption | null) => ReactNode
}

type PanelPosition = {
  top: number
  left: number
  width: number
  strategy: 'fixed' | 'absolute'
}

const DIALOG_CONTENT_SELECTOR =
  '[data-radix-dialog-content], [role="dialog"], [data-slot="sheet-content"]'

const normalize = (value: string) => value.toLowerCase().trim()

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled,
  searchPlaceholder = 'Search…',
  emptyText = 'No results found',
  className,
  renderOption,
  renderValue,
}: SearchableSelectProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const dialogContent =
      containerRef.current?.closest(DIALOG_CONTENT_SELECTOR) ?? null

    setPortalTarget(
      dialogContent instanceof HTMLElement ? dialogContent : document.body,
    )
  }, [mounted])

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  )

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query)
    if (!normalizedQuery) return options

    return options.filter((option) => {
      const haystack = normalize(
        [option.label, option.secondaryText, option.searchText]
          .filter(Boolean)
          .join(' '),
      )
      return haystack.includes(normalizedQuery)
    })
  }, [options, query])

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      if (portalTarget && portalTarget !== document.body) {
        const portalRect = portalTarget.getBoundingClientRect()
        const maxWidth = Math.min(rect.width, portalRect.width - 24)
        const left = Math.max(
          12,
          Math.min(
            rect.left - portalRect.left,
            portalRect.width - maxWidth - 12,
          ),
        )

        setPanelPosition({
          top: rect.bottom - portalRect.top + 6,
          left,
          width: maxWidth,
          strategy: 'absolute',
        })
        return
      }

      const viewportWidth = window.innerWidth
      const maxWidth = Math.min(rect.width, viewportWidth - 24)
      const left = Math.max(
        12,
        Math.min(rect.left, viewportWidth - maxWidth - 12),
      )

      setPanelPosition({
        top: rect.bottom + 6,
        left,
        width: maxWidth,
        strategy: 'fixed',
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, portalTarget])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      setIsOpen(false)
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      return
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault()
      setIsOpen(true)
    }
  }

  const panel =
    mounted && isOpen && panelPosition && portalTarget
      ? createPortal(
          <div
            ref={panelRef}
            className="z-[100]"
            style={{
              position: panelPosition.strategy,
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
            }}
          >
            <div className="overflow-hidden rounded-input border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-elevated">
              <div className="border-b border-[var(--border-default)] p-2">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full rounded-input border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus-visible:border-blue-500/50 focus-visible:bg-[var(--surface-elevated)] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                />
              </div>
              <div
                id={listboxId}
                role="listbox"
                className="max-h-72 overflow-y-auto p-1"
              >
                {filteredOptions.length ? (
                  filteredOptions.map((option) => {
                    const isSelected = option.value === value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={cx(
                          'flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
                            : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
                        )}
                        onClick={() => {
                          onChange(option.value)
                          setIsOpen(false)
                          triggerRef.current?.focus()
                        }}
                      >
                        {renderOption ? (
                          renderOption(option, isSelected)
                        ) : (
                          <>
                            <span className="truncate">{option.label}</span>
                            {option.secondaryText ? (
                              <span className="mt-0.5 whitespace-normal break-words text-xs text-[var(--text-muted)]">
                                {option.secondaryText}
                              </span>
                            ) : null}
                          </>
                        )}
                      </button>
                    )
                  })
                ) : (
                  <div className="px-3 py-2 text-sm text-[var(--text-muted)]">
                    {emptyText}
                  </div>
                )}
              </div>
            </div>
          </div>,
          portalTarget,
        )
      : null

  return (
    <div ref={containerRef} className={cx('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-input border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-left text-sm text-[var(--text-primary)] shadow-sm outline-none transition-all hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] focus-visible:border-blue-500/50 focus-visible:bg-[var(--surface-elevated)] focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {renderValue ? (
          <span
            className={cx(
              'min-w-0 flex-1',
              !selectedOption && 'text-[var(--text-muted)]',
            )}
          >
            {renderValue(selectedOption)}
          </span>
        ) : (
          <span
            className={cx(
              'truncate',
              !selectedOption && 'text-[var(--text-muted)]',
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>
        )}
        <span className="shrink-0 text-xs text-[var(--text-muted)]">▾</span>
      </button>
      {panel}
    </div>
  )
}
