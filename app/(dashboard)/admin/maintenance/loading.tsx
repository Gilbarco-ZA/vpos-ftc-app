import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function MaintenanceLoading() {
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <Skeleton className="mb-2 h-4 w-28" />
        <Skeleton className="mb-3 h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="p-5 sm:p-6">
            <Skeleton className="mb-3 h-5 w-52" />
            <Skeleton className="mb-5 h-4 w-full" />
            <Skeleton className="h-10 w-40" />
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-6 w-32" />
          </Card>
        ))}
      </div>
    </div>
  )
}
