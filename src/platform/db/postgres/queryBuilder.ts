/**
 * Accumulates conditions and parameters for a parameterised `WHERE` clause.
 *
 * Use `$#` in condition strings as a placeholder — it will be replaced
 * with the next positional `$N` parameter index automatically.
 */
export type WhereBuilder = {
  readonly conditions: readonly string[]
  readonly params: unknown[]
  readonly nextIndex: number
  add(condition: string, ...values: unknown[]): WhereBuilder
  addIf(value: unknown, condition: string, ...values: unknown[]): WhereBuilder
  toWhere(): string
  toConditions(): string
}

export function createWhereBuilder(startIndex = 1): WhereBuilder {
  const conditions: string[] = []
  const params: unknown[] = []
  let idx = startIndex

  const builder: WhereBuilder = {
    get conditions() {
      return conditions
    },
    get params() {
      return params
    },
    get nextIndex() {
      return idx
    },

    add(condition: string, ...values: unknown[]) {
      let resolved = condition
      for (const value of values) {
        resolved = resolved.replace('$#', `$${idx++}`)
        params.push(value)
      }
      conditions.push(resolved)
      return builder
    },

    addIf(value: unknown, condition: string, ...values: unknown[]) {
      if (value != null && value !== '' && value !== false) {
        builder.add(condition, ...values)
      }
      return builder
    },

    toWhere() {
      if (conditions.length === 0) return ''
      return `WHERE ${conditions.join(' AND ')}`
    },

    toConditions() {
      return conditions.join(' AND ')
    },
  }

  return builder
}
