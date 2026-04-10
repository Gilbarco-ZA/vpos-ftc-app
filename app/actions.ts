'use server'

import webpush, { WebPushError } from 'web-push'

import { requireAuth } from '@/src/shared/auth'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'

type PushSubscriptionData = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

type StoredSubscription = PushSubscriptionData & { createdAt: number }
type SubscriptionMap = Record<string, StoredSubscription[]>

const SUBSCRIPTIONS_KEY = 'push.subscriptions'

const publicKey =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
  'BGU51qc0AjFITxqDTecOxncR2JQhtHiv8XwdsoPBI_84BiEFc8-UkjEQqYu6KJSwM04mOm88xqMkeTlXoGtqnDY'
const privateKey =
  process.env.VAPID_PRIVATE_KEY?.trim() ||
  'xy9gK3GdeZvCyU0d7Od2p1mPQkmGccQGi2UEGHIcTH4'
const contactEmail =
  process.env.VAPID_CONTACT_EMAIL?.trim() || 'support@vpos-ftc.local'

if (!publicKey || !privateKey) {
  throw new Error(
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured for push notifications.',
  )
}

const contactValue = contactEmail.startsWith('mailto:')
  ? contactEmail
  : `mailto:${contactEmail}`

webpush.setVapidDetails(contactValue, publicKey, privateKey)

const normalizeSubscription = (
  sub: PushSubscriptionData,
): StoredSubscription => ({
  endpoint: sub.endpoint,
  expirationTime: sub.expirationTime ?? null,
  keys: {
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  },
  createdAt: Date.now(),
})

const loadSubscriptions = async (
  stationId: string,
): Promise<SubscriptionMap> => {
  return (await kvGet<SubscriptionMap>(stationId, SUBSCRIPTIONS_KEY)) ?? {}
}

const persistSubscriptions = async (
  stationId: string,
  data: SubscriptionMap,
): Promise<void> => {
  await kvSet(stationId, SUBSCRIPTIONS_KEY, data)
}

const validateSubscriptionInput = (sub: PushSubscriptionData) => {
  if (!sub?.endpoint?.trim()) {
    throw new Error('Invalid push subscription: missing endpoint')
  }
  if (!sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error('Invalid push subscription: missing key material')
  }
}

export async function subscribeUser(sub: PushSubscriptionData) {
  validateSubscriptionInput(sub)
  const user = await requireAuth()
  const stationId = getStationId()
  const data = await loadSubscriptions(stationId)
  const normalized = normalizeSubscription(sub)
  const existing = data[user.id] ?? []
  const filtered = existing.filter(
    (entry) => entry.endpoint !== normalized.endpoint,
  )
  data[user.id] = [...filtered, normalized]
  await persistSubscriptions(stationId, data)
  return { success: true }
}

export async function unsubscribeUser(endpoint?: string) {
  const user = await requireAuth()
  const stationId = getStationId()
  const data = await loadSubscriptions(stationId)
  if (!data[user.id]?.length) return { success: true }
  if (endpoint) {
    data[user.id] = data[user.id].filter((entry) => entry.endpoint !== endpoint)
  } else {
    delete data[user.id]
  }
  if (data[user.id]?.length === 0) {
    delete data[user.id]
  }
  await persistSubscriptions(stationId, data)
  return { success: true }
}

export async function sendNotification(message: string, title?: string) {
  await requireAuth()
  const stationId = getStationId()
  const data = await loadSubscriptions(stationId)
  const payload = JSON.stringify({
    title: title || 'VPOS Notification',
    body: message,
    icon: '/icon.png',
  })

  let delivered = 0
  let failures = 0
  let changed = false

  for (const [userId, entries] of Object.entries(data)) {
    const survivors: StoredSubscription[] = []
    for (const entry of entries) {
      try {
        await webpush.sendNotification(entry, payload)
        delivered += 1
        survivors.push(entry)
      } catch (error) {
        failures += 1
        const statusCode =
          error instanceof WebPushError
            ? error.statusCode
            : (error as any)?.statusCode
        const shouldRemove = statusCode === 404 || statusCode === 410
        logger.error('[push-notification]', {
          msg: 'Failed to deliver push notification',
          userId,
          endpoint: entry.endpoint,
          statusCode: statusCode ?? null,
          error,
        })
        if (!shouldRemove) {
          survivors.push(entry)
        } else {
          changed = true
        }
      }
    }
    if (survivors.length) {
      if (survivors.length !== entries.length) {
        changed = true
      }
      data[userId] = survivors
    } else {
      delete data[userId]
      changed = true
    }
  }

  if (changed) {
    await persistSubscriptions(stationId, data)
  }

  if (delivered === 0) {
    const errorMessage =
      failures > 0
        ? 'No subscriptions accepted the notification'
        : 'No subscriptions registered'
    return { success: false, error: errorMessage, delivered, failures }
  }

  return { success: true, delivered, failures }
}
