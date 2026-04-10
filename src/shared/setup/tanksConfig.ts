import { KV_KEYS } from '@/src/shared/setup/keys'

export { KV_KEYS }

export type TankConfig = {
  grades: string[]
  gradeLimits?: Array<number | null>
  tanks: string[]
  activeTanks: boolean[]
  tankLevels?: Array<number | null>
}

export const defaultTankConfig: TankConfig = {
  grades: [],
  gradeLimits: [],
  tanks: [],
  activeTanks: [],
  tankLevels: [],
}

const ensureArray = <T>(value: unknown, fallback: T[] = []) =>
  Array.isArray(value) ? (value as T[]) : fallback

export const normalizeTankConfig = (input: Partial<TankConfig>): TankConfig => {
  const grades = ensureArray<string>(input.grades).map((g) => String(g ?? ''))
  const gradeLimits = ensureArray<number | null>(input.gradeLimits)
    .map((v) => (v === null || v === undefined ? null : Number(v)))
    .map((v) => (Number.isFinite(v as number) ? (v as number) : null))
  const tanks = ensureArray<string>(input.tanks).map((t) => String(t ?? ''))
  const activeTanks = ensureArray<boolean>(input.activeTanks).map((v) => !!v)
  const tankLevels = ensureArray<number | null>(input.tankLevels)
    .map((v) => (v === null || v === undefined ? null : Number(v)))
    .map((v) => (Number.isFinite(v as number) ? (v as number) : null))

  while (activeTanks.length < tanks.length) activeTanks.push(false)
  if (activeTanks.length > tanks.length) activeTanks.splice(tanks.length)

  while (tankLevels.length < tanks.length) tankLevels.push(null)
  if (tankLevels.length > tanks.length) tankLevels.splice(tanks.length)

  while (gradeLimits.length < grades.length) gradeLimits.push(null)
  if (gradeLimits.length > grades.length) gradeLimits.splice(grades.length)

  const seen = new Set<string>()
  tanks.forEach((grade, index) => {
    const normalized = String(grade ?? '').trim()
    if (!normalized || !activeTanks[index]) return
    if (seen.has(normalized)) {
      activeTanks[index] = false
      return
    }
    seen.add(normalized)
  })

  return { grades, gradeLimits, tanks, activeTanks, tankLevels }
}

export const sanitizeTankConfigForSave = (
  input: Partial<TankConfig>,
): TankConfig => {
  const normalized = normalizeTankConfig(input)
  const grades = normalized.grades
    .map((g) => String(g ?? '').trim())
    .filter((g) => g.length > 0)
  const tanks = normalized.tanks.map((t) => String(t ?? '').trim())
  const gradeLimits = normalized.gradeLimits?.map((v) =>
    v === null || v === undefined ? null : Number(v),
  )
  const tankLevels = normalized.tankLevels?.map((v) =>
    v === null || v === undefined ? null : Number(v),
  )
  return normalizeTankConfig({
    ...normalized,
    grades,
    tanks,
    gradeLimits,
    tankLevels,
  })
}

const buildTotalsByGrade = (config: TankConfig) => {
  const totals: Record<string, number> = {}
  config.tanks.forEach((grade, index) => {
    const key = String(grade ?? '').trim()
    if (!key) return
    const level = config.tankLevels?.[index]
    const volume = level === null || level === undefined ? 0 : Number(level)
    if (!Number.isFinite(volume)) return
    totals[key] = (totals[key] ?? 0) + volume
  })
  return totals
}

export const validateTankCloudLimits = (config: TankConfig) => {
  const totals = buildTotalsByGrade(config)
  const errors: string[] = []
  config.grades.forEach((grade, index) => {
    const key = String(grade ?? '').trim()
    if (!key) return
    const limit = config.gradeLimits?.[index]
    if (limit === null || limit === undefined) return
    if (!Number.isFinite(limit)) return
    const total = totals[key] ?? 0
    if (total > limit) {
      errors.push(
        `Virtual tank ${key} total ${total} exceeds cloud availability ${limit}`,
      )
    }
  })
  return errors
}

export type TankFormState = {
  grade: string
  tank: string
  active: boolean
  level: string
  limit: string
}

export const emptyTankForm = (): TankFormState => ({
  grade: '',
  tank: '',
  active: false,
  level: '',
  limit: '',
})

export const normalizeTankForm = (
  input: Partial<TankFormState>,
): TankFormState => ({
  grade: String(input.grade ?? '').trim(),
  tank: String(input.tank ?? '').trim(),
  active: Boolean(input.active),
  level: String(input.level ?? '').trim(),
  limit: String(input.limit ?? '').trim(),
})

export const buildTankPayload = (form: Partial<TankFormState>) => {
  const normalized = normalizeTankForm(form)
  return {
    grade: normalized.grade,
    tank: normalized.tank,
    active: normalized.active,
    level: normalized.level === '' ? null : Number(normalized.level),
    limit: normalized.limit === '' ? null : Number(normalized.limit),
  }
}

export const parseTankConfig = (value: unknown) => value
