import type {
  PssXmlConfig,
  PssXmlFuellingPoint,
  PssXmlGrade,
  PssXmlGradeOption,
  PssXmlPriceGroup,
  PssXmlProduct,
  PssXmlTank,
} from '@/src/shared/integrations/pssXml/types'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const toArray = <T = any>(list: any): T[] => {
  const out: T[] = []
  if (!list || typeof list.length !== 'number') return out
  for (let i = 0; i < list.length; i++) {
    const item = list.item ? list.item(i) : list[i]
    if (item) out.push(item as T)
  }
  return out
}

const isElement = (node: any): node is Element =>
  !!node && typeof node === 'object' && node.nodeType === 1

const getAttr = (el: any, name: string) => {
  try {
    const v = el?.getAttribute?.(name)
    return v == null ? '' : String(v)
  } catch {
    return ''
  }
}

const getText = (el: any) => {
  const raw = String(el?.textContent ?? '').trim()
  return raw
}

const toIntOrNull = (value: unknown): number | null => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? Math.trunc(n) : null
}

const getDirectChild = (parent: any, name: string): Element | null => {
  if (!parent?.childNodes) return null
  const children = toArray<any>(parent.childNodes)
  for (const node of children) {
    if (isElement(node) && String(node.nodeName) === name) return node
  }
  return null
}

const getDirectChildren = (parent: any, name: string): Element[] => {
  if (!parent?.childNodes) return []
  const out: Element[] = []
  const children = toArray<any>(parent.childNodes)
  for (const node of children) {
    if (isElement(node) && String(node.nodeName) === name) out.push(node)
  }
  return out
}

export const parsePssConfigXml = (xml: string): PssXmlConfig => {
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: () => {},
    } as any,
  })

  const doc = parser.parseFromString(xml || '', 'text/xml')

  // Grades
  const gradeNodes = toArray<Element>(
    (doc as any).getElementsByTagName?.('Grade'),
  )
  const grades: PssXmlGrade[] = gradeNodes
    .map((g) => ({
      id: getAttr(g, 'ID').trim(),
      name: getAttr(g, 'Name').trim(),
    }))
    .filter((g) => !!g.id)

  // Products (optional in some XML backups)
  const productNodes = toArray<Element>(
    (doc as any).getElementsByTagName?.('Product'),
  )
  const products: PssXmlProduct[] = productNodes
    .map((p) => ({
      id: getAttr(p, 'ID').trim(),
      name: getAttr(p, 'Name').trim() || undefined,
      color: getAttr(p, 'Color').trim() || undefined,
    }))
    .filter((p) => !!p.id)

  // PriceGroups (optional)
  const priceGroups: PssXmlPriceGroup[] = []
  const priceGroupNodes = toArray<Element>(
    (doc as any).getElementsByTagName?.('PriceGroup'),
  )
  for (const pg of priceGroupNodes) {
    const id = getAttr(pg, 'ID').trim()
    if (!id) continue

    const gradeIdNodes = toArray<Element>(
      (pg as any).getElementsByTagName?.('GradeID'),
    )
    const priceNodes = toArray<Element>(
      (pg as any).getElementsByTagName?.('Price'),
    )

    const pricesByGradeId: Record<string, number> = {}
    const n = Math.min(gradeIdNodes.length, priceNodes.length)
    for (let i = 0; i < n; i++) {
      const gradeId = getText(gradeIdNodes[i])
      const priceRaw = getText(priceNodes[i])
      const price = Number(priceRaw)
      if (!gradeId) continue
      pricesByGradeId[gradeId] = Number.isFinite(price) ? price : 0
    }

    priceGroups.push({ id, pricesByGradeId })
  }

  // Devices section
  const devices =
    toArray<Element>((doc as any).getElementsByTagName?.('Devices'))[0] || null

  // Tanks (under Devices)
  const tanks: PssXmlTank[] = []
  const tanksNode = devices ? getDirectChild(devices, 'Tanks') : null
  if (tanksNode) {
    const tankNodes = getDirectChildren(tanksNode, 'Tank')
    for (const t of tankNodes) {
      const id = getAttr(t, 'ID').trim()
      if (!id) continue
      const productId = getAttr(t, 'ProductID').trim()
      tanks.push({ id, productId: productId || null })
    }
  }

  // FuellingPoints (under Devices)
  const fuellingPoints: PssXmlFuellingPoint[] = []
  const fpsNode = devices ? getDirectChild(devices, 'FuellingPoints') : null
  if (fpsNode) {
    const fpNodes = getDirectChildren(fpsNode, 'FuellingPoint')
    for (const fp of fpNodes) {
      const id = getAttr(fp, 'ID').trim()
      if (!id) continue

      const pssPortNo = toIntOrNull(getText(getDirectChild(fp, 'PSSPortNo')))
      const deviceSubAddress = toIntOrNull(
        getText(getDirectChild(fp, 'DeviceSubAddress')),
      )
      const endpointNode = getDirectChild(fp, 'IPAddressAndPortNo')
      const ipAddress = endpointNode
        ? getText(getDirectChild(endpointNode, 'IPAddress'))
        : ''
      const tcpUdpPortNo = endpointNode
        ? toIntOrNull(getText(getDirectChild(endpointNode, 'TCP_UDP_PortNo')))
        : null

      const gradeOptions: PssXmlGradeOption[] = []
      const gradeOptionsNode = getDirectChild(fp, 'GradeOptions')
      if (gradeOptionsNode) {
        const goNodes = getDirectChildren(gradeOptionsNode, 'GradeOption')
        for (const go of goNodes) {
          const goId = getAttr(go, 'ID').trim()
          if (!goId) continue

          const gradeIdNode = getDirectChild(go, 'GradeID')
          const gradeId = gradeIdNode ? getText(gradeIdNode) : ''

          const partNode = getDirectChild(go, 'Part')
          const tankId = partNode ? getAttr(partNode, 'TankID').trim() : ''
          const parts = partNode ? getAttr(partNode, 'Parts').trim() : ''

          gradeOptions.push({
            id: goId,
            gradeId: gradeId || null,
            tankId: tankId || null,
            parts: parts || null,
          })
        }
      }

      fuellingPoints.push({
        id,
        pssPortNo,
        ipAddress: ipAddress || null,
        tcpUdpPortNo,
        deviceSubAddress,
        gradeOptions,
      })
    }
  }

  return { grades, priceGroups, products, tanks, fuellingPoints }
}

