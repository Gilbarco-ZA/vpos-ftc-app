// scripts/trace-net.cjs
"use strict";

const net = require("net");
const tls = require("tls");

function stackHere() {
  const e = new Error("connect callsite");
  // Remove this function + tracer frames, keep the app frames
  return (e.stack || "")
    .split("\n")
    .filter((l) => !l.includes("scripts/trace-net.cjs"))
    .slice(0, 12)
    .join("\n");
}

function fmtOpts(opts) {
  if (!opts) return {};
  if (typeof opts === "number") return { port: opts };
  if (typeof opts === "string") return { path: opts };
  const { host, hostname, port, path, servername } = opts;
  return { host, hostname, port, path, servername };
}

function patchConnect(mod, fnName) {
  const orig = mod[fnName];
  mod[fnName] = function (...args) {
    try {
      const a0 = args[0];
      const a1 = args[1];
      const opts =
        typeof a0 === "object" && a0 !== null ? a0 :
        typeof a0 === "number" ? { port: a0, host: typeof a1 === "string" ? a1 : undefined } :
        typeof a0 === "string" ? { host: a0, port: typeof a1 === "number" ? a1 : undefined } :
        null;

      const h = (opts && (opts.host || opts.hostname)) || "127.0.0.1";
      const p = opts && (opts.port || opts.path);

      // Only spam when it's localhost-ish
      if (h === "127.0.0.1" || h === "localhost" || h === "::1") {
        console.error(`[trace-net] ${fnName} raw args=`, args);
				console.error(`[trace-net] ${fnName} ->`, fmtOpts(opts));
				console.error(stackHere());
      }
    } catch (_) {
      // never break prod
    }
    return orig.apply(this, args);
  };
}

patchConnect(net, "connect");
patchConnect(net, "createConnection");
patchConnect(tls, "connect");

console.error("[trace-net] enabled");