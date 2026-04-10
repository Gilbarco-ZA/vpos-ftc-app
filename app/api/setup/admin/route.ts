import { NextResponse } from 'next/server'

import { bootstrapStationConfig } from '@/src/platform/config/loader'
import { queryOne } from '@/src/platform/db/postgres'
import { readBody } from '@/src/platform/web/api/request'
import { serverError } from '@/src/platform/web/api/response'
import { createUser } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

import { getOrCreateSetupStationId } from '@/src/modules/setup/application/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  csrf_token?: string
  username?: string
  password?: string
  email?: string
  fullName?: string
  deviceRegistered?: boolean | string
}
export const POST = async (req: Request) => {
  try {
    const body = (await readBody(req)) as Body

    // CSRF protection
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body.csrf_token,
    })

    // Verify device is registered first
    // const deviceStatus = await checkProxyDeviceStatus()
    const deviceRegistered =
      body.deviceRegistered === true ||
      body.deviceRegistered === 'true' ||
      req.headers.get('x-device-registered') === 'true'

    if (!deviceRegistered) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device must be registered before creating admin user',
        },
        { status: 400 },
      )
    }
    const username = String(body.username || '').trim()
    const password = String(body.password || '').trim()
    const email = String(body.email || `${username}@local`).trim()
    const fullName = String(body.fullName || '').trim()

    // Validation
    if (!username || username.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Username must be at least 3 characters' },
        { status: 400 },
      )
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }

    // Get or create default station
    const stationId = await getOrCreateSetupStationId()

    // Check if user already exists
    const existingUser = await queryOne<{ id: string }>(
      `SELECT id FROM users 
       WHERE station_id = $1 
         AND (username = $2 OR email = $3) 
         AND deleted_at IS NULL 
       LIMIT 1`,
      [stationId, username, email],
    )

    if (existingUser?.id) {
      return NextResponse.json(
        { success: false, error: 'User already exists' },
        { status: 409 },
      )
    }

    // Create admin user
    const user = await createUser({
      stationId,
      username,
      email,
      password,
      role: 'administrator',
      fullName: fullName || undefined,
    })

    // Ensure station_config exists
    await bootstrapStationConfig(stationId)

    return NextResponse.json({
      success: true,
      message: 'Admin user created successfully',
      userId: user.id,
      username: user.username,
    })
  } catch (err: any) {
    return await serverError(err, {})
  }
}