export type PssXmlPumpMapping = {
  pumpId: string
  nozzles: Array<{
    nozzleId: string
    /** PSS GradeID (string) */
    gradeId: string
    /** PSS TankID (string) */
    tankId: string
  }>
}

/**
 * Apply pump/nozzle mapping into the existing XML document.
 *
 * Important design choice: we only patch GradeOptions within existing FuellingPoint nodes.
 * We DO NOT attempt to create full FuellingPoint nodes because the PSS schema contains
 * many required fields (IP, DeviceSubAddress, etc.) that vpos-ftc-app does not own.
 */
export const patchPssXmlFuellingPoints = (args: {
  xml: string
  pumpMappings: PssXmlPumpMapping[]
}): string => {
  const { xml, pumpMappings } = args

  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: () => {},
    } as any,
  })
  const doc = parser.parseFromString(xml || '', 'text/xml')

  const devices =
    toArray<Element>((doc as any).getElementsByTagName?.('Devices'))[0] || null
  if (!devices) return xml

  let fpsNode = getDirectChild(devices, 'FuellingPoints')
  if (!fpsNode) {
    fpsNode = doc.createElement('FuellingPoints') as Element
    devices.appendChild(fpsNode)
  }

  const fpNodes = getDirectChildren(fpsNode, 'FuellingPoint')
  const fpById = new Map<string, Element>()
  for (const fp of fpNodes) {
    const id = getAttr(fp, 'ID').trim()
    if (id) fpById.set(id, fp)
  }

  for (const pump of pumpMappings) {
    const fp = fpById.get(String(pump.pumpId))
    if (!fp) {
      // No matching FuellingPoint in the XML; do not create one.
      continue
    }

    let gradeOptionsNode = getDirectChild(fp, 'GradeOptions')
    if (!gradeOptionsNode) {
      gradeOptionsNode = doc.createElement('GradeOptions') as Element
      fp.appendChild(gradeOptionsNode)
    }

    // Replace GradeOption elements entirely.
    // (Preserves other fp sections like OperationModes, TransactionProcessing, etc.)
    const existing = getDirectChildren(gradeOptionsNode, 'GradeOption')
    for (const node of existing) {
      try {
        gradeOptionsNode.removeChild(node)
      } catch {}
    }

    for (const nozzle of pump.nozzles) {
      const go = doc.createElement('GradeOption')
      go.setAttribute('ID', String(nozzle.nozzleId))

      const gradeIdNode = doc.createElement('GradeID')
      gradeIdNode.appendChild(doc.createTextNode(String(nozzle.gradeId)))
      go.appendChild(gradeIdNode)

      const partNode = doc.createElement('Part')
      partNode.setAttribute('TankID', String(nozzle.tankId))
      // PSS examples include Parts="1"; keep that default.
      partNode.setAttribute('Parts', '1')
      go.appendChild(partNode)

      gradeOptionsNode.appendChild(go)
    }
  }

  const serializer = new XMLSerializer()
  const serialized = serializer.serializeToString(doc as any)

  // Ensure an XML declaration exists (PSS expects utf-8 typically).
  if (serialized.trimStart().startsWith('<?xml')) return serialized
  return `<?xml version="1.0" encoding="utf-8"?>\n${serialized}`
}
