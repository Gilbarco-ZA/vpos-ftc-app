import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const form = readFileSync('components/admin/AdminBrandingForm.tsx', 'utf8')
const route = readFileSync('app/api/admin/branding/route.ts', 'utf8')

test('branding GET provides station country to distinguish Kenya and Tanzania', () => {
  assert.match(route, /getStationCountryCode\(user\.stationId\)/)
  assert.match(route, /station_country: country/)
})

test('Kenya uses commercial labels while Tanzania keeps generic receipt labels', () => {
  assert.match(form, /\['KE', 'KEN', 'KENYA'\]/)
  assert.match(form, /isKenya \? 'Commercial Message Header' : 'Receipt header text'/)
  assert.match(form, /isKenya \? 'Commercial Footer' : 'Receipt footer text'/)
  assert.match(form, /name="receiptHeaderText"/)
  assert.match(form, /name="receiptFooterText"/)
})
