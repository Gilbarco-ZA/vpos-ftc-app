import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'

const SUPPORTED_TANZANIA_PROXY_TAX_CODES = new Set(['A', 'B', 'C', 'D', 'E'])

function normalizeTaxCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

export function assertTanzaniaProxyTaxCodes(
  invoice: ProxyInvoiceRequest,
): void {
  const lines = invoice.lines ?? []

  lines.forEach((line, lineIndex) => {
    const taxes = line.taxes ?? []
    if (taxes.length === 0) {
      throw new Error(
        `Tanzania proxy invoice line ${lineIndex + 1} requires a TRA tax code (A-E).`,
      )
    }

    taxes.forEach((tax) => {
      const code = normalizeTaxCode(tax.type)
      if (SUPPORTED_TANZANIA_PROXY_TAX_CODES.has(code)) return

      if (code === 'Z') {
        throw new Error(
          `Tanzania TaxCode Z is not supported by vpos-proxy. Configure the product with the applicable TRA tax code A-E before fiscalization.`,
        )
      }

      throw new Error(
        `Tanzania tax code ${code || '(missing)'} is not supported by vpos-proxy. Supported codes are A-E.`,
      )
    })
  })
}
