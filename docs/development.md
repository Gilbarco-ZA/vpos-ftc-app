# Development

**Type:** authoritative

## Environment

Use Node.js `>=22.15.0 <23` and npm `10.9.2`. Authenticate to the private feed configured in `.npmrc`, then run:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

PostgreSQL is required for normal application behavior. Forecourt, proxy, fiscalization, PSS, printer, and device endpoints are only required for the workflows being exercised.

## Commands

```bash
npm run dev                 # Next.js development server
npm run dev:forecourt       # focused forecourt server
npm run worker              # omnibus worker
npm run build               # Next build plus generated server bundle
npm start                   # production wrapper
```

## Code quality

```bash
npm run format              # modifies files
npm run format:check        # validation only
npm run lint                # ESLint validation only
npm run typecheck
npm run check
```

Commands named `check`, `lint`, and `test` must not modify source files.

## Local HTTPS

Store local certificates under `.certs/`, which is ignored. Set all three values:

```env
VPOS_USE_HTTPS=1
VPOS_HTTPS_KEY_PATH=.certs/localhost-key.pem
VPOS_HTTPS_CERT_PATH=.certs/localhost.pem
```

The server fails fast when HTTPS is enabled without readable paths. It does not silently fall back to HTTP.

## Agent navigation

Use the scoped commands documented in `AGENTS.md`. Regenerate the compact manifest after entrypoint, command, or documentation-map changes:

```bash
npm run agent:manifest
```
