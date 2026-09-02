import type { EscposLine } from '@/src/shared/printers/types'

export type { EscposDocument, EscposLine } from '@/src/shared/printers/types'

export type EscposRenderOptions = {
  width?: number
  qrModuleSize?: number
  qrErrorCorrection?: 48 | 49 | 50 | 51
}

const ESC = 0x1b
const GS = 0x1d

const cmd = (...bytes: number[]) => Buffer.from(bytes)

const encodeQr = (data: string, moduleSize: number, ecLevel: number) => {
  const store = Buffer.from(data, 'utf-8')
  const storeLen = store.length + 3
  const pL = storeLen & 0xff
  const pH = (storeLen >> 8) & 0xff

  return Buffer.concat([
    cmd(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    cmd(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize),
    cmd(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ecLevel),
    cmd(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30),
    store,
    cmd(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
  ])
}

const encodeRasterImage = (line: Extract<EscposLine, { type: 'image' }>) => {
  const width = Math.max(0, Math.floor(Number(line.width ?? 0)))
  const height = Math.max(0, Math.floor(Number(line.height ?? 0)))
  const widthBytes = Math.ceil(width / 8)
  if (!line.dataBase64 || !width || !height || !widthBytes) return null

  const data = Buffer.from(line.dataBase64, 'base64')
  if (data.length !== widthBytes * height) return null

  return Buffer.concat([
    cmd(
      GS,
      0x76,
      0x30,
      0x00,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ),
    data,
  ])
}

export const renderEscpos = (
  lines: EscposLine[],
  options: EscposRenderOptions = {},
) => {
  const width = options.width ?? 42
  const qrModuleSize = options.qrModuleSize ?? 6
  const qrErrorCorrection = options.qrErrorCorrection ?? 48

  const buffers: Buffer[] = [cmd(ESC, 0x40)]
  let align: 'left' | 'center' | 'right' = 'left'
  let bold = false

  const setAlign = (next: typeof align) => {
    if (next === align) return
    align = next
    const val = align === 'center' ? 1 : align === 'right' ? 2 : 0
    buffers.push(cmd(ESC, 0x61, val))
  }

  const setBold = (next: boolean) => {
    if (next === bold) return
    bold = next
    buffers.push(cmd(ESC, 0x45, bold ? 1 : 0))
  }

  const separator = '-'.repeat(width)

  lines.forEach((line) => {
    if (line.type === 'separator') {
      setAlign('left')
      setBold(false)
      buffers.push(Buffer.from(separator, 'utf-8'), cmd(0x0a))
      return
    }

    if (line.type === 'empty') {
      const count = Math.max(1, line.lines ?? 1)
      for (let i = 0; i < count; i += 1) buffers.push(cmd(0x0a))
      return
    }

    if (line.type === 'qr') {
      setAlign('center')
      setBold(false)
      buffers.push(encodeQr(line.value, qrModuleSize, qrErrorCorrection))
      buffers.push(cmd(0x0a))
      return
    }

    if (line.type === 'image') {
      const image = encodeRasterImage(line)
      if (!image) return
      setAlign('center')
      setBold(false)
      buffers.push(image, cmd(0x0a))
      return
    }

    setAlign(line.align ?? 'left')
    setBold(Boolean(line.bold))
    buffers.push(Buffer.from(line.value, 'utf-8'), cmd(0x0a))
  })

  buffers.push(cmd(0x0a), cmd(0x0a), cmd(GS, 0x56, 0x41, 0x00))
  return Buffer.concat(buffers)
}
