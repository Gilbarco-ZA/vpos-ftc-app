import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const freePort = async () => {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

test('FTC partner sandbox mirrors /api response formats without production connectivity', { timeout: 15000 }, async () => {
  const port = await freePort()
  const child = spawn(process.execPath, ['scripts/partner-api-sandbox.mjs'], {
    cwd: root, env: {...process.env, VPOS_PARTNER_SANDBOX_PORT: String(port), VPOS_PARTNER_SANDBOX_HOST: '127.0.0.1'},
    stdio: 'ignore'
  })
  const base = 'http://127.0.0.1:' + port
  const auth = {authorization:'Bearer sandbox-token'}
  const get = async path => fetch(base+path,{headers:auth})
  try {
    let live
    for (let i=0;i<100;i++){
      if (child.exitCode!==null) throw new Error('Sandbox exited early: '+child.exitCode)
      try {live=await fetch(base+'/api/livez');break} catch {await new Promise(resolve=>setTimeout(resolve,50))}
    }
    assert.equal(live?.status,200)
    assert.deepEqual(await live.json(),{ok:true,success:true,status:'running'})
    const customerRes=await get('/api/customers')
    assert.equal(customerRes.status,200)
    assert.equal((await customerRes.json()).data.rows[0].buyerName,'Sandbox Transport Ltd')
    const tx=await get('/api/transactions')
    assert.equal(tx.status,200)
    const txRow=(await tx.json()).data.items[0]
    assert.equal(txRow.pump_number,1)
    assert.equal(typeof txRow.total_amount,'number')
    const options=await get('/api/transactions/fuel-options')
    assert.equal((await options.json()).data.options.length,2)
    const pre=await get('/api/transactions/pre-fuel-customer')
    assert.equal((await pre.json()).data.captureOrder,'before_transaction')
    const settings=await get('/api/settings')
    assert.deepEqual(await settings.json(),{})
    const reports=await get('/api/reports/transactions.csv')
    assert.match(reports.headers.get('content-type'),/text\/csv/)
    const unknown=await get('/api/pos/doms/nonexistent')
    assert.equal(unknown.status,501)
    assert.equal((await unknown.json()).error.code,'SANDBOX_NOT_IMPLEMENTED')
    const withoutAuth=await fetch(base+'/api/transactions')
    assert.equal(withoutAuth.status,401)
    const coverage=await get('/api/sandbox/coverage')
    assert.equal((await coverage.json()).data.baseUrl,'/api')
  } finally {
    child.kill('SIGTERM')
  }
})
