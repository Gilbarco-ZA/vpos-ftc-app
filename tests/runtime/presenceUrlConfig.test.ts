import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  DEFAULT_PRESENCE_URL,
  readPresenceUrl,
  validatePresenceUrl,
  writePresenceUrl,
} from '@/src/platform/runtime/presence-url'

test('presence URL accepts HTTP and HTTPS', () => {
  assert.equal(
    validatePresenceUrl('https://example.com/hubs/vpos-presence'),
    'https://example.com/hubs/vpos-presence',
  )
  assert.equal(
    validatePresenceUrl('http://example.com/hubs/vpos-presence'),
    'http://example.com/hubs/vpos-presence',
  )
  assert.throws(
    () => validatePresenceUrl('ftp://example.com/hubs/vpos-presence'),
    /HTTP or HTTPS/,
  )
  assert.throws(() => validatePresenceUrl('not-a-url'), /valid absolute URL/)
})

test('presence URL is persisted in the shared file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vpos-presence-'))
  const filePath = join(dir, 'presence-url')
  const previous = process.env.VPOS_PRESENCE_URL_FILE
  process.env.VPOS_PRESENCE_URL_FILE = filePath

  try {
    const expected = 'https://presence.example/hubs/vpos-presence'
    assert.equal(await writePresenceUrl(expected), expected)
    assert.equal(await readPresenceUrl(), expected)
    assert.equal((await readFile(filePath, 'utf8')).trim(), expected)

    assert.equal(await writePresenceUrl(''), '')
    assert.equal(await readPresenceUrl(), DEFAULT_PRESENCE_URL)
  } finally {
    if (previous === undefined) delete process.env.VPOS_PRESENCE_URL_FILE
    else process.env.VPOS_PRESENCE_URL_FILE = previous
    await rm(dir, { recursive: true, force: true })
  }
})
