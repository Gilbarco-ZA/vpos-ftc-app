import packageJson from '@/package.json'

import {
  CONFIG_STORAGE_RESTORE_ACK,
  CONFIG_STORAGE_RETIREMENT_ACK,
  getConfigStorageRetirementPlan,
  restoreLegacyConfigStorageCompatibility,
  retireLegacyConfigStorage,
} from '@/src/platform/config/retirement/configStorageRetirement'
import { closePool } from '@/src/platform/db/postgres/core'
import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'

const args = process.argv.slice(2)

const valueOf = (name: string) => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`))
  if (direct) return direct.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const main = async () => {
  bootstrapRuntimeEnvironment()

  const apply = args.includes('--apply')
  const restoreCompatibility = args.includes('--restore-compatibility')
  if (apply && restoreCompatibility) {
    throw new Error('Choose either --apply or --restore-compatibility')
  }

  if (!apply && !restoreCompatibility) {
    const plan = await getConfigStorageRetirementPlan()
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
    if (
      args.includes('--require-safe') &&
      !plan.readyToApply &&
      !plan.retirementComplete
    ) {
      process.exitCode = 2
    }
    return
  }

  const operatorName = valueOf('--operator') ?? ''
  const acknowledgement = valueOf('--ack') ?? ''

  if (apply) {
    const result = await retireLegacyConfigStorage({
      acknowledgement,
      maintenanceConfirmed: args.includes('--maintenance-confirmed'),
      backupReference: valueOf('--backup-reference') ?? '',
      operatorName,
      applicationVersion: packageJson.version,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  const result = await restoreLegacyConfigStorageCompatibility({
    acknowledgement,
    sourceRunId: valueOf('--source-run-id') ?? '',
    operatorName,
    applicationVersion: packageJson.version,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    if (message.includes(CONFIG_STORAGE_RETIREMENT_ACK)) {
      console.error(
        `Use --ack ${CONFIG_STORAGE_RETIREMENT_ACK} only after reviewing the dry-run plan.`,
      )
    }
    if (message.includes(CONFIG_STORAGE_RESTORE_ACK)) {
      console.error(
        `Use --ack ${CONFIG_STORAGE_RESTORE_ACK} only for compatibility-shell restoration.`,
      )
    }
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool().catch(() => undefined)
  })
