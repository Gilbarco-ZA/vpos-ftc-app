import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('clipboard copy attempts synchronous copy before asynchronous permissions', () => {
  const clipboard = read('src/shared/utils/clipboard.ts')
  assert.match(clipboard, /document\.execCommand\('copy'\)/)
  assert.match(clipboard, /navigator\.clipboard\.writeText\(text\)/)
  assert.ok(
    clipboard.indexOf("document.execCommand('copy')") <
      clipboard.indexOf('navigator.clipboard.writeText(text)'),
  )
  assert.match(clipboard, /textarea\.remove\(\)/)
  assert.match(clipboard, /focused\?\.isConnected/)
})

test('support bundle is still available if copying is blocked', () => {
  const dialog = read('components/transactions/SupportBundleFallbackDialog.tsx')
  for (const path of [
    'components/transactions/NonFiscalizedTransactionsPageClient.tsx',
    'components/transactions/FiscalizedTransactionsPageClient.tsx',
  ]) {
    const page = read(path)
    assert.match(page, /setBlockedSupportBundle\(\{ transactionId: transaction\.id, text: bundle \}\)/)
    assert.match(page, /<SupportBundleFallbackDialog/)
    assert.match(page, /Copied support bundle/)
  }
  assert.match(dialog, /readOnly/)
  assert.match(dialog, /Select all/)
  assert.match(dialog, /Try copying again/)
  assert.match(dialog, /Download \.txt/)
  assert.match(dialog, /text\/plain;charset=utf-8/)
  assert.match(dialog, /URL\.revokeObjectURL/)
})
