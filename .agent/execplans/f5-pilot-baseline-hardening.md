# F5 — Endurecimiento del alcance piloto

## Objetivo

Completar la migración F5 en pasos locales y con gates: bloquear referencias comerciales fuera del baseline en piloto estricto, revisar `v_resumen_caja`, auditar los cambios y sólo después preparar la publicación en staging.

## Contexto y restricciones

- Repositorio `X:\Programación\kiosco-app`, rama `master`, base `f5b11957a649884a4bf71ee39c7eb43331431859`.
- Supabase staging autorizado: `acoyfwwmhaeruciyedri`. El proyecto `wlqujnwxrmksheubfrha` es intocable.
- El checkout contiene cambios locales previos; preservar y clasificar antes de cualquier staging.
- `src/test/partialReturnPreparation.test.ts` queda fuera de alcance y nunca debe implementarse ni incluirse.
- No ejecutar escrituras remotas, commit, push o deploy antes del gate F5.4. No ejecutar `db push`, reset ni repair.
- No borrar IndexedDB ni la outbox del checkout manual transaccional.

## Alcance

- F5.2B: bloquear consultas/escrituras incompatibles a `suscripciones`, `planes` y `configuracion_admin`, sustituir el health-check de Soporte y bloquear `/admin` con la bandera estricta, conservando legacy con la bandera falsa.
- F5.2C: revisar `v_resumen_caja` y evitar consultas 404 innecesarias en piloto estricto, preservando el fallback funcional y legacy.
- F5.3: clasificar exactamente los cambios F5 frente a la base, separar cambios locales preexistentes y validar referencias, scope y checkout transaccional.
- F5.4: sólo tras F5.3 PASS, preparar una selección quirúrgica, revisar archivos staged y publicar únicamente en staging; hacer smoke test controlado de lectura.

## Criterios de aceptación

- En strict scope no se consultan tablas comerciales ausentes ni se muestran estados comerciales inventados; `/admin` informa claramente que está fuera del piloto.
- Con strict scope desactivado se conserva el comportamiento anterior.
- F5.2B y F5.2C pasan pruebas dirigidas, suite completa excluyendo `src/test/partialReturnPreparation.test.ts`, build y `git diff --check`.
- F5.3 confirma la lista y propiedad de cada cambio; cualquier ambigüedad bloquea commit.
- F5.4 nunca escribe en el proyecto Supabase viejo ni altera datos locales persistentes del checkout.

## Progreso

- [x] F5.2B — PASS: guardas strict/legacy, pruebas focalizadas 15/15, suite 173 archivos / 1.599 tests excluyendo la deuda indicada, build y diff-check aprobados. Sin escrituras remotas ni commit.
- [x] F5.2C — PASS: strict scope omite la vista no presente y conserva cálculo manual; flag false conserva consulta legacy. 13 pruebas focalizadas, suite 173 archivos / 1.601 tests, build y diff-check aprobados.
- [x] F5.3 — PASS: inventario F5 separado de 325 entradas locales ajenas; index vacío; sin referencias al proyecto viejo en `src`; `.env.local` sólo declara URL y publishable key de staging; archivos de checkout manual sin cambios frente a HEAD; recursos fuera de alcance no consultados en strict scope.
- [x] F5.4 — PASS: commit `ff094a3` en `origin/master`; staging responde HTTP 200 y sirve los bundles de F5.2B, incluidos el aviso comercial y la pestaña de Configuración.

## Resultado final

F5.2B, F5.2C, F5.3 y F5.4 aprobaron sus gates. El smoke test consultó sólo recursos públicos del frontend staging; no se escribieron datos remotos ni se tocó el proyecto Supabase viejo. El checkout manual transaccional y los 325 elementos locales no F5 se preservaron.
