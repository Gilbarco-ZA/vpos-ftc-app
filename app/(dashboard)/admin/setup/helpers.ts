import type { Product } from './types'

export function norm(s: unknown) {
  return String(s || '')
    .trim()
    .toLowerCase()
}

export function productLabel(p: Product) {
  const name = p.productName || p.name || p.productId
  const code = p.productCode || p.code
  const price =
    (p.unitPrice ?? p.price) != null ? ` - ${p.unitPrice ?? p.price}` : ''
  return `${name}${code ? ` [${code}]` : ''} (${p.productId})${price}`
}

export function suggestProductId(
  fuelType: string | undefined,
  products: Product[],
) {
  const ft = norm(fuelType)
  if (!ft) return ''
  let best: { id: string; score: number } = { id: '', score: -1 }
  for (const p of products) {
    const pid = norm(p.productId)
    const code = norm(p.productCode || p.code)
    const name = norm(p.productName || p.name)
    let score = -1
    if (code && (code === ft || code.includes(ft) || ft.includes(code))) {
      score = Math.max(score, 100)
    }
    if (pid && (pid === ft || pid.includes(ft) || ft.includes(pid))) {
      score = Math.max(score, 80)
    }
    if (name && (name.includes(ft) || ft.includes(name))) {
      score = Math.max(score, 60)
    }

    if (
      (ft.includes('diesel') || ft === 'dsl') &&
      (pid.includes('diesel') || code === 'dsl' || name.includes('diesel'))
    ) {
      score = Math.max(score, 90)
    }
    if (
      (ft.includes('petrol') ||
        ft.includes('pms') ||
        ft.includes('gasoline')) &&
      (pid.includes('petrol') || code === 'pms' || name.includes('petrol'))
    ) {
      score = Math.max(score, 90)
    }
    if (
      ft.includes('pms') &&
      (code === 'pms' || pid.includes('pms') || name.includes('petrol'))
    ) {
      score = Math.max(score, 95)
    }
    if (
      ft.includes('kerosene') &&
      (pid.includes('kero') || code.includes('kero') || name.includes('kero'))
    ) {
      score = Math.max(score, 90)
    }

    if (score > best.score) best = { id: p.productId, score }
  }
  return best.score >= 0 ? best.id : ''
}
