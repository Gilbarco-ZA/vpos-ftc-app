'use client'

/**
 * Copy while the initiating click/key event is still active. In particular,
 * dropdown menus may remove their focused item immediately after selection,
 * which makes a delayed legacy fallback unreliable.
 */
export async function safeCopy(text: string): Promise<boolean> {
  if (!text || typeof document === 'undefined') return false

  try {
    if (typeof document.execCommand === 'function' && document.body) {
      const focused = document.activeElement as HTMLElement | null
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.readOnly = true
      textarea.style.position = 'fixed'
      textarea.style.top = '0'
      textarea.style.left = '0'
      textarea.style.opacity = '0'
      textarea.style.pointerEvents = 'none'
      document.body.appendChild(textarea)

      try {
        textarea.focus({ preventScroll: true })
        textarea.select()
        if (document.execCommand('copy')) return true
      } finally {
        textarea.remove()
        if (focused?.isConnected) focused.focus({ preventScroll: true })
      }
    }
  } catch {
    // The browser may disable legacy copying. Try the modern API instead.
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Clipboard access may be blocked on non-secure origins or by permissions.
  }
  return false
}
