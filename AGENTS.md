# KioskoPOS — Codex Project Instructions

## Project Overview

KioskoPOS is a comprehensive Point of Sale system for kiosks,
minimarkets, and grocery stores.

### Stack

- React 19
- Vite
- TypeScript 5
- Tailwind CSS v4
- Zustand 5
- Supabase / PostgreSQL
- Lucide React

## Key Modules

- `src/pages/POSPage.tsx`
  Fast checkout terminal, multi-ticket tabs, barcode scanner,
  and bottle return reception.

- `src/stores/cartStore.ts`
  Multi-tab shopping cart, automated discounts/promotions,
  and empty bottle stock synchronization.

- `src/stores/cajaStore.ts`
  Cash-register shift sessions, blind cash counting
  (`arqueo ciego`), and income/expense movements.

- `src/stores/comboStore.ts`
  Multi-component product packs and dynamic deduction
  of physical-component stock.

- `src/stores/envasesStore.ts`
  Returnable bottle and deposit management.

- `src/stores/clienteStore.ts`
  Customer directory, credit limits, debt tracking,
  cuenta corriente / fiado.

- `src/stores/promocionStore.ts`
  Automated promotions such as NxM, combo discounts,
  and percentage discounts.

- `src/stores/afipStore.ts`
  ARCA (ex-AFIP) electronic invoicing:
  Facturas A/B/C, QR and CAE.

- `src/pages/CatalogoPage.tsx`
  Inventory management, batch price increases,
  shelf barcode labels and categories.

- `src/pages/ReportesPage.tsx`
  Daily balance, accounting ledger, profit-margin analytics
  and sale annulment.


## Working Method

Before modifying code:

1. Understand the requested behavior.
2. Inspect the relevant implementation.
3. Search for existing patterns before introducing new ones.
4. Identify affected stores, pages, services, persistence
   and tests.
5. Resolve questions from the repository whenever possible.
6. Ask the user only when an unresolved decision could
   materially change the implementation.

Do not begin a large implementation before understanding
its impact on the POS business rules.


## Codex Configuration

Codex is the primary agent environment for this project. `.agents/` contains
only the active KioskoPOS skills and the two active style rules referenced
below. Historical ECC/Antigravity material is kept under `legacy/ecc/`; it is
not active configuration and must not be loaded or executed as instructions.

### KioskoPOS skills

Choose skills according to the work and its risk; do not require every skill
for every task. These are the project's primary skills:

- `.agents/skills/kiosk-pos-flow-audit/SKILL.md` — POS behavior involving
  checkout, stock, cart, cash register, combos, returnable bottles, or customer
  credit/current accounts.
- `.agents/skills/kiosk-build-verify/SKILL.md` — build and React/Vite/TypeScript
  validation for application changes.
- `.agents/skills/kiosk-react-review/SKILL.md` — focused React/TypeScript review
  when the change warrants it.
- `.agents/skills/kiosk-data-supabase-review/SKILL.md` — persistence, Supabase,
  synchronization, or data consistency changes.
- `.agents/skills/kiosk-security-review/SKILL.md` — changes with security
  impact.

### Coding rules

When changing TypeScript or React code, consult as relevant:

- `.agents/rules/typescript-coding-style.md`
- `.agents/rules/common-coding-style.md`

Important principles include:

- strict TypeScript;
- avoid `any`;
- explicit public API types;
- type narrowing;
- immutable updates;
- KISS;
- DRY;
- YAGNI.

### Security

The active security policy is this section together with
`.agents/skills/kiosk-security-review/SKILL.md` for changes with security
impact. In particular:

Never:

- hardcode credentials;
- expose secrets or tokens;
- trust external input without validation;
- weaken security controls only to make code work.

### Testing

- Run related tests when they exist.
- Add or update tests when behavior changes, choosing unit, integration, or
  end-to-end coverage to match the change.
- Run `npm run build` before considering an application change complete.
- TDD is not required for every task, and there is no universal 80% coverage
  requirement.
- Do not invent tests or report checks that were not run.

### Development workflow

For significant changes, use `.agent/PLANS.md`; apply the relevant
KioskoPOS-specific skill above when its scope applies.


## Engineering Rules

### Zero Regressions

Preserve existing functionality and check relevant related flows when changing
application behavior. Follow the testing policy above for validation.


### Zustand State

All Zustand state changes must remain immutable.

When a store persists information to both Supabase and localStorage,
preserve synchronization semantics.

Do not silently modify persistence behavior.


### Inventory Model

Maintain the distinction between physical and virtual inventory.

Virtual combo products derive availability from their physical
components.

Returnable bottles and deposits can affect stock during:

- checkout;
- sale annulment;
- cart changes;
- bottle returns.

Before modifying these flows, trace all related stock mutations.


### POS Resilience

The cashier workflow is business-critical.

Network failures, Supabase errors or UI/modal failures must not
unnecessarily block checkout.

Prefer:

- clear error feedback;
- controlled fallback behavior;
- safe optimistic updates where appropriate.

Never hide data-consistency failures.


## Implementation Rules

- Keep changes small and cohesive.
- Respect the existing architecture.
- Reuse existing abstractions before creating new ones.
- Do not duplicate business logic.
- Avoid unrelated refactors.
- Do not introduce dependencies unnecessarily.
- Preserve public APIs unless the task explicitly requires changing them.
- Handle relevant errors and edge cases.
- Prefer readable and maintainable code over clever solutions.


## Planning Large Changes

For small, localized fixes, work directly.

For significant features, migrations, architectural changes,
cross-store changes or work spanning many files:

1. Inspect the existing implementation.
2. Describe the current situation.
3. Define the problem.
4. Identify affected components.
5. Identify important decisions and risks.
6. Produce a concise implementation plan.
7. Define how the result will be validated.

Use `.agent/PLANS.md` as the source of ExecPlans for complex features,
architectural changes, significant refactors, migrations, multi-store or
multi-module changes, and work expected to span sessions. Small, localized
changes do not require an ExecPlan.


## Architectural Decisions

When a non-trivial architectural or business-domain decision is made,
record it in `DECISIONS.md` if that file exists.

Record:

- context;
- alternatives considered;
- selected decision;
- reason;
- important consequences.

Do not record trivial implementation choices.


## Scope Control

If an unrelated problem is discovered:

- report it;
- do not automatically fix it unless it blocks the requested task.

Do not silently expand the scope of a task.


## Shell Commands / RTK

When using supported shell commands, first consult:

- `RTK.md`
- `docs/rtk-agentes.md`

Use the project's RTK workflow when appropriate.

If RTK cannot provide the necessary full output, use the documented
fallback behavior.


## Completion

Before finishing:

- re-read the original objective;
- verify the requested behavior;
- review the diff;
- run the relevant validations;
- confirm no debug code, temporary files or secrets were introduced.

Then summarize:

1. what changed;
2. important files/components modified;
3. tests/checks executed;
4. their results;
5. remaining risks or limitations.
