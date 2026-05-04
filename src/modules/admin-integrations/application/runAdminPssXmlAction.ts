import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { kvSet, PSS_XML_KEYS } from '@/src/shared/integrations/pssXml'

import { importPssConfigXml } from '@/src/modules/setup/infrastructure/pssXmlImporter'

import type { PssXmlActionBody } from './pssXmlTypes'

const isFile = (v: any): v is File => {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.text === 'function' &&
    typeof v.arrayBuffer === 'function'
  )
}

const sniffXml = (xml: string) => {
  const s = String(xml || '').trim()
  if (!s) return { ok: false, reason: 'xml is empty' }
  if (!s.includes('<PSS_Config')) {
    return {
      ok: false,
      reason: 'xml does not appear to be a PSS config (missing <PSS_Config>)',
    }
  }
  if (
    !s.includes('<Devices') &&
    !s.includes('<Grades') &&
    !s.includes('<FuellingPoints')
  ) {
    return {
      ok: false,
      reason: 'xml does not look like a PSS config (missing expected sections)',
    }
  }
  return { ok: true as const }
}

export async function runAdminPssXmlAction(
  user: SessionUser,
  body: PssXmlActionBody,
) {
  const action =
    String(body?.action ?? body?.data?.action ?? '').trim() ||
    (body?.file || body?.xmlFile ? 'upload_xml' : '')

  if (action === 'request_export') {
    await kvSet(
      user.stationId,
      PSS_XML_KEYS.EXPORT_REQUEST_AT,
      new Date().toISOString(),
    )
    return { requested: true }
  }

  if (
    action === 'import_xml' ||
    action === 'upload_xml' ||
    action === 'upload'
  ) {
    const file = (body?.file ?? body?.xmlFile) as any
    let xml = String(body?.xml ?? body?.data?.xml ?? '').trim()
    let sourcePath: string | undefined

    if (!xml && isFile(file)) {
      const maxBytes = 5 * 1024 * 1024
      if (Number(file.size) > maxBytes) {
        return NextResponse.json(
          { success: false, error: `file too large (max ${maxBytes} bytes)` },
          { status: 413 },
        )
      }
      xml = String(await file.text())
      sourcePath = file?.name ? `upload:${String(file.name)}` : 'upload'
    }

    if (!xml) {
      return NextResponse.json(
        {
          success: false,
          error: 'xml is required (either as xml field or as file upload)',
        },
        { status: 400 },
      )
    }

    const sniff = sniffXml(xml)
    if (!sniff.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid XML: ${'reason' in sniff ? sniff.reason : 'unknown error'}`,
        },
        { status: 400 },
      )
    }

    const res = await importPssConfigXml({
      stationId: user.stationId,
      xml,
      sourcePath,
    })
    return { imported: true, result: res }
  }

  return NextResponse.json(
    { success: false, error: 'Unsupported action' },
    { status: 400 },
  )
}
