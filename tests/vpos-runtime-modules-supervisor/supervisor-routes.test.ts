import test from 'node:test'
import assert from 'node:assert/strict'
import { SupervisorRuntime } from '../../src/modules/supervisor/infrastructure/supervisorRuntime'
import {
	supervisorProcessActionResponse,
	supervisorProcessStatusResponse,
	supervisorRestartResponse,
	supervisorReloadConfigResponse,
	supervisorStatusResponse
} from '../../src/modules/supervisor/infrastructure/supervisorHandlers'

const isolatedSupervisorDeps = {
  upsertProcessHeartbeat: async () => undefined,
  getAllProcessHeartbeats: async () => [],
  getFiscalRecoveryMeta: async () => null,
  getFiscalInboxMetrics: async () => null,
  sleep: async () => undefined,
}

const createRuntime = () => {
	const store = new Map<string, any>()
	const kvKey = (stationId: string, key: string) => `${stationId}:${key}`
	const kvGet = async <T>(stationId: string, key: string): Promise<T | null> =>
		(store.get(kvKey(stationId, key)) as T) ?? null
	const kvSet = async <T>(
		stationId: string,
		key: string,
		value: T
	): Promise<void> => {
		store.set(kvKey(stationId, key), value)
	}
	const getRuntimeState = async (stationId: string) => {
		return (
			(await kvGet<any>(stationId, 'vpos.runtime.state')) ?? {
				status: 'IDLE',
				updatedAt: new Date().toISOString()
			}
		)
	}
	const setRuntimeState = async (
		stationId: string,
		patch: Record<string, any>
	) => {
		const current = await getRuntimeState(stationId)
		const next = {
			...current,
			...patch,
			updatedAt: new Date().toISOString()
		}
		await kvSet(stationId, 'vpos.runtime.state', next)
		return next
	}
	const query = async () => ({ rows: [], rowCount: 0 })
	const getSystemConfiguration = async () => ({
		config: { country: 'US', timezone: 'UTC', language: 'en', rtl: false },
		supervisor: {
			loggerParams: { label: 'TEST', level: 'warn', console: false },
			restartDelay: 1000,
			maxRestarts: 1,
			healthCheckInterval: 1000,
			startupTimeout: 1000
		},
		processes: {
			loggerParams: { label: 'TEST', level: 'warn', console: false },
			process: {
				api: { enabled: true }
			}
		}
	})
	return new SupervisorRuntime('station-1', {
    ...isolatedSupervisorDeps,
		query: query as any,
		kvGet,
		kvSet,
		getSystemConfiguration: getSystemConfiguration as any,
		getRuntimeState: getRuntimeState as any,
		setRuntimeState: setRuntimeState as any
	})
}

test('supervisor status route returns status payload', async () => {
	const runtime = createRuntime()
	const result = await supervisorStatusResponse('station-1', runtime)
	assert.equal(result.status, 200)
	assert.ok(result.body.processes)
})

test('supervisor process status returns 404 for missing process', async () => {
	const runtime = createRuntime()
	const result = await supervisorProcessStatusResponse(
		'station-1',
		'missing',
		runtime
	)
	assert.equal(result.status, 404)
	assert.equal(result.body.error, 'Process not found')
})

test('supervisor process action returns 200', async () => {
	const runtime = createRuntime()
	const result = await supervisorProcessActionResponse(
		'station-1',
		'api',
		'restart',
		{},
		runtime
	)
	assert.equal(result.status, 200)
})

test('supervisor process action returns 400 for invalid action', async () => {
	const runtime = createRuntime()
	const result = await supervisorProcessActionResponse(
		'station-1',
		'api',
		'not-a-real-action',
		{},
		runtime
	)
	assert.equal(result.status, 400)
	assert.equal(result.body.error, 'Invalid action')
})

test('supervisor process action returns 404 for unknown process', async () => {
	const runtime = createRuntime()
	const result = await supervisorProcessActionResponse(
		'station-1',
		'nope',
		'restart',
		{},
		runtime
	)
	assert.equal(result.status, 404)
	assert.equal(result.body.error, 'Process not found')
})

test('supervisor restart and reload-config handlers return 200', async () => {
	const runtime = createRuntime()
	const r1 = await supervisorRestartResponse('station-1', runtime)
	assert.equal(r1.status, 200)
	const r2 = await supervisorReloadConfigResponse('station-1', runtime)
	assert.equal(r2.status, 200)
})
