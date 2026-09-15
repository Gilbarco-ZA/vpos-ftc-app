# Production Debugging

Production field troubleshooting is maintained in the single field-support manual:

- [VPOS FTC Field Support, Installation & Commissioning Manual](../manuals/TECHNICIAN_SETUP_GUIDE.md)

The supported production troubleshooting model is application-first:

- use VPOS **Diagnostics**, **Device Status**, **Forecourt Monitor**, **Print Jobs**, transaction state, and the applicable configuration screens
- use the approved DOMS package-management interface for package state, restart, upgrade, and rollback
- capture evidence before changing configuration or restarting
- escalate when the required corrective action is not exposed safely through VPOS or the approved DOMS/PSS administration workflow

Do not use SSH, terminal commands, Node/npm scripts, SQL commands, filesystem edits, or `.env` changes as field troubleshooting steps.
