'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type UseApiState<T> = {
  data: T | null
  loading: boolean
  error: unknown
}

export type UseApiOptions<T> = {
  /** Parse the JSON body into the desired shape. Defaults to `body?.data ?? body`. */
  parse?: (body: any) => T
  /** When false the fetch will not run automatically — call `refetch()` manually. Default true. */
  auto?: boolean
  /** Initial data to seed the hook (e.g. from SSR). */
  initialData?: T | null
}

export type UseApiReturn<T> = UseApiState<T> & {
  /** Re-run the fetch. Optionally override the URL. */
  refetch: (urlOverride?: string) => Promise<void>
}

/**
 * Shared data-fetching hook with loading/error/data state and AbortController cleanup.
 */
export function useApi<T = unknown>(
  url: string | null,
  options?: UseApiOptions<T>,
): UseApiReturn<T> {
  const { parse, auto = true, initialData = null } = options ?? {}

  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState<boolean>(auto && url != null)
  const [error, setError] = useState<unknown>(null)

  const parseRef = useRef(parse)

  useEffect(() => {
    parseRef.current = parse
  }, [parse])

  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(
    async (urlOverride?: string) => {
      const target = urlOverride ?? url
      if (!target) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)

      try {
        const res = await fetch(target, {
          cache: 'no-store',
          signal: controller.signal,
        })

        const body = await res.json().catch(() => ({}))

        if (controller.signal.aborted) return

        if (!res.ok || body?.ok === false) {
          setError(res.ok ? body : { status: res.status, body })
          return
        }

        const parsed = parseRef.current
          ? parseRef.current(body)
          : (body?.data ?? body)
        setData(parsed as T)
      } catch (error: unknown) {
        if ((error as any)?.name === 'AbortError') return
        setError(error)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    },
    [url],
  )

  useEffect(() => {
    if (!auto || !url) return
    queueMicrotask(() => {
      fetchData()
    })
    return () => {
      abortRef.current?.abort()
    }
  }, [auto, url, fetchData])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  return { data, loading, error, refetch: fetchData }
}
