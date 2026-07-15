export const runSingleFlight = async <T>(args: {
  registry: Map<string, Promise<T>>
  key: string
  run: () => Promise<T>
}): Promise<T> => {
  const key = String(args.key ?? '').trim()
  if (!key) throw new Error('single-flight key is required')

  const existing = args.registry.get(key)
  if (existing) return await existing

  const promise = Promise.resolve().then(args.run)
  args.registry.set(key, promise)

  try {
    return await promise
  } finally {
    if (args.registry.get(key) === promise) {
      args.registry.delete(key)
    }
  }
}
