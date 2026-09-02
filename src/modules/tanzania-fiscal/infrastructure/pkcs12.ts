import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type OpenSslResult = {
  stdout: Buffer
  stderr: Buffer
}

const runOpenSsl = async (args: string[], passphrase: string) =>
  await new Promise<OpenSslResult>((resolve, reject) => {
    const child = spawn('openssl', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      }
      if (code === 0) {
        resolve(result)
        return
      }
      reject(
        new Error(
          result.stderr.toString('utf8').trim() ||
            `OpenSSL exited with status ${code ?? 'unknown'}`,
        ),
      )
    })

    child.stdin.end(`${passphrase}\n`)
  })

const extractPemBlock = (value: string, labelPattern: string) => {
  const match = new RegExp(
    `-----BEGIN (${labelPattern})-----[\\s\\S]*?-----END \\1-----`,
  ).exec(value)
  return match?.[0]?.trim() ?? null
}

async function extractWithOpenSsl(args: {
  pfxPath: string
  passphrase: string
  mode: 'private-key' | 'certificate'
}) {
  const modeArgs =
    args.mode === 'private-key'
      ? ['-nocerts', '-nodes']
      : ['-clcerts', '-nokeys']

  const baseArgs = [
    'pkcs12',
    '-in',
    args.pfxPath,
    ...modeArgs,
    '-passin',
    'stdin',
  ]

  try {
    return (await runOpenSsl(baseArgs, args.passphrase)).stdout.toString('utf8')
  } catch (error) {
    // Older TRA packages can use legacy PKCS#12 algorithms disabled by
    // OpenSSL 3 unless the legacy provider is explicitly enabled.
    try {
      return (
        await runOpenSsl([...baseArgs, '-legacy'], args.passphrase)
      ).stdout.toString('utf8')
    } catch {
      throw error
    }
  }
}

export type ImportedTraCertificate = {
  privateKeyPem: string
  certificatePem: string
  certSerial: string
  certSerialBase64: string
  proxyCertSerialBase64: string
  privateKeyBase64: string
  publicKeyBase64: string
  subject: string
  issuer: string
  validFrom: string
  validTo: string
}

export async function importTraPkcs12(args: {
  payload: Buffer
  passphrase?: string | null
}): Promise<ImportedTraCertificate> {
  if (!args.payload.length) throw new Error('TRA certificate file is empty')

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vpos-tra-pfx-'))
  const pfxPath = path.join(tempDir, 'certificate.pfx')
  const passphrase = String(args.passphrase ?? '')

  try {
    await fs.writeFile(pfxPath, args.payload, { mode: 0o600 })
    const [privateOutput, certificateOutput] = await Promise.all([
      extractWithOpenSsl({ pfxPath, passphrase, mode: 'private-key' }),
      extractWithOpenSsl({ pfxPath, passphrase, mode: 'certificate' }),
    ])

    const privateKeyPem = extractPemBlock(
      privateOutput,
      '(?:ENCRYPTED |RSA |EC )?PRIVATE KEY',
    )
    const certificatePem = extractPemBlock(certificateOutput, 'CERTIFICATE')

    if (!privateKeyPem) {
      throw new Error('The TRA PKCS#12 file does not contain a private key')
    }
    if (!certificatePem) {
      throw new Error('The TRA PKCS#12 file does not contain a certificate')
    }

    const privateKey = crypto.createPrivateKey(privateKeyPem)
    const certificate = new crypto.X509Certificate(certificatePem)
    const rawSerial = certificate.serialNumber
      .replace(/[^0-9a-fA-F]/g, '')
      .toUpperCase()
    const certSerial = rawSerial.replace(/(.{2})/g, '$1 ').trim()
    const certSerialBase64 = certSerial
      ? Buffer.from(certSerial).toString('base64')
      : ''
    if (!certSerial || !certSerialBase64) {
      throw new Error('Unable to derive the TRA certificate serial number')
    }

    const proxyCertSerial = rawSerial.toLowerCase()
    const proxyCertSerialBase64 = Buffer.from(proxyCertSerial, 'utf8').toString(
      'base64',
    )
    const privateKeyBase64 = Buffer.from(
      privateKey.export({ format: 'der', type: 'pkcs8' }),
    ).toString('base64')
    const publicKeyBase64 = Buffer.from(
      certificate.publicKey.export({
        format: 'der',
        type: 'spki',
      }),
    ).toString('base64')

    return {
      privateKeyPem,
      certificatePem,
      certSerial,
      certSerialBase64,
      proxyCertSerialBase64,
      privateKeyBase64,
      publicKeyBase64,
      subject: certificate.subject,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
