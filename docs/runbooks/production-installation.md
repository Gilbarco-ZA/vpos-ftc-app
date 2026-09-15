# Production Installation and Upgrade

Production installation and upgrade procedures are maintained in the single field-support manual:

- [VPOS FTC Field Support, Installation & Commissioning Manual](../manuals/TECHNICIAN_SETUP_GUIDE.md)

Production deployment model:

- CPB-579 uses the approved `cpb-579-node22.pkg` package.
- CPB-539 uses the approved `cpb-539-node-22.pkg` package.
- The package is installed on the DOMS using the approved DOMS package-management workflow.
- No SSH, terminal, shell, source checkout, `npm`, SQL, or filesystem access is required or supported for field installation.
- Production `.env` files are not used for field configuration.
- Station-specific adjustments are made through supported VPOS application screens and approved DOMS/PSS tools.

Use the consolidated manual for installation, configuration, commissioning, rollback criteria, troubleshooting, screenshot guidance, and handover sign-off.
