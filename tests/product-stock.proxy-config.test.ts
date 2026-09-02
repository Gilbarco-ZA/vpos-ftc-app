import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStockProxyUrlFromHost,
  resolveDevelopmentStockProxyFallback,
  resolveStockProxyTargetValues,
} from '@/src/modules/stock/infrastructure/stockProxyTarget'

test('production stock proxy resolution ignores environment fallbacks', () => {
  assert.deepEqual(
    resolveDevelopmentStockProxyFallback('production', {
      proxyUrl: 'http://dev-proxy:5555',
      proxyBasePath: '/dev',
    }),
    { baseUrl: null, basePath: null },
  )
})

test('development stock proxy resolution may use environment fallbacks', () => {
  assert.deepEqual(
    resolveDevelopmentStockProxyFallback('development', {
      proxyUrl: 'http://dev-proxy:5555',
      proxyBasePath: '/proxy',
    }),
    { baseUrl: 'http://dev-proxy:5555', basePath: '/proxy' },
  )
})

test('DOMS host resolves to the vpos-proxy port', () => {
  assert.equal(
    buildStockProxyUrlFromHost('192.168.10.20:8888'),
    'http://192.168.10.20:5555',
  )
})

test('production target uses persisted configuration and ignores proxy env values', () => {
  assert.deepEqual(
    resolveStockProxyTargetValues({
      nodeEnv: 'production',
      configuredBaseUrl: 'http://persisted-proxy:5555/',
      configuredBasePath: 'proxy/',
      persistedJplHost: '192.168.10.20',
      environment: {
        proxyUrl: 'http://dev-proxy:9999',
        proxyBasePath: '/dev',
      },
    }),
    { baseUrl: 'http://persisted-proxy:5555', basePath: '/proxy' },
  )
})

test('production target may derive vpos-proxy from the persisted JPL host', () => {
  assert.deepEqual(
    resolveStockProxyTargetValues({
      nodeEnv: 'production',
      persistedJplHost: '192.168.10.20:8888',
      environment: {
        proxyUrl: 'http://dev-proxy:9999',
        proxyBasePath: '/dev',
      },
    }),
    { baseUrl: 'http://192.168.10.20:5555', basePath: '/proxy' },
  )
})

test('production target falls back to the local proxy instead of environment configuration', () => {
  assert.deepEqual(
    resolveStockProxyTargetValues({
      nodeEnv: 'production',
      environment: {
        proxyUrl: 'http://dev-proxy:9999',
        proxyBasePath: '/dev',
      },
    }),
    { baseUrl: 'http://127.0.0.1:5555', basePath: '/proxy' },
  )
})
