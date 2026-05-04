type CounterKey = string

type Counter = { help: string; value: number }
type Gauge = { help: string; value: number }

const counters = new Map<CounterKey, Counter>()
const gauges = new Map<string, Gauge>()

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function incCounter(name: string, help: string, by = 1) {
  const key = sanitizeName(name)
  const cur = counters.get(key) ?? { help, value: 0 }
  cur.value += by
  counters.set(key, cur)
}

export function setGauge(name: string, help: string, value: number) {
  const key = sanitizeName(name)
  gauges.set(key, { help, value })
}

export function recordDurationMetric(
  name: string,
  help: string,
  valueMs: number,
) {
  setGauge(`${name}_last_ms`, `${help} (last observed, ms)`, valueMs)
}

export function recordSlowQuery(adapter: string, durationMs: number) {
  incCounter(
    'db_slow_queries_total',
    'Total database queries above the slow-query threshold',
    1,
  )
  incCounter(
    `db_slow_queries_${adapter}_total`,
    `Total ${adapter} queries above the slow-query threshold`,
    1,
  )
  recordDurationMetric(
    `db_${adapter}_query`,
    `Observed ${adapter} query duration`,
    durationMs,
  )
}

export function snapshotPrometheusText() {
  const uptime = process.uptime()
  const mem = process.memoryUsage()

  setGauge('process_uptime_seconds', 'Process uptime in seconds', uptime)
  setGauge(
    'nodejs_memory_rss_bytes',
    'Resident set size in bytes',
    mem.rss ?? 0,
  )
  setGauge(
    'nodejs_memory_heap_used_bytes',
    'Heap used bytes',
    mem.heapUsed ?? 0,
  )
  setGauge(
    'nodejs_memory_heap_total_bytes',
    'Heap total bytes',
    mem.heapTotal ?? 0,
  )

  let out = ''
  for (const [name, g] of gauges.entries()) {
    out += `# HELP ${name} ${g.help}\n`
    out += `# TYPE ${name} gauge\n`
    out += `${name} ${Number(g.value)}\n`
  }
  for (const [name, c] of counters.entries()) {
    out += `# HELP ${name} ${c.help}\n`
    out += `# TYPE ${name} counter\n`
    out += `${name} ${Number(c.value)}\n`
  }
  return out
}
