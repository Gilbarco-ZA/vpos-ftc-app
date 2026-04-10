import {
  reloadVposRestartManagerConfig,
  requestVposRestartManagerRestart,
} from '@/src/shared/vpos/supervisor'

export async function restartVposSupervisor(args: { stationId: string }) {
  if (!args.stationId) throw new Error('stationId is required')
  return await requestVposRestartManagerRestart(args.stationId)
}

export async function reloadVposSupervisorConfig(args: { stationId: string }) {
  if (!args.stationId) throw new Error('stationId is required')
  return await reloadVposRestartManagerConfig(args.stationId)
}
