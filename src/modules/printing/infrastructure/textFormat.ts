export function wrapTextToWidth(text: string, width: number): string {
  if (!width || width < 8) return text
  const lines: string[] = []
  const raw = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  for (const l of raw) {
    let line = l
    while (line.length > width) {
      // Prefer breaking on last space within width
      let idx = line.lastIndexOf(' ', width)
      if (idx <= 0) idx = width
      lines.push(line.slice(0, idx).trimEnd())
      line = line.slice(idx).trimStart()
    }
    lines.push(line)
  }
  return lines.join('\n')
}

export function makeWidthRuler(width: number): string {
  const w = Math.max(16, Math.min(96, width || 48))
  const tens = Array.from({ length: Math.ceil(w / 10) }, (_, i) =>
    String((i + 1) * 10).padStart(10, '-'),
  ).join('')
  const ones = Array.from({ length: w }, (_, i) => String((i + 1) % 10)).join(
    '',
  )
  return [`WIDTH TEST (w=${w})`, tens.slice(0, w), ones.slice(0, w)].join('\n')
}
