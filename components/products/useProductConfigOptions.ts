import { useEffect, useState } from 'react'

import type { ConfigOption } from './products.types'

type ProductConfigOptionsState = {
  configLoading: boolean
  configError: string | null
  productClassOptions: ConfigOption[]
  productTypeOptions: ConfigOption[]
  packSizeOptions: ConfigOption[]
  unitOptions: ConfigOption[]
  categoryOptions: ConfigOption[]
}

export const useProductConfigOptions = (): ProductConfigOptionsState => {
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [productClassOptions, setProductClassOptions] = useState<
    ConfigOption[]
  >([])
  const [productTypeOptions, setProductTypeOptions] = useState<ConfigOption[]>(
    [],
  )
  const [packSizeOptions, setPackSizeOptions] = useState<ConfigOption[]>([])
  const [unitOptions, setUnitOptions] = useState<ConfigOption[]>([])
  const [categoryOptions, setCategoryOptions] = useState<ConfigOption[]>([])

  useEffect(() => {
    let isMounted = true

    const loadConfig = async () => {
      try {
        setConfigLoading(true)
        setConfigError(null)
        const [classRes, typeRes, packRes, unitRes, categoryRes] =
          await Promise.all([
            fetch('/api/config/product-class-codes'),
            fetch('/api/config/product-type-codes'),
            fetch('/api/config/pack-sizes'),
            fetch('/api/config/units-of-measure'),
            fetch('/api/product-categories?includeInactive=true'),
          ])

        const parseRes = async (res: Response) => {
          if (!res.ok) return [] as ConfigOption[]
          const body = await res.json().catch(() => ({}))
          return Array.isArray(body?.data) ? (body.data as ConfigOption[]) : []
        }

        const [classData, typeData, packData, unitData, categoryData] =
          await Promise.all([
            parseRes(classRes),
            parseRes(typeRes),
            parseRes(packRes),
            parseRes(unitRes),
            parseRes(categoryRes),
          ])

        if (!isMounted) return
        setProductClassOptions(classData)
        setProductTypeOptions(typeData)
        setPackSizeOptions(packData)
        setUnitOptions(unitData)
        setCategoryOptions(categoryData)
      } catch (err: any) {
        if (!isMounted) return
        setConfigError(err?.message ?? 'Failed to load configuration options')
      } finally {
        if (isMounted) setConfigLoading(false)
      }
    }

    loadConfig()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const refreshCategories = async () => {
      try {
        const response = await fetch(
          '/api/product-categories?includeInactive=true',
          { cache: 'no-store' },
        )
        if (!response.ok) return
        const body = await response.json().catch(() => ({}))
        if (active && Array.isArray(body?.data)) {
          setCategoryOptions(body.data as ConfigOption[])
        }
      } catch {
        // Keep the last known category list when the background refresh fails.
      }
    }

    window.addEventListener('focus', refreshCategories)
    return () => {
      active = false
      window.removeEventListener('focus', refreshCategories)
    }
  }, [])

  return {
    configLoading,
    configError,
    productClassOptions,
    productTypeOptions,
    packSizeOptions,
    unitOptions,
    categoryOptions,
  }
}
