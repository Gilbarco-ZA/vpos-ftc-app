import type { ReactNode } from 'react'

import { ensureBootstrapReady } from '@/src/platform/bootstrap/runtime'

import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

export const metadata = {
  title: 'VPOS FTC APP',
  description: 'VPOS Offline-first TIN capture and fiscalization',
}

const RootLayout = async ({ children }: { children: ReactNode }) => {
  // Ensure DB migrations + bootstrap defaults are applied as early as possible
  await ensureBootstrapReady()

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}

export default RootLayout
