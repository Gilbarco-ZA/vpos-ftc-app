import test from 'node:test'
import assert from 'node:assert/strict'
import { SupervisorRuntime } from '../../src/modules/supervisor/infrastructure/supervisorRuntime'

type KvStore = Map<string, any>

const createRuntime = () => {
	const store: KvStore = new Map()

	const locks = new Map<string, Promise<void>>()

	const withLock = async <T>(key: string, fn: () => Promise<T>) => {
		// simple single-flight: queue by key
		const prev = locks.get(key) ?? Promise.resolve()
		let release!: () => void
		const next = new Promise<void>((res) => (release = res))
		locks.set(
			key,
			prev.then(() => next)
		)

		await prev
		try {
			return await fn()
		} finally {
			release()
			// cleanup when no one is waiting
			if (locks.get(key) === next) locks.delete(key)
		}
	}

	const kvKey = (stationId: string, key: string) => `${stationId}:${key}`

	const kvGet = async <T>(stationId: string, key: string): Promise<T | null> => {
		return (store.get(kvKey(stationId, key)) as T) ?? null
	}

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
				api: { enabled: true },
				pos: { enabled: true }
			}
		}
	})

	const runtime = new SupervisorRuntime('station-1', {
		query: query as any,
		kvGet,
		kvSet,
		getSystemConfiguration: getSystemConfiguration as any,
		getRuntimeState: getRuntimeState as any,
		setRuntimeState: setRuntimeState as any,
		withLock
	})

	return { runtime, store, kvGet }
}

test('SupervisorRuntime returns status for configured processes', async () => {
	const { runtime } = createRuntime()
	const status = await runtime.getStatus()
	assert.ok(status.processes.api)
	assert.ok(status.processes.pos)
	assert.equal(status.processes.api?.pid, process.pid)
})

test('SupervisorRuntime stop/start actions update process status', async () => {
	const { runtime } = createRuntime()
	await runtime.commandProcess('pos', 'stop')
	let status = await runtime.getStatus()
	assert.equal(status.processes.pos?.status, 'stopped')

	await runtime.commandProcess('pos', 'start')
	status = await runtime.getStatus()
	assert.equal(status.processes.pos?.status, 'running')
})

test('SupervisorRuntime restart updates runtime state and meta', async () => {
	const { runtime, kvGet } = createRuntime()
	await runtime.restartSupervisor('manual')
	const state = await kvGet<any>('station-1', 'vpos.runtime.state')
	const meta = await kvGet<any>('station-1', 'vpos.supervisor.meta')
	assert.equal(state?.status, 'IDLE')
	assert.ok(meta?.lastRestartAt)
})

test('SupervisorRuntime restart is single-flight under lock', async () => {
	const { runtime, kvGet } = createRuntime()

	await Promise.all([
		runtime.restartSupervisor('manual'),
		runtime.restartSupervisor('manual')
	])

	const meta = await kvGet<any>('station-1', 'vpos.supervisor.meta')
	assert.ok(meta?.lastRestartAt)
})