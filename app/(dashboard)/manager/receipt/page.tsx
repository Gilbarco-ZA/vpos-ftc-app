import { redirect } from 'next/navigation'

export default async function ManagerReceiptPage(
  props: {
    searchParams: Promise<{ transactionId?: string; q?: string; print?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = new URLSearchParams({
    status: 'fiscalized',
    view: 'receipt',
  })

  if (searchParams.transactionId) {
    params.set('transactionId', searchParams.transactionId)
  }
  if (searchParams.q) {
    params.set('q', searchParams.q)
  }
  if (searchParams.print) {
    params.set('print', searchParams.print)
  }

  redirect(`/transactions?${params.toString()}`)
}
