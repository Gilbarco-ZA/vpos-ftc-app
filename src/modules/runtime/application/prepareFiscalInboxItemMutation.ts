import type {
  RuntimeFiscalInboxAction,
  RuntimeFiscalInboxMutationInput,
} from '@/src/modules/runtime/application/runtimeFiscalInboxTypes'

import { fiscalInboxActions } from '@/src/modules/runtime/application/runtimeFiscalInboxTypes'

export function parseFiscalInboxItemId(rawId: unknown) {
  const id = Number(rawId)
  if (!Number.isFinite(id) || id <= 0) return null
  return Math.trunc(id)
}

export function prepareFiscalInboxItemMutation(
  body: any,
):
  | { ok: true; value: RuntimeFiscalInboxMutationInput }
  | { ok: false; error: string } {
  const action = String(
    body?.action ?? '',
  ).toUpperCase() as RuntimeFiscalInboxAction
  if (!fiscalInboxActions.includes(action)) {
    return {
      ok: false,
      error:
        'Invalid action. Allowed: REQUEUE, CLONE_REQUEUE, MARK_DEAD, MARK_FAILED, MARK_PROCESSED, DELETE',
    }
  }

  let messageJson = body?.messageJson
  if (messageJson != null && typeof messageJson === 'string') {
    try {
      messageJson = JSON.parse(messageJson)
    } catch {
      return { ok: false, error: 'Invalid messageJson: not valid JSON' }
    }
  } else if (messageJson != null && typeof messageJson !== 'object') {
    return {
      ok: false,
      error: 'Invalid messageJson: expected object or JSON string',
    }
  }

  return {
    ok: true,
    value: {
      action,
      errorText: body?.errorText ? String(body.errorText) : null,
      requestId: body?.requestId != null ? String(body.requestId) : null,
      messageJson,
    },
  }
}
