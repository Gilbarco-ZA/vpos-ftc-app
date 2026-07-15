import {
  mapRows,
  query,
  queryAll,
  withTransaction,
} from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type I18nLanguage = {
  id: string
  code: string
  name: string
  nativeName?: string | null
  direction: 'ltr' | 'rtl'
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export type UpsertLanguageInput = {
  code: string
  name: string
  nativeName?: string | null
  direction?: 'ltr' | 'rtl'
  isDefault?: boolean
  isActive?: boolean
  sortOrder?: number
}

const DEFAULT_LANGUAGES: UpsertLanguageInput[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    isDefault: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    direction: 'ltr',
    isDefault: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    isDefault: false,
    isActive: false,
    sortOrder: 3,
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    direction: 'ltr',
    isDefault: false,
    isActive: false,
    sortOrder: 4,
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    direction: 'rtl',
    isDefault: false,
    isActive: false,
    sortOrder: 5,
  },
]

const FALLBACK_DEFAULT_LANGUAGE: I18nLanguage = {
  id: 'default-en',
  code: 'en',
  name: 'English',
  nativeName: 'English',
  direction: 'ltr',
  isDefault: true,
  isActive: true,
  sortOrder: 1,
}

const isUndefinedTableError = (err: unknown) =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  (err as { code?: string }).code === '42P01'

let bootstrapPromise: Promise<void> | null = null

const normalizeCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()

const normalizeDirection = (value: unknown): 'ltr' | 'rtl' =>
  String(value || '').toLowerCase() === 'rtl' ? 'rtl' : 'ltr'

export const bootstrapDefaultLanguages = async () => {
  if (!bootstrapPromise) {
    bootstrapPromise = withTransaction(async (client) => {
      for (const language of DEFAULT_LANGUAGES) {
        const code = normalizeCode(language.code)
        if (!code) continue
        if (language.isDefault) {
          await client.query(
            `UPDATE i18n_languages SET is_default = FALSE WHERE is_default = TRUE AND code <> $1`,
            [code],
          )
        }
        await client.query(
          `INSERT INTO i18n_languages (id, code, name, native_name, direction, is_default, is_active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (code) DO UPDATE SET
             name = COALESCE(NULLIF(EXCLUDED.name, ''), i18n_languages.name),
             native_name = EXCLUDED.native_name,
             direction = EXCLUDED.direction,
             is_default = CASE WHEN EXCLUDED.is_default THEN TRUE ELSE i18n_languages.is_default END,
             is_active = CASE WHEN i18n_languages.code = 'en' THEN TRUE ELSE i18n_languages.is_active END,
             sort_order = LEAST(i18n_languages.sort_order, EXCLUDED.sort_order),
             updated_at = NOW()`,
          [
            uuidv4(),
            code,
            language.name.trim(),
            language.nativeName ?? null,
            normalizeDirection(language.direction),
            Boolean(language.isDefault),
            language.isActive ?? true,
            language.sortOrder ?? 0,
          ],
        )
      }
    })
  }

  try {
    return await bootstrapPromise
  } catch (err) {
    if (isUndefinedTableError(err)) bootstrapPromise = null
    throw err
  }
}

export const listLanguages = async (opts?: { activeOnly?: boolean }) => {
  try {
    await bootstrapDefaultLanguages()
    const where = opts?.activeOnly ? 'WHERE is_active = TRUE' : ''
    const rows = await queryAll<Record<string, unknown>>(
      `SELECT id, code, name, native_name, direction, is_default, is_active, sort_order, created_at, updated_at
       FROM i18n_languages
       ${where}
       ORDER BY sort_order ASC, name ASC`,
    )
    return mapRows<I18nLanguage>(rows)
  } catch (err) {
    if (isUndefinedTableError(err)) return [FALLBACK_DEFAULT_LANGUAGE]
    throw err
  }
}

export const getDefaultLanguage = async () => {
  try {
    await bootstrapDefaultLanguages()
    const rows = await queryAll<Record<string, unknown>>(
      `SELECT id, code, name, native_name, direction, is_default, is_active, sort_order, created_at, updated_at
       FROM i18n_languages
       WHERE is_default = TRUE
       LIMIT 1`,
    )
    return mapRows<I18nLanguage>(rows)[0] ?? FALLBACK_DEFAULT_LANGUAGE
  } catch (err) {
    if (isUndefinedTableError(err)) return FALLBACK_DEFAULT_LANGUAGE
    throw err
  }
}

export const upsertLanguage = async (input: UpsertLanguageInput) => {
  const code = normalizeCode(input.code)
  const name = String(input.name || '').trim()
  if (!code) throw new Error('Language code is required')
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(code)) {
    throw new Error(
      'Language code must be a valid BCP-47 style code, for example en or pt-BR',
    )
  }
  if (!name) throw new Error('Language name is required')

  await bootstrapDefaultLanguages()
  await withTransaction(async (client) => {
    if (input.isDefault) {
      await client.query(
        `UPDATE i18n_languages SET is_default = FALSE WHERE is_default = TRUE AND code <> $1`,
        [code],
      )
    }
    await client.query(
      `INSERT INTO i18n_languages (id, code, name, native_name, direction, is_default, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         native_name = EXCLUDED.native_name,
         direction = EXCLUDED.direction,
         is_default = EXCLUDED.is_default,
         is_active = EXCLUDED.is_active,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [
        uuidv4(),
        code,
        name,
        input.nativeName ?? null,
        normalizeDirection(input.direction),
        Boolean(input.isDefault),
        input.isActive ?? true,
        input.sortOrder ?? 0,
      ],
    )
    if (input.isDefault) {
      await client.query(
        `UPDATE i18n_languages SET is_active = TRUE WHERE code = $1`,
        [code],
      )
    }
  })

  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id, code, name, native_name, direction, is_default, is_active, sort_order, created_at, updated_at
     FROM i18n_languages
     WHERE code = $1`,
    [code],
  )
  return mapRows<I18nLanguage>(rows)[0] ?? null
}

export const setLanguageActive = async (
  codeInput: string,
  isActive: boolean,
) => {
  const code = normalizeCode(codeInput)
  if (!code) throw new Error('Language code is required')
  await bootstrapDefaultLanguages()

  if (!isActive) {
    const existing = await queryAll<{ is_default: boolean }>(
      `SELECT is_default FROM i18n_languages WHERE code = $1`,
      [code],
    )
    if (existing[0]?.is_default) {
      throw new Error('The default language cannot be disabled')
    }
  }

  await query(
    `UPDATE i18n_languages SET is_active = $2, updated_at = NOW() WHERE code = $1`,
    [code, isActive],
  )
  return await listLanguages()
}
