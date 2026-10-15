---
name: kiosk-pos-flow-audit
description: Trace a KioskoPOS user flow end to end across UI handlers, Zustand, business rules, persistence, side effects, stock, and the final visible state. Use for checkout, annulments, cart changes, combos, returnable bottles, cash register, or customer credit changes.
---

# KioskoPOS POS Flow Audit

Use this audit when a business-critical POS flow changes, a cashier reports that an action behaves incorrectly, or multiple state changes may interact. Scope it to the affected flow; do not turn it into an unrelated full application review.

## Trace the flow

Follow the actual implementation in order:

```text
UI / touchpoint
→ handler
→ Zustand action and state transition
→ business rules
→ Supabase and/or localStorage persistence
→ side effects and related stores
→ physical and virtual stock changes
→ final state visible to the cashier
```

1. Identify the user action, expected result, handler, and all functions it calls, in order.
2. Map relevant store actions: state read, fields written, resets, and effects on other stores.
3. Follow asynchronous calls and persistence outcomes. Note partial failure, retries, stale reads, duplicate submissions, and ordering that could change the result.
4. Trace every stock mutation and reversal. Keep physical inventory distinct from virtual combo availability; account for bottle deposits and returns.
5. Check that the final persisted and visible state matches the expected business result, including clear feedback when an operation fails.
6. Review nearby callers when a shared store action changes. Do not assume a successful function call proves the whole user flow is correct.

## Areas requiring special attention

- **Checkout:** cart totals and promotions, payment, sale persistence, cash movements, stock deductions, bottles, and the completed-sale UI.
- **Annulments:** eligibility, original sale data, reversing stock and cash/customer effects, persistence, duplicate annulment, and user feedback.
- **Cart changes:** ticket/tab selection, add/remove/quantity changes, recalculated promotions, and any stock reservation or bottle side effect.
- **Combos:** component quantities and availability, physical component deductions, and consistency when combo configuration changes.
- **Returnable bottles:** receipt, deposits, checkout, cart edits, and annulment; trace both bottle quantities and money.
- **Cash register:** shift state, income/expense movements, opening/closing counts, and the displayed balance.
- **Customer credit:** customer selection, credit-limit checks, debt creation/payment, and the displayed account balance.

## Report findings

For each actionable issue, include the touchpoint and file, the traced call/state sequence, expected versus actual final state, impact, and a focused recommendation. Distinguish confirmed defects from risks or unanswered questions. If no defect is found, state what was traced and any unverified runtime behavior.

Do not change code as part of an audit unless the user also asked for a fix. Do not infer database guarantees or invent transactions that the current implementation does not provide.