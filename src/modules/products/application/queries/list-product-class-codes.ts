import { listProductClassCodesService } from '@/src/modules/products/application/services/product-service'

export async function listProductClassCodes(args: { country?: string | null }) {
  return await listProductClassCodesService(args)
}
