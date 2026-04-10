#!/usr/bin/env node
const http = require('http');
const https = require('https');

const port = Number(process.env.PORT || 3080);
const host = process.env.HOSTNAME || '127.0.0.1';
const path = process.env.VPOS_HEALTH_PATH || '/';
const useHttps = String(process.env.VPOS_USE_HTTPS || '0').toLowerCase() === '1';

const mod = useHttps ? https : http;

const req = mod.request(
  {
    host,
    port,
    path,
    method: 'GET',
    timeout: Math.max(1000, Number(process.env.VPOS_HEALTH_TIMEOUT_MS || 3000)),
    rejectUnauthorized: false,
  },
  (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      console.log(JSON.stringify({
        ok: res.statusCode && res.statusCode < 500,
        status: res.statusCode,
        headers: res.headers,
        body_preview: body.slice(0, 200),
      }, null, 2));
      process.exit(res.statusCode && res.statusCode < 500 ? 0 : 2);
    });
  }
);

req.on('timeout', () => {
  req.destroy(new Error('timeout'));
});

req.on('error', (e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && (e.stack || e)) }, null, 2));
  process.exit(1);
});

req.end();
