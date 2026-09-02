import { setConfigVersionPin } from '@/src/platform/config/config-version-pinning'

const args = process.argv.slice(2)
const valueOf = (name: string) => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`))
  if (direct) return direct.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function main() {
  const store = valueOf('--store')
  const id = valueOf('--id')
  const unpin = args.includes('--unpin')
  const reason = valueOf('--reason')

  if (!['station', 'plugin', 'device'].includes(String(store))) {
    throw new Error('--store must be station, plugin, or device')
  }
  if (!id) throw new Error('--id is required')
  if (!unpin && !String(reason || '').trim()) {
    throw new Error('--reason is required when pinning a version')
  }

  const result = await setConfigVersionPin({
    store: store as 'station' | 'plugin' | 'device',
    id,
    pinned: !unpin,
    reason,
  })

  if (!result) throw new Error('configuration version was not found')
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
