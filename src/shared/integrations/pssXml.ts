import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { kvGet, kvGetMany, kvSet } from '@/src/shared/storage/stationKv'

import { importPssConfigXml } from '@/src/modules/setup/infrastructure/pssXmlImporter'

export { PSS_XML_KEYS }
export { importPssConfigXml }
export { kvGet, kvGetMany, kvSet }

export function getPssXmlEnv() {
  const toBool = (name: string, fallback = false) => {
    const raw = String(process.env[name] ?? '')
      .trim()
      .toLowerCase()
    if (!raw) return fallback
    if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false
    return fallback
  }

  return {
    enabled: toBool('PSS_XML_SYNC_ENABLED', true),
    inPath:
      String(
        process.env.PSS_XML_IN_PATH ?? '/tmp/fccapps/pss/config.xml',
      ).trim() || null,
    outPath:
      String(
        process.env.PSS_XML_OUT_PATH ??
          '/tmp/fccapps/pss/peeps/temp/config.xml',
      ).trim() || null,
    pollMs: Number(process.env.PSS_XML_POLL_MS ?? '2000'),
  }
}
