import type { ReactNode } from 'react'

import { ensureBootstrapReady } from '@/src/platform/bootstrap/runtime'
import { getDefaultLanguage } from '@/src/shared/server/i18n/languages'

import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

export const metadata = {
  title: 'VPOS FTC APP',
  description: 'VPOS Offline-first TIN capture and fiscalization',
}

const FALLBACK_LANGUAGE = {
  code: 'en',
  direction: 'ltr' as const,
}

const RootLayout = async ({ children }: { children: ReactNode }) => {
  // Ensure DB migrations + bootstrap defaults are applied as early as possible
  await ensureBootstrapReady()

  // During `next build`, first-boot intentionally skips migrations, so avoid
  // querying migration-created i18n tables while prerendering pages.
  const defaultLanguage =
    process.env.NEXT_PHASE === 'phase-production-build'
      ? FALLBACK_LANGUAGE
      : ((await getDefaultLanguage()) ?? FALLBACK_LANGUAGE)

  return (
    <html
      lang={defaultLanguage.code || FALLBACK_LANGUAGE.code}
      dir={defaultLanguage.direction || FALLBACK_LANGUAGE.direction}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}

export default RootLayout
