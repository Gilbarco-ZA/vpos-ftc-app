import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type RedirectRule = {
  from: string
  to: string
}

const redirectRules: RedirectRule[] = [
  { from: '/tenant/transactions', to: '/transactions' },
  { from: '/tenant', to: '/dashboard' },
  { from: '/manager', to: '/dashboard' },
  { from: '/admin', to: '/dashboard' },
  { from: '/manager/transactions', to: '/transactions' },
  { from: '/manager/reports', to: '/reports' },
  { from: '/admin/runtime/transactions', to: '/transactions' },
  { from: '/tenant/non-fiscalized', to: '/transactions?status=non-fiscalized' },
  { from: '/tenant/fiscalized', to: '/transactions?status=fiscalized' },
  {
    from: '/manager/transactions/non-fiscalized',
    to: '/transactions?status=non-fiscalized',
  },
  {
    from: '/manager/transactions/fiscalized',
    to: '/transactions?status=fiscalized',
  },
  {
    from: '/admin/runtime/transactions/non-fiscalized',
    to: '/transactions?status=non-fiscalized',
  },
  {
    from: '/admin/runtime/transactions/fiscalized',
    to: '/transactions?status=fiscalized',
  },
  {
    from: '/admin/runtime/receipt',
    to: '/transactions?status=fiscalized&view=receipt',
  },
  {
    from: '/manager/receipt',
    to: '/transactions?status=fiscalized&view=receipt',
  },
  { from: '/tenant/receipts', to: '/receipts' },
  { from: '/tenant/customers', to: '/customers' },
  { from: '/tenant/customers/new', to: '/customers' },
  { from: '/manager/customers', to: '/customers' },
  { from: '/admin/customers', to: '/customers' },
  { from: '/manager/tanks', to: '/tanks' },
  { from: '/admin/tanks', to: '/tanks' },
  { from: '/manager/pumps', to: '/pumps' },
  { from: '/admin/pumps', to: '/pumps' },
]

const normalizePath = (pathname: string) =>
  pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname

const buildRedirectUrl = (req: NextRequest, target: string) => {
  const targetUrl = new URL(target, req.url)
  req.nextUrl.searchParams.forEach((value, key) => {
    if (!targetUrl.searchParams.has(key)) {
      targetUrl.searchParams.set(key, value)
    }
  })
  return targetUrl
}

export const proxy = (req: NextRequest) => {
  const pathname = normalizePath(req.nextUrl.pathname)
  const rule = redirectRules.find((entry) => entry.from === pathname)

  if (!rule) return NextResponse.next()

  const redirectUrl = buildRedirectUrl(req, rule.to)
  return NextResponse.redirect(redirectUrl, 308)
}

export const config = {
  matcher: ['/tenant/:path*', '/manager/:path*', '/admin/:path*'],
}
