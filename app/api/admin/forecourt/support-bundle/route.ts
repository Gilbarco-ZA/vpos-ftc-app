import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import {
  buildDomsSupportBundleFilename,
  getDomsSupportBundle,
} from '@/src/modules/forecourt/application/domsSupportBundle'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    const inline = url.searchParams.get('inline') === 'true'
    const generatedAt = new Date().toISOString()
    const bundle = await getDomsSupportBundle(user.stationId, {
      eventLimit: url.searchParams.get('limit') ?? undefined,
      includeSamples: url.searchParams.get('includeSamples') !== 'false',
    })

    if (inline) {
      return NextResponse.json({ success: true, data: bundle })
    }

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        'content-disposition': `attachment; filename="${buildDomsSupportBundleFilename(
          user.stationId,
          generatedAt,
        )}"`,
        'content-type': 'application/json; charset=utf-8',
      },
    })
  },
})
