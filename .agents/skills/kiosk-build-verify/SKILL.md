---
name: kiosk-build-verify
description: Verify KioskoPOS React, Vite, and TypeScript changes with the repository build and focused checks. Use after implementation when build validation is in scope or requested.
---

# KioskoPOS Build Verification

Use this for changes to this React 19, Vite, and TypeScript 5 application. Keep checks tied to the files and behavior changed; do not assume a different bundler or prescribe a global test-coverage threshold.

## Required build

Run the project build:

```sh
rtk npm run build
```

This invokes the repository's `npm run build` through RTK, as required by project shell guidance. If RTK is unavailable or its output is insufficient to diagnose a result, use the documented project fallback (`rtk proxy npm run build`) and report which command was run. Do not claim success unless the command exits successfully.

## Verification steps

1. Read the relevant project instructions and identify the changed stack and user-visible behavior.
2. Run the required build after implementation.
3. Run focused tests or checks for the changed behavior when they exist and are in scope. Do not add a universal coverage target or require TDD for every change.
4. Review diagnostics and the final diff. If a check fails, report the exact failure and distinguish it from unrelated existing issues.
5. For POS or stock changes, verify the related flow paths and reversals identified in `AGENTS.md`; a successful build alone does not establish business correctness.

## Build failure handling

- Identify whether the error is TypeScript, React/JSX, Vite configuration, dependency, or another layer before editing.
- Make one focused correction at a time and rerun the build to confirm the result.
- Preserve type checking and existing architecture. Do not change bundlers, add dependencies, or suppress errors without evidence that the change requires it.
- Report unresolved errors and any validation you could not run. Never imply that tests, a build, or runtime behavior were verified when they were not.