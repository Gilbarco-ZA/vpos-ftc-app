import type { LucideIcon } from 'lucide-react'
import {
  Apple,
  BatteryCharging,
  Beer,
  Boxes,
  Candy,
  Car,
  Coffee,
  Droplets,
  Fuel,
  Gift,
  Package,
  Pizza,
  ReceiptText,
  Sandwich,
  ScanBarcode,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Store,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from 'lucide-react'

import { cx } from '@/src/shared/utils/cx'

export type CategoryIconOption = {
  value: string
  label: string
  Icon: LucideIcon
  keywords?: string
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  {
    value: 'Store',
    label: 'Store',
    Icon: Store,
    keywords: 'general retail shop storefront',
  },
  {
    value: 'ShoppingBasket',
    label: 'Shopping basket',
    Icon: ShoppingBasket,
    keywords: 'groceries basket convenience',
  },
  {
    value: 'ShoppingCart',
    label: 'Shopping cart',
    Icon: ShoppingCart,
    keywords: 'cart checkout market',
  },
  {
    value: 'Package',
    label: 'Package',
    Icon: Package,
    keywords: 'boxed goods stock inventory',
  },
  {
    value: 'Boxes',
    label: 'Boxes',
    Icon: Boxes,
    keywords: 'warehouse stock storage cartons',
  },
  {
    value: 'ReceiptText',
    label: 'Receipt',
    Icon: ReceiptText,
    keywords: 'bill slip receipt checkout invoice',
  },
  {
    value: 'Fuel',
    label: 'Fuel',
    Icon: Fuel,
    keywords: 'petrol diesel forecourt pump',
  },
  {
    value: 'Droplets',
    label: 'Liquids',
    Icon: Droplets,
    keywords: 'water liquids oils fluids',
  },
  {
    value: 'Coffee',
    label: 'Coffee',
    Icon: Coffee,
    keywords: 'coffee cafe hot drinks beverage',
  },
  {
    value: 'Beer',
    label: 'Beverage',
    Icon: Beer,
    keywords: 'beer drink beverage cooler',
  },
  {
    value: 'Candy',
    label: 'Snacks',
    Icon: Candy,
    keywords: 'snacks sweets candy confectionery',
  },
  {
    value: 'Sandwich',
    label: 'Grab-and-go food',
    Icon: Sandwich,
    keywords: 'sandwich meals takeaway prepared food',
  },
  {
    value: 'Pizza',
    label: 'Hot food',
    Icon: Pizza,
    keywords: 'pizza food hot kitchen takeaway',
  },
  {
    value: 'UtensilsCrossed',
    label: 'Restaurant',
    Icon: UtensilsCrossed,
    keywords: 'restaurant dining meal utensils',
  },
  {
    value: 'Apple',
    label: 'Fresh food',
    Icon: Apple,
    keywords: 'apple produce fresh fruit grocery',
  },
  {
    value: 'ScanBarcode',
    label: 'Barcode',
    Icon: ScanBarcode,
    keywords: 'barcode scanner packaged item sku',
  },
  {
    value: 'Car',
    label: 'Automotive',
    Icon: Car,
    keywords: 'car vehicle auto accessories',
  },
  {
    value: 'Wrench',
    label: 'Parts & service',
    Icon: Wrench,
    keywords: 'tools hardware maintenance service',
  },
  {
    value: 'Wallet',
    label: 'Payments',
    Icon: Wallet,
    keywords: 'wallet money finance payment',
  },
  {
    value: 'Gift',
    label: 'Gifts',
    Icon: Gift,
    keywords: 'gift seasonal promo present',
  },
  {
    value: 'Shirt',
    label: 'Apparel',
    Icon: Shirt,
    keywords: 'clothing apparel fashion wear',
  },
  {
    value: 'Smartphone',
    label: 'Electronics',
    Icon: Smartphone,
    keywords: 'electronics phone devices accessories',
  },
  {
    value: 'BatteryCharging',
    label: 'Power',
    Icon: BatteryCharging,
    keywords: 'battery charging power electrical',
  },
]

const CATEGORY_ICON_MAP = new Map(
  CATEGORY_ICON_OPTIONS.map((option) => [option.value, option]),
)

export const getCategoryIconOption = (icon?: string | null) => {
  if (!icon) return null
  return CATEGORY_ICON_MAP.get(String(icon).trim()) ?? null
}

export const getCategoryIconLabel = (icon?: string | null) =>
  getCategoryIconOption(icon)?.label ?? String(icon || '').trim()

export function CategoryIconGlyph({
  icon,
  className,
  fallback = 'Package',
}: {
  icon?: string | null
  className?: string
  fallback?: string
}) {
  const selected = getCategoryIconOption(icon)
  const fallbackIcon =
    getCategoryIconOption(fallback) ?? CATEGORY_ICON_OPTIONS[0]

  if (selected) {
    const Icon = selected.Icon
    return <Icon className={className} aria-hidden="true" />
  }

  if (icon && String(icon).trim()) {
    return <span className={className}>{icon}</span>
  }

  const Icon = fallbackIcon.Icon
  return <Icon className={className} aria-hidden="true" />
}

export function CategoryIconChip({
  icon,
  label,
  className,
}: {
  icon?: string | null
  label: string
  className?: string
}) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <span className="inline-flex h-4 w-4 items-center justify-center">
        <CategoryIconGlyph icon={icon} className="h-4 w-4" />
      </span>
    </span>
  )
}
