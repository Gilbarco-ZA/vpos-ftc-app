import type { FiscalReceiptModel, PrintableLine } from '../types'
import { buildReceiptLines as buildDefaultLines } from './DEFAULT'

export const buildReceiptLines = (
  model: FiscalReceiptModel,
): PrintableLine[] => {
  return buildDefaultLines(model)
}
