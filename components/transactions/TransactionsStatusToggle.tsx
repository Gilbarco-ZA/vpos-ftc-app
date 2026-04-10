import Link from 'next/link'

import { Button } from '../ui/button'

type Props = {
  active: 'non-fiscalized' | 'fiscalized'
  className?: string
}

export const TransactionsStatusToggle = ({ active }: Props) => {
  return (
    <>
      <Button
        asChild
        variant={active === 'non-fiscalized' ? 'primary' : 'secondary'}
      >
        <Link href="/transactions?status=non-fiscalized">Non-fiscalized</Link>
      </Button>
      <Button
        asChild
        variant={active === 'fiscalized' ? 'primary' : 'secondary'}
      >
        <Link href="/transactions?status=fiscalized">Fiscalized</Link>
      </Button>
    </>
  )
}
