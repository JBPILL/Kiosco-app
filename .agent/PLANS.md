# ExecPlans

Use an ExecPlan for complex features, architectural changes, significant refactors, migrations, work affecting multiple stores or modules, and tasks expected to span multiple sessions. Small, localized changes do not need an ExecPlan.

An ExecPlan is a living document: create it before implementation, update **Progreso** as work advances, and complete **Resultado final** before closing the work. Keep it in the project documentation/configuration area and link to it from the task when useful.

## Objetivo común vigente — cierre del desarrollo y Production Readiness

**Estado de referencia: 24/10/2026.** Este objetivo común gobierna el trabajo de Codex mientras el proyecto siga en la rama/PR activo del piloto y hasta completar la salida productiva. No reemplaza el registro canónico de gates; ordena prioridades para evitar abrir trabajo paralelo que no reduzca riesgo ni cierre aceptación.

Fuentes de verdad:

- `plan_operativo_y_comercial_kioskopos_revision.md` para PR01–PR11 y P01–P24.
- `.agent/execplans/arca-homologation.md` para el circuito fiscal.
- `docs/plan-completar-piloto.md` y ExecPlans específicos para evidencia de cada módulo.
- `DECISIONS.md` para decisiones de arquitectura/dominio ya tomadas.

Estado consolidado que debe respetarse:

- `master` está en `03a798f` y contiene el módulo comercial seguro mergeado mediante PR #2.
- PR #2 está cerrado/mergeado; no reconstruir administración comercial ya aceptada.
- PR #1 (`hardening/next-operational-block`) quedó obsoleto/divergido respecto de `master`; no intentar mergearlo completo. Auditar sólo si alguna pieza concreta no fue absorbida por trabajo posterior y cerrar/superseder cuando corresponda.
- PR #3 (`feat/pilot-envases-returns`) es el bloque activo principal: parte de `master`, sigue en draft y concentra operaciones del piloto, recuperación, backup ampliado y el circuito fiscal privado.
- PR01 está PASS: WSAA real y consulta autenticada `FEParamGetTiposCbte` ya fueron acreditados en homologación.
- PR02 sigue pendiente: primer CAE real de homologación.
- PR03–PR09 están parciales: existe mucha implementación local, pero falta aceptación hospedada/real suficiente.
- PR10 no está iniciado y PR11 sigue pendiente.
- Impresora/cajón físicos y Point permanecen diferidos hasta contar con cliente/medios para ensayo real.

### Meta única

Llevar KioskoPOS desde el estado actual de **implementación avanzada** hasta **Production Readiness verificable**, cerrando gates en orden y sin confundir tests locales, mocks o previews con aceptación hospedada/productiva.

El orden de trabajo obligatorio es:

1. **Cerrar técnicamente PR #3.**
   - Completar únicamente piezas que reduzcan PR02–PR09 o eliminen blockers reales.
   - Finalizar flujo fiscal/NC/representación/recuperación pendiente sin abrir features cosméticas nuevas.
   - Ejecutar suite global sobre el HEAD definitivo, build, lint/diff, secret scan y evidencia PostgreSQL aplicable.
   - Mantener PR #3 en draft hasta que el bloque esté coherente y revisable.

2. **Convertir preparación local en aceptación de Staging.**
   - Instalar SQL/Edge/flags sólo con autorización específica y con backup/rollback definidos.
   - Validar JWT/RLS/ACL reales con Dueño/Cajero/Visor/otro comercio.
   - Probar dos ventanas/terminales, Web Locks, respuestas perdidas, reintentos, concurrencia, cambio de actor, recuperación y estados inciertos.
   - No usar un HTTP 200, un preview o una prueba simulada como sustituto de aceptación hospedada.

