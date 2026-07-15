#!/usr/bin/env ts-node
// @ts-nocheck
/*
 * Generates a machine-readable .agent metadata layer for this TypeScript/Next.js project.
 *
 * The generated files are descriptive indexes for AI-assisted navigation. They do
 * not change application behavior.
 */
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

interface PackageJson {
  name?: string
  version?: string
  description?: string
  private?: boolean
  main?: string
  engines?: Record<string, string>
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  overrides?: Record<string, string>
}

interface FileRecord {
  path: string
  kind: string
  language: string
  sizeBytes: number
  lines: number
  purpose: string
  exports: string[]
  imports: string[]
  sideEffects: string[]
  isEntrypoint: boolean
  isRoute: boolean
  route?: string
  routeType?: string
  httpMethods?: string[]
  isTest: boolean
  isRuntimeAsset: boolean
  relatedTests: string[]
}

interface SymbolRecord {
  id: string
  name: string
  kind: string
  file: string
  exported: boolean
  publicApi: boolean
  declaration: string
  signature?: string
  async?: boolean
  defaultExport?: boolean
  members?: Array<{
    name: string
    kind: string
    visibility: string
    async?: boolean
    sideEffects?: string[]
  }>
  sideEffects: string[]
  tags: string[]
}

interface ImportEdge {
  from: string
  to: string
  specifier: string
  resolvedPath?: string
  external: boolean
  typeOnly: boolean
  imports: string[]
  isDynamic: boolean
}

interface PublicApiRecord {
  id: string
  type: string
  route?: string
  methods?: string[]
  file: string
  exportName?: string
  kind?: string
  purpose: string
  sideEffects: string[]
}

interface ExportItem {
  name: string
  sourceFile?: string
  typeOnly: boolean
  kind: 'local' | 're-export' | 'star' | 'default'
}

const ROOT = process.cwd()
const AGENT_DIR = path.join(ROOT, '.agent')

const IGNORE_DIRS = new Set([
  '.agent',
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
  'out',
])

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.cjs',
  '.mjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.css',
  '.sql',
  '.sh',
])

const INDEXED_EXTENSIONS = new Set(TEXT_EXTENSIONS)
const RUNTIME_ASSET_PREFIXES = ['public/', 'scripts/migrations/', '.config/']

function rel(filePath: string): string {
  return path.relative(ROOT, filePath).split(path.sep).join('/')
}

function isTextFile(relativePath: string): boolean {
  return (
    TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()) &&
    !relativePath.endsWith('package-lock.json')
  )
}

function readTextIfSafe(absolutePath: string): string {
  const relativePath = rel(absolutePath)
  if (!isTextFile(relativePath)) return ''
  return fs.readFileSync(absolutePath, 'utf8')
}

function readJson<T>(relativePath: string, fallback: T): T {
  const absolutePath = path.join(ROOT, relativePath)
  if (!fs.existsSync(absolutePath)) return fallback
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T
}

function writeJson(relativePath: string, value: unknown): void {
  fs.writeFileSync(
    path.join(ROOT, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
  )
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const absolutePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(absolutePath, out)
      continue
    }
    if (!INDEXED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      continue
    out.push(absolutePath)
  }
  return out.sort((a, b) => rel(a).localeCompare(rel(b)))
}

function languageFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.ts') return 'typescript'
  if (ext === '.tsx') return 'typescript-react'
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') return 'javascript'
  if (ext === '.jsx') return 'javascript-react'
  if (ext === '.json') return 'json'
  if (ext === '.md') return 'markdown'
  if (ext === '.yml' || ext === '.yaml') return 'yaml'
  if (ext === '.css') return 'css'
  if (ext === '.sql') return 'sql'
  if (ext === '.sh') return 'shell'
  return ext.replace(/^\./, '') || 'text'
}

function routeFromAppPath(relativePath: string): string | undefined {
  if (!relativePath.startsWith('app/')) return undefined
  const parts = relativePath.split('/')
  const file = parts[parts.length - 1]
  if (
    ![
      'route.ts',
      'route.tsx',
      'page.tsx',
      'layout.tsx',
      'error.tsx',
      'loading.tsx',
      'not-found.tsx',
      'manifest.ts',
    ].includes(file)
  )
    return undefined
  let routeParts = parts
    .slice(1, -1)
    .filter((part) => !(part.startsWith('(') && part.endsWith(')')))
  if (file !== 'route.ts' && file !== 'route.tsx' && routeParts[0] === 'api')
    return undefined
  if (file === 'manifest.ts') return '/manifest.webmanifest'
  const route = `/${routeParts.join('/')}`.replace(/\/+/g, '/')
  return route === '/' ? '/' : route
}

function routeTypeFor(relativePath: string): string | undefined {
  const base = path.basename(relativePath)
  if (relativePath.includes('/api/') && base.startsWith('route.'))
    return 'api-route'
  if (base === 'page.tsx') return 'page'
  if (base === 'layout.tsx') return 'layout'
  if (base === 'error.tsx') return 'error-boundary'
  if (base === 'loading.tsx') return 'loading-boundary'
  if (base === 'not-found.tsx') return 'not-found-boundary'
  if (base === 'manifest.ts') return 'web-app-manifest'
  return undefined
}

