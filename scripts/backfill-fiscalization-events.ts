import process from 'node:process'

import { closePool } from '@/src/platform/db/postgres/core'
import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'

import {
  assessFiscalizationSyncReadiness,
  backfillLegacyFiscalizationEvents,
  listFiscalizationBackfillStationIds,
} from '@/src/modules/transactions/application/backfillLegacyFiscalizationEvents'

const args = new Set(process.argv.slice(2))
const valueArg = (name: string): string | undefined => {
  const prefix = `${name}=`
  const direct = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const numberArg = (name: string, fallback: number): number => {
  const value = Number(valueArg(name))
  return Number.isFinite(value) ? value : fallback
}

const main = async () => {
  bootstrapRuntimeEnvironment()
  const apply = args.has('--apply')
  const allStations = args.has('--all-stations')
  const stationId = valueArg('--station-id') || process.env.VPOS_STATION_ID
  if (!stationId && !allStations) {
    throw new Error(
      'Provide --station-id <uuid>, set VPOS_STATION_ID, or explicitly use --all-stations.',
    )
  }

  const stationIds = allStations
    ? await listFiscalizationBackfillStationIds()
    : [String(stationId)]
  const batchSize = numberArg('--batch-size', 250)
  const maxBatches = numberArg('--max-batches', 100)

  const result = []
  for (const id of stationIds) {
    const before = await assessFiscalizationSyncReadiness({
      stationId: id,
      batchSize,
    })
    const backfill = await backfillLegacyFiscalizationEvents({
      stationId: id,
      dryRun: !apply,
      batchSize,
      maxBatches,
    })
    const after = apply
      ? await assessFiscalizationSyncReadiness({ stationId: id, batchSize })
      : before
    result.push({ stationId: id, before, backfill, after })
  }

  process.stdout.write(`${JSON.stringify({ apply, result }, null, 2)}\n`)
  if (result.some((entry) => entry.backfill.lockUnavailable))
    process.exitCode = 2
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool().catch(() => undefined)
  })
