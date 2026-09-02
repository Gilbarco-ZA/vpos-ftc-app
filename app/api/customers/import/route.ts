import { fail } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async () =>
    fail(
      'Cloud customer import has been retired. Create or select the customer in the station database.',
      410,
    ),
})
