import { localDateTime } from '@/src/shared/time/localDateTime'

export const DEFAULT_TANZANIA_DAILY_TOTALS_SEND_TIME = '00:00'

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function normalizeTanzaniaDailyTotalsSendTime(value: unknown): string {
  const text = String(value ?? '').trim()
  const candidate = text.length >= 5 ? text.slice(0, 5) : text
  if (!HH_MM_RE.test(candidate)) {
    throw new Error('Daily totals send time must use 24-hour HH:mm format.')
  }
  return candidate
}

export function isTanzaniaDailyTotalsSendTimeReached(args: {
  now: Date
  timezone: string
  sendTime: string
}): boolean {
  const sendTime = normalizeTanzaniaDailyTotalsSendTime(args.sendTime)
  const [hour, minute] = sendTime.split(':').map(Number)
  const scheduledMinutes = hour * 60 + minute
  return localDateTime(args.now, args.timezone).timeMinutes >= scheduledMinutes
}
