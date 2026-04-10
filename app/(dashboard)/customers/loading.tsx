import { TableSkeleton } from '@/components/ui/table-skeleton'

const CustomersLoading = () => {
  return <TableSkeleton rows={6} columns={4} />
}

export default CustomersLoading
