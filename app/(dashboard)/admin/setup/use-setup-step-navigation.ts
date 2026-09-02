import { useEffect, useMemo, useState } from 'react'

type SetupCurrent = {
  siteProfile: any | null
  tanks: any | null
  setupStep?: string | null
  products: { count: number }
  printer: { configured: boolean; configs?: any[] }
  pumps: { config: any | null; liveState: any }
}

export const setupSteps = [
  { key: 'site', label: 'Site' },
  { key: 'tanks', label: 'Tanks' },
  { key: 'products', label: 'Products' },
  { key: 'pumps', label: 'Pumps' },
  { key: 'printer', label: 'Printer' },
  { key: 'finalized', label: 'Finalized' },
] as const

export function useSetupStepNavigation({
  current,
  pumpAgeMs,
}: {
  current: SetupCurrent | null
  pumpAgeMs: number | null
}) {
  const stepIndex = useMemo(() => {
    const k = current?.setupStep || ''
    const idx = setupSteps.findIndex((s) => s.key === k)
    return idx >= 0 ? idx : -1
  }, [current?.setupStep])

  const [activeStep, setActiveStep] = useState(() =>
    stepIndex >= 0 ? stepIndex : 0,
  )

  useEffect(() => {
    if (stepIndex >= 0) {
      queueMicrotask(() => setActiveStep(stepIndex))
    }
  }, [stepIndex])

  const stepReadiness = useMemo(() => {
    if (!current) {
      return {
        site: false,
        tanks: false,
        products: false,
        pumps: false,
        printer: false,
        finalized: false,
        pumpFeedFresh: false,
      }
    }

    const tanksReady =
      Array.isArray((current as any)?.tanks?.grades) &&
      ((current as any).tanks.grades?.length ?? 0) > 0 &&
      Array.isArray((current as any)?.tanks?.activeTanks) &&
      (current as any).tanks.activeTanks.some((v: any) => !!v)

    const productsReady = (current.products?.count ?? 0) > 0
    const pumpsReady = Boolean(current.pumps?.config)
    const printerReady = Boolean(current.printer?.configured)
    const siteReady = Boolean(current.siteProfile)

    const pumpFeedFresh = typeof pumpAgeMs === 'number' && pumpAgeMs < 60_000

    return {
      site: siteReady,
      tanks: tanksReady,
      products: productsReady,
      pumps: pumpsReady,
      printer: printerReady,
      finalized: current.setupStep === 'finalized',
      pumpFeedFresh,
    }
  }, [current, pumpAgeMs])

  const maxUnlockedStepIndex = useMemo(() => {
    let idx = 0
    if (stepReadiness.site) idx = 1
    if (stepReadiness.tanks) idx = 2
    if (stepReadiness.products) idx = 3
    if (stepReadiness.pumps) idx = 4
    if (stepReadiness.printer) idx = 5
    if (stepReadiness.finalized) idx = setupSteps.length - 1
    return idx
  }, [stepReadiness])

  const activeStepKey = setupSteps[activeStep]?.key

  const canGoNextFromStep = useMemo(() => {
    switch (activeStepKey) {
      case 'site':
        return stepReadiness.site
      case 'tanks':
        return stepReadiness.tanks
      case 'products':
        return stepReadiness.products
      case 'pumps':
        return stepReadiness.pumps
      case 'printer':
        return stepReadiness.printer
      default:
        return false
    }
  }, [activeStepKey, stepReadiness])

  const shouldShowZeroStepsOpen = useMemo(() => {
    if (!current) return true
    return (
      !stepReadiness.tanks || !stepReadiness.products || !stepReadiness.pumps
    )
  }, [
    current,
    stepReadiness.tanks,
    stepReadiness.products,
    stepReadiness.pumps,
  ])

  const goToStep = (index: number) => {
    if (index < 0 || index >= setupSteps.length) return
    if (index > maxUnlockedStepIndex) return
    setActiveStep(index)
  }

  const handleNext = () => {
    if (!canGoNextFromStep) return
    setActiveStep((prev) =>
      Math.min(prev + 1, maxUnlockedStepIndex, setupSteps.length - 1),
    )
  }

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0))
  }

  return {
    stepReadiness,
    maxUnlockedStepIndex,
    activeStep,
    activeStepKey,
    canGoNextFromStep,
    shouldShowZeroStepsOpen,
    goToStep,
    handleNext,
    handleBack,
  }
}
