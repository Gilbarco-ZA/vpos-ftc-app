import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import {
  JplSettingsValidationError,
  testJplConnectionSettings,
} from '@/src/modules/forecourt/application/testJplConnectionSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator', 'manager'],
  csrf: false,
  handler: async (_req, { body }) => {
    try {
      return NextResponse.json({
        ok: true,
        success: true,
        data: await testJplConnectionSettings(body || {}),
      })
    } catch (error) {
      if (error instanceof JplSettingsValidationError) {
        return NextResponse.json(
          {
            ok: false,
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
