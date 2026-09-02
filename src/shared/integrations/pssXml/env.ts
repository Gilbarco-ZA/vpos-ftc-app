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
