import { FiscalInboxDetailLoader } from './FiscalInboxDetailLoader'

export const dynamic = 'force-dynamic'

export default async function FiscalInboxDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  return <FiscalInboxDetailLoader id={id} />
}
