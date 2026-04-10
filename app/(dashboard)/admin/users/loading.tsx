import { TableSkeleton } from '@/components/ui/table-skeleton'

export default function UsersLoading() {
  return <TableSkeleton rows={6} columns={4} />
}
