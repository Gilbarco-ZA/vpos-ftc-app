'use client'

import type { Socket } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

import { api } from '@/src/shared/api/fetch'
import {
  FORECOURT_CONNECTION_STATUS,
  STATUS_VARIANT,
} from '@/src/shared/status'

import type { ForecourtConnectionPayload } from '../types'

export function useForecourtConnection(stationId?: string) {
  const [connection, setConnection] =
    useState<ForecourtConnectionPayload | null>(null)

  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const res = await api<ForecourtConnectionPayload>('/api/forecourt/status')
      if (!cancelled && res.success && res.data) {
        setConnection(res.data)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: '/ws/forecourt',
      transports: ['websocket'],
      upgrade: false,
      query: stationId ? { stationId } : undefined,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    })

    socketRef.current = socket

    socket.on('message', (payload: any) => {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload

      if (parsed?.type === 'forecourt:conn' && parsed?.data) {
        setConnection(parsed.data as ForecourtConnectionPayload)
      }
    })

    return () => {
      try {
        socket.disconnect()
      } catch {}
      socketRef.current = null
    }
  }, [stationId])

  return connection
}

export const forecourtBadge = (
  status?: ForecourtConnectionPayload['status'],
) => {
  if (status === FORECOURT_CONNECTION_STATUS.ONLINE)
    return { label: 'Online', variant: STATUS_VARIANT.SUCCESS }
  if (status === FORECOURT_CONNECTION_STATUS.DEGRADED)
    return { label: 'Degraded', variant: STATUS_VARIANT.WARN }
  return { label: 'Offline', variant: STATUS_VARIANT.NEUTRAL }
}
