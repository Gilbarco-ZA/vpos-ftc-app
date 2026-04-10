import { TableSkeleton } from '@/components/ui/table-skeleton'

export default function ReceiptsLoading() {
  return <TableSkeleton rows={8} columns={4} />
}
