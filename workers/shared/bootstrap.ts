import {
  bootstrapRuntimeEnvironment,
  parseRuntimeInterval,
  requireRuntimeStationId,
  resolveRuntimePollMs,
} from '@/src/platform/runtime'

export function bootstrapWorkerEnvironment() {
  bootstrapRuntimeEnvironment()
}

export function parseWorkerInterval(
  value: string | undefined,
  fallback: number,
): number {
  return parseRuntimeInterval(value, fallback)
}

export function resolveWorkerPollMs(
  envNames: string[],
  fallback: number,
): number {
  return resolveRuntimePollMs(envNames, fallback)
}

export function requireWorkerStationId(workerName: string): string {
  return requireRuntimeStationId(workerName)
}