function kindFor(relativePath: string): string {
  const base = path.basename(relativePath)
  if (base === 'package.json') return 'package-manifest'
  if (base === 'package-lock.json') return 'package-lock'
  if (base.startsWith('tsconfig')) return 'typescript-config'
  if (base.startsWith('next.config')) return 'next-config'
  if (base.startsWith('eslint.config')) return 'eslint-config'
  if (base.startsWith('prettier.config')) return 'prettier-config'
  if (base.startsWith('tailwind.config')) return 'tailwind-config'
  if (base === 'components.json') return 'ui-components-config'
  if (relativePath === 'server.ts') return 'node-next-server-entrypoint'
  if (relativePath === 'start.cjs') return 'production-start-entrypoint'
  if (relativePath === 'vpos-server.cjs') return 'generated-server-bundle'
  if (relativePath === 'instrumentation.ts') return 'next-instrumentation'
  if (relativePath === 'proxy.ts') return 'next-proxy-middleware'
  if (relativePath.startsWith('app/api/')) return 'next-api-route'
  if (relativePath.startsWith('app/') && base === 'page.tsx') return 'next-page'
  if (relativePath.startsWith('app/') && base === 'layout.tsx')
    return 'next-layout'
  if (
    relativePath.startsWith('app/') &&
    ['error.tsx', 'loading.tsx', 'not-found.tsx'].includes(base)
  )
    return 'next-route-boundary'
  if (relativePath.startsWith('app/setup/')) return 'setup-ui-route'
  if (relativePath.startsWith('app/')) return 'next-app-router-file'
  if (relativePath.startsWith('components/ui/')) return 'ui-primitive-component'
  if (relativePath.startsWith('components/admin/')) return 'admin-ui-component'
  if (relativePath.startsWith('components/transactions/'))
    return 'transaction-ui-component'
  if (relativePath.startsWith('components/pos/')) return 'pos-ui-component'
  if (relativePath.startsWith('components/pumps/')) return 'pump-ui-component'
  if (relativePath.startsWith('components/tank')) return 'tank-ui-component'
  if (relativePath.startsWith('components/reports/'))
    return 'report-ui-component'
  if (relativePath.startsWith('components/receipts/'))
    return 'receipt-ui-component'
  if (relativePath.startsWith('components/')) return 'react-component'
  if (
    relativePath.startsWith('src/modules/') &&
    relativePath.includes('/application/')
  )
    return 'business-application-service'
  if (
    relativePath.startsWith('src/modules/') &&
    relativePath.includes('/domain/')
  )
    return 'business-domain-model'
  if (
    relativePath.startsWith('src/modules/') &&
    relativePath.includes('/infrastructure/')
  )
    return 'business-infrastructure-adapter'
  if (
    relativePath.startsWith('src/modules/') &&
    relativePath.includes('/presentation/')
  )
    return 'business-presentation-helper'
  if (
    relativePath.startsWith('src/modules/') &&
    relativePath.includes('/client/')
  )
    return 'business-client-hook'
  if (relativePath.startsWith('src/modules/')) return 'business-module'
  if (relativePath.startsWith('src/platform/auth/')) return 'platform-auth'
  if (relativePath.startsWith('src/platform/bootstrap/'))
    return 'platform-bootstrap'
  if (relativePath.startsWith('src/platform/config/')) return 'platform-config'
  if (relativePath.startsWith('src/platform/db/')) return 'platform-database'
  if (relativePath.startsWith('src/platform/integrations/'))
    return 'platform-integration-adapter'
  if (relativePath.startsWith('src/platform/runtime/'))
    return 'platform-runtime'
  if (relativePath.startsWith('src/platform/security/'))
    return 'platform-security'
  if (relativePath.startsWith('src/platform/web/api/'))
    return 'platform-api-helper'
  if (relativePath.startsWith('src/platform/')) return 'platform-infrastructure'
  if (relativePath.startsWith('src/shared/forecourt/'))
    return 'shared-forecourt-facade'
  if (relativePath.startsWith('src/shared/fiscalization/'))
    return 'shared-fiscalization-helper'
  if (relativePath.startsWith('src/shared/receipts/'))
    return 'shared-receipt-helper'
  if (relativePath.startsWith('src/shared/setup/')) return 'shared-setup-helper'
  if (relativePath.startsWith('src/shared/config/'))
    return 'shared-config-helper'
  if (relativePath.startsWith('src/shared/')) return 'shared-helper'
  if (relativePath.startsWith('workers/')) return 'runtime-worker-entrypoint'
  if (relativePath.startsWith('server/')) return 'server-support'
  if (relativePath.startsWith('scripts/migrations/'))
    return 'database-migration'
  if (relativePath.startsWith('scripts/') && relativePath.endsWith('worker.ts'))
    return 'worker-script'
  if (relativePath.startsWith('scripts/')) return 'developer-or-ops-script'
  if (
    relativePath.startsWith('tests/') ||
    relativePath.endsWith('.test.ts') ||
    relativePath.endsWith('.test.tsx')
  )
    return 'test'
  if (relativePath.startsWith('docs/') || relativePath.endsWith('.md'))
    return 'documentation'
  if (relativePath.startsWith('public/')) return 'public-runtime-asset'
  if (relativePath.startsWith('.config/')) return 'runtime-config-artifact'
  return 'source-or-config'
}

function moduleName(relativePath: string): string | undefined {
  const match = relativePath.match(/^src\/modules\/([^/]+)/)
  return match?.[1]
}

function componentArea(relativePath: string): string | undefined {
  const match = relativePath.match(/^components\/([^/]+)/)
  return match?.[1]
}

function inferPurpose(relativePath: string, content: string): string {
  const base = path.basename(relativePath)
  const route = routeFromAppPath(relativePath)
  const routeType = routeTypeFor(relativePath)
  const mod = moduleName(relativePath)
  const area = componentArea(relativePath)

  if (relativePath === 'README.md')
    return 'Primary project overview for the VPOS FTC App, including runtime model, route/module layout, configuration, and local development guidance.'
  if (relativePath === 'docs/ARCHITECTURE.md')
    return 'Technical architecture guide for the Next.js UI, route handlers, server runtime, workers, modules, platform layer, and shared facades.'
  if (relativePath === 'DOMS_INTEGRATION_TODO.md')
    return 'DOMS/JPL integration checklist and progress tracker for transport, protocol handling, bootstrap, dispense, wetstock, observability, and validation work.'
  if (relativePath === 'scripts/generate-agent-index.ts')
    return 'Regenerates the .agent metadata layer for AI-assisted codebase navigation and safe modification workflows.'
  if (relativePath === 'package.json')
    return 'npm package manifest declaring runtime entrypoints, Next.js and Node commands, dependency graph, Node engine constraints, and test/index scripts.'
  if (relativePath === 'server.ts')
    return 'Custom production Node server entrypoint that hosts Next.js, bootstraps runtime services, and attaches forecourt/websocket support.'
  if (relativePath === 'start.cjs')
    return 'Production launcher that starts the bundled VPOS server runtime on the configured port.'
  if (relativePath === 'vpos-server.cjs')
    return 'Generated esbuild server bundle produced by npm run server:gen during build.'
  if (relativePath === 'scripts/worker.ts')
    return 'Omnibus long-running worker entrypoint for station runtime jobs outside the HTTP request lifecycle.'
  if (relativePath.startsWith('workers/') && base.endsWith('.worker.ts'))
    return 'Dedicated worker process entrypoint for queue-backed or runtime background processing.'
  if (relativePath === 'server/forecourtWs.ts')
    return 'Socket.IO forecourt websocket support that bridges runtime/forecourt state to connected clients.'
  if (relativePath === 'server/index.ts')
    return 'Standalone forecourt development/server entrypoint used by the dev:forecourt command.'
  if (relativePath === 'instrumentation.ts')
    return 'Next.js instrumentation hook for process-level observability or boot-time setup.'
  if (relativePath === 'proxy.ts')
    return 'Next.js proxy/middleware-style request interception file.'

  if (routeType === 'api-route')
    return `Next.js API route handler for ${route}. Inspect exported HTTP method functions and imported application services before changing behavior.`
  if (routeType === 'page')
    return `Next.js App Router page for ${route}. It composes route-level UI and usually delegates data fetching/actions to modules or shared APIs.`
  if (routeType === 'layout')
    return `Next.js App Router layout for ${route}. It defines route tree shell, providers, guards, or shared chrome for child pages.`
  if (routeType === 'error-boundary')
    return `Next.js error boundary for ${route}. It renders scoped error recovery UI.`
  if (routeType === 'loading-boundary')
    return `Next.js loading boundary for ${route}. It renders route-scoped loading/skeleton UI.`
  if (routeType === 'web-app-manifest')
    return 'Next.js dynamic web app manifest provider for PWA metadata.'

  if (relativePath.startsWith('components/ui/'))
    return 'Reusable UI primitive component. Preserve generic props, accessibility behavior, and styling compatibility when changing it.'
  if (area)
    return `React component, hook, or UI helper for the ${area} area of the station console.`

  if (mod) {
    const layer = relativePath.includes('/application/')
      ? 'application-service'
      : relativePath.includes('/domain/')
        ? 'domain'
        : relativePath.includes('/infrastructure/')
          ? 'infrastructure'
          : relativePath.includes('/presentation/')
            ? 'presentation'
            : relativePath.includes('/client/')
              ? 'client'
              : 'module'
    const modulePurposes: Record<string, string> = {
      'admin-config':
        'administrator configuration, plugin catalog, branding, station settings, and device configuration',
      'admin-diagnostics':
        'administrator diagnostics and operational status summaries',
      'admin-integrations':
        'administrator-facing POS/PSS XML integration settings and actions',
      'admin-logs':
        'administrator log discovery, viewing, download, and clearing',
      archive: 'archive destinations, export metadata, and archive events',
      control:
        'generic operational command registry, command execution, and control events',
      customers:
        'customer CRUD, lookup, import, and customer-to-transaction workflows',
      doms: 'DOMS command normalization and execution',
      'fiscal-inbox': 'fiscal inbox domain errors and status handling',
      forecourt:
        'DOMS/JPL forecourt runtime, pump/tank state, command dispatch, and synchronization',
      'legacy-import': 'legacy import retry and migration support',
      pos: 'POS command handling, attendant authorization, DOMS command facades, and POS control runtime',
      printing:
        'receipt print jobs, printer configuration, ESC/POS formatting, and print queue processing',
      products: 'product and product-category presentation/application helpers',
      'proxy-settings': 'fiscalization proxy configuration',
      pumps:
        'pump runtime state snapshots, health summaries, and pump store persistence',
      reports:
        'report generation, reporting queries, CSV export, and report print queueing',
      runtime:
        'runtime bus, fiscal inbox operations, runtime manager state, and supervisor monitoring',
      settings: 'station, pump, tank, pump-mode, console, and cloud settings',
      setup:
        'first-time setup, station onboarding, device checks, printer tests, and validation',
      status: 'station status payloads',
      supervisor:
        'process supervision, restart orchestration, and runtime status',
      sync: 'station/cloud sync orchestration and cursor/state management',
      'tank-levels':
        'tank stock entries, tank level snapshots, proxy stock-in flows, and transaction tank deductions',
      terminal: 'restricted terminal command execution',
      transactions:
        'transaction queueing, daily totals, status policy, errors, and recomputation',
      vpos: 'VPOS bridge/status/command operations and supervisor restart controls',
    }
    return `${layer} source for ${modulePurposes[mod] || `${mod} business workflows`}.`
  }

  if (relativePath.startsWith('src/platform/auth/'))
    return 'Authentication, authorization, password/session, permission, or role/station policy infrastructure.'
  if (relativePath.startsWith('src/platform/bootstrap/'))
    return 'Boot-time infrastructure for first boot, migrations, legacy import, DOMS process guard, and runtime initialization.'
  if (relativePath.startsWith('src/platform/config/'))
    return 'Configuration loading, defaults, effective config, plugin catalog, station settings, and config persistence helpers.'
  if (relativePath.startsWith('src/platform/db/'))
    return 'Database infrastructure for PostgreSQL, Azure SQL, query helpers, migrations, locks, transactions, and generated SQL fragments.'
  if (relativePath.startsWith('src/platform/integrations/jpl/'))
    return 'JPL/DOMS integration adapter plumbing for forecourt connectivity and typed gateway access.'
  if (relativePath.startsWith('src/platform/integrations/'))
    return 'External integration adapter, configuration, HTTP client, importer/exporter, or shared integration type.'
  if (relativePath.startsWith('src/platform/runtime/'))
    return 'Runtime composition root, environment parsing, process management, and worker service lifecycle code.'
  if (relativePath.startsWith('src/platform/security/'))
    return 'Security infrastructure for audit logging, idempotency, PII redaction, rate limits, or secure artifact handling.'
  if (relativePath.startsWith('src/platform/web/api/'))
    return 'Shared HTTP API helper for request parsing, response formatting, validation, routing, or API errors.'
  if (relativePath.startsWith('src/shared/'))
    return 'Shared facade, adapter, utility, validation, or client/server helper used across app routes, modules, and UI components.'
  if (relativePath.startsWith('tests/'))
    return 'Focused node:test or runtime test covering protocol, fiscalization proxy, runtime supervisor, tank-levels, or transaction behavior.'
  if (relativePath.startsWith('scripts/migrations/'))
    return 'Database migration or migration-adjacent operational artifact.'
  if (relativePath.startsWith('scripts/'))
    return 'Developer or operational script for diagnostics, cleanup, imports, worker stubs, sync, or runtime support.'
  if (relativePath.startsWith('public/'))
    return 'Public static or PWA runtime asset served by the Next.js app.'
  if (relativePath.endsWith('.md'))
    return 'Project documentation or implementation notes.'
  if (content.includes('export const runtime'))
    return 'Next.js route/runtime configuration source file.'
  return 'Project source or configuration file.'
}

