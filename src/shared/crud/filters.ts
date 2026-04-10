export type CrudDateFilter = {
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
}

export function applyDateRangeParams(
  params: URLSearchParams,
  range: CrudDateFilter,
  opts?: {
    fromKey?: string
    toKey?: string
    startTime?: string
    endTime?: string
  },
) {
  const fromKey = opts?.fromKey ?? 'from'
  const toKey = opts?.toKey ?? 'to'
  const startTime = opts?.startTime ?? 'T00:00:00'
  const endTime = opts?.endTime ?? 'T23:59:59'

  if (range.startDate) params.set(fromKey, `${range.startDate}${startTime}`)
  if (range.endDate) params.set(toKey, `${range.endDate}${endTime}`)
}
