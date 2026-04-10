#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises'
import path from 'path'
import process from 'process'
import { Pool } from 'pg'
import { randomUUID } from 'crypto'

/**
 * Legacy vpos-console storage constants (from vpos-console/src-server/core/common/config.ts)
 */
const LEGACY = {
	FOLDERS: {
		TRANSACTIONS: 'transactions',
		PENDING_TRANSACTIONS: 'pending-transactions',
		REPORTS: 'reports',
		EWURA_REPORTS: 'ewura-reports',
		EWURA_TRANSACTIONS: 'ewura-transactions'
	},
	FILES: {
		TRANSACTION_QUEUE: 'fiscal.transaction.queue.json',
		REPORT_QUEUE: 'fiscal.report.queue.json',
		EWURA_REPORTS_QUEUE: 'ewura.reports.json',
		EWURA_TRANSACTIONS_QUEUE: 'ewura.transactions.json'
	}
}

/**
 * ENV
 * - LEGACY_PERM_DIR: path to the vpos-console PERM_DIR you want to import from
 * - STATION_ID or STATION_CODE: identifies the fuel station row in Postgres
 * - DRY_RUN: "1" to only print what would happen
 */
const LEGACY_PERM_DIR =
	process.env.LEGACY_PERM_DIR || '/opt/fccapps/vpos-perm/vposfiscal'
const STATION_ID_ENV = process.env.STATION_ID
const STATION_CODE_ENV = process.env.STATION_CODE
const DRY_RUN = process.env.DRY_RUN === '1'

if (!LEGACY_PERM_DIR) {
	console.error('Missing env LEGACY_PERM_DIR (path to vpos-console PERM_DIR)')
	process.exit(1)
}
if (!STATION_ID_ENV && !STATION_CODE_ENV) {
	console.error('Missing env STATION_ID or STATION_CODE')
	process.exit(1)
}

/**
 * Postgres connection (mirrors lib/db/postgres.ts defaults)
 */
const pool = new Pool({
	connectionString: process.env.POSTGRES_URL,
	host: process.env.POSTGRES_HOST || 'localhost',
	port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
	database: process.env.POSTGRES_DATABASE || 'postgres',
	user: process.env.POSTGRES_USER || 'postgres',
	password: process.env.POSTGRES_PASSWORD || 'postgres',
	max: 5
})

const qOne = async (text, params) => {
	const r = await pool.query(text, params)
	return r.rows[0] || null
}
const qAll = async (text, params) => {
	const r = await pool.query(text, params)
	return r.rows
}
const q = async (text, params) => pool.query(text, params)

const safeParseJson = async (filePath) => {
	try {
		const raw = await fs.readFile(filePath, 'utf8')
		return JSON.parse(raw)
	} catch (e) {
		return null
	}
}

const listJsonFiles = async (dirPath) => {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true })
		return entries
			.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
			.map((e) => e.name)
			.sort()
	} catch {
		return []
	}
}

const toDateTime = (dateStr, timeStr, fallbackDate) => {
	// vpos-console uses moment(`${date}T${time}Z`)
	if (dateStr && timeStr) {
		const iso = `${dateStr}T${timeStr}Z`
		const d = new Date(iso)
		if (Number.isFinite(d.getTime())) return d
	}
	return fallbackDate || new Date()
}

const toNumber = (v, fallback = 0) => {
	if (v === null || v === undefined) return fallback
	const n = typeof v === 'number' ? v : parseFloat(String(v))
	return Number.isFinite(n) ? n : fallback
}

const resolveStationId = async () => {
	if (STATION_ID_ENV) return STATION_ID_ENV

	const row = await qOne(`SELECT id FROM fuel_stations WHERE code = $1`, [
		STATION_CODE_ENV
	])
	if (!row) {
		throw new Error(`No fuel_stations row found for code=${STATION_CODE_ENV}`)
	}
	return row.id
}

const existsByLegacyFilename = async (table, stationId, legacyFilename) => {
	const row = await qOne(
		`SELECT id FROM ${table} WHERE station_id = $1 AND legacy_filename = $2 LIMIT 1`,
		[stationId, legacyFilename]
	)
	return !!row
}

/**
 * INSERT: transactions
 * Legacy file is typically a VfdTransaction:
 * {
 *  transaction: { date,time, details:{ pumpNumber,pumpVolume }, totals:{ totalIncludingTax }, items:[{description}], receiptNo, receiptVerificationNo, ... },
 *  response: ...
 * }
 */
const importTransactionFile = async (
	stationId,
	filePath,
	filename,
	statusOverride
) => {
	const json = await safeParseJson(filePath)
	if (!json) {
		console.warn(`WARN: could not parse ${filePath}`)
		return { inserted: 0, skipped: 0 }
	}

	// Some legacy files are stored as { data: ... } depending on the writer. Normalize.
	const vfd = json.data ? json.data : json

	const tx = vfd.transaction || {}
	const details = tx.details || {}
	const totals = tx.totals || {}
	const items = Array.isArray(tx.items) ? tx.items : []

	const stat = await fs.stat(filePath)

	const transactionDateTime = toDateTime(tx.date, tx.time, stat.mtime)

	const pumpNumber =
		parseInt(details.pumpNumber ?? details.pump_number ?? 0, 10) || 0
	const volume = toNumber(details.pumpVolume ?? details.pump_volume, null)
	const totalAmount = toNumber(
		totals.totalIncludingTax ?? totals.total_including_tax,
		0
	)

	const fuelType =
		(items[0] && (items[0].description || items[0].type)) || tx.fuelType || null

	const posReference =
		tx.receiptNo !== undefined
			? String(tx.receiptNo).trim().toUpperCase()
			: tx.globalCount !== undefined
				? String(tx.globalCount).trim().toUpperCase()
				: null

	const fiscalRef = tx.receiptVerificationNo || null

	const status = statusOverride || 'FISCALIZED'

	// Skip duplicates by legacy_filename
	if (await existsByLegacyFilename('transactions', stationId, filename)) {
		return { inserted: 0, skipped: 1 }
	}

	if (DRY_RUN) {
		console.log(
			`DRY_RUN: would insert transaction ${filename} pump=${pumpNumber} total=${totalAmount} status=${status}`
		)
		return { inserted: 0, skipped: 0 }
	}

	await q(
		`
    INSERT INTO transactions (
      station_id,
      customer_id,
      pump_number,
      transaction_date_time,
      total_amount,
      volume,
      fuel_type,
      pos_reference,
      status,
      fiscalization_reference,
      fiscalization_response,
      legacy_filename,
      created_at,
      updated_at
    )
    VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `,
		[
			stationId,
			pumpNumber || 0,
			transactionDateTime,
			totalAmount,
			volume,
			fuelType,
			posReference,
			status,
			fiscalRef,
			// Store entire legacy payload for traceability
			JSON.stringify(vfd),
			filename
		]
	)

	return { inserted: 1, skipped: 0 }
}

/**
 * INSERT: reports
 * Legacy report file is typically { report: VfdReport, respose: any } or { data: { report, respose } }
 */
const importReportFile = async (stationId, filePath, filename) => {
	const json = await safeParseJson(filePath)
	if (!json) {
		console.warn(`WARN: could not parse ${filePath}`)
		return { inserted: 0, skipped: 0 }
	}

	const fileObj = json.data ? json.data : json
	const report = fileObj.report || fileObj

	const stat = await fs.stat(filePath)
	const reportDateTime = toDateTime(report.date, report.time, stat.mtime)

	// Best-effort: tag "ZREPORT" if znum is present and > 0, otherwise UNKNOWN
	const reportType = report.znum !== undefined ? 'ZREPORT' : 'UNKNOWN'

	if (await existsByLegacyFilename('reports', stationId, filename)) {
		return { inserted: 0, skipped: 1 }
	}

	if (DRY_RUN) {
		console.log(`DRY_RUN: would insert report ${filename} type=${reportType}`)
		return { inserted: 0, skipped: 0 }
	}

	await q(
		`
    INSERT INTO reports (
      station_id,
      report_date_time,
      report_type,
      payload,
      status,
      legacy_filename,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, 'COMPLETED', $5, NOW(), NOW())
    `,
		[stationId, reportDateTime, reportType, fileObj, filename]
	)

	return { inserted: 1, skipped: 0 }
}

