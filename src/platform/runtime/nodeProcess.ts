type NodeProcessLike = {
  uptime?: () => number
}

const getRuntimeProcess = (): NodeProcessLike | undefined =>
  (globalThis as typeof globalThis & { process?: NodeProcessLike })['process']

export const getRuntimeUptimeSeconds = () => {
  const proc = getRuntimeProcess()
  const uptime = proc?.['uptime']
  return typeof uptime === 'function' ? Number(uptime.call(proc) || 0) : 0
}
