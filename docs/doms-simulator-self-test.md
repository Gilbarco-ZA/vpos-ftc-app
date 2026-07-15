# DOMS/JPL simulator self-test

This pass adds a one-command local validation loop for the DOMS/JPL simulator harness.

The previous simulator workflow required two terminals: one to run `npm run doms:jpl-sim`, and one to run `npm run doms:jpl-sim:validate`. The self-test command starts a local simulator, runs the validation runner against the dynamically selected simulator port, stops the simulator, and emits a field-validation evidence payload that can be imported through the existing admin field-validation panel.

## Command

```bash
npm run doms:jpl-sim:selftest -- --scenario full --json-out ./doms-jpl-selftest-report.json --evidence-out ./doms-jpl-selftest-evidence.json
```

The default `--port` is `0`, so the OS chooses an available local port. This avoids conflicts with a real DOMS/PSS controller on `8888` or another simulator already running.

## Output

The full report includes:

- simulator host, port, scenario, start/stop timestamps, and secure-mode flag;
- validation summary and per-step results;
- importable field-validation evidence JSON;
- a safety boundary stating that the self-test only talks to the local simulator.

Use `--evidence-only` to print only the JSON that can be pasted into the admin field-validation evidence import form.

## Scenarios

Supported scenarios match the simulator and validation runner:

- `minimal`
- `readiness`
- `transaction-recovery`
- `wetstock`
- `optional-modules`
- `full`

For normal development passes, use `minimal` for quick bootstrap checks and `full` before handing a package to field testing.

## Safety boundary

This command starts a local simulator process in the same Node runtime and sends JPL requests only to that local simulator. It does not connect to a live DOMS/PSS controller, does not send PSS write commands, does not update FTC mappings, and does not approve any Tanzania fiscalization cutover.

## Build fix in this pass

The previous validation runner exposed a TypeScript `Buffer<ArrayBufferLike>` vs `Buffer<ArrayBuffer>` assignment issue in Next.js builds. The framing helper, simulator server, and validation client now use explicit `Buffer<ArrayBufferLike>` typing for partial-frame buffers and extracted remainders.
