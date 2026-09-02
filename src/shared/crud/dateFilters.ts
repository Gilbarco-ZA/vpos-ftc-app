export type DatePresetKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'custom'

export type DateFilterInput = {
  startDate?: string | null
  endDate?: string | null
  preset?: string | null
}

export type ResolvedDateFilter = {
  startDate: string
  endDate: string
  preset: DatePresetKey
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const normalizeDate = (value: string | null | undefined) => {
  const normalized = String(value || '').trim()
  return DATE_PATTERN.test(normalized) ? normalized : ''
}

const shiftDate = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

export function resolveDateFilter(
  input: DateFilterInput,
  currentBusinessDate: string,
): ResolvedDateFilter {
  const today = normalizeDate(currentBusinessDate)
  const startDate = normalizeDate(input.startDate)
  const endDate = normalizeDate(input.endDate)
  const requestedPreset = String(input.preset || '').trim() as DatePresetKey

  if (requestedPreset === 'all') {
    return { startDate: '', endDate: '', preset: 'all' }
  }

  if (startDate || endDate || requestedPreset === 'custom') {
    return { startDate, endDate, preset: 'custom' }
  }

  if (!today) {
    return { startDate: '', endDate: '', preset: 'all' }
  }

  if (requestedPreset === 'yesterday') {
    const yesterday = shiftDate(today, -1)
    return {
      startDate: yesterday,
      endDate: yesterday,
      preset: 'yesterday',
    }
  }

  if (requestedPreset === 'last7') {
    return { startDate: shiftDate(today, -6), endDate: today, preset: 'last7' }
  }

  if (requestedPreset === 'last30') {
    return {
      startDate: shiftDate(today, -29),
      endDate: today,
      preset: 'last30',
    }
  }

  if (requestedPreset === 'thisMonth') {
    return {
      startDate: `${today.slice(0, 8)}01`,
      endDate: today,
      preset: 'thisMonth',
    }
  }

  return { startDate: today, endDate: today, preset: 'today' }
}
