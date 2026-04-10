import type { SelectOption } from '@/src/shared/types'

export const readOptions = (payload: any): SelectOption[] => {
  const options = payload?.data?.options ?? payload?.options ?? []
  return Array.isArray(options) ? options : []
}
