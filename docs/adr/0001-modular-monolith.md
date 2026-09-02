# ADR 0001: Modular Monolith

**Status:** accepted

VPOS FTC remains a modular monolith with multiple process entrypoints. Feature ownership stays under `src/modules`, while generic runtime and infrastructure concerns stay under `src/platform`.

This preserves transactional and deployment simplicity for station controllers while allowing selected workers to run independently. Service extraction is justified only when process isolation, scaling, or independent deployment provides a measurable operational benefit.
