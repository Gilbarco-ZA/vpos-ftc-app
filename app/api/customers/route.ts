import { NextResponse } from "next/server";

import { wantsHtmlRedirect } from '@/src/platform/web/api/request'
import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { createCustomerRecord } from '@/src/modules/customers/application/createCustomerRecord'
import { listCustomers } from '@/src/modules/customers/application/listCustomers'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const includeDeleted = ['true', '1', 'yes'].includes(
      String(searchParams.get('includeDeleted') || '').toLowerCase(),
    )

    const result = await listCustomers({
      stationId: user.stationId,
      q: searchParams.get('q') || '',
      country: searchParams.get('country') || '',
      buyerType: searchParams.get('buyerType') || '',
      includeDeleted,
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 20),
    })

    return ok(result)
  },
})

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user, body }) => {
    const result = await createCustomerRecord({
      stationId: user.stationId,
      userId: user.id,
      stationCountry: user.station?.country,
      body,
    })

    if (result instanceof Response) {
      if ((result as any).status === 403 && wantsHtmlRedirect(req)) {
        const url = new URL('/customers', req.url)
        url.searchParams.set('error', 'CSRF validation failed')
        return NextResponse.redirect(url, { status: 303 })
      }
      return result
    }

    if (wantsHtmlRedirect(req)) {
      const url = new URL('/customers', req.url)
      url.searchParams.set('q', result.searchTin)
      url.searchParams.set('created', '1')
      return NextResponse.redirect(url, { status: 303 })
    }

    return ok(result.customer)
  },
})
