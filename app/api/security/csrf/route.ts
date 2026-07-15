import { NextResponse } from 'next/server'

import { ensureCsrfCookie } from '@/src/shared/security/csrf'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  const token = await ensureCsrfCookie()
  return NextResponse.json({ success: true, token })
}