3. **Cerrar PR03 y luego PR02.**
   - Antes de una emisión real de homologación, demostrar idempotencia, numeración, cuerpo inmutable, conciliación y custodia segura en entorno hospedado.
   - Confirmar punto de venta, catálogo/parámetros y emisor correctos.
   - Pedir autorización específica antes de ejecutar `FECAESolicitar`.
   - Obtener el primer CAE real de homologación y recuperarlo mediante `FECompConsultar` sin simulaciones.
   - Validar rechazo, timeout/respuesta incierta y nota de crédito antes de considerar cerrado el circuito fiscal.

4. **Cerrar PR04–PR09 con evidencia real.**
   - Contingencias ARCA/Internet.
   - Integridad venta-stock-caja-envases-devoluciones.
   - Seguridad JWT/RLS/secretos/auditoría.
   - Backup/restore y recuperación de desastre.
   - Crash/reinicio/pérdida de copia local.
   - Concurrencia/E2E con dos actores/terminales y fallos inyectados.

5. **Preparar PR10 — transición controlada a Production.**
   - Sólo después de PR01–PR09 cerrados.
   - Requiere autorización expresa del titular.
   - Definir backup, cutover, rollback, monitoreo, credenciales/certificados productivos y soporte.
   - No emitir comprobantes reales ni cambiar ARCA Production sin esa autorización.

6. **Cerrar PR11 — piloto comercial real.**
   - Comercio/operadores reales, formación, soporte, métricas y conciliación.
   - Ensayar impresora/cajón y Point cuando el titular aporte cliente/hardware/medios.
   - La aceptación del piloto real es el último gate antes de declarar desarrollo cerrado para operación comercial.

### Regla de priorización

Antes de comenzar cualquier tarea nueva, Codex debe responder internamente:

> ¿Este cambio cierra o reduce directamente un gate PR02–PR11 o un blocker necesario para cerrar PR #3?

Si la respuesta es **no**, posponerlo salvo que el titular lo pida expresamente.

Prioridad:

`seguridad e integridad > aceptación hospedada > recuperación/concurrencia > homologación fiscal > backup/operación > UX/cosmética`.

### Criterio de “terminado”

No declarar el desarrollo cerrado sólo porque el código esté implementado o la suite pase. El sistema se considera listo para cierre únicamente cuando:

- PR #3 esté integrado o sustituido por bloques equivalentes revisados.
- PR01–PR09 estén PASS con evidencia del entorno requerido.
- PR10 se ejecute con autorización explícita y rollback probado.
- PR11 tenga aceptación de piloto comercial real o quede formalmente diferido por decisión del titular con alcance comercial reducido.
- No existan blockers conocidos de seguridad, integridad, recuperación o fiscalidad sin una decisión explícita registrada.

### Reglas de autonomía de Codex

Codex puede continuar autónomamente con lectura, análisis, implementación local, pruebas, documentación y commits temáticos dentro de la rama activa.

Debe detenerse y pedir autorización sólo para:

- emitir un comprobante real, incluso en homologación si la acción crea un CAE;
- instalar SQL/Edge o activar flags en un entorno remoto cuando no exista autorización vigente para ese alcance;
- usar/rotar secretos, certificados, claves privadas o credenciales reales;
- modificar `master`/Production o hacer merge de un PR;
- ejecutar una operación destructiva o irreversible;
- tomar una decisión de negocio/fiscal que no esté resuelta en documentación.

Nunca:

- `git push --force` / `--force-with-lease`;
- `git reset --hard`;
- `git clean`;
- bypass de protecciones GitHub/secret scanning;
- `npm audit fix` automático;
- exponer JWT, Token/Sign, claves privadas, passwords, peppers o conexiones;
- debilitar tests para obtener PASS;
- declarar PASS hospedado/productivo usando sólo mocks, PGlite o pruebas locales.

### Política de evidencia

Cada cierre debe registrar como mínimo:

- fecha y commit/ref;
- entorno (`local`, PostgreSQL local, Staging, homologación ARCA, Production);
- actor/rol y alcance;
- caso probado y resultado;
- límites de lo que NO demuestra;
- rollback o recuperación cuando aplique.

Conservar evidencia histórica. No reescribir resultados anteriores para hacer coincidir el estado actual.

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
