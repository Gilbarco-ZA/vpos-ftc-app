import type { ZodTypeAny } from 'zod'

import { AppError } from '@/src/shared/errors/AppError'

import { readBody, toBool, toFloat, toInt } from './request'

export { readBody, toBool, toFloat, toInt }

export async function parseBody<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<import('zod').infer<TSchema>> {
  const body = await readBody(request)
  return parseInput(body, schema)
}

export function parseInput<TSchema extends ZodTypeAny>(
  input: unknown,
  schema: TSchema,
): import('zod').infer<TSchema> {
  const result = schema.safeParse(input)

  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Invalid request payload',
      400,
      result.error.flatten(),
    )
  }

  return result.data
}

export function safeParseInput<TSchema extends ZodTypeAny>(
  input: unknown,
  schema: TSchema,
) {
  return schema.safeParse(input)
}
