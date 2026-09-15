# Production Support Screenshot Guide

**Audience:** On-site support technicians, commissioning engineers, and technical support  
**Purpose:** Placeholder and capture specification for screenshots used alongside the production installation and debugging runbooks.

Use this page until approved screenshots are captured. Store final images under `docs/images/support/` and replace each placeholder with the corresponding Markdown image.

Follow the redaction and capture rules in [Documentation Screenshot Assets](../images/README.md). Never create a production fault, price change, dispenser action, or fiscal event only to obtain a screenshot.

## 1. Startup status

> **Screenshot placeholder — `support-startup-status.png`**  
> Capture `/api/startup/status` or the supported startup-status UI showing the startup phase and a clear ready/degraded state. Keep the timestamp/context visible. Redact station/internal infrastructure identifiers where required.

Use with:

- [Production Installation — Observe first boot](production-installation.md#7-observe-first-boot)
- [Production Debugging — Startup is degraded or never reaches ready](production-debugging.md#4-startup-is-degraded-or-never-reaches-ready)

## 2. Readiness and health

> **Screenshot placeholder — `support-readiness-health.png`**  
> Capture readiness/health output with component names and states visible, including database, JPL/integrations, proxy fiscalization, printer, and workers where configured. Do not expose raw connection strings, credentials, or tokens.

Use with:

- [Production Installation — Health checks](production-installation.md#8-health-checks)
- [Production Debugging — First five minutes](production-debugging.md#1-first-five-minutes)

## 3. Forecourt Monitor

> **Screenshot placeholder — `support-forecourt-monitor.png`**  
> Capture the administrator Forecourt Monitor showing JPL/session state and enough pump/forecourt context to identify whether connectivity is stable or reconnecting. Use a safe demonstration state; do not induce a live outage.

Use with:

- [Production Installation — Forecourt/JPL verification](production-installation.md#9-forecourtjpl-verification)
- [Production Debugging — DOMS/JPL or station-wide pump failure](production-debugging.md#6-domsjpl-or-station-wide-pump-failure)

## 4. Diagnostics

> **Screenshot placeholder — `support-diagnostics.png`**  
> Capture the Diagnostics view with the relevant component state, timestamp, device/transaction reference, and visible error/request reference in frame. Redact customer information, credentials, secret configuration, and unnecessary infrastructure details.

Use with:

- [Production Debugging](production-debugging.md)
- [Forecourt recovery](forecourt-recovery.md)

## 5. Print Jobs

> **Screenshot placeholder — `support-print-jobs.png`**  
> Capture the Print Jobs view showing an example job state such as queued, processing, failed, or completed, with transaction/receipt reference and timestamp context. Use synthetic/redacted identifiers.

Use with:

- [Production Debugging — Receipt or printing failure](production-debugging.md#9-receipt-or-printing-failure)
- [Production Installation — Controlled production acceptance](production-installation.md#11-controlled-production-acceptance)

## 6. JPL setup

> **Screenshot placeholder — `support-setup-jpl.png`**  
> Capture the JPL/forecourt connection setup screen with host, port, POS ID, operation mode, and TLS controls visible. All production hostnames/IPs, certificate paths, and credentials must be synthetic or redacted unless explicitly approved for internal documentation.

Use with:

- [Production Installation — Forecourt/JPL verification](production-installation.md#9-forecourtjpl-verification)
- [Technician Setup Guide](../manuals/TECHNICIAN_SETUP_GUIDE.md)

## 7. Configuration reconciliation

> **Screenshot placeholder — `support-reconciliation.png`**  
> Capture the configuration reconciliation result showing matched and mismatched VPOS/PSS values clearly enough for a technician to understand the comparison. Use a safe example and redact site-specific infrastructure identifiers.

Use with:

- [Production Installation — Forecourt/JPL verification](production-installation.md#9-forecourtjpl-verification)
- [Commissioning](commissioning.md)

## 8. Capture checklist

| Screenshot | Purpose | Status |
| --- | --- | --- |
| `support-startup-status.png` | startup/degraded-state diagnosis | ☐ |
| `support-readiness-health.png` | component readiness/health | ☐ |
| `support-forecourt-monitor.png` | JPL/session and forecourt state | ☐ |
| `support-diagnostics.png` | detailed support evidence | ☐ |
| `support-print-jobs.png` | printer/queue troubleshooting | ☐ |
| `support-setup-jpl.png` | JPL configuration training | ☐ |
| `support-reconciliation.png` | VPOS/PSS comparison | ☐ |

Once an image is approved, replace the placeholder with a normal Markdown image reference, for example:

```markdown
![Forecourt Monitor showing stable JPL session](../images/support/support-forecourt-monitor.png)
```

Keep a short caption explaining what the technician should look for rather than relying on the screenshot alone.
