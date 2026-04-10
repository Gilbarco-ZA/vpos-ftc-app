#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'

import { scanAndUpsertPluginCatalog } from '@/src/platform/config/plugin-catalog'
import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'
import { logger } from '@/src/shared/utils/logger'

// Usage:
//   tsx scripts/seed-plugin-catalog.ts /path/to/plugins
// Defaults:
//   PLUGIN_ROOT env var, or <repo>/src/plugins, or <repo>/plugins

async function existsDir(p: string): Promise<boolean> {
  if (!p) return false
  try {
    const st = await fs.stat(p)
    return st.isDirectory()
  } catch {
    return false
  }
}

async function main() {
  bootstrapRuntimeEnvironment()
  const argRoot = process.argv[2]
  const cwd = process.cwd()
  const candidates = [
    argRoot,
    process.env.PLUGIN_ROOT,
    path.join(cwd, 'src', 'plugins'),
    path.join(cwd, 'plugins'),
  ].filter(Boolean) as string[]

  let root: string | null = null
  for (const c of candidates) {
    if (await existsDir(c)) {
      root = c
      break
    }
  }

  if (!root) {
    logger.error('[seed-plugin-catalog]', {
      msg: `No plugin directory found. Tried: ${candidates.join(', ')}`,
    })
    process.exit(2)
  }

  const res = await scanAndUpsertPluginCatalog(root)
}

main().catch((e) => {
  logger.error('[seed-plugin-catalog]', { error: e })
  process.exit(1)
})
