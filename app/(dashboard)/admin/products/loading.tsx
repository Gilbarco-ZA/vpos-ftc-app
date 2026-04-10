import { TableSkeleton } from '@/components/ui/table-skeleton'

const ProductsLoading = () => {
  return <TableSkeleton rows={6} columns={4} />
}

export default ProductsLoading
