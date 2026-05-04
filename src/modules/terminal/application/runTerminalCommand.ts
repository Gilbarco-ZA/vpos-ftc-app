import { spawn } from 'child_process'
import { NextResponse } from "next/server";

import { badRequest, forbidden } from '@/src/platform/web/api/response'
import { getTerminalAllowlistCommand } from '@/src/shared/terminal/commands'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function runTerminalCommand(command: string) {
  if (process.env.ENABLE_CONSOLE_TERMINAL !== '1') {
    return forbidden('Terminal disabled')
  }

  const cmd = getTerminalAllowlistCommand(
    requireNonEmptyString(command, 'command'),
  )
  if (!cmd) {
    return badRequest('Command not allowed')
  }

  const [bin, ...args] = cmd
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  let out = ''
  let err = ''
  child.stdout.on('data', (d) => (out += d.toString()))
  child.stderr.on('data', (d) => (err += d.toString()))

  const code: number = await new Promise((resolve) =>
    child.on('close', resolve),
  )

  return NextResponse.json({ code, stdout: out, stderr: err })
}
