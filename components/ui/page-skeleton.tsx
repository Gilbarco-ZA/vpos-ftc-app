import { Skeleton } from '@/components/ui/skeleton'

export const PageSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading page">
    <div className="space-y-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full max-w-lg" />
    </div>
    <div className="rounded-lg border bg-[var(--surface-card)] p-6">
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div className="space-y-2" key={index}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
)