function modifiersOf(node: ts.Node): readonly ts.ModifierLike[] {
  return ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return modifiersOf(node).some((modifier) => modifier.kind === kind)
}

function isExportedNode(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword)
}

function nodeName(node: ts.Node): string | undefined {
  const named = node as ts.Node & { name?: ts.Node }
  if (!named.name) return undefined
  if (
    ts.isIdentifier(named.name) ||
    ts.isStringLiteral(named.name) ||
    ts.isNumericLiteral(named.name)
  )
    return named.name.text
  return named.name.getText()
}

function declarationLine(sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = node.getText(sourceFile).split(/\r?\n/)[0]?.trim() || ''
  return text.length > 240 ? `${text.slice(0, 237)}...` : text
}

function signatureOf(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    const text = node.getText(sourceFile)
    const idx = text.indexOf('{')
    return (idx === -1 ? text : text.slice(0, idx)).replace(/\s+/g, ' ').trim()
  }
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  )
    return declarationLine(sourceFile, node)
  if (ts.isVariableStatement(node)) return declarationLine(sourceFile, node)
  return undefined
}

function symbolKind(node: ts.Node): string {
  if (ts.isClassDeclaration(node)) return 'class'
  if (ts.isInterfaceDeclaration(node)) return 'interface'
  if (ts.isTypeAliasDeclaration(node)) return 'type'
  if (ts.isEnumDeclaration(node)) return 'enum'
  if (ts.isFunctionDeclaration(node)) return 'function'
  if (ts.isVariableStatement(node)) return 'variable'
  if (ts.isMethodDeclaration(node)) return 'method'
  if (ts.isPropertyDeclaration(node)) return 'property'
  if (ts.isExportAssignment(node)) return 'default-export'
  return ts.SyntaxKind[node.kind] || 'unknown'
}

