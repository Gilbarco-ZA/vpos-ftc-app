const { commonConsumerConfig, PACKAGE_TARGET_DEFAULTS } = require("./consumer-config.cjs")

const main = 'start.cjs'
const name = 'vposftc'
const title = 'PSS 5000 GVR VPOS FTC'
const project = 'gvr-vpos-ftc-app'
const domsAppId = '472-22'
const pid = 'vpos.pid'
const appStartGrep = '[s]tart.cjs'
const healthPorts = '3080'
const healthPaths = '/api/livez'
const healthProbeTimeoutSeconds = '5'
const startupTimeoutSeconds = '180'
const dependencies = '90005102,79961133,46701120'

const startScriptTemplate = 'node-web'
// The pipeline supplies this per package target. The fallback represents the
// local CPB539 Node 22 package-rendering target.
const nodeVersionDir =
  process.env.FNEZ_NODE_VERSION_DIR || PACKAGE_TARGET_DEFAULTS['cpb-539-node22'].nodeVersionDir

const environmentVariables = {
  NODE_ENV: 'production',
  PROD: 'true',
  PORT: '3080',
  HOST: '0.0.0.0',
  NEXT_PUBLIC_BASE_URL: 'http://127.0.0.1:3080',
  POSTGRES_URL: 'postgresql://postgres:postgres@localhost:5432/vpos_ftc',
  DEFAULT_LINKING_WINDOW_SECONDS: '30',
  VPOS_FISCAL_FLOW: 'proxy',
  VPOS_PROXY_URL: 'http://127.0.0.1:5555',
  VPOS_PROXY_BASE_PATH: '/',
  VPOS_PROXY_SENDER_POLL_MS: '1000',
  RUN_PROXY_WORKER: 'true',
  VPOS_VAT_RATE_TZ: '0.18',
  VPOS_VAT_RATE_KE: '0.16',
  VPOS_VAT_RATE_DEFAULT: '0',
  LEGACY_PERM_DIR: '/opt/fccapps/vpos-perm/vposfiscal',
  LEGACY_IMPORT_DIR: '/opt/fccapps/vpos-perm/vposftc/legacy-archive',
  PERM_DIR: '/opt/fccapps/vpos-perm/vposftc',
  FORECOURT_MODE: 'sim_tcp',
  FORECOURT_TCP_HOST: '127.0.0.1',
  FORECOURT_TCP_PORT: '10000',
  PSS_XML_SYNC_ENABLED: 'true',
  PSS_XML_POLL_MS: '2000',
  PSS_XML_IN_PATH: '/tmp/fccapps/pss/config.xml',
  PSS_XML_OUT_PATH: '/tmp/fccapps/pss/peeps/temp/config.xml',
}

const descriptionSml =
  'This application provides the solution for the Virtual POS (VPOS) Engine for the Fiscalization of Fuel station transactions.'

const description = `
  This application provides the solution for the Virtual POS (VPOS) Engine for the Fiscalization of Fuel station transactions.
`

const limitations = `
  None
`

const installGuide = `
  Install the package via the FccWebApp "5.2 Software Update" page.
  Please consult the installation, configuration and user manuals.
`

const installationSteps = [
  {
    title: 'Upgrade process: ',
    steps: [
      "Install the package provided in this email using the FccWebApp '5.2 Software Update' page.",
      'Make sure your DOMS PSS 5000 is connected to the internet.',
      'Make sure your EPSON printer is connected to the same network DOMS PSS 5000.',
    ],
  },
]

const emailListTo = ['bhenning@dearx.co.za']
const emailListCC = ['']


const exclude = [
  'app',
  'components',
  'docs',
  'server',
  'src',
  'tests',
  'types',
  'workers',
  'azure-pipelines.yml',
  'instrumentation.ts',
  'middleware.ts',
  'postcss.config.js',
  'prettier.config.js',
  'server.ts',
  'tailwind.config.js',
  'tsconfig.json',
]

const config = {
  ...commonConsumerConfig(),
  name,
  main,
  title,
  project,
  domsAppId,
  pid,
  appStartGrep,
  healthPorts,
  healthPaths,
  healthProbeTimeoutSeconds,
  startupTimeoutSeconds,
  dependencies,
  description,
  descriptionSml,
  limitations,
  installGuide,
  emailListTo,
  emailListCC,
  environmentVariables,
  startScriptTemplate,
  // Shared package manager emits persist.sh only for the CPB539 Node22
  // Next.js runtime; other package targets are deliberately unaffected.
  enableNodeWebPersistHook:
    process.env.FNEZ_PACKAGE_TARGET_NAME === 'cpb-539-node22',
  // Only the CPB539 Node22 FTC target opts into full package-owned
  // snapshot/application-root removal on explicit uninstall. Customer state
  // under vpos-perm remains out of scope and must not be deleted.
  completeUninstallAppRoot:
    process.env.FNEZ_PACKAGE_TARGET_NAME === 'cpb-539-node22',
  // .env and .env.* are for local development only, never production packages.
  // Production startup receives environment exports from generated start.sh.
  excludeDevelopmentEnvFromPackage: true,
  persistHookPort: 3080,
  nodeVersionDir,
  installationSteps,
  exclude,
}

module.exports = {
  config,
}
