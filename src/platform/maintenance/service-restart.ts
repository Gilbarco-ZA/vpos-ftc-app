import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'

import { readEnvOrDefault } from '@/src/platform/config/env'
import { AppError } from '@/src/shared/errors/AppError'

export const DEFAULT_APPLICATION_ROOT = '/opt/fccapps/vposftc'

export type ApplicationRestartScripts = {
  appRoot: string
  stopScript: string
  startScript: string
}

export const resolveApplicationRestartScripts =
  async (): Promise<ApplicationRestartScripts> => {
    const appRoot = path.normalize(
      readEnvOrDefault('VPOS_APPLICATION_ROOT', DEFAULT_APPLICATION_ROOT),
    )
    if (!path.isAbsolute(appRoot)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'VPOS_APPLICATION_ROOT must be an absolute path.',
        500,
      )
    }
    const stopScript = path.join(/*turbopackIgnore: true*/ appRoot, 'stop.sh')
    const startScript = path.join(/*turbopackIgnore: true*/ appRoot, 'start.sh')

    try {
      await Promise.all([
        access(/*turbopackIgnore: true*/ stopScript),
        access(/*turbopackIgnore: true*/ startScript),
      ])
    } catch {
      throw new AppError(
        'INTERNAL_ERROR',
        'The production start.sh and stop.sh scripts are not available in the application directory.',
        503,
        { stopScript, startScript },
      )
    }

    return { appRoot, stopScript, startScript }
  }

export const scheduleApplicationRestart = (
  scripts: ApplicationRestartScripts,
  delayMs = 1_000,
) => {
  setTimeout(() => {
    const child = spawn(
      '/bin/sh',
      [
        '-c',
        'sleep 1; /bin/sh "$1"; /bin/sh "$2"',
        'restart-vpos-ftc',
        scripts.stopScript,
        scripts.startScript,
      ],
      {
        cwd: scripts.appRoot,
        detached: true,
        stdio: 'ignore',
        env: process.env,
      },
    )
    child.on('error', () => undefined)
    child.unref()
  }, delayMs)
}
