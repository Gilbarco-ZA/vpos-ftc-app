import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getDomsFirstSiteAcceptancePack } from '@/src/modules/forecourt/application/getDomsFirstSiteAcceptancePack'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const safeFilePart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'station'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const pack = await getDomsFirstSiteAcceptancePack(user.stationId)
    const timestamp = pack.generatedAt
      .replaceAll('-', '')
      .replaceAll(':', '')
      .replaceAll('.', '')
    const filename = `doms-first-site-acceptance-${safeFilePart(user.stationId)}-${timestamp}.json`

    return new NextResponse(JSON.stringify(pack, null, 2), {
      headers: {
        'content-disposition': `attachment; filename="${filename}"`,
        'content-type': 'application/json; charset=utf-8',
      },
    })
  },
})
