export type ColumnAlign = 'left' | 'right' | 'center'

const pad = (value: string, width: number, align: ColumnAlign) => {
  if (value.length === width) return value
  if (value.length > width) return value.slice(0, width)
  const padSize = width - value.length
  if (align === 'right') return `${' '.repeat(padSize)}${value}`
  if (align === 'center') {
    const left = Math.floor(padSize / 2)
    const right = padSize - left
    return `${' '.repeat(left)}${value}${' '.repeat(right)}`
  }
  return `${value}${' '.repeat(padSize)}`
}

export const formatColumns = (params: {
  widths: number[]
  values: string[]
  aligns?: ColumnAlign[]
}) => {
  const { widths, values, aligns = [] } = params
  return widths
    .map((width, index) => {
      const value = values[index] ?? ''
      const align = aligns[index] ?? 'left'
      return pad(value, width, align)
    })
    .join('')
}
