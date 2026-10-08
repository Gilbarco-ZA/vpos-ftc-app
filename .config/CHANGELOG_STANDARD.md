# VPOS FTC changelog standard

The authoritative release-note files are:

- `.config/changelog.log` — active, unpublished changes only.
- `.config/changelog.archive.log` — published release history, oldest first.

## Release-entry structure

Use plain UTF-8 text (not Markdown headings or JSON). The package manager
concatenates these files into a Software Release Document and does not parse
sections.

```text
VPOS FTC - CURRENT RELEASE CHANGES
==================================
Release: 0.1.45 (unreleased)
Previous published release: 0.1.44 / 47222001t044
Status: Unreleased
Scope: Changes introduced after the previous published release

RELEASE HIGHLIGHTS
------------------
- One customer- or operator-visible outcome per bullet.

DETAILED CHANGES
----------------
Functional area
- Action + affected functionality + effect (commitsha).

RELEASE NOTES
-------------
Operational caveats, compatibility, migration requirements, or limitations.
```

## Editorial rules

1. Lead with 3–6 meaningful highlights, prioritizing user-visible effects.
2. Group changes by domain (fiscalization, forecourt/pricing, reporting,
   receipts/printing, administration, runtime/deployment).
3. Write concise outcomes, not commit titles such as "Update file.ts".
4. Keep original eight-character commit SHAs in parentheses for traceability.
5. Describe only changes since the immediately preceding *published* release.
   Do not regenerate a cumulative "changes since v0.1.0" list.
6. Avoid duplicate features across sections. List related fixes together when
   feasible, keeping relevant commit references.
7. Never invent test outcomes, package dates, compatibility claims, or version
   history that cannot be verified. Mark unknown values as unknown.
8. Preserve historical records. Historical editorial corrections may improve
   legibility but must not remove original commit references.
9. Update the live changelog throughout the release cycle, and review it
   before packaging. The archive is only updated after release publication.

## Tooling compatibility

`mono-package-mgr/builder/config.ts` assembles the archive and current
changelog into the package description. `builder/changelog.ts` appends a
generated DOMS version header followed by the live changelog into the archive
and clears the live file. Therefore:

- Do NOT include a duplicate generated DOMS identifier as a standalone line
  in `changelog.log`; the builder supplies it automatically.
- Do NOT manually move unpublished entries to the archive.
- After publishing, reinitialize the cleared live file for the next release.
- Keep the package ID header lines in the archive unchanged.
- Avoid manually running `fnez-changelog` before the release is published;
  the command commits changes to git.

The archive includes older raw records and the cumulative 0.1.44 baseline.
Future releases must be incremental.
