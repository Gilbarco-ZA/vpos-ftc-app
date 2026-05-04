import { NextResponse } from "next/server";

export function legacyJson<T>(payload: T, init?: ResponseInit) {
  return NextResponse.json(payload as any, init)
}

export function legacyPosAck(action: string) {
  return legacyJson({ message: `Pos ${action} message received` })
}

export function legacyDomsSuccess<T>(data: T, message = '') {
  return legacyJson({ success: true, message, data })
}

export function legacyDomsFailure(error: any, message?: string, status = 200) {
  const msg =
    message ??
    (typeof error === 'string'
      ? error
      : ((error?.message as string) ?? 'Request failed'))
  return legacyJson({ success: false, message: msg, error }, { status })
}
