import { Skeleton } from '@/components/ui/skeleton'

const PumpDetailLoading = () => {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

export default PumpDetailLoading
