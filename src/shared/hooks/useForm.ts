'use client'

import type { Dispatch, SetStateAction } from 'react'
import type { ZodError, ZodType } from 'zod'
import { useCallback, useState } from 'react'

export type UseFormOptions<TForm extends Record<string, any>> = {
  /** Initial form values. */
  initial: TForm
  /** Optional Zod schema for validation. When omitted, `validate` always passes. */
  schema?: ZodType<any>
  /**
   * Submit handler. Receives the validated form data and the CSRF token.
   * Return `true` (or void) on success, or throw / return `false` to indicate failure.
   */
  onSubmit: (data: TForm, csrfToken: string) => Promise<void | boolean>
}

export type UseFormReturn<TForm extends Record<string, any>> = {
  form: TForm
  /** Replace a single field value. */
  setField: <K extends keyof TForm>(key: K, value: TForm[K]) => void
  /** Replace the entire form state (e.g. when switching edit target). */
  setForm: Dispatch<SetStateAction<TForm>>
  /** Per-field error messages produced by Zod validation. */
  fieldErrors: Partial<Record<keyof TForm, string>>
  /** General (non-field) submission error. */
  error: unknown
  /** Whether a submission is in flight. */
  isSubmitting: boolean
  /** CSRF token state — pass to CsrfBootstrap's `onToken`. */
  csrfToken: string
  setCsrfToken: (token: string) => void
  /** Trigger validation + submission. */
  handleSubmit: () => Promise<void>
  /** Clear all errors and reset the form to `initial`. */
  reset: (nextInitial?: TForm) => void
}

/**
 * Shared form hook that standardizes field state, Zod validation,
 * CSRF token injection, and submit guards.
 */
export function useForm<TForm extends Record<string, any>>(
  options: UseFormOptions<TForm>,
): UseFormReturn<TForm> {
  const { initial, schema, onSubmit } = options

  const [form, setForm] = useState<TForm>(initial)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof TForm, string>>
  >({})
  const [error, setError] = useState<unknown>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')

  const setField = useCallback(
    <K extends keyof TForm>(key: K, value: TForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const reset = useCallback(
    (nextInitial?: TForm) => {
      setForm(nextInitial ?? initial)
      setFieldErrors({})
      setError(null)
      setIsSubmitting(false)
    },
    [initial],
  )

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return

    if (schema) {
      const result = schema.safeParse(form)
      if (!result.success) {
        const zodError = result.error as ZodError
        const next: Partial<Record<keyof TForm, string>> = {}
        for (const issue of zodError.issues) {
          const key = issue.path[0] as keyof TForm
          if (key && !next[key]) {
            next[key] = issue.message
          }
        }
        setFieldErrors(next)
        return
      }
    }

    setFieldErrors({})
    setError(null)
    setIsSubmitting(true)

    try {
      const result = await onSubmit(form, csrfToken)
      if (result === false) {
        return
      }
    } catch (error) {
      setError(error)
    } finally {
      setIsSubmitting(false)
    }
  }, [csrfToken, form, isSubmitting, onSubmit, schema])

  return {
    form,
    setField,
    setForm,
    fieldErrors,
    error,
    isSubmitting,
    csrfToken,
    setCsrfToken,
    handleSubmit,
    reset,
  }
}
