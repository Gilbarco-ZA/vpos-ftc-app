export function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <details
      open={open}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.tagName.toLowerCase() === 'summary') {
          event.preventDefault()
          onToggle()
        }
      }}
      className="rounded-card border border-border bg-surface-card px-3 py-2"
    >
      <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)]">
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}
