# F6.2D — Contrato de migración y reconciliación

## Objetivo
Definir, antes de cualquier acceso remoto, el contrato objetivo y el procedimiento de migración de datos al futuro Supabase productivo, distinguiendo lo que se conoce del bootstrap de lo que requiere inventario legacy de sólo lectura.

## Contexto actual
El bootstrap local es `ONE_SHOT_EMPTY_DB`, manifestado en `supabase/bootstrap/manifest.json`. El usuario ejecutó manualmente el inventario legacy read-only 00–11 y entregó resultados agregados/sanitizados; Codex no accedió al backend. Block 11 es `PRE_CUTOVER`, no el baseline final. El checkout autorizado es `X:\Programación\kiosco-app-f6-validation`; el checkout principal permanece intacto.

## Alcance
- Derivar la matriz target, FK y orden desde SQL/bootstrap y backend contract local.
- Definir mapping fuente→destino, identidad/Auth, históricos, transformaciones, reconciliación, freeze y rollback.
- Mantener contratos machine-readable y validación offline sin conectividad.

## Fuera de alcance
- Consultar legacy, staging o cualquier Supabase remoto.
- Crear/exportar datos reales, cargar/transformar bundle de origen o ejecutar import.
- Commit, push, deploy o modificar checkout principal.

## Decisiones importantes
- Preservar IDs de negocio cuando se reconozcan; Auth users se recrean/invitan en proyecto nuevo y se enlazan mediante mapping privado.
- Adoptar el flujo ya seleccionado en `write-access.json`: provisioning server-side con compensación de Auth user si falla el perfil.
- No inventar saldos iniciales, líneas faltantes, eventos de ledger ni evidencia checkout.
- El origen sigue fuente de verdad hasta completar reconciliación y GO explícito.

## Riesgos
Resultados del usuario: 4 kioscos; 6 perfiles Auth enlazados; 9 usuarios Auth sin perfil; un perfil con `kiosco_id NULL`; 285 productos y 284 costos; 122 movimientos stock; 28 ventas, 118 detalles y 28 pagos; 4 de 7 cajas abiertas y 14 ventas asociadas; dominios clientes/CC y proveedores/compras/pagos vacíos. El origen carece de `operaciones_escritura`, `movimientos_proveedor` e `historial_precios_producto`. Perfil sin kiosco, cajas abiertas, clasificación de excluidos, semántica temporal/monetaria y camino de importación seguro quedan bloqueados para C2.

## Criterios de aceptación
- Contrato documenta entidades, FK/DAG, Auth mapping, históricos, validaciones, corte/rollback y preguntas pendientes.
- Herramienta local no accede a red/DB y verifica integridad del manifest.
- Mapping por tabla/columnas, disposition, transformación, UUID/null/default, FK/DAG y reconciliación está versionado en `supabase/bootstrap/contract/source-destination-mapping.json`.
- `data-migration.json` apunta al mapping y separa inventario PRE de baseline FINAL pendiente.
- El SQL 04 separa kiosk NULL, kiosco existente e inexistente; el anterior `matched_kiosco_id IS NULL` mezclaba estados.
- No se copian triggers/ACL/RLS/funciones legacy. Importar mediante RPC de negocio o deshabilitar triggers queda prohibido; el canal destino-only seguro debe probarse localmente en C2.
- C1 pasa para plan/mapping, mientras import/export sigue BLOCKED por los blockers listados.

## Plan de implementación
1. Leer manifest, bootstrap, backend contract y guías del repo.
2. Derivar matrices y reglas target; señalar ambigüedades source.
3. Añadir documentación, JSON de orden/clasificación y comando offline.
4. Ejecutar sólo validaciones estáticas locales.

## Validación

`node --check scripts/f6-2d-migration.mjs`
`node scripts/f6-2d-migration.mjs check-bootstrap`
`git diff --check` en artefactos.

## Progreso
- [x] Inspeccionar contrato target y claves foráneas desde SQL local.
- [x] Documentar mapping, transformación, reconciliación y rollback.
- [x] Añadir manifiesto JSON y utilitario offline sin DB/network.
- [x] Confirmar estrategia de provisioning Auth en `write-access.json` y Edge local.
- [x] Verificar manifest y whitespace.

## Resultado final
**F6.2D-C1 PASS para mapping; migración ejecutable BLOCKED.** Mapping explícito y DAG preparados desde el contrato destino y los resultados read-only agregados del usuario. El baseline de inventario es PRE_CUTOVER. Sigue pendiente decidir el perfil sin kiosco, cerrar cajas en futura ventana autorizada, clasificar datos excluidos, probar semánticas de origen y diseñar/probar localmente el importador histórico seguro. No hubo acceso remoto, export/import, commit, push ni deploy.


## F6.2D-C2 — ejecución local sintética

- [x] Derivar ventana después de `041`; instalar triggers en `042` antes de la seguridad final.
- [x] Agregar fixture sintética y allowlist basada en mapping; filas Auth son placeholders locales sin credenciales.
- [x] Implementar modos `DRY_RUN`, `VALIDATE_ONLY`, `IMPORT_LOCAL --target local` con loopback-only y fail-fast.
- [ ] Ejecutar import one-shot sobre Supabase local real desde base vacía.
- [ ] Confirmar postflight/hardening y reconciliación en Supabase local real.
- [ ] Ejecutar suite completa, build y diff-check.

El resultado de C2 permanece BLOCKED hasta las comprobaciones pendientes. No se accede a legacy/staging, ni se hace commit, push o deploy.
- [x] Ejecutar suite excluyendo `partialReturnPreparation.test.ts` y build en local/PGlite.
- [ ] Ejecutar Supabase local real; actualmente BLOCKED: CLI/Docker no disponibles en el proceso y PostgreSQL local termina la conexión.

Evidencia: 177 archivos / 1,624 tests PASS; `npm run build` PASS; prueba C2 PGlite 3 tests PASS; manifest y `git diff --check` PASS. `npx --offline supabase status` respondió ENOTCACHED; SELECT-only a 127.0.0.1:54322 terminó inesperadamente incluso con ejecución ampliada. No se envió SQL ni se escribió en ningún backend. Por ello C2 permanece **BLOCKED**, no PASS.


## F6.2D-C3D-4 — demo-only zero-row cutover policy

- [x] Versionar los modos `OPERATIONAL_CUTOVER_REQUIRED` y `DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE` en mapping/data migration contract.
- [x] Fijar el migration set revisado por checksums, fingerprints, conteos y provenance.
- [x] Añadir validator offline al utilitario existente `scripts/f6-2d-migration.mjs`; cualquier condición fallida conserva blockers.
- [x] Añadir pruebas PASS/BLOCK para inclusión, unresolved, provenance, reconciliación, blockers, huérfanos/cruces, fingerprint y filas migrables.
- [x] Ejecutar validador y validaciones locales; sin remoto, export, import ni cambios de cajas.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR05, PR06, PR07, PR08 y PR10**.

Conservar los gates de acceso legacy, freeze, reconciliación y rollback documentados. El nuevo registro no autoriza lectura/escritura remota ni cutover de este plan por sí solo.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.
