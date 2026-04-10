import net from 'net'

export type EscposTcpOptions = {
  host: string
  port?: number
  timeoutMs?: number
}

/**
 * Minimal ESC/POS over TCP (port 9100 by default).
 * Sends: initialize, text bytes, line feeds, cut.
 *
 * Note: This is intentionally lightweight (no external deps).
 */
export async function escposTcpPrintText(
  text: string,
  opts: EscposTcpOptions,
): Promise<void> {
  const port = opts.port ?? 9100
  const timeoutMs = opts.timeoutMs ?? 8000

  // ESC/POS commands
  const INIT = Buffer.from([0x1b, 0x40]) // ESC @
  const LF = Buffer.from([0x0a]) // \n
  const CUT = Buffer.from([0x1d, 0x56, 0x41, 0x00]) // GS V A 0 (full cut)

  const payload = Buffer.concat([INIT, Buffer.from(text, 'utf-8'), LF, LF, CUT])

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
    sock.connect(port, opts.host, () => {
      sock.write(payload, (err) => {
        if (err) return finish(err)
        // Ensure bytes flush
        sock.end(() => finish())
      })
    })
  })
}
