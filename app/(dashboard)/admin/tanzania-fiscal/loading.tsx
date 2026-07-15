import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingTanzaniaFiscalPage() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
