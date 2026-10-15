---
name: kiosk-security-review
description: Review KioskoPOS React, Vite, and Supabase changes that handle secrets, user input, data access, authentication, or sensitive operations for security risks.
---

# KioskoPOS Security Review

Use for changes involving credentials, external or user-controlled input, Supabase access, authentication or authorization, customer or sales data, payments, or other sensitive operations. Assess the real browser-to-Supabase trust boundary and existing project configuration.

## Review checklist

- **Secrets and configuration:** No service-role keys, private credentials, or tokens are committed or shipped to browser code. Vite variables exposed to the client are public; a public Supabase key must rely on appropriate database policies and permissions.
- **Input and output:** Validate and constrain untrusted values at relevant boundaries. Check rendering and URL use for injection or unsafe HTML; rely on React escaping unless code bypasses it.
- **Supabase access:** Inspect the actual query/write path and database policies where available. Client-side checks are not authorization. Verify operations cannot access or alter another user's or store's data contrary to the intended access model.
- **Authentication and authorization:** Follow the implemented session and role model, if present. Check sensitive actions at the enforcement boundary and avoid assuming a hidden UI control provides protection.
- **Sensitive data:** Limit exposure in UI, logs, errors, browser storage, and returned columns. Consider customer debt, sales, and cash data in context.
- **Sensitive operations:** Check permissions and validation for sale annulments, cash movements, stock changes, credit balances, and invoicing flows affected by the change.
- **Failure behavior:** Errors should not disclose credentials or sensitive records, and security checks should fail closed where access is being decided.

## Output

Report concrete findings with location, attacker or misuse precondition, impact, and a focused remediation. Distinguish verified issues from configuration questions. Do not add backend-only controls or dependencies to a client app without evidence they fit the existing architecture.