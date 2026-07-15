import { PageHeader } from '@/components/layout/page-header'

import FiscalInboxPageClient, { FiscalInboxRefreshButton } from './client'

export const dynamic = 'force-dynamic'

const FiscalInboxPage = () => (
  <FiscalInboxPageClient initialRows={[]}>
    <PageHeader
      title="Fiscal inbox"
      description="Inspect pending and failed fiscal messages"
      actions={<FiscalInboxRefreshButton />}
    />
  </FiscalInboxPageClient>
)

export default FiscalInboxPage
