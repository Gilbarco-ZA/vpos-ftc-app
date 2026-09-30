import { NextResponse } from 'next/server'

import type { PosDomsRouteCommand } from './posDomsTypes'
import { executePosDomsCommand } from './executePosDomsCommand'

export async function runPosDomsCommand(
  stationId: string,
  command: PosDomsRouteCommand,
  body: Record<string, unknown>,
  options: {
    userId?: string
  } = {},
) {
  const result = await executePosDomsCommand(stationId, command, body, options)

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.message,
        error: result.error,
      },
      { status: 200 },
    )
  }

  return NextResponse.json({
    success: true,
    message: result.message,
    data: result.data,
  })
}
