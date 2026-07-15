import { safeAsync } from '@/src/shared/utils/safeAsync'

import { getRuntimeManager } from '@/src/modules/runtime/infrastructure/RuntimeManager'

import type { SupervisorRuntime } from './supervisorRuntime'
import { InvalidActionError, ProcessNotFoundError } from './errors'

type HandlerResponse<T> = {
  status: number
  body: T
}

const resolveRuntime = (stationId: string, runtime?: SupervisorRuntime) => {
  return runtime ?? getRuntimeManager(stationId).supervisor
}

export const supervisorStatusResponse = async (
  stationId: string,
  runtime?: SupervisorRuntime,
): Promise<HandlerResponse<any>> => {
  const data = await resolveRuntime(stationId, runtime).getStatus()
  return { status: 200, body: data }
}

export const supervisorProcessStatusResponse = async (
  stationId: string,
  name: string,
  runtime?: SupervisorRuntime,
): Promise<HandlerResponse<any>> => {
  const rt = resolveRuntime(stationId, runtime)

  try {
    const status = await rt.getProcessStatus(name)
    if (!status) {
      const full = await safeAsync(
        rt.getStatus(),
        'supervisorHandlers.processStatus',
      )
      return {
        status: 404,
        body: {
          error: 'Process not found',
          process: name,
          available: full ? Object.keys(full.processes || {}) : [],
          aliases: full?.optional?.processAliases ?? undefined,
        },
      }
    }
    return { status: 200, body: status }
  } catch (err: any) {
    if (err instanceof ProcessNotFoundError) {
      const full = await safeAsync(
        rt.getStatus(),
        'supervisorHandlers.processNotFound',
      )
      return {
        status: 404,
        body: {
          error: 'Process not found',
          process: err.processName,
          available: full ? Object.keys(full.processes || {}) : [],
          aliases: full?.optional?.processAliases ?? undefined,
        },
      }
    }
    throw err
  }
}

export const supervisorProcessActionResponse = async (
  stationId: string,
  name: string,
  action: string,
  body: any,
  runtime?: SupervisorRuntime,
): Promise<HandlerResponse<any>> => {
  const rt = resolveRuntime(stationId, runtime)

  try {
    const result = await rt.commandProcess(name, action, body)
    return { status: 200, body: result }
  } catch (err: any) {
    if (err instanceof ProcessNotFoundError) {
      const full = await safeAsync(
        rt.getStatus(),
        'supervisorHandlers.actionNotFound',
      )
      return {
        status: 404,
        body: {
          error: 'Process not found',
          process: err.processName,
          requested: name,
          available: full ? Object.keys(full.processes || {}) : [],
          aliases: full?.optional?.processAliases ?? undefined,
        },
      }
    }
    if (err instanceof InvalidActionError) {
      return {
        status: 400,
        body: { error: 'Invalid action', action: err.action },
      }
    }
    throw err
  }
}

export const supervisorRestartResponse = async (
  stationId: string,
  runtime?: SupervisorRuntime,
): Promise<HandlerResponse<any>> => {
  // Prefer runtime manager so in-process workers restart too
  if (runtime) {
    await runtime.restartSupervisor('manual')
  } else {
    await getRuntimeManager(stationId).restart('manual')
  }

  return {
    status: 200,
    body: { success: true, data: { message: 'Restart requested' } },
  }
}

export const supervisorRestartAllResponse = async (
  stationId: string,
  runtime?: SupervisorRuntime,
): Promise<HandlerResponse<any>> => {
  await resolveRuntime(stationId, runtime).restartAll()
  return {
    status: 200,
    body: { message: 'Restart command sent for all processes' },
  }
}

export const supervisorReloadConfigResponse = async (
  stationId: string,
  runtime?: SupervisorRuntime,
): Promise<HandlerResponse<any>> => {
  const data = runtime
    ? await runtime.reloadConfig()
    : await getRuntimeManager(stationId).reloadConfig()
  return { status: 200, body: { success: true, data } }
}
