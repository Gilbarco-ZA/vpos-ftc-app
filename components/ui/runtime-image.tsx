import type { ComponentPropsWithoutRef } from 'react'

type RuntimeImageProps = Omit<ComponentPropsWithoutRef<'img'>, 'alt'> & {
  alt: string
}

/**
 * Preserves native image behavior for runtime, blob, data, and print-only
 * sources that cannot safely use Next.js image optimization.
 */
export const RuntimeImage = ({ alt, ...props }: RuntimeImageProps) => (
  // eslint-disable-next-line @next/next/no-img-element -- These sources are runtime-defined or used in printable receipts.
  <img alt={alt} {...props} />
)
