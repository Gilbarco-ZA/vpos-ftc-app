export type EscposLine =
  | {
      type: 'text'
      value: string
      align?: 'left' | 'center' | 'right'
      bold?: boolean
    }
  | { type: 'separator' }
  | { type: 'qr'; value: string }
  | {
      type: 'image'
      asset: 'tra-receipt-start' | 'branding-logo' | 'tra-receipt-end'
      dataBase64?: string
      width?: number
      height?: number
    }
  | { type: 'empty'; lines?: number }

/**
 * Preserve the historical alias shape used by downstream code.
 * The legacy path exported a single printable-line union for both names.
 */
export type EscposDocument = EscposLine
