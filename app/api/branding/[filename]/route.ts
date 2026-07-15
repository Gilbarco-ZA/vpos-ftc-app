import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

import { resolveBrandingDir } from '@/src/shared/branding/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

export async function GET(
  _req: Request,
  props: { params: Promise<{ filename: string }> },
) {
  const params = await props.params
  const requested = path.basename(String(params.filename || ''))
  const ext = path.extname(requested).toLowerCase()
  const contentType = MIME_TYPES[ext]

  if (!requested || !contentType) {
    return new NextResponse('Not found', { status: 404 })
  }

  const absolutePath = path.join(resolveBrandingDir(), requested)

  try {
    const file = await fs.readFile(absolutePath)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
