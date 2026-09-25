# KioskoPOS — Operating Manual & Everything Claude Code (ECC) Integration

Welcome to the **KioskoPOS** codebase. This project has been integrated with **Everything Claude Code (ECC)** for Google Antigravity 2.0.

---

## 1. Project Overview & Architecture
* **Stack**: React 19, Vite, TypeScript 5, Tailwind CSS v4, Zustand 5, Supabase (PostgreSQL), Lucide React.
* **Domain**: Comprehensive Point of Sale (POS) system for kiosks, minimarkets, and grocery stores.
* **Key Modules**:
  * `src/pages/POSPage.tsx`: Fast checkout terminal, multi-ticket tabs, barcode scanner, bottle return reception.
  * `src/stores/cartStore.ts`: Multi-tab shopping cart, automated discounts/promotions, empty bottle stock sync.
  * `src/stores/cajaStore.ts`: Cash register shift sessions, blind cash counting (arqueo ciego), income/expense movements.
  * `src/stores/comboStore.ts`: Multi-component product packs, dynamic stock deduction of physical components.
  * `src/stores/envasesStore.ts`: Returnable bottles and deposit management.
  * `src/stores/clienteStore.ts`: Customer directory, credit limits, debt tracking (cuenta corriente / fiado).
  * `src/stores/promocionStore.ts`: Automated volume discounts (NxM, combo discounts, percentage).
  * `src/stores/afipStore.ts`: ARCA (ex-AFIP) electronic invoice generation (Facturas A, B, C, QR, CAE).
  * `src/pages/CatalogoPage.tsx`: Product inventory, batch price increases, shelf barcode labels, category management.
  * `src/pages/ReportesPage.tsx`: Daily balance, accounting ledger, profit margin analytics, sale annulment.

---

## 2. Everything Claude Code (ECC) Ecosystem in Antigravity
The workspace has been customized with the official ECC toolkit installed in `./.agents/`:

### A. Rules (`.agents/rules/`)
Automatically loaded and scoped across the project:
* `typescript-coding-style.md`: Strict TypeScript standards (explicit types for public APIs, no `any`, interfaces for models, type narrowing).
* `common-coding-style.md`: Immutability (no mutation of state/objects), KISS, DRY, YAGNI, file size discipline (<400 lines typical).
* `common-security.md` & `typescript-security.md`: Zero hardcoded credentials, input sanitization, safe API handling.
* `common-testing.md` & `typescript-testing.md`: Test-driven verification, edge case coverage, validation loops.
* `common-development-workflow.md`: Structured development process: Plan -> Test -> Implement -> Review -> Verify.

### B. Specialized Agents (`.agents/agents/`)
Specialized subagents ready for delegation:
* `react-reviewer`: Inspects React hooks dependencies, render performance, memory leaks, accessibility, and JSX safety.
* `typescript-reviewer`: Audits type safety, strict-null checks, async/Promise correctness, and API contracts.
* `planner`: Formulates multi-step architectural implementation plans with risks and dependencies.
* `code-reviewer`: Comprehensive peer review focusing on architecture, edge cases, and code quality.
* `security-reviewer`: Analyzes injection vulnerabilities, data leakage, and authentication boundaries.
* `performance-optimizer`: Detects render bottlenecks, unindexed queries, and excessive re-renders.
* `tdd-guide`: Guides test-driven development cycles (RED -> GREEN -> REFACTOR).

### C. Skills & Workflows (`.agents/skills/` & `.agents/workflows/`)
* `tdd-workflow`: Write tests first, implement, and verify guarantees.
* `verification-loop`: Automated compile checks (`tsc -b && vite build`) and runtime validation.
* `codebase-onboarding`: Quick architectural orientation for new features.
* `architecture-decision-records`: Documenting critical architectural and domain decisions.
* `browser-qa`: End-to-end interface inspection and user flow validation.

---

## 3. Engineering Guidelines for Pair Programming
1. **Zero Regressions**: Any modification must preserve existing functionality and satisfy `npm run build` (`tsc -b && vite build`) with 0 errors.
2. **Atomic State Updates**: State changes in Zustand stores must be immutable and keep Supabase and offline cache (`localStorage`) synchronized.
3. **Physical vs. Virtual Inventory**:
   * Virtual combo products derive their stock from their physical components.
   * Returnable bottles adjust deposit quantities dynamically upon checkout, annulment, or cart modification.
4. **Resilient POS Experience**: Cashiers must never be blocked by network drops or modal crashes. Fallbacks and optimistic updates must always provide clear feedback.
