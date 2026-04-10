import net from 'net'
import type { PrintableLine } from '@/src/shared/fiscalization/receipt/types'

import { renderEscpos } from '@/src/shared/printers/escposRenderer'

export type ReceiptPrinterConfig = {
  host: string
  port?: number
  timeoutMs?: number
  width?: number
}

export const sendEscposRaw = async (
  payload: Buffer,
  config: ReceiptPrinterConfig,
) => {
  const port = config.port ?? 9100
  const timeoutMs = config.timeoutMs ?? 8000

  await new Promise<void>((resolve, reject) => {
    const sock = new net.Socket()
    let done = false

    const finish = (err?: any) => {
      if (done) return
      done = true
      try {
        sock.destroy()
      } catch {}
      if (err) reject(err)
      else resolve()
    }

    sock.setTimeout(timeoutMs)
    sock.once('error', (e) => finish(e))
    sock.once('timeout', () => finish(new Error('Printer connection timeout')))
    sock.connect(port, config.host, () => {
      sock.write(payload, (err) => {
        if (err) return finish(err)
        sock.end(() => finish())
      })
    })
  })
}

export const printReceiptLines = async (
  lines: PrintableLine[],
  config: ReceiptPrinterConfig,
) => {
  const buffer = renderEscpos(lines, { width: config.width })
  await sendEscposRaw(buffer, config)
}
