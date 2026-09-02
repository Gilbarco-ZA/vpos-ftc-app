import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { getForecourtSettings } from '@/src/modules/forecourt/application/forecourtSettings'
import {
  JplSettingsValidationError,
  testJplConnectionSettings,
} from '@/src/modules/forecourt/application/testJplConnectionSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['administrator', 'manager', 'field_engineer'],
  csrf: false,
  handler: async (_req, { user }) => {
    try {
      const settings = await getForecourtSettings(user.stationId)
      return NextResponse.json({
        success: true,
        data: await testJplConnectionSettings(settings),
      })
    } catch (error) {
      if (error instanceof JplSettingsValidationError) {
        return NextResponse.json(
          {
            success: false,
            error: { message: error.message, details: error.details },
          },
          { status: error.status },
        )
      }
      throw error
    }
  },
})
