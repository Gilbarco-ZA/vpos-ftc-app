# DOMS TODO progress report generator

`scripts/update-doms-todo-progress.js` rebuilds the generated header in `DOMS_INTEGRATION_TODO.md` from the checklist sections in the same file.

Run it from the repository root:

```bash
npm run update-todo
```

You can also point it at a temporary or copied checklist file:

```bash
node scripts/update-doms-todo-progress.js ./DOMS_INTEGRATION_TODO.md
```

## Generated report behavior

The generated header now includes stable markers:

- `<!-- doms-todo-progress:start -->`
- `<!-- doms-todo-progress:end -->`

Those markers make repeated runs idempotent. The script replaces only the generated progress report and leaves the manually maintained checklist content below the first separator intact.

Each per-section progress row links directly to the applicable `##` section lower in the same report. Example:

```md
| **[15) Testing and validation](#15-testing-and-validation)** | 16 | 27 | ... |
```

This makes the progress table usable as a navigation index during review sessions.

## Anchor rules

The script derives GitHub-style anchors from each `##` heading by:

1. lowercasing the heading;
2. removing Markdown punctuation and slash characters;
3. converting `&` to `and`;
4. removing unsupported punctuation;
5. replacing whitespace with hyphens;
6. adding numeric suffixes for duplicate headings.

The anchor generation is exported as `markdownAnchor()` for focused tests and future tooling.

## Cleanup of older generated headers

Older script versions could leave repeated `Last updated` lines because the timestamp was written after the report separator. The current script removes stale progress headers and leading duplicate timestamp leftovers before writing the new marker-based block.

## Test coverage

The focused test file is:

```text
tests/runtime/domsTodoProgressReport.test.ts
```

It covers linked progress rows, idempotent header replacement, duplicate timestamp cleanup, direct file updates, and anchor generation.
