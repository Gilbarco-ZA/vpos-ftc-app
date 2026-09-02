import process from 'node:process'

import { runCountryCatalogAudit } from '@/src/platform/config/audit/countryCatalogAudit'
import { closePool } from '@/src/platform/db/postgres/core'
import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'

const readArg = (name: string) => {
  const prefix = `${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const main = async () => {
  bootstrapRuntimeEnvironment()
  const requireSafe = process.argv.includes('--require-safe')
  const countryCode = readArg('--country')
  const result = await runCountryCatalogAudit({ countryCode })

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (requireSafe && !result.safeForDestructiveMigration) process.exitCode = 2
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool().catch(() => undefined)
  })
