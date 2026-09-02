# Production debugging (busybox / no npm)

This repo ships a standalone Node entry (`vpos-server.cjs`). On very minimal systems it can be hard to see why the
process exits.

## Recommended: run with the debug wrapper

```sh
cd /opt/fccapps/vposftc
./scripts/debug-run.sh
```

This will:

- run `node` with `--trace-uncaught --trace-warnings --unhandled-rejections=strict`
- write logs to `./logs/`
- write a heartbeat JSON file (updated periodically)

## If it still "silently exits"

If Node is being killed with `SIGKILL` (OOM killer, watchdog, supervisor), it cannot print a final log line.
The heartbeat file + kernel logs are the best signal:

- `logs/*.heartbeat.json` will stop updating at the time of death
- check `dmesg` / syslog for OOM events (if available)

## Useful one-liners

Dump system/process diagnostics:

```sh
node scripts/diagnose.cjs > diagnose.json
```

Healthcheck the running server:

```sh
PORT=3080 node scripts/healthcheck.cjs
```

## Environment handling

- `.env` is optional and **not** expected to exist in production.
- Set `VPOS_DUMP_ENV=1` to print a redacted env snapshot.
- Set `VPOS_HEARTBEAT_FILE=/tmp/vpos-heartbeat.json` to record liveness.
