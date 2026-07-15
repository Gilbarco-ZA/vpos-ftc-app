#!/usr/bin/env node
/*
  Production entrypoint / debug-friendly wrapper.

  Goals:
  - Load .env if present (optional; not shipped)
  - Add robust process-level diagnostics (exit causes, unhandled errors)
  - Emit enough context to debug "silent" exits on minimal/busybox systems

  Usage:
    node start.cjs

  Optional env flags:
    VPOS_DEBUG=1                -> more verbose logging
    VPOS_DUMP_ENV=1             -> print selected env keys (redacted)
    VPOS_HEARTBEAT_FILE=/tmp/...-> write periodic heartbeat JSON
    VPOS_KEEPALIVE=1            -> keep event loop alive with a timer (debug)
*/

const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

function nowIso() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(...args);
}

function warn(...args) {
  console.warn(...args);
}

function err(...args) {
  console.error(...args);
}

function redactEnvValue(key, value) {
  const k = String(key || '').toUpperCase();
  if (value == null) return value;
  if (
    k.includes('PASSWORD') ||
    k.includes('SECRET') ||
    k.includes('TOKEN') ||
    k.includes('KEY') ||
    k.includes('PRIVATE') ||
    k.includes('POSTGRES') ||
    k.includes('DATABASE') ||
    k.includes('CONNECTION')
  ) {
    const s = String(value);
    if (s.length <= 6) return '***';
    return s.slice(0, 3) + '***' + s.slice(-3);
  }
  return value;
}

function dumpEnv(keys) {
  const out = {};
  for (const k of keys) out[k] = redactEnvValue(k, process.env[k]);
  return out;
}

function parseEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s || s.startsWith('#')) return;
      const i = s.indexOf('=');
      if (i === -1) return;
      const key = s.slice(0, i).trim();
      let val = s.slice(i + 1).trim();

      // strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }

      // do not overwrite already-set env vars
      if (process.env[key] === undefined) process.env[key] = val;
    });
    return true;
  } catch {
    return false;
  }
}

function loadDevelopmentEnvOptional() {
  if (process.env.NODE_ENV === 'production') {
    return { loaded: false, envPath: null, skipped: true };
  }

  const envPaths = ['.env.local', '.env.development', '.env'].map((name) => path.join(__dirname, name));
  let loaded = false;
  for (const envPath of envPaths) {
    try {
      const res = require('dotenv').config({ path: envPath });
      loaded = loaded || !res.error;
    } catch (_) {
      loaded = parseEnvFile(envPath) || loaded;
    }
  }
  return { loaded, envPath: envPaths.join(','), skipped: false };
}

async function writeHeartbeat(filePath, extra = {}) {
  try {
    const payload = {
      t: nowIso(),
      pid: process.pid,
      ppid: process.ppid,
      uptime_s: Math.round(process.uptime()),
      rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      extra,
    };
    await fs.promises.writeFile(filePath, JSON.stringify(payload) + os.EOL);
  } catch (e) {
    if (String(process.env.VPOS_DEBUG || '') === '1') {
      err('[debug] heartbeat write failed:', e?.stack || e);
    }
  }
}

function installProcessDiagnostics() {
  const t0 = Date.now();

  process.on('beforeExit', (code) => {
    warn(`[diag] beforeExit code=${code} uptime_s=${Math.round(process.uptime())}`);
  });

  process.on('exit', (code) => {
    const ms = Date.now() - t0;
    warn(`[diag] exit code=${code} runtime_ms=${ms}`);
  });

  process.on('uncaughtException', (e) => {
    err('[diag] uncaughtException:', e?.stack || e);
    // ensure stderr flush; then exit non-zero
    try { process.stderr.write(''); } catch {}
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    err('[diag] unhandledRejection:', reason?.stack || reason);
    // make this loud; don't silently continue
    try { process.stderr.write(''); } catch {}
    process.exit(1);
  });

  process.on('warning', (w) => {
    warn('[diag] warning:', w?.stack || w);
  });
  // Log signals, but do not force-exit here. vpos-server installs its own graceful handlers.
  const sigs = ['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGQUIT'];
  for (const sig of sigs) {
    try {
      process.on(sig, () => {
        warn(`[diag] received  (pid=)`);
      });
    } catch {
    }
  }
}

// ---- main ----
installProcessDiagnostics();

const { loaded, envPath, skipped } = loadDevelopmentEnvOptional();
log('[start] ts=', nowIso());
log('[start] node=', process.version, 'platform=', process.platform, 'arch=', process.arch);
log('[start] pid=', process.pid, 'ppid=', process.ppid);
log('[start] cwd=', process.cwd());
log('[start] development .env loaded:', loaded, 'path=', envPath, 'skipped=', skipped);

if (String(process.env.VPOS_DUMP_ENV || '') === '1') {
  log('[start] env:', dumpEnv([
    'NODE_ENV',
    'PORT',
    'HOSTNAME',
    'POSTGRES_URL',
    'DATABASE_URL',
    'VPOS_USE_HTTPS',
    'VPOS_HTTPS_KEY_PATH',
    'VPOS_HTTPS_CERT_PATH',
    'STATION_ID',
  ]));
} else {
  // keep original log signal without dumping sensitive info
  log('[start] POSTGRES_URL:', redactEnvValue('POSTGRES_URL', process.env.POSTGRES_URL));
}

const hbFile = process.env.VPOS_HEARTBEAT_FILE;
if (hbFile) {
  writeHeartbeat(hbFile, { phase: 'pre-require' });
  const intervalMs = Math.max(5_000, Number(process.env.VPOS_HEARTBEAT_MS || 30_000));
  const timer = setInterval(() => {
    writeHeartbeat(hbFile, { phase: 'running' });
  }, intervalMs);
  if (String(process.env.VPOS_KEEPALIVE || '') !== '1') timer.unref();
}

// Optionally keep the event-loop alive even if server handles get dropped.
if (String(process.env.VPOS_KEEPALIVE || '') === '1') {
  setInterval(() => {}, 60_000);
}

if (process.env.VPOS_TRACE_NET === "1") {
  require("./scripts/trace-net.cjs");
}

// Start main server
require('./vpos-server.cjs');
