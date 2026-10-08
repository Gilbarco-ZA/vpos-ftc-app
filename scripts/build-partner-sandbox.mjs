import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const out = path.join(root, 'dist', 'partner-sandbox')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

const copy = (source, target) => {
  fs.copyFileSync(path.join(root, source), path.join(out, target))
}

copy('scripts/partner-api-sandbox.mjs', 'server.mjs')
copy('scripts/partner-api-compat.mjs', 'partner-api-compat.mjs')
copy('scripts/partner-api-swagger.mjs', 'partner-api-swagger.mjs')
copy('docs/partner-api/v1/openapi.yaml', 'openapi.yaml')
copy('docs/partner-api/v1/README.md', 'README.md')

fs.writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: '@gilbarcoafs/vpos-ftc-partner-sandbox',
      version: '1.0.0',
      private: true,
      type: 'module',
      engines: { node: '>=22' },
      scripts: { start: 'node server.mjs' },
    },
    null,
    2,
  ) + '\n',
)

fs.writeFileSync(
  path.join(out, 'Dockerfile'),
  [
    'FROM node:22-alpine',
    'WORKDIR /app',
    'COPY package.json server.mjs partner-api-compat.mjs partner-api-swagger.mjs openapi.yaml README.md ./',
    'ENV VPOS_PARTNER_SANDBOX_HOST=0.0.0.0',
    'ENV VPOS_PARTNER_SANDBOX_PORT=3080',
    'EXPOSE 3080',
    'CMD ["node", "server.mjs"]',
    '',
  ].join('\n'),
)

process.stdout.write(`Partner sandbox bundle created at ${out}\n`)
