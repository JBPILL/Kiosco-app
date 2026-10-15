---
name: kiosk-react-review
description: Review a KioskoPOS React or TypeScript change for hooks, async behavior, rendering, types, accessibility, errors, and maintainability. Use when the component or state change warrants a focused review.
---

# KioskoPOS React and TypeScript Review

Use when a change to React components, hooks, or TypeScript state and API contracts has enough behavior or complexity to benefit from review. This review is selective, not a required step for every edit.

## Review checklist

- **Hooks:** Hooks run unconditionally at component top level; dependency arrays include reactive values; effects clean up subscriptions, timers, and async work where needed.
- **State and closures:** Event handlers use current state; shared Zustand actions do not cause unintended resets; updates are immutable; derived values are not stored redundantly without a reason.
- **Rendering:** Identify avoidable repeated work or renders that matter to the changed path. Avoid speculative memoization.
- **Types:** Public props and functions are explicit; `unknown` is narrowed; nullability and optional data are handled; casts do not bypass meaningful checks.
- **Async behavior:** Promises are handled; loading, cancellation, duplicate actions, and partial errors have deliberate behavior; stale results cannot overwrite newer state where relevant.
- **Accessibility:** Controls have labels and usable keyboard/focus behavior; status and errors are understandable without relying on color alone.
- **Error behavior:** Failures reach an appropriate UI or caller; fallbacks do not silently hide data-consistency problems.
- **Maintainability:** The change follows existing project patterns and stays cohesive without unnecessary abstractions or unrelated refactors.

## Output

Report only actionable findings, ordered by impact, with file/line, behavior and a specific recommendation. Separate confirmed defects from suggestions. If no issue is found, say what areas were reviewed. Do not request blanket linting or tests unless they are relevant to the change.