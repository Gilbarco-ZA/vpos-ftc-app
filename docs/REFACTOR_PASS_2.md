# Refactor Pass 2

## Objective

Complete the hard page boundary cleanup and centralize application bootstrap routing behind HTTP APIs.

## Changed routes

- `/`
- `/login`
- `/setup`
- `/api/bootstrap/status`
- `/admin/forecourt` type dependency only

## Behavioral preservation

- Unregistered devices still route to setup.
- Registered devices with an active user still route away from setup.
- Login remains unavailable until setup has an active user.
- Authenticated root requests still route to the dashboard.
- Unauthenticated root requests still route to login.
- The setup wizard retains proxy URL, reachability, registration status, and initial proxy errors.

## Verification

Run:

```bash
npm run lint
npm run check:architecture
npm run test
npm run build
```

Expected architecture output:

```text
Page boundary check passed (0 known violations remaining).
```
