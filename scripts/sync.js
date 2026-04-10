/* eslint-disable no-console */

// This script runs inside app environment.
// Ensure environment variables are available: POSTGRES_*, AZURE_SQL_*

const main = async () => {
	const stationId = process.env.STATION_ID || undefined
	const force = process.argv.includes('--force')
	const directionArg = getArgValue('--direction') || 'both'
	const limitArg = getArgValue('--limit')
	const limitPerTable = limitArg ? parseInt(limitArg, 10) : undefined

	// Import from compiled Next runtime (TS is compiled at build time)
	const { runSync } = await import('../src/modules/sync/application/runSync')

	const result = await runSync({
		stationId,
		force,
		direction: directionArg,
		limitPerTable
	})

	if (!result.success) {
		console.error('SYNC FAILED:', result.errors)
		process.exit(1)
	}

	console.log('SYNC OK:', {
		pushed: result.recordsPushed,
		pulled: result.recordsPulled
	})
	process.exit(0)
}

const getArgValue = (flag) => {
	const idx = process.argv.indexOf(flag)
	if (idx === -1) return null
	const v = process.argv[idx + 1]
	if (!v || v.startsWith('--')) return null
	return v
}

main().catch((e) => {
	console.error('SYNC CRASH:', e?.message || e)
	process.exit(1)
})
