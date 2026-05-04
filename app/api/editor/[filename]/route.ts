import fs from 'fs/promises'
import path from 'path'
import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { readBody } from '@/src/platform/web/api/request'
import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function mustEnable() {
  if (process.env.ENABLE_CONSOLE_EDITOR !== '1') {
    return NextResponse.json({ error: 'Editor disabled' }, { status: 403 })
  }
  return null
}

function safeJoin(root: string, name: string) {
  // prevent path traversal
  const clean = name.replace(/\\/g, '/')
  if (clean.includes('..') || clean.startsWith('/'))
    throw new Error('Invalid filename')
  return path.join(root, clean)
}

export const GET = async (req: Request, props: { params: Promise<{ filename: string }> }) => {
  const params = await props.params;
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const disabled = mustEnable()
    if (disabled) return disabled

    const root =
      process.env.EDITOR_ROOT_DIR ||
      process.env.LEGACY_PERM_DIR ||
      '/opt/fccapps/vpos-perm/vposfiscal'
    const fp = safeJoin(root, params.filename)
    const content = await fs.readFile(fp, 'utf8')
    return NextResponse.json({ filename: params.filename, content })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const POST = async (req: Request, props: { params: Promise<{ filename: string }> }) => {
  const params = await props.params;
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const disabled = mustEnable()
    if (disabled) return disabled

    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body.csrf_token,
    })

    const root =
      process.env.EDITOR_ROOT_DIR ||
      process.env.LEGACY_PERM_DIR ||
      '/opt/fccapps/vpos-perm/vposfiscal'
    const fp = safeJoin(root, params.filename)
    await fs.writeFile(fp, body?.content ?? '', 'utf8')
    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const DELETE = async (req: Request, props: { params: Promise<{ filename: string }> }) => {
  const params = await props.params;
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const disabled = mustEnable()
    if (disabled) return disabled

    const body = await readBody(req)
    if (body?.csrf_token) {
      requireCsrfFromParts({
        headerToken: req.headers.get('x-csrf-token'),
        bodyToken: body.csrf_token,
      })
    }

    const root =
      process.env.EDITOR_ROOT_DIR ||
      process.env.LEGACY_PERM_DIR ||
      '/opt/fccapps/vpos-perm/vposfiscal'
    const fp = safeJoin(root, params.filename)
    await fs.unlink(fp)
    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
