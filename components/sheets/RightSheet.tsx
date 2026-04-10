import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export function RightSheet({
  open,
  onClose,
  title,
  children,
  contentClassName,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className={contentClassName}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
