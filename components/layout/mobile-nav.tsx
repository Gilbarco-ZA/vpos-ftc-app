'use client'

import type { UserRole } from '@/src/shared/types'
import { useState } from 'react'
import { Menu } from 'lucide-react'

import { SidebarBranding, SidebarContent } from '@/components/layout/sidebar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export const MobileNav = ({
  role,
  branding,
}: {
  role: UserRole
  branding?: SidebarBranding
}) => {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="h-10 w-10 rounded-lg px-0 xl:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-full max-w-[85vw] border-r border-[var(--border-default)] p-0 text-[var(--text-primary)] sm:max-w-xs"
        style={{
          background: 'var(--surface-page)',
        }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>

        <SidebarContent
          role={role}
          branding={branding}
          collapsed={false}
          showCollapseToggle={false}
          onNavigate={() => setOpen(false)}
          className="flex h-full flex-col"
        />
      </SheetContent>
    </Sheet>
  )
}
