import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { listFiscalInboxQuery } from '@/src/modules/fiscal-inbox/application/queries/list-fiscal-inbox'
import { presentFiscalInboxListRows } from '@/src/modules/fiscal-inbox/presentation/presenters/fiscal-inbox.presenter'

import { PageHeader } from '@/components/layout/page-header'

import FiscalInboxPageClient, {
  FiscalInboxRefreshButton,
  FiscalInboxRow,
} from './client'

export const dynamic = 'force-dynamic'

const FiscalInboxPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  let rows: FiscalInboxRow[] = []
  let error: string | null = null

  try {
    const list = await listFiscalInboxQuery({
      stationId: user.stationId,
      status: 'ANY',
      limit: 200,
      offset: 0,
    })
    rows = presentFiscalInboxListRows(list) as FiscalInboxRow[]
  } catch (err: any) {
    error = err?.message ?? 'Failed to load fiscal inbox'
  }

  return (
    <FiscalInboxPageClient initialRows={rows} error={error}>
      <PageHeader
        title="Fiscal inbox"
        description="Inspect pending and failed fiscal messages"
        actions={<FiscalInboxRefreshButton />}
      />
    </FiscalInboxPageClient>
  )
}

export default FiscalInboxPage
