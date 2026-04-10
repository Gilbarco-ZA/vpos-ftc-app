import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export const TERMINAL_ALLOWLIST: Record<string, string[]> = {
  'service-status': ['systemctl', 'status', 'vpos'],
  'journalctl-vpos': ['journalctl', '-u', 'vpos', '-n', '200', '--no-pager'],
}

export function getTerminalAllowlistCommand(command: string): string[] | null {
  const normalized = requireNonEmptyString(command, 'command')
  return TERMINAL_ALLOWLIST[normalized] ?? null
}
