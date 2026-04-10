import { PassThrough, Readable } from 'stream'
import type { SessionUser } from '@/src/shared/types'
import archiver from 'archiver'

import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { getLogContent, listLogs } from '@/src/shared/logs/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Console compatibility alias for /api/logs (vpos-console)
export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const end = new Date()
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    const data = await listLogs(user.stationId, 'live', start, end)
    return ok({ data })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await req.json().catch((): Record<string, any> => ({}))
    const filenames: string[] = Array.isArray(body?.filenames)
      ? body.filenames
      : []
    const type: 'archive' | 'live' =
      body?.type === 'archive' ? 'archive' : 'live'
    if (!filenames.length) return fail('filenames is required', 400)

    const archive = archiver('zip', { zlib: { level: 9 } })
    const pass = new PassThrough()
    archive.on('error', (e) => pass.destroy(e as any))
    archive.pipe(pass)

    for (const filename of filenames) {
      const row = await getLogContent(user.stationId, type, filename)
      if (!row) continue
      archive.append(row.data ?? '', { name: filename })
    }
    await archive.finalize()

    const webStream = (Readable as any).toWeb(pass)
    return new Response(webStream, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${type}-logs.zip"`,
      },
    })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
