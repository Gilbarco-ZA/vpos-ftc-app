export const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

export async function dispatchClaimedItems<T>(opts: {
  items: readonly T[]
  handleItem: (item: T) => Promise<void>
}) {
  for (const item of opts.items) {
    await opts.handleItem(item)
  }
}

export async function runClaimLoop<T>(opts: {
  claimBatch: () => Promise<readonly T[]>
  handleItem: (item: T) => Promise<void>
  idleDelayMs: number
}) {
  const items = await opts.claimBatch()
  if (!items.length) {
    await sleep(opts.idleDelayMs)
    return 0
  }

  await dispatchClaimedItems({ items, handleItem: opts.handleItem })
  return items.length
}
