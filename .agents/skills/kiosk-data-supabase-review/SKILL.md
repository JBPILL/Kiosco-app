---
name: kiosk-data-supabase-review
description: Review KioskoPOS data changes involving Supabase, Zustand persistence, localStorage, or database-backed stock for integrity, synchronization, partial failures, concurrency, and security.
---

# KioskoPOS Data and Supabase Review

Use when a change affects Supabase queries or writes, schema/SQL, or data synchronized with Zustand and localStorage. Follow the repository's existing data access patterns; do not introduce a new persistence architecture as part of a review.

## Review checklist

- **Integrity:** Check identifiers, relationships, quantities, monetary values, and assumptions about null or missing rows. Trace the affected data through its consumers.
- **Supabase operations:** Verify selected/updated columns and filters, result and error handling, and whether the operation's authorization assumptions match the actual database configuration.
- **State synchronization:** Follow success and failure paths between Supabase, Zustand, and localStorage. Look for stale cache, optimistic state not reconciled after failure, partial writes, and duplicate operations.
- **Stock consistency:** Trace physical stock and virtual combo availability, plus bottle and deposit effects, across the initiating action and any reversal.
- **Partial failures:** Identify multi-step writes that can leave inconsistent records or UI state. Describe the observed risk; do not assume transaction support where none exists.
- **Concurrency:** Consider duplicate submissions, overlapping updates, or stale reads when those are plausible for the affected operation. Recommend safeguards consistent with existing data mechanisms.
- **Data security:** Check that client-visible queries and writes are restricted by the database's real policies and access model. Avoid treating a browser-side condition as authorization.
- **Efficiency:** Flag concrete repeated queries, excessive payloads, or query patterns that affect this flow; avoid speculative indexing or schema changes.

## Output

Report actionable findings with location, affected records/state, failure scenario, impact, and a focused recommendation. State assumptions that need database or deployment confirmation. Do not prescribe RLS policies, transaction patterns, or schema abstractions without evidence they fit this repository and the specific operation.