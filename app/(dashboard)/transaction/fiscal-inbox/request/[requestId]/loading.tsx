import { Skeleton } from '@/components/ui/skeleton'

const FiscalInboxRequestLoading = () => {
  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="rounded-xl border bg-[var(--surface-card)] p-4">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default FiscalInboxRequestLoading
