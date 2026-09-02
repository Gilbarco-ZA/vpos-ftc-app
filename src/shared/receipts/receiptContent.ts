export const RECEIPT_RENDER_VERSION = 1 as const

export type ReceiptRenderVersion = typeof RECEIPT_RENDER_VERSION

export type ResolvedReceiptContent = {
  plainTextContent: string | null
  htmlContent: string | null
  renderVersion: number
  htmlSource: 'stored' | 'generated' | 'none'
}

const asContentString = (value: unknown): string | null => {
  const content = String(value ?? '')
  return content.trim().length ? content : null
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function htmlToPlainText(html: unknown): string {
  const value = asContentString(html)
  if (!value) return ''

  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function renderReceiptHtmlFromPlainText(
  plainTextContent: unknown,
  renderVersion: number = RECEIPT_RENDER_VERSION,
): string {
  const text = String(plainTextContent ?? '')

  if (renderVersion !== RECEIPT_RENDER_VERSION) {
    throw new Error(`Unsupported receipt render version: ${renderVersion}`)
  }

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Receipt</title></head>
<body>
<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px; line-height:1.4;">${escapeHtml(text)}</pre>
</body>
</html>`
}

export function resolveReceiptContent(input: {
  plainTextContent?: unknown
  htmlContent?: unknown
  renderVersion?: unknown
}): ResolvedReceiptContent {
  const storedHtml = asContentString(input.htmlContent)
  const storedText = asContentString(input.plainTextContent)
  const parsedVersion = Number(input.renderVersion)
  const renderVersion =
    Number.isInteger(parsedVersion) && parsedVersion > 0
      ? parsedVersion
      : RECEIPT_RENDER_VERSION

  if (storedHtml) {
    return {
      plainTextContent: storedText ?? (htmlToPlainText(storedHtml) || null),
      htmlContent: storedHtml,
      renderVersion,
      htmlSource: 'stored',
    }
  }

  if (storedText) {
    return {
      plainTextContent: storedText,
      htmlContent: renderReceiptHtmlFromPlainText(storedText, renderVersion),
      renderVersion,
      htmlSource: 'generated',
    }
  }

  return {
    plainTextContent: null,
    htmlContent: null,
    renderVersion,
    htmlSource: 'none',
  }
}

export function resolveReceiptRowContent<
  T extends {
    plain_text_content?: unknown
    html_content?: unknown
    render_version?: unknown
  },
>(
  row: T,
): T & {
  plain_text_content: string | null
  html_content: string | null
  render_version: number
} {
  const resolved = resolveReceiptContent({
    plainTextContent: row.plain_text_content,
    htmlContent: row.html_content,
    renderVersion: row.render_version,
  })

  return {
    ...row,
    plain_text_content: resolved.plainTextContent,
    html_content: resolved.htmlContent,
    render_version: resolved.renderVersion,
  }
}
