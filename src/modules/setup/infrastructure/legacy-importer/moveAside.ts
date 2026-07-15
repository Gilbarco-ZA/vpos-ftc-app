import fs from 'fs/promises'
import path from 'path'

export type MoveAsideResult = { movedTo: string }

export function makeRunId() {
  // safe-ish folder name
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export async function ensureMoveAsideDirs(root: string, runId: string) {
  try {
    await fs.mkdir(
      /*turbopackIgnore: true*/ path.join(
        /*turbopackIgnore: true*/ root,
        runId,
        'imported',
      ),
      { recursive: true },
    )
    await fs.mkdir(
      /*turbopackIgnore: true*/ path.join(
        /*turbopackIgnore: true*/ root,
        runId,
        'failed',
      ),
      { recursive: true },
    )
    await fs.access(/*turbopackIgnore: true*/ root, fs.constants.W_OK)
  } catch (error: any) {
    const wrapped = new Error(
      `Legacy import archive is not writable: ${root} (${error?.code || 'unknown error'})`,
      { cause: error },
    )
    ;(wrapped as NodeJS.ErrnoException).code = error?.code
    throw wrapped
  }
}

export async function moveAside(params: {
  moveRoot: string
  runId: string
  status: 'imported' | 'failed'
  relativePath: string // keep folder structure
  from: string
}): Promise<MoveAsideResult> {
  const dest = path.join(
    /*turbopackIgnore: true*/
    params.moveRoot,
    params.runId,
    params.status,
    params.relativePath,
  )
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(dest), {
    recursive: true,
  })

  try {
    await fs.rename(/*turbopackIgnore: true*/ params.from, dest) // atomic if same filesystem
  } catch (e: any) {
    // cross-device move fallback
    if (e?.code === 'EXDEV') {
      const buf = await fs.readFile(/*turbopackIgnore: true*/ params.from)
      await fs.writeFile(/*turbopackIgnore: true*/ dest, buf)
      await fs.unlink(/*turbopackIgnore: true*/ params.from)
    } else {
      throw e
    }
  }

  return { movedTo: dest }
}