/**
 * INSERT: queue items
 * - fiscal.transaction.queue.json structure (per console logic):
 *   { data: { transactions: [ ... ] } }
 * - fiscal.report.queue.json:
 *   { data: { reports: [ ... ] } }
 */
const importQueueFile = async (stationId, filePath, queueKind) => {
	const json = await safeParseJson(filePath)
	if (!json) return { inserted: 0, skipped: 0 }

	const payloadRoot = json.data ? json.data : json

	if (queueKind === 'transaction') {
		const items = Array.isArray(payloadRoot.transactions)
			? payloadRoot.transactions
			: []
		if (!items.length) return { inserted: 0, skipped: 0 }

		let inserted = 0
		for (const item of items) {
			if (DRY_RUN) {
				console.log(`DRY_RUN: would enqueue transaction_queue payload`)
				continue
			}
			await q(
				`INSERT INTO transaction_queue (station_id, status, payload) VALUES ($1, 'PENDING', $2)`,
				[stationId, item]
			)
			inserted++
		}
		return { inserted, skipped: 0 }
	}

	if (queueKind === 'report') {
		const items = Array.isArray(payloadRoot.reports) ? payloadRoot.reports : []
		if (!items.length) return { inserted: 0, skipped: 0 }

		let inserted = 0
		for (const item of items) {
			if (DRY_RUN) {
				console.log(`DRY_RUN: would enqueue report_queue payload`)
				continue
			}
			await q(
				`INSERT INTO report_queue (station_id, status, payload) VALUES ($1, 'PENDING', $2)`,
				[stationId, item]
			)
			inserted++
		}
		return { inserted, skipped: 0 }
	}

	return { inserted: 0, skipped: 0 }
}


/**
 * INSERT/UPSERT: station_config (+ version row)
 * Imports vpos-app style config files (vpos.config.json / config.json).
 * Notes:
 * - We do not attempt deep validation here; the Next.js app validates on load.
 * - We normalize "{ data: ... }" payloads used by some legacy writers.
 */
const normalizeConfigPayload = (input) => {
	if (input && typeof input === 'object' && 'data' in input) return input.data
	return input
}

const upsertStationConfig = async (stationId, configJson, schemaVersion) => {
	if (DRY_RUN) {
		console.log(`DRY_RUN: would upsert station_config schema=${schemaVersion}`)
		return
	}
	await q(
		`INSERT INTO station_config (station_id, schema_version, config_json)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (station_id)
		 DO UPDATE SET schema_version = EXCLUDED.schema_version,
						config_json = EXCLUDED.config_json,
						updated_at = NOW()`,
		[stationId, schemaVersion, configJson]
	)
	const id = randomUUID()
	await q(
		`INSERT INTO station_config_versions (id, station_id, schema_version, config_json, created_by)
		 VALUES ($5, $1, $2, $3, $4)`,
		[stationId, schemaVersion, configJson, 'legacy-import',id]
	)
}

const importVposAppConfig = async (stationId) => {
	for (const name of LEGACY_VPOS_APP_CONFIG_CANDIDATES) {
		const p = path.join(LEGACY_VPOS_APP_PERM_DIR, name)
		const json = await safeParseJson(p)
		if (!json) continue
		const normalized = normalizeConfigPayload(json)
		if (!normalized || typeof normalized !== 'object') continue

		console.log(`Importing station config from ${p}`)
		await upsertStationConfig(stationId, normalized, 'vpos-app-1')
		return { imported: true, path: p }
	}
	console.log(
		`No vpos-app config file found under ${LEGACY_VPOS_APP_PERM_DIR}. Tried: ${LEGACY_VPOS_APP_CONFIG_CANDIDATES.join(
			', '
		)}`
	)
	return { imported: false, path: null }
}

