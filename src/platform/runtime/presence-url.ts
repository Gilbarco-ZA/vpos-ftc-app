import { chmod, mkdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'

const DEFAULT_PRESENCE_URL_FILE = '/opt/fccapps/vpos-perm/vpos-presence-url'
export const DEFAULT_PRESENCE_URL =
  'https://ec2-13-246-19-190.af-south-1.compute.amazonaws.com/hubs/vpos-presence'

export const getPresenceUrlFilePath = () =>
  String(process.env.VPOS_PRESENCE_URL_FILE || DEFAULT_PRESENCE_URL_FILE).trim()

export async function readPresenceUrl(): Promise<string> {
  try {
    return (await readFile(getPresenceUrlFilePath(), 'utf8')).trim() || DEFAULT_PRESENCE_URL
  } catch (error: any) {
    if (error?.code === 'ENOENT') return DEFAULT_PRESENCE_URL
    throw error
  }
}

export function validatePresenceUrl(value: unknown): string {
  const url = String(value ?? '').trim()
  if (!url) return ''

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Presence URL must be a valid absolute URL.')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Presence URL must use HTTP or HTTPS.')
  }

  return url
}

export async function writePresenceUrl(value: unknown): Promise<string> {
  const url = validatePresenceUrl(value)
  const filePath = getPresenceUrlFilePath()
  const dir = path.dirname(filePath)
  const tempPath = `${filePath}.tmp-${process.pid}`

  await mkdir(dir, { recursive: true })
  await writeFile(tempPath, url ? `${url}\n` : '', 'utf8')
  try {
    await chmod(tempPath, 0o644)
  } catch {}
  await rename(tempPath, filePath)

  return url
}
