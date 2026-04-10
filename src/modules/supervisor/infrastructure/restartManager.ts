import cron, { ScheduledTask } from 'node-cron'

import { appendLogLine } from '@/src/shared/logs/service'
import { getRuntimeManager } from '@/src/shared/runtime/manager'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { logger } from '@/src/shared/utils/logger'

import {
  RestartConfig,
  RestartReason,
  RestartStatus,
  SafetyCheckResult,
} from './restartTypes'

const CONFIG_KEY = 'vpos.restart.config'
const STATUS_KEY = 'vpos.restart.status'
const LOG_FILENAME = 'restart.log'

function nowIso() {
  return new Date().toISOString()
}

export const defaultRestartConfig: RestartConfig = {
  enabled: false,
  scheduleCron: '0 3 * * *',
  minIntervalMs: 5 * 60 * 1000,
  safetyCheck: {
    enabled: true,
    requiredConsecutiveSuccesses: 2,
    maxRetries: 3,
    retryDelayMs: 30_000,
  },
}

export class RestartManager {
  private cronTask: ScheduledTask | null = null
  private lastRestartAt: number | null = null
  private isRestarting = false

  constructor(private stationId: string) {}

  private async log(message: string) {
    const line = `[${nowIso()}] ${message}`
    logger.info(`[restart][${this.stationId}]`, { msg: line })
    await appendLogLine(this.stationId, 'restart', LOG_FILENAME, line)
  }

  async getConfig(): Promise<RestartConfig> {
    return (
      (await kvGet<RestartConfig>(this.stationId, CONFIG_KEY)) ??
      defaultRestartConfig
    )
  }

  async setConfig(next: Partial<RestartConfig>) {
    const current = await this.getConfig()
    const merged: RestartConfig = {
      ...current,
      ...next,
      safetyCheck: {
        ...current.safetyCheck,
        ...(next as any).safetyCheck,
      },
    }
    await kvSet(this.stationId, CONFIG_KEY, merged)
    await this.reloadSchedule()
    return merged
  }

  async getStatus(): Promise<RestartStatus> {
    return (
      (await kvGet<RestartStatus>(this.stationId, STATUS_KEY)) ?? {
        status: 'IDLE',
        updatedAt: nowIso(),
      }
    )
  }

  private async setStatus(patch: Partial<RestartStatus>) {
    const cur = await this.getStatus()
    const next: RestartStatus = { ...cur, ...patch, updatedAt: nowIso() }
    await kvSet(this.stationId, STATUS_KEY, next)
    return next
  }

  async start() {
    await this.reloadSchedule()
  }

  async reloadSchedule() {
    const cfg = await this.getConfig()
    if (this.cronTask) {
      this.cronTask.stop()
      this.cronTask.destroy()
      this.cronTask = null
    }
    if (!cfg.enabled) {
      await this.log('Scheduled restarts disabled')
      return
    }
    if (!cron.validate(cfg.scheduleCron)) {
      await this.log(`Invalid scheduleCron: ${cfg.scheduleCron}`)
      return
    }
    this.cronTask = cron.schedule(cfg.scheduleCron, async () => {
      await this.restart('scheduled')
    })
    await this.log(`Scheduled restart enabled: ${cfg.scheduleCron}`)
  }

  async reloadConfig() {
    await this.log('Reloading restart manager configuration')
    await this.reloadSchedule()
    return await this.getConfig()
  }

  private canRestartNow(minIntervalMs: number) {
    if (!this.lastRestartAt) return true
    return Date.now() - this.lastRestartAt >= minIntervalMs
  }

  async safetyCheck(): Promise<SafetyCheckResult> {
    try {
      const status = await getRuntimeManager(this.stationId).status()
      const s = String((status as any)?.status ?? '').toUpperCase()
      const ok = s.includes('RUN') || s.includes('OK') || s.includes('READY')
      return {
        ok,
        message: ok
          ? 'Supervisor healthy'
          : `Supervisor not healthy (${s || 'unknown'})`,
        supervisorStatus: status,
      }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Safety check failed' }
    }
  }

  async restart(reason: RestartReason = 'manual') {
    if (this.isRestarting) {
      await this.log('Restart request ignored (already restarting)')
      return
    }
    const cfg = await this.getConfig()
    if (!this.canRestartNow(cfg.minIntervalMs)) {
      await this.log('Restart request ignored (min interval not elapsed)')
      return
    }
    this.isRestarting = true
    await this.setStatus({
      status: 'RESTARTING',
      lastReason: reason,
      message: 'Restarting...',
    })
    await this.log(`Restart initiated (reason=${reason})`)
    try {
      await getRuntimeManager(this.stationId).restart(reason)
      this.lastRestartAt = Date.now()
      await this.setStatus({
        status: 'IDLE',
        lastRestartAt: nowIso(),
        message: 'Restart requested',
      })
      await this.log('Restart requested via Supervisor API')
      if (cfg.safetyCheck.enabled) {
        await this.runSafetyRetries(reason)
      }
    } catch (e: any) {
      await this.setStatus({
        status: 'FAILED',
        message: e?.message || 'Restart failed',
      })
      await this.log(`Restart failed: ${e?.message || e}`)
      throw e
    } finally {
      this.isRestarting = false
    }
  }

  private async runSafetyRetries(reason: RestartReason) {
    const cfg = await this.getConfig()
    let successes = 0
    for (let i = 0; i < cfg.safetyCheck.maxRetries; i++) {
      const r = await this.safetyCheck()
      await this.log(
        `Safety check ${i + 1}/${cfg.safetyCheck.maxRetries}: ${r.ok ? 'OK' : 'FAIL'} - ${r.message}`,
      )
      if (r.ok) successes += 1
      else successes = 0
      if (successes >= cfg.safetyCheck.requiredConsecutiveSuccesses) {
        await this.log('Safety check passed')
        return
      }
      await new Promise((res) => setTimeout(res, cfg.safetyCheck.retryDelayMs))
    }
    await this.log('Safety check did not reach required consecutive successes')
    await this.setStatus({
      status: 'FAILED',
      lastReason: reason,
      message: 'Safety check failed',
    })
  }
}
