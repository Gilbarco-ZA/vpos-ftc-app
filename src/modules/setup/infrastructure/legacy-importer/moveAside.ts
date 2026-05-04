import fs from 'fs/promises'
import path from 'path'

export type MoveAsideResult = { movedTo: string }

export function makeRunId() {
  // safe-ish folder name
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function ensureMoveAsideDirs(root: string, runId: string) {
  await fs.mkdir(path.join(root, runId, 'imported'), { recursive: true })
  await fs.mkdir(path.join(root, runId, 'failed'), { recursive: true })
}

export async function moveAside(params: {
  moveRoot: string
  runId: string
  status: 'imported' | 'failed'
  relativePath: string // keep folder structure
  from: string
}): Promise<MoveAsideResult> {
  const dest = path.join(
    params.moveRoot,
    params.runId,
    params.status,
    params.relativePath,
  )
  await fs.mkdir(path.dirname(dest), { recursive: true })

  try {
    await fs.rename(params.from, dest) // atomic if same filesystem
  } catch (e: any) {
    // cross-device move fallback
    if (e?.code === 'EXDEV') {
      const buf = await fs.readFile(params.from)
      await fs.writeFile(dest, buf)
      await fs.unlink(params.from)
    } else {
      throw e
    }
  }

  return { movedTo: dest }
}
