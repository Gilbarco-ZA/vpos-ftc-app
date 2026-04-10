import crypto from 'node:crypto'
import fs from 'node:fs/promises'

import { exportPssConfigXml } from '@/src/platform/integrations/pssXml/exporter'
import { importPssConfigXml } from '@/src/platform/integrations/pssXml/importer'
import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { logger } from '@/src/shared/utils/logger'

const sha256Hex = (input: string) =>
  crypto.createHash('sha256').update(input, 'utf8').digest('hex')

const envBool = (name: string, fallback = false) => {
  const raw = String(process.env[name] ?? '')
    .trim()
    .toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false
  return fallback
}

export type PssXmlSyncWorkerOpts = {
  stationId: string
  pollMs?: number
  inPath?: string
  outPath?: string
}

/**
 * Long-lived worker that:
 * 1) Polls an inbound XML path (written by PSS) and imports on change.
 * 2) Listens for export requests via station_kv and writes an updated XML file.
 */
export const startPssXmlSyncWorker = (opts: PssXmlSyncWorkerOpts) => {
  const enabled = envBool('PSS_XML_SYNC_ENABLED', true)
  if (!enabled) {
    logger.info('pss-xml', {
      message: 'sync disabled (set PSS_XML_SYNC_ENABLED=true)',
    })
    return
  }

  const stationId = opts.stationId
  const pollMs = Number(opts.pollMs ?? process.env.PSS_XML_POLL_MS ?? '2000')

  const inPath =
    String(
      opts.inPath ??
        process.env.PSS_XML_IN_PATH ??
        '/tmp/fccapps/pss/config.xml',
    ).trim() || null
  const outPath =
    String(
      opts.outPath ??
        process.env.PSS_XML_OUT_PATH ??
        '/tmp/fccapps/pss/peeps/temp/config.xml',
    ).trim() || null

  logger.info('pss-xml', {
    message: 'starting',
    stationId,
    pollMs,
    inPath,
    outPath,
  })

  let lastInChecksum: string | null = null
  let busy = false
  let hasPersistedBaseline: boolean | null = null
  let hasLoggedMissingInbound = false

  const checkPersistedBaseline = async () => {
    if (hasPersistedBaseline != null) return hasPersistedBaseline
    const rawXml = await kvGet<string>(stationId, PSS_XML_KEYS.RAW_XML)
    hasPersistedBaseline = !!String(rawXml ?? '').trim()
    return hasPersistedBaseline
  }

  const readInboundXml = async () => {
    if (!inPath) return null

    try {
      const xml = await fs.readFile(inPath, 'utf8')
      hasLoggedMissingInbound = false
      return xml
    } catch (e: any) {
      const code = String(e?.code ?? '').toUpperCase()
      const msg = String(e?.message || e)

      if (code === 'ENOENT' || code === 'ENOTDIR') {
        const baselineReady = await checkPersistedBaseline()
        if (!baselineReady && !hasLoggedMissingInbound) {
          hasLoggedMissingInbound = true
          logger.info('pss-xml', {
            message: 'inbound xml not present yet; waiting for initial import',
            inPath,
          })
        }
        return null
      }

      logger.warn('pss-xml.readInPath', { error: msg, inPath })
      return null
    }
  }

  const tick = async () => {
    if (busy) return
    busy = true
    try {
      // 1) Import inbound XML only until a DB baseline has been established.
      // After that, exports use station_kv and the source file is no longer required.
      const baselineReady = await checkPersistedBaseline()
      if (inPath && !baselineReady) {
        const xml = await readInboundXml()
        if (xml) {
          const checksum = sha256Hex(xml)
          if (checksum !== lastInChecksum) {
            lastInChecksum = checksum
            logger.info('pss-xml', {
              message: 'detected change, importing',
              checksum,
            })
            try {
              await importPssConfigXml({ stationId, xml, sourcePath: inPath })
              hasPersistedBaseline = true
              logger.info('pss-xml', { message: 'import success' })
            } catch (e: any) {
              const msg = String(e?.message || e)
              logger.error('pss-xml', { message: 'import failed', error: msg })
              await kvSet(stationId, PSS_XML_KEYS.LAST_IMPORT_ERROR, msg)
            }
          }
        }
      }

      // 2) Export on request
      const exportReqAt = await kvGet<string>(
        stationId,
        PSS_XML_KEYS.EXPORT_REQUEST_AT,
      )

      if (exportReqAt && outPath) {
        logger.info('pss-xml', { message: 'export requested', exportReqAt })
        try {
          await exportPssConfigXml({
            stationId,
            outPath,
            fallbackInPath: inPath || undefined,
          })
          logger.info('pss-xml', { message: 'export success' })
          await kvSet(stationId, PSS_XML_KEYS.EXPORT_REQUEST_AT, null)
        } catch (e: any) {
          const msg = String(e?.message || e)
          logger.error('pss-xml', { message: 'export failed', error: msg })
          await kvSet(stationId, PSS_XML_KEYS.LAST_EXPORT_ERROR, msg)
          // keep request key so the user can retry after fixing env/permissions
        }
      }
    } finally {
      busy = false
    }
  }

  // Initial tick + interval
  void tick()
  const timer = setInterval(
    () => {
      void tick()
    },
    Math.max(500, pollMs),
  )

  const shutdown = () => {
    clearInterval(timer)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return { stop: shutdown }
}
