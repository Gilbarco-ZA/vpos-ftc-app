import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync('components/ui/alert.tsx', 'utf8')

test('shared alerts are dismissible by default and expose an accessible close control', () => {
  assert.match(source, /dismissible = true/)
  assert.match(source, /aria-label="Dismiss alert"/)
  assert.match(source, /setDismissedKey\(alertKey\)/)
  assert.match(source, /onDismiss\?\.\(\)/)
})