const main = async () => {
	const stationId = await resolveStationId()

	console.log('--- Legacy import starting ---')
	console.log('LEGACY_PERM_DIR =', LEGACY_PERM_DIR)
	console.log('stationId       =', stationId)
	console.log('DRY_RUN         =', DRY_RUN ? '1' : '0')
	console.log('-----------------------------')

	await importVposAppConfig(stationId)

	let totalInsertedTx = 0
	let totalSkippedTx = 0
	let totalInsertedRpt = 0
	let totalSkippedRpt = 0
	let totalEnqueuedTx = 0
	let totalEnqueuedRpt = 0

	// 1) Completed transactions
	{
		const dir = path.join(LEGACY_PERM_DIR, LEGACY.FOLDERS.TRANSACTIONS)
		const files = await listJsonFiles(dir)
		console.log(`Found ${files.length} completed transaction files in ${dir}`)
		for (const filename of files) {
			const filePath = path.join(dir, filename)
			const r = await importTransactionFile(
				stationId,
				filePath,
				filename,
				'FISCALIZED'
			)
			totalInsertedTx += r.inserted
			totalSkippedTx += r.skipped
		}
	}

	// 2) Pending transactions
	{
		const dir = path.join(LEGACY_PERM_DIR, LEGACY.FOLDERS.PENDING_TRANSACTIONS)
		const files = await listJsonFiles(dir)
		console.log(`Found ${files.length} pending transaction files in ${dir}`)
		for (const filename of files) {
			const filePath = path.join(dir, filename)
			// Mark these as FAILED so they show up under /api/transactions/pending
			const r = await importTransactionFile(
				stationId,
				filePath,
				filename,
				'FAILED'
			)
			totalInsertedTx += r.inserted
			totalSkippedTx += r.skipped
		}
	}

	// 3) Transaction queue file
	{
		const filePath = path.join(LEGACY_PERM_DIR, LEGACY.FILES.TRANSACTION_QUEUE)
		const r = await importQueueFile(stationId, filePath, 'transaction')
		totalEnqueuedTx += r.inserted
		console.log(`Transaction queue enqueued: ${r.inserted} (from ${filePath})`)
	}

	// 4) Completed reports
	{
		const dir = path.join(LEGACY_PERM_DIR, LEGACY.FOLDERS.REPORTS)
		const files = await listJsonFiles(dir)
		console.log(`Found ${files.length} report files in ${dir}`)
		for (const filename of files) {
			const filePath = path.join(dir, filename)
			const r = await importReportFile(stationId, filePath, filename)
			totalInsertedRpt += r.inserted
			totalSkippedRpt += r.skipped
		}
	}

	// 5) Report queue file
	{
		const filePath = path.join(LEGACY_PERM_DIR, LEGACY.FILES.REPORT_QUEUE)
		const r = await importQueueFile(stationId, filePath, 'report')
		totalEnqueuedRpt += r.inserted
		console.log(`Report queue enqueued: ${r.inserted} (from ${filePath})`)
	}

	console.log('--- Import summary ---')
	console.log(`Transactions inserted: ${totalInsertedTx}`)
	console.log(`Transactions skipped : ${totalSkippedTx}`)
	console.log(`Reports inserted     : ${totalInsertedRpt}`)
	console.log(`Reports skipped      : ${totalSkippedRpt}`)
	console.log(`Tx queued inserted   : ${totalEnqueuedTx}`)
	console.log(`Rpt queued inserted  : ${totalEnqueuedRpt}`)
	console.log('----------------------')
}

main()
	.catch((err) => {
		console.error('IMPORT FAILED:', err)
		process.exit(1)
	})
	.finally(async () => {
		try {
			await pool.end()
		} catch {
		}
	})
