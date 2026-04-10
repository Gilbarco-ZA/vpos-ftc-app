#!/usr/bin/env node
const os = require('os');
const fs = require('fs');

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function bytesToMb(n) {
  return Math.round(n / (1024 * 1024));
}

const info = {
  ts: new Date().toISOString(),
  node: process.version,
  pid: process.pid,
  ppid: process.ppid,
  platform: process.platform,
  arch: process.arch,
  cwd: process.cwd(),
  execPath: process.execPath,
  argv: process.argv,
  env: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HOSTNAME: process.env.HOSTNAME,
  },
  os: {
    type: os.type(),
    release: os.release(),
    hostname: os.hostname(),
    uptime_s: Math.round(os.uptime()),
    loadavg: os.loadavg(),
    totalmem_mb: bytesToMb(os.totalmem()),
    freemem_mb: bytesToMb(os.freemem()),
  },
  processMem: {
    rss_mb: bytesToMb(process.memoryUsage().rss),
    heapUsed_mb: bytesToMb(process.memoryUsage().heapUsed),
    heapTotal_mb: bytesToMb(process.memoryUsage().heapTotal),
  },
  proc: {
    meminfo: safeRead('/proc/meminfo'),
    limits: safeRead('/proc/self/limits'),
    status: safeRead('/proc/self/status'),
  }
};

console.log(JSON.stringify(info, null, 2));
