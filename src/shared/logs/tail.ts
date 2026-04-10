/**
 * Efficient-ish tail for in-DB log blobs.
 * Avoids splitting huge strings into arrays when possible.
 */
export function tailLines(content: string, lines: number): string {
  const n = Math.max(1, Math.min(5000, Math.floor(lines || 200)))
  if (!content) return ''

  if (content.length < 200_000) {
    const parts = content.split('\n')
    return parts.slice(Math.max(0, parts.length - n)).join('\n')
  }

  let i = content.length - 1
  let found = 0
  while (i >= 0) {
    if (content.charCodeAt(i) === 10) {
      found++
      if (found >= n) {
        return content.slice(i + 1)
      }
    }
    i--
  }
  return content
}
