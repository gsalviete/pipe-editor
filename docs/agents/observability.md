# Observability

Local single-user tool: no observability platform. Logging is the console floor
defined in `GUIDELINES.md` § Logging (console.warn / console.error only, failures
only, no user file contents or secrets). The owner declined observability,
feature-flag and latency guideline themes (make-guidelines, 2026-09-22).

```
platform: none
logger: console
conventions: GUIDELINES.md § Logging; user-visible run data lives in RunResult, not logs
```
