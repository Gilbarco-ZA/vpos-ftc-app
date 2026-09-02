import { requireAuth } from '@/src/shared/auth'

import StockPageClient from '@/components/stock/StockPageClient'

export const dynamic = 'force-dynamic'

export default async function StockPage() {
  await requireAuth(['manager', 'administrator'])
  return <StockPageClient />
}
