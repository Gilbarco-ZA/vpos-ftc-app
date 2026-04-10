import { cx } from '@/src/shared/utils/cx'

type SegmentedControlOption = {
  label: string
  value: string
  disabled?: boolean
}

type SegmentedControlProps = {
  value: string
  onValueChange: (value: string) => void
  options: SegmentedControlOption[]
  className?: string
}

export function SegmentedControl({
  value,
  onValueChange,
  options,
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cx(
        'inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1',
        className,
      )}
      role="tablist"
      aria-orientation="horizontal"
    >
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cx(
              'rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-50',
              isActive
                ? 'bg-surface-card text-[var(--text-primary)] shadow-card'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
