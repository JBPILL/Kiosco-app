# ExecPlans

Use an ExecPlan for complex features, architectural changes, significant refactors, migrations, work affecting multiple stores or modules, and tasks expected to span multiple sessions. Small, localized changes do not need an ExecPlan.

An ExecPlan is a living document: create it before implementation, update **Progreso** as work advances, and complete **Resultado final** before closing the work. Keep it in the project documentation/configuration area and link to it from the task when useful.

## Template

```markdown
# <Plan title>

## Objetivo
<Concrete outcome and user-visible behavior.>

## Contexto actual
<Relevant implementation, constraints, and evidence from the repository.>

## Problema
<What is missing, incorrect, or risky today.>

## Alcance
- <Included behavior or components.>

## Fuera de alcance
- <Explicit exclusions.>

## Componentes afectados
- <Pages, stores, services, persistence, database objects, tests, or docs.>

## Dependencias
- <Required components, data, external systems, or prerequisite work.>

## Decisiones importantes
- <Decision, rationale, and alternatives when consequential.>

## Riesgos
- <Business, data, compatibility, regression, rollout, and recovery risks.>
- <Rollback or recovery approach when relevant.>

## Criterios de aceptación
- <Observable outcomes that define completion.>

## Plan de implementación
1. <Small, ordered steps.>

## Validación
- <Relevant tests and checks, including affected business flows and possible regressions.>

## Progreso
- [ ] <Current implementation step.>

## Resultado final
<Completed outcome, validations and results, or remaining work.>
```

## Working rules

### Production Readiness del piloto

Los ExecPlans del repositorio deben vincular los gates aplicables del registro
canónico [Production Readiness](../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026),
PR01–PR11. Incluyen WSAA/WSFE homologación, CAE, idempotencia fiscal, contingencias,
integridad venta-stock-caja, seguridad, backup/restore, recuperación, concurrencia
E2E, transición productiva y piloto comercial. No duplicar esa matriz ni crear
otro plan equivalente; registrar sólo progreso/evidencia/limitaciones del módulo.

Antes de cerrar un ExecPlan o declarar un release listo, comprobar el gate
correspondiente con evidencia del entorno requerido, sin convertir un PASS local,
una simulación o un DIFERIDO en aceptación hospedada/productiva. Conservar
resultados históricos y añadir revisiones fechadas. Los gates no amplían permisos:
respetar autorizaciones para SQL, emisión fiscal, publicación y Production.
Impresora/cajón físicos y Point permanecen diferidos hasta ensayo con cliente por
decisión del titular. Al retomar, continuar por el primer gate pendiente del
registro: PR01 quedó PASS el 20/10/2026; sigue PR02 (CAE), cuya dependencia
PR03 (backend seguro e idempotencia fiscal) debe prepararse antes de emitir.

- Ground the plan in the current repository; do not fill gaps with invented architecture.
- Keep the scope and validation proportional to the change, and follow project instructions such as `AGENTS.md` and `RTK.md`.
- Update the plan when scope, decisions, risks, or implementation progress materially changes.
- Record non-trivial architectural or domain decisions in `DECISIONS.md` when applicable; the plan is not a substitute for that record.
