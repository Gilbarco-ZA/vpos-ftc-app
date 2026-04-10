export const withAzureRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  const max = 3
  let lastErr: unknown = null

  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const isLast = attempt === max - 1
      const delayMs =
        250 * Math.pow(2, attempt) + Math.floor(Math.random() * 100)

      if (isLast) break

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastErr
}
