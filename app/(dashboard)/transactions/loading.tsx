import { TableSkeleton } from '@/components/ui/table-skeleton'

export default function TransactionsLoading() {
  return <TableSkeleton rows={8} columns={5} />
}
