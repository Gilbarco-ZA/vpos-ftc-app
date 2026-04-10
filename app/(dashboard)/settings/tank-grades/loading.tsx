import { Skeleton } from '@/components/ui/skeleton'

const TankGradesLoading = () => {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

export default TankGradesLoading