function sideEffectsFromText(text: string): string[] {
  const sideEffects: Array<[RegExp, string]> = [
    [/process\.env\b/, 'reads/writes process environment'],
    [
      /process\.(exit|on|kill|send|memoryUsage|uptime|cwd)\b/,
      'uses process lifecycle or process telemetry',
    ],
    [/\bconsole\.(log|error|warn|info|debug)\b/, 'writes to console'],
    [
      /\b(fs|writeFileSync|readFileSync|readdirSync|existsSync|copyFileSync|mkdirSync|rmSync|createReadStream|createWriteStream|promises)\b|from ["']fs/,
      'uses filesystem',
    ],
    [
      /\b(pg|Pool|PoolClient|sql|query\(|transaction\(|beginTransaction)\b|from ["']mssql|from ["']pg/,
      'uses database',
    ],
    [
      /fetch\(|axios|http\.request|https\.request|BaseHttpIntegrationAdapter/,
      'performs HTTP I/O',
    ],
    [
      /socket\.io|SocketIO|\.emit\(|\.on\(|EventEmitter/,
      'emits or subscribes to events',
    ],
    [
      /\.listen\(|createServer|net\.createConnection|tls\.connect|WebSocket|Socket/,
      'opens network listener or connection',
    ],
    [
      /\bsetInterval\(|\bsetTimeout\(|\bclearInterval\(|\bclearTimeout\(/,
      'uses timers',
    ],
    [
      /randomUUID|crypto|createHash|randomBytes|bcrypt|scrypt/,
      'generates identifiers or uses crypto',
    ],
    [
      /cookies\(|headers\(|NextRequest|NextResponse|redirect\(|notFound\(/,
      'uses Next.js request/response primitives',
    ],
    [
      /requireAuth|requireUser|requirePermission|csrf|session|password|role/i,
      'enforces auth/session/security policy',
    ],
    [
      /z\.object|zod|safeParse|validate[A-Z]|schema/i,
      'performs runtime validation',
    ],
    [
      /JPL|DOMS|Forecourt|FpStatus|FpId|Nozzle|Tank|Wetstock|PSS|Pump/i,
      'interacts with forecourt or DOMS domain state',
    ],
    [
      /Fiscal|fiscalization|TRA|EWURA|proxy/i,
      'interacts with fiscalization/proxy workflows',
    ],
    [
      /print|printer|ESC\/POS|receipt/i,
      'interacts with printing or receipt workflows',
    ],
    [
      /queue|worker|heartbeat|supervisor|restart/i,
      'manages background queue, worker, heartbeat, or supervisor lifecycle',
    ],
  ]
  const found = new Set<string>()
  for (const [pattern, label] of sideEffects) {
    if (pattern.test(text)) found.add(label)
  }
  return Array.from(found).sort()
}

function importNamesFromClause(clause: ts.ImportClause | undefined): string[] {
  if (!clause) return []
  const names: string[] = []
  if (clause.name) names.push(clause.name.text)
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings))
      names.push(`* as ${clause.namedBindings.name.text}`)
    if (ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements)
        names.push(
          element.propertyName
            ? `${element.propertyName.text} as ${element.name.text}`
            : element.name.text,
        )
    }
  }
  return names
}

function exportNamesFromDeclaration(
  sourceFile: ts.SourceFile,
  node: ts.ExportDeclaration,
): string[] {
  if (!node.exportClause) return ['*']
  if (ts.isNamespaceExport(node.exportClause))
    return [`* as ${node.exportClause.name.text}`]
  return node.exportClause.elements.map((element) =>
    element.propertyName
      ? `${element.propertyName.text} as ${element.name.text}`
      : element.name.text,
  )
}

function resolveAliasImport(
  specifier: string,
  knownFiles: Set<string>,
): string | undefined {
  const aliases: string[] = []
  if (specifier.startsWith('@/')) aliases.push(specifier.replace(/^@\//, ''))
  if (specifier.startsWith('~/')) aliases.push(specifier.replace(/^~\//, ''))
  for (const candidate of aliases) {
    const resolved = resolveCandidates(candidate, knownFiles)
    if (resolved) return resolved
  }
  return undefined
}

function resolveCandidates(
  baseRelativeOrAbsolute: string,
  knownFiles: Set<string>,
): string | undefined {
  const base = path.isAbsolute(baseRelativeOrAbsolute)
    ? baseRelativeOrAbsolute
    : path.join(ROOT, baseRelativeOrAbsolute)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.json`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
    path.join(base, 'index.json'),
  ].map(rel)
  return candidates.find((candidate) => knownFiles.has(candidate))
}

function resolveLocalImport(
  fromFile: string,
  specifier: string,
  knownFiles: Set<string>,
): string | undefined {
  if (specifier.startsWith('@/') || specifier.startsWith('~/'))
    return resolveAliasImport(specifier, knownFiles)
  if (!specifier.startsWith('.')) return undefined
  const fromDir = path.dirname(path.join(ROOT, fromFile))
  const base = path.resolve(fromDir, specifier)
  return resolveCandidates(base, knownFiles)
}

function collectImports(
  sourceFile: ts.SourceFile,
  relativePath: string,
  knownFiles: Set<string>,
): ImportEdge[] {
  const edges: ImportEdge[] = []
  const add = (
    specifier: string,
    imports: string[],
    typeOnly: boolean,
    isDynamic: boolean,
  ): void => {
    const resolvedPath = resolveLocalImport(relativePath, specifier, knownFiles)
    edges.push({
      from: relativePath,
      to: resolvedPath || specifier,
      specifier,
      resolvedPath,
      external:
        !specifier.startsWith('.') &&
        !specifier.startsWith('@/') &&
        !specifier.startsWith('~/'),
      typeOnly,
      imports,
      isDynamic,
    })
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      add(
        node.moduleSpecifier.text,
        importNamesFromClause(node.importClause),
        !!node.importClause?.isTypeOnly,
        false,
      )
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      add(
        node.moduleSpecifier.text,
        exportNamesFromDeclaration(sourceFile, node),
        !!node.isTypeOnly,
        false,
      )
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    )
      add(node.arguments[0].text, ['dynamic import'], false, true)
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    )
      add(node.arguments[0].text, ['require'], false, false)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return edges
}

function collectLocalExportItems(
  sourceFile: ts.SourceFile,
  relativePath: string,
  knownFiles: Set<string>,
): ExportItem[] {
  const exports: ExportItem[] = []
  const addVarNames = (node: ts.VariableStatement): void => {
    for (const declaration of node.declarationList.declarations) {
      const name = nodeName(declaration)
      if (name)
        exports.push({
          name,
          sourceFile: relativePath,
          typeOnly: false,
          kind: 'local',
        })
    }
  }
  sourceFile.forEachChild((node) => {
    if (isExportedNode(node)) {
      if (ts.isVariableStatement(node)) addVarNames(node)
      else {
        const name = nodeName(node)
        if (name)
          exports.push({
            name,
            sourceFile: relativePath,
            typeOnly:
              ts.isInterfaceDeclaration(node) ||
              ts.isTypeAliasDeclaration(node),
            kind: 'local',
          })
      }
    }
    if (ts.isExportDeclaration(node)) {
      const resolvedPath =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? resolveLocalImport(
              relativePath,
              node.moduleSpecifier.text,
              knownFiles,
            )
          : undefined
      if (!node.exportClause)
        exports.push({
          name: '*',
          sourceFile: resolvedPath,
          typeOnly: !!node.isTypeOnly,
          kind: 'star',
        })
      else if (ts.isNamespaceExport(node.exportClause))
        exports.push({
          name: `* as ${node.exportClause.name.text}`,
          sourceFile: resolvedPath,
          typeOnly: !!node.isTypeOnly,
          kind: 're-export',
        })
      else {
        for (const element of node.exportClause.elements)
          exports.push({
            name: element.name.text,
            sourceFile: resolvedPath,
            typeOnly: !!node.isTypeOnly,
            kind: 're-export',
          })
      }
    }
    if (ts.isExportAssignment(node))
      exports.push({
        name: 'default',
        sourceFile: relativePath,
        typeOnly: false,
        kind: 'default',
      })
  })
  return exports
}

function collectExportNames(sourceFile: ts.SourceFile): string[] {
  const exports = new Set<string>()
  sourceFile.forEachChild((node) => {
    if (isExportedNode(node)) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          const name = nodeName(declaration)
          if (name) exports.add(name)
        }
      } else {
        const name = nodeName(node)
        if (name) exports.add(name)
      }
    }
    if (ts.isExportDeclaration(node))
      for (const name of exportNamesFromDeclaration(sourceFile, node))
        exports.add(name)
    if (ts.isExportAssignment(node)) exports.add('default')
  })
  return Array.from(exports).sort()
}

function exportedHttpMethods(sourceFile: ts.SourceFile): string[] {
  const methods = new Set<string>()
  const allowed = new Set([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
  ])
  sourceFile.forEachChild((node) => {
    if (isExportedNode(node)) {
      if (ts.isFunctionDeclaration(node)) {
        const name = nodeName(node)
        if (name && allowed.has(name)) methods.add(name)
      }
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          const name = nodeName(declaration)
          if (name && allowed.has(name)) methods.add(name)
        }
      }
    }
  })
  return Array.from(methods).sort()
}

function classMembers(
  sourceFile: ts.SourceFile,
  node: ts.ClassDeclaration,
): SymbolRecord['members'] {
  return node.members
    .filter(
      (member) =>
        ts.isMethodDeclaration(member) ||
        ts.isPropertyDeclaration(member) ||
        ts.isConstructorDeclaration(member),
    )
    .map((member) => {
      const name = ts.isConstructorDeclaration(member)
        ? 'constructor'
        : nodeName(member) || '<computed>'
      let visibility = 'public'
      if (hasModifier(member, ts.SyntaxKind.PrivateKeyword))
        visibility = 'private'
      if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword))
        visibility = 'protected'
      return {
        name,
        kind: symbolKind(member),
        visibility,
        async: hasModifier(member, ts.SyntaxKind.AsyncKeyword),
        sideEffects: sideEffectsFromText(member.getText(sourceFile)),
      }
    })
}

function isPublicFile(relativePath: string): boolean {
  if (
    relativePath.startsWith('app/') &&
    ['page.tsx', 'route.ts', 'layout.tsx', 'manifest.ts'].includes(
      path.basename(relativePath),
    )
  )
    return true
  if (
    [
      'server.ts',
      'start.cjs',
      'scripts/worker.ts',
      'server/index.ts',
      'server/forecourtWs.ts',
    ].includes(relativePath)
  )
    return true
  if (relativePath.startsWith('workers/')) return true
  return false
}

function collectSymbols(
  sourceFile: ts.SourceFile,
  relativePath: string,
  publicFiles: Set<string>,
  publicSymbolKeys: Set<string>,
): SymbolRecord[] {
  const records: SymbolRecord[] = []
  const pushDeclaration = (
    node: ts.Node,
    exportedOverride = false,
    nameOverride?: string,
  ): void => {
    const exported = exportedOverride || isExportedNode(node)
    const names: string[] = []
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const name = nodeName(declaration)
        if (name) names.push(name)
      }
    } else {
      const name = nameOverride || nodeName(node)
      if (name) names.push(name)
    }
    for (const name of names) {
      const publicApi =
        publicFiles.has(relativePath) &&
        publicSymbolKeys.has(`${relativePath}#${name}`)
      records.push({
        id: `${relativePath}#${name}`,
        name,
        kind: symbolKind(node),
        file: relativePath,
        exported,
        publicApi,
        declaration: declarationLine(sourceFile, node),
        signature: signatureOf(sourceFile, node),
        async: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
        defaultExport: name === 'default' || ts.isExportAssignment(node),
        members: ts.isClassDeclaration(node)
          ? classMembers(sourceFile, node)
          : undefined,
        sideEffects: sideEffectsFromText(node.getText(sourceFile)),
        tags: [
          kindFor(relativePath),
          ...(publicApi ? ['public-surface'] : []),
          ...(exported && !publicApi ? ['exported-internal'] : []),
        ],
      })
    }
  }

  sourceFile.forEachChild((node) => {
    if (
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isVariableStatement(node)
    ) {
      if (isExportedNode(node)) pushDeclaration(node)
    }
    if (ts.isExportAssignment(node)) pushDeclaration(node, true, 'default')
    if (ts.isExportDeclaration(node)) {
      for (const name of exportNamesFromDeclaration(sourceFile, node)) {
        records.push({
          id: `${relativePath}#export:${name}`,
          name,
          kind: 're-export',
          file: relativePath,
          exported: true,
          publicApi: publicFiles.has(relativePath),
          declaration: declarationLine(sourceFile, node),
          sideEffects: [],
          tags: [
            kindFor(relativePath),
            publicFiles.has(relativePath)
              ? 'public-export-surface'
              : 'barrel-export',
          ],
        })
      }
    }
  })

  return records
}

function countLines(content: string): number {
  if (content.length === 0) return 0
  return content.split(/\r?\n/).length
}

function relatedTestsFor(
  relativePath: string,
  allRelativeFiles: string[],
): string[] {
  if (relativePath.startsWith('tests/')) return []
  const basename = path
    .basename(relativePath)
    .replace(/\.(tsx?|jsx?|json|md|css|sql)$/, '')
    .replace(
      /\.(handler|worker|repo|repository|client|service|route|types|helpers|runtime|mapper|policy)$/,
      '',
    )
  if (
    !basename ||
    basename === 'index' ||
    basename === 'route' ||
    basename === 'page'
  )
    return []
  return allRelativeFiles.filter(
    (candidate) =>
      (candidate.startsWith('tests/') ||
        candidate.endsWith('.test.ts') ||
        candidate.endsWith('.test.tsx')) &&
      candidate.toLowerCase().includes(basename.toLowerCase()),
  )
}

function dependencyCycles(edges: ImportEdge[]): string[][] {
  const graph = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.resolvedPath) continue
    if (!graph.has(edge.from)) graph.set(edge.from, [])
    graph.get(edge.from)!.push(edge.resolvedPath)
  }
  const cycles: string[][] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  function dfs(node: string): void {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node)
      if (idx >= 0) cycles.push([...stack.slice(idx), node])
      return
    }
    if (visited.has(node)) return
    visiting.add(node)
    stack.push(node)
    for (const next of graph.get(node) || []) dfs(next)
    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }
  for (const node of graph.keys()) dfs(node)
  const seen = new Set<string>()
  return cycles.filter((cycle) => {
    const key = cycle.join(' -> ')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function publicApiRecords(
  files: FileRecord[],
  symbols: SymbolRecord[],
): PublicApiRecord[] {
  const records: PublicApiRecord[] = []
  for (const file of files) {
    if (file.isRoute) {
      records.push({
        id: file.path,
        type: file.routeType || 'route',
        route: file.route,
        methods: file.httpMethods,
        file: file.path,
        purpose: file.purpose,
        sideEffects: file.sideEffects,
      })
    }
    if (
      [
        'node-next-server-entrypoint',
        'production-start-entrypoint',
        'worker-script',
        'runtime-worker-entrypoint',
        'server-support',
      ].includes(file.kind)
    ) {
      records.push({
        id: file.path,
        type: 'runtime-entrypoint',
        file: file.path,
        purpose: file.purpose,
        sideEffects: file.sideEffects,
      })
    }
  }
  for (const symbol of symbols.filter((symbol) => symbol.publicApi)) {
    records.push({
      id: symbol.id,
      type: 'exported-symbol',
      file: symbol.file,
      exportName: symbol.name,
      kind: symbol.kind,
      purpose: `Public exported ${symbol.kind} from ${symbol.file}.`,
      sideEffects: symbol.sideEffects,
    })
  }
  return records.sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      (a.route || a.file).localeCompare(b.route || b.file),
  )
}

function markdownConventions(pkg: PackageJson, generatedAt: string): string {
  return `# Agent Coding Conventions

Generated: ${generatedAt}

## Project intent

This repository is the \`${pkg.name || 'vpos-ftc-app'}\` station operations console. It combines a Next.js App Router UI, API route handlers, a custom Node/Next server, background worker processes, PostgreSQL-backed business modules, DOMS/JPL forecourt integration, fiscalization/proxy workflows, printing, reporting, setup, and supervisor tooling.

## Agent ground rules

- Do not rewrite the application while updating metadata. Regenerate this layer with \`npm run agent:index\` after structural source changes.
- Treat \`app/api/**/route.ts\` files as the HTTP API contract. Route handlers should delegate to \`src/modules/**/application\` services or \`src/platform/web/api/**\` helpers rather than embedding broad business logic.
- Treat \`app/**/page.tsx\` and \`components/**\` as the UI surface. Prefer small route-level pages that compose domain-specific client/server components.
- Preserve the layered module structure under \`src/modules/<feature>/{application,domain,infrastructure,presentation,client}\`.
- Keep cross-cutting concerns in \`src/platform/**\` and reusable facades/utilities in \`src/shared/**\`.
- Be conservative around DOMS/JPL, fiscalization, transaction, print, queue, supervisor, and database code. These paths have external device, fiscal, or operational side effects.
- Do not commit generated server bundles or runtime artifacts unless the repository already expects them. \`vpos-server.cjs\` is generated by \`npm run server:gen\`.
- Avoid logging secrets, connection strings, certificates, bearer tokens, fiscal payload credentials, customer PII, or raw payment-sensitive data.

## Runtime architecture

- \`app/\`: Next.js App Router pages, layouts, error/loading boundaries, setup flow, and HTTP route handlers.
- \`components/\`: React UI components, domain screens, reusable UI primitives, sheets, forms, status views, and role-specific pages.
- \`src/modules/\`: business feature modules. Application services orchestrate use cases; infrastructure modules own persistence/integration details; domain modules define policy/status/errors.
- \`src/platform/\`: infrastructure for auth, bootstrap, config, database access, integrations, logs, observability, queues, runtime composition, security, and web API helpers.
- \`src/shared/\`: shared facades and utilities consumed by routes, modules, workers, and UI code.
- \`server.ts\`, \`start.cjs\`, \`server/**\`: custom Node/Next runtime and forecourt websocket support.
- \`scripts/worker.ts\` and \`workers/**\`: long-running background processing entrypoints.
- \`tests/\`: focused node:test suites for protocol/runtime/fiscalization/tank-level/supervisor behavior.

## Public surface expectations

This is a private application, so the public surface is operational rather than package-oriented:

- Browser pages are represented by \`app/**/page.tsx\`.
- HTTP APIs are represented by exported method handlers in \`app/api/**/route.ts\`.
- Process/runtime entrypoints are \`start.cjs\`, \`server.ts\`, \`scripts/worker.ts\`, \`server/index.ts\`, and \`workers/**\`.
- Module-level exported functions/classes/types are internal application APIs unless exposed through a route, page, or runtime entrypoint.

## Side-effect discipline

Before modifying code, inspect \`.agent/files.json\` and \`.agent/symbols.json\` for side-effect hints. Pay particular attention to:

- database writes, transactions, locks, migrations, and generated SQL fragments
- forecourt/DOMS/JPL socket communication, pump status, tanks, wetstock, and command execution
- fiscalization/proxy requests and invoice/receipt payload mapping
- print queues, ESC/POS rendering, receipt/report workers, and printer connectivity
- runtime workers, heartbeats, supervisor restarts, process lifecycle, and timers
- auth/session/permission/CSRF enforcement on API routes and server actions
- PII redaction, secure artifacts, audit logging, and idempotency keys

## Validation commands

Run the smallest useful command first, then escalate:

1. \`npm run agent:index\`
2. \`npm run test:jpl-protocol\`
3. \`npm run lint\` (note: this repository script currently formats with Prettier)
4. \`npm run server:gen\`
5. \`npm run build\`
6. Targeted \`node --test\` / \`tsx --test\` tests under \`tests/**\` when touching runtime, fiscalization, tank, or supervisor code

## Adding or changing an API route

1. Locate the route in \`.agent/public-api.json\` or under \`app/api/**/route.ts\`.
2. Keep parsing, auth, CSRF, and response/error shaping consistent with nearby route handlers and \`src/platform/web/api/**\` helpers.
3. Put business behavior in the appropriate \`src/modules/<feature>/application\` service.
4. Add or update tests for non-trivial validation, persistence, fiscalization, DOMS/JPL, or supervisor behavior.
5. Regenerate \`.agent\` metadata.

## Adding or changing a feature module

1. Choose or create \`src/modules/<feature>\` with application, domain, infrastructure, presentation, and client layers as needed.
2. Keep database code in infrastructure and expose use cases through application services.
3. Share only stable cross-module abstractions through \`src/shared/**\`.
4. Add UI under \`components/<feature>\` and route composition under \`app/**\`.
5. Wire routes through \`app/api/**\` only after auth/permission requirements are clear.

## Adding or changing workers

- Keep workers idempotent and restart-safe.
- Ensure polling intervals, heartbeat writes, leases, locks, and queue retries have bounded failure behavior.
- Keep process shutdown and error paths explicit.
- Avoid importing browser-only modules from worker entrypoints.
- Add focused tests around queue selection, retry policy, idempotency, and failure handling.

## Metadata files

- \`manifest.json\`: high-level project manifest, package details, architecture summary, entrypoints, route counts, and validation commands.
- \`files.json\`: file inventory with purpose, imports, exports, route data, related tests, and side-effect hints.
- \`symbols.json\`: exported symbols with declarations, public-surface flags, members, and side-effect hints.
- \`imports.json\`: local and external import graph with reverse dependencies and dependency cycles.
- \`public-api.json\`: operational public surface map for pages, API routes, runtime entrypoints, and public exports.
- \`tasks.json\`: safe workflows for future agents.
`
}

function taskGuide(pkg: PackageJson): Record<string, unknown> {
  return {
    generatedFor: pkg.name || 'vpos-ftc-app',
    validationCommands: [
      {
        command: 'npm run agent:index',
        purpose:
          'Regenerate machine-readable and human-readable agent metadata.',
      },
      {
        command: 'npm run test:jpl-protocol',
        purpose: 'Run the existing JPL protocol-focused runtime test.',
      },
      {
        command: 'npm run lint',
        purpose:
          'Run the repository formatting/lint script. Currently this runs Prettier over the tree.',
      },
      {
        command: 'npm run server:gen',
        purpose: 'Regenerate the bundled Node server entrypoint.',
      },
      {
        command: 'npm run build',
        purpose: 'Build the Next.js application and bundled server artifact.',
      },
    ],
    workflows: [
      {
        id: 'add-api-route',
        title: 'Add or modify a Next.js API route',
        safeSteps: [
          'Find the owning feature module under src/modules or create one if the behavior is new.',
          'Keep route.ts focused on auth/CSRF/validation/request-response shaping and delegate business logic to an application service.',
          'Use shared API helpers from src/platform/web/api or nearby route conventions for errors and responses.',
          'Add tests for validation, persistence, fiscalization, DOMS/JPL, or supervisor side effects.',
          'Regenerate .agent metadata and inspect .agent/public-api.json for the new route.',
        ],
        highRiskFiles: [
          'app/api/**/route.ts',
          'src/platform/web/api/**',
          'src/platform/auth/**',
          'src/platform/security/**',
        ],
      },
      {
        id: 'change-forecourt-integration',
        title: 'Change DOMS/JPL forecourt integration behavior',
        safeSteps: [
          'Inspect src/modules/forecourt, src/shared/forecourt, and src/platform/integrations/jpl together before changing behavior.',
          'Preserve connection lifecycle, retry, reconciliation, pump/tank state normalization, and correlation/error diagnostics.',
          'Keep settings/config changes aligned with setup/admin config screens and API routes.',
          'Add or update protocol/runtime tests under tests/runtime or focused root tests.',
          'Run npm run test:jpl-protocol and regenerate .agent metadata.',
        ],
        highRiskFiles: [
          'src/modules/forecourt/**',
          'src/shared/forecourt/**',
          'src/platform/integrations/jpl/**',
          'app/api/admin/forecourt/**',
          'app/api/pos/doms/**',
        ],
      },
      {
        id: 'change-fiscalization-or-proxy',
        title:
          'Change fiscalization, TRA/EWURA, proxy, or invoice payload behavior',
        safeSteps: [
          'Trace from app/api/transactions/** or runtime fiscal inbox routes into src/modules/runtime, src/shared/fiscalization, and proxy settings.',
          'Preserve idempotency, retry semantics, request/response auditability, and PII redaction.',
          'Avoid logging secrets, raw fiscal credentials, or customer PII.',
          'Add tests under tests/fiscalization-proxy or transaction-focused tests for mapper and payload accuracy.',
        ],
        highRiskFiles: [
          'src/shared/fiscalization/**',
          'src/modules/runtime/**',
          'src/modules/transactions/**',
          'app/api/runtime/fiscal/**',
          'app/api/transactions/**',
        ],
      },
      {
        id: 'change-database-code',
        title: 'Change persistence, SQL, migrations, or repositories',
        safeSteps: [
          'Identify whether the code uses PostgreSQL or Azure SQL before changing query syntax.',
          'Keep SQL fragments and repository code in infrastructure/platform db layers.',
          'Wrap multi-step writes in existing transaction helpers where possible.',
          'Account for station scoping, idempotency, locking, retry behavior, and migration order.',
          'Add focused tests for query builders/repositories when practical.',
        ],
        highRiskFiles: [
          'src/platform/db/**',
          'src/modules/**/infrastructure/**',
          'scripts/migrations/**',
          'src/platform/bootstrap/postgres-migrations.ts',
        ],
      },
      {
        id: 'change-worker-or-supervisor',
        title:
          'Change workers, process supervision, queues, or runtime lifecycle',
        safeSteps: [
          'Trace runtime entrypoints through scripts/worker.ts, workers/**, src/platform/runtime, and src/modules/supervisor.',
          'Keep workers restart-safe, bounded by polling intervals, and explicit about shutdown/error handling.',
          'Preserve heartbeat, queue retry, lease/lock, and process alias semantics.',
          'Run supervisor/runtime focused tests and regenerate metadata.',
        ],
        highRiskFiles: [
          'scripts/worker.ts',
          'workers/**',
          'src/platform/runtime/**',
          'src/modules/supervisor/**',
          'src/modules/runtime/**',
        ],
      },
      {
        id: 'change-ui-page',
        title: 'Change an App Router page or React component',
        safeSteps: [
          'Start from the route page in app/**/page.tsx and identify the composed components under components/**.',
          'Keep server/client boundaries explicit. Do not import server-only modules into client components.',
          'Use existing UI primitives under components/ui and feature-specific patterns under neighboring components.',
          'Route mutations through API routes or server actions with existing auth/CSRF conventions.',
        ],
        highRiskFiles: [
          'app/**/page.tsx',
          'components/**',
          'src/shared/api/**',
          'src/shared/hooks/**',
        ],
      },
    ],
  }
}

function main(): void {
  const generatedAt = new Date().toISOString()
  const pkg = readJson<PackageJson>('package.json', {})
  const tsconfig = readJson<Record<string, unknown>>('tsconfig.json', {})
  const allFilesAbs = walk(ROOT)
  const allRelativeFiles = allFilesAbs.map(rel)
  const knownFiles = new Set(allRelativeFiles)

  const sourceFiles = new Map<string, ts.SourceFile>()
  const allEdges: ImportEdge[] = []
  const exportNamesByFile = new Map<string, string[]>()
  const exportItemsByFile = new Map<string, ExportItem[]>()
  const httpMethodsByFile = new Map<string, string[]>()

  for (const absolutePath of allFilesAbs) {
    const relativePath = rel(absolutePath)
    const content = readTextIfSafe(absolutePath)
    if (/\.(tsx?|jsx?|cjs|mjs|js)$/.test(relativePath)) {
      const scriptKind =
        relativePath.endsWith('.tsx') || relativePath.endsWith('.jsx')
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS
      const sourceFile = ts.createSourceFile(
        relativePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind,
      )
      sourceFiles.set(relativePath, sourceFile)
      allEdges.push(...collectImports(sourceFile, relativePath, knownFiles))
      exportNamesByFile.set(relativePath, collectExportNames(sourceFile))
      exportItemsByFile.set(
        relativePath,
        collectLocalExportItems(sourceFile, relativePath, knownFiles),
      )
      httpMethodsByFile.set(relativePath, exportedHttpMethods(sourceFile))
    } else {
      exportNamesByFile.set(relativePath, [])
      exportItemsByFile.set(relativePath, [])
      httpMethodsByFile.set(relativePath, [])
    }
  }

  const publicFiles = new Set(allRelativeFiles.filter(isPublicFile))
  const publicSymbolKeys = new Set<string>()
  for (const file of publicFiles) {
    for (const name of exportNamesByFile.get(file) || [])
      publicSymbolKeys.add(`${file}#${name}`)
  }

  const symbols: SymbolRecord[] = []
  for (const [relativePath, sourceFile] of sourceFiles)
    symbols.push(
      ...collectSymbols(
        sourceFile,
        relativePath,
        publicFiles,
        publicSymbolKeys,
      ),
    )
  symbols.sort(
    (a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name),
  )

  const files: FileRecord[] = allFilesAbs.map((absolutePath) => {
    const relativePath = rel(absolutePath)
    const content = readTextIfSafe(absolutePath)
    const imports = allEdges
      .filter((edge) => edge.from === relativePath)
      .map((edge) => edge.to)
      .sort()
    const route = routeFromAppPath(relativePath)
    const routeType = routeTypeFor(relativePath)
    const isRoute = !!route && !!routeType
    return {
      path: relativePath,
      kind: kindFor(relativePath),
      language: languageFor(absolutePath),
      sizeBytes: fs.statSync(absolutePath).size,
      lines: countLines(content),
      purpose: inferPurpose(relativePath, content),
      exports: exportNamesByFile.get(relativePath) || [],
      imports,
      sideEffects: sideEffectsFromText(content),
      isEntrypoint: isPublicFile(relativePath),
      isRoute,
      route,
      routeType,
      httpMethods: httpMethodsByFile.get(relativePath) || [],
      isTest:
        relativePath.startsWith('tests/') ||
        relativePath.endsWith('.test.ts') ||
        relativePath.endsWith('.test.tsx'),
      isRuntimeAsset: RUNTIME_ASSET_PREFIXES.some((prefix) =>
        relativePath.startsWith(prefix),
      ),
      relatedTests: relatedTestsFor(relativePath, allRelativeFiles),
    }
  })

  const reverseDependencies: Record<string, string[]> = {}
  for (const edge of allEdges) {
    if (!edge.resolvedPath) continue
    reverseDependencies[edge.resolvedPath] =
      reverseDependencies[edge.resolvedPath] || []
    reverseDependencies[edge.resolvedPath].push(edge.from)
  }
  for (const key of Object.keys(reverseDependencies))
    reverseDependencies[key].sort()

  const externalDependencies = Array.from(
    new Set(
      allEdges.filter((edge) => edge.external).map((edge) => edge.specifier),
    ),
  ).sort()
  const localEdges = allEdges.filter((edge) => !!edge.resolvedPath).length
  const externalEdges = allEdges.filter((edge) => edge.external).length
  const publicApi = publicApiRecords(files, symbols)
  const publicSymbols = symbols.filter((symbol) => symbol.publicApi)
  const exportedInternalSymbols = symbols.filter(
    (symbol) => symbol.exported && !symbol.publicApi,
  )
  const apiRoutes = files.filter((file) => file.routeType === 'api-route')
  const pages = files.filter((file) => file.routeType === 'page')
  const moduleNames = Array.from(
    new Set(files.map((file) => moduleName(file.path)).filter(Boolean)),
  ).sort()

  const manifest = {
    schemaVersion: 1,
    generatedAt,
    project: {
      name: pkg.name,
      version: pkg.version,
      private: pkg.private,
      description:
        pkg.description ||
        'Next.js and Node.js VPOS FTC station operations console for forecourt, fiscalization, reporting, setup, and runtime supervision.',
      runtime: 'Node.js + Next.js App Router',
      language: 'TypeScript',
      moduleSystem:
        (tsconfig.compilerOptions as Record<string, unknown> | undefined)
          ?.module || 'esnext',
      nodeEngine: pkg.engines?.node,
    },
    package: {
      main: pkg.main,
      scripts: pkg.scripts,
      dependencies: pkg.dependencies,
      devDependencies: pkg.devDependencies,
      overrides: pkg.overrides,
    },
    entrypoints: {
      webServer: ['start.cjs', 'server.ts', 'vpos-server.cjs'].filter((file) =>
        fs.existsSync(path.join(ROOT, file)),
      ),
      nextApp: ['app/layout.tsx', 'app/page.tsx', 'app/api/**/route.ts'],
      instrumentation: ['instrumentation.ts', 'proxy.ts'].filter((file) =>
        fs.existsSync(path.join(ROOT, file)),
      ),
      workerRuntime: [
        'scripts/worker.ts',
        ...allRelativeFiles.filter(
          (file) =>
            file.startsWith('workers/') && /\.(ts|tsx|js|cjs)$/.test(file),
        ),
      ],
      forecourtServer: ['server/index.ts', 'server/forecourtWs.ts'].filter(
        (file) => fs.existsSync(path.join(ROOT, file)),
      ),
    },
    architecture: {
      appType:
        'Private station operations web application with background runtime workers',
      directories: [
        {
          path: 'app',
          purpose:
            'Next.js App Router pages, layouts, API routes, setup flow, and route boundaries.',
        },
        {
          path: 'components',
          purpose:
            'React UI components, feature screens, reusable primitives, and page clients.',
        },
        {
          path: 'src/modules',
          purpose:
            'Business feature modules grouped by application/domain/infrastructure/presentation/client layers.',
        },
        {
          path: 'src/platform',
          purpose:
            'Auth, bootstrap, config, database, integrations, runtime, security, observability, queues, and web API infrastructure.',
        },
        {
          path: 'src/shared',
          purpose:
            'Shared facades, adapters, utilities, validations, hooks, and cross-feature types.',
        },
        {
          path: 'server',
          purpose: 'Forecourt websocket and standalone server support.',
        },
        {
          path: 'scripts',
          purpose:
            'Operational scripts, diagnostics, worker launcher, migrations, and generated metadata script.',
        },
        {
          path: 'workers',
          purpose: 'Dedicated background worker entrypoints.',
        },
        {
          path: 'tests',
          purpose:
            'Focused node:test suites for runtime, protocol, fiscalization proxy, tank-level, and supervisor behavior.',
        },
        {
          path: 'public',
          purpose:
            'Static assets, PWA manifest/service worker, and public certificate assets.',
        },
        {
          path: 'docs',
          purpose: 'Architecture and implementation documentation.',
        },
      ],
      modules: moduleNames,
      highRiskDomains: [
        'DOMS/JPL forecourt',
        'fiscalization/proxy',
        'transactions',
        'printing',
        'database persistence',
        'runtime workers',
        'process supervisor',
        'auth/security',
      ],
    },
    counts: {
      files: files.length,
      sourceFiles: files.filter((file) =>
        [
          'typescript',
          'typescript-react',
          'javascript',
          'javascript-react',
        ].includes(file.language),
      ).length,
      apiRoutes: apiRoutes.length,
      pages: pages.length,
      tests: files.filter((file) => file.isTest).length,
      documentationFiles: files.filter(
        (file) => file.kind === 'documentation' || file.language === 'markdown',
      ).length,
      exportedSymbols: symbols.filter((symbol) => symbol.exported).length,
      publicSymbols: publicSymbols.length,
      publicApiRecords: publicApi.length,
      importEdges: allEdges.length,
      localImportEdges: localEdges,
      externalImportEdges: externalEdges,
    },
    validation: {
      install: 'npm ci',
      metadata: 'npm run agent:index',
      protocolTest: 'npm run test:jpl-protocol',
      formatOrLint: 'npm run lint',
      serverBundle: 'npm run server:gen',
      build: 'npm run build',
      caveats: [
        'Package installation may require access to the configured Gilbarco AFS npm registry if dependencies are not already cached.',
        'The repository script named lint currently runs Prettier with --write, so expect formatting changes.',
        'vpos-server.cjs is generated by npm run server:gen and may be stale if source changed without rebuilding.',
      ],
    },
  }

  const importsJson = {
    schemaVersion: 1,
    generatedAt,
    summary: {
      filesWithImports: Array.from(new Set(allEdges.map((edge) => edge.from)))
        .length,
      totalEdges: allEdges.length,
      localEdges,
      externalEdges,
      externalDependencies,
    },
    edges: allEdges.sort(
      (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    ),
    reverseDependencies,
    cycles: dependencyCycles(allEdges),
  }

  const publicApiJson = {
    schemaVersion: 1,
    generatedAt,
    package: {
      name: pkg.name,
      version: pkg.version,
      main: pkg.main,
      private: pkg.private,
    },
    summary: {
      apiRoutes: apiRoutes.length,
      pages: pages.length,
      layouts: files.filter((file) => file.routeType === 'layout').length,
      runtimeEntrypoints: publicApi.filter(
        (record) => record.type === 'runtime-entrypoint',
      ).length,
      publicSymbols: publicSymbols.length,
    },
    apiRoutes: apiRoutes.map((file) => ({
      route: file.route,
      methods: file.httpMethods,
      file: file.path,
      purpose: file.purpose,
      sideEffects: file.sideEffects,
    })),
    pages: pages.map((file) => ({
      route: file.route,
      file: file.path,
      purpose: file.purpose,
    })),
    runtimeEntrypoints: publicApi.filter(
      (record) => record.type === 'runtime-entrypoint',
    ),
    exportedPublicSymbols: publicSymbols,
    internalExports: exportedInternalSymbols.map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      file: symbol.file,
      reason:
        'Exported from a source module but not part of an operational route/page/runtime public surface.',
    })),
    allPublicRecords: publicApi,
    guidance: [
      'Treat app/api/**/route.ts as the HTTP API contract and keep route handlers thin.',
      'Treat app/**/page.tsx and components/** as the user-visible UI surface.',
      'Treat start.cjs, server.ts, scripts/worker.ts, server/index.ts, and workers/** as process entrypoints with operational side effects.',
      'Regenerate this file after adding routes, pages, worker entrypoints, or exported route/runtime symbols.',
    ],
  }

  fs.mkdirSync(AGENT_DIR, { recursive: true })
  writeJson('.agent/manifest.json', manifest)
  writeJson('.agent/files.json', { schemaVersion: 1, generatedAt, files })
  writeJson('.agent/symbols.json', { schemaVersion: 1, generatedAt, symbols })
  writeJson('.agent/imports.json', importsJson)
  writeJson('.agent/public-api.json', publicApiJson)
  writeJson('.agent/tasks.json', taskGuide(pkg))
  fs.writeFileSync(
    path.join(AGENT_DIR, 'conventions.md'),
    markdownConventions(pkg, generatedAt),
  )

  console.log(
    `Generated .agent metadata for ${files.length} files, ${symbols.length} symbols, ${allEdges.length} import edges, ${apiRoutes.length} API routes, and ${pages.length} pages.`,
  )
}

main()
