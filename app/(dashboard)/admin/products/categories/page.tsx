import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { ProductCategoriesManager } from '@/components/products/ProductCategoriesManager'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default function ProductCategoriesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Products"
        title="Product categories"
        description="Organize the POS catalog with searchable categories, presentation assets, activation state, and display order."
        actions={
          <Button asChild variant="secondary">
            <Link href="/admin/products">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to products
            </Link>
          </Button>
        }
      />
      <ProductCategoriesManager />
    </div>
  )
}
