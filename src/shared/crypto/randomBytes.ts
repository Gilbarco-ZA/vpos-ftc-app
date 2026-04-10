import * as crypto from 'node:crypto'

export function randomBytesAsync(size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(size, (err, buf) => {
      if (err) reject(err)
      else resolve(buf)
    })
  })
}
