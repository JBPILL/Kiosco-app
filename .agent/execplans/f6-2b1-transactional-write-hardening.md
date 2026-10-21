# F6.2B.1 — Hardening transaccional de escrituras

## Objetivo
Eliminar todos los bloqueos locales en `write-access.json` para strict pilot, moviendo operaciones multi-tabla a RPC transaccionales y aprovisionamiento Auth a una Edge Function segura, preservando legacy cuando strict scope sea false.

## Contexto actual
- `proveedorStore`, `cajaStore`, `clienteStore`, catálogo/importación/combos/auditoría y alta de usuarios contienen writes directos o secuencias browser-side.
- El bootstrap ya revoca DML browser en libros sensibles e incluye `registrar_movimiento_stock_idempotente` y `resolver_operacion_stock`.
- F6.2B.1 es exclusivamente local: no tocar staging/legacy, no commit/push/deploy y excluir `partialReturnPreparation.test.ts`.

## Alcance
- Compra completa atómica e idempotente.
- Apertura/movimiento/cierre de caja en RPC con ownership, lock e idempotencia.
- Operaciones de cuenta corriente atómicas.
- Inventario de writes de stock y ruta segura para módulos habilitados.
- Provisioning Auth server-side con validación de rol/kiosco.
- Contrato/tests/manifest/docs.

## Fuera de alcance
- Supabase remoto, Vercel, producción, sesiones/tokens Auth, fixtures F4A/F4B, partial returns.

## Decisiones importantes
- Mantener browser DML revocado en el baseline strict.
- Las rutas legacy existentes permanecen sólo bajo `VITE_KIOSKO_PILOT_STRICT_SCOPE !== 'true'`.
- Evaluar trigger confiable versus compensación server-side para Auth y documentar una estrategia única.

## Riesgos
- Compatibilidad de IDs y cuerpos de las RPC con todos los callers.
- Consistencia caja/compra/stock bajo concurrencia y retries.
- La atomicidad entre `auth.users` y `public.usuarios` no es una transacción distribuida; se requiere compensación o trigger controlado.

## Criterios de aceptación
- `write-access.json` contiene sólo SAFE_RPC, SAFE_EDGE, LEGACY_ONLY u OUT_OF_SCOPE.
- Compras, caja, crédito, stock y perfil no hacen DML browser bajo strict.
- SQL SECURITY DEFINER valida actor/tenant/rol, fija search_path y tiene ACL cerradas.
- Pruebas de rollback, idempotencia, body conflict, autorización, concurrency, strict on/off y prohibición de direct writes.
- Suite (excluyendo `partialReturnPreparation.test.ts`), build, manifest y diff-check pasan.

## Plan de implementación
1. Trazar todos los write paths de cada libro y anotar columnas/reglas actuales.
2. Diseñar RPCs y Edge Function contra el schema real del bootstrap.
3. Adaptar callers sólo para strict true y conservar legacy false.
4. Agregar pruebas SQL/client/contrato; actualizar contrato y checksum.
5. Ejecutar validaciones y completar el gate o documentar un bloqueo real.

## Validación
- Pruebas focalizadas por store/RPC y PGlite.
- Suite completa con `partialReturnPreparation.test.ts` excluido.
- `npm run build`, `node supabase/bootstrap/verify-manifest.mjs --check`, `git diff --check`.

## Evidencia de esta ejecución
- Pruebas focalizadas: 70 tests PASS.
- Suite excluyendo `src/test/partialReturnPreparation.test.ts`: 175 archivos / 1614 tests PASS.
- `npm run build`: PASS; queda el aviso conocido de chunk >500 kB.
- Manifest: PASS (41 SQL ordenados); `git diff --check`: PASS (sólo avisos CRLF de Git).
- Sin staging/commit: índice limpio; branch `master`; HEAD local observado `d4f66b0de2c2d4af0c0b5b403ea4411cc2a6180a`.
- Ningún acceso/escritura remota realizado.

## Progreso
- [x] Revisar guías y estado local.
- [x] Inventariar write paths de compra, caja, cuenta corriente, stock, proveedor y provisioning; mantener inventario contractual explícito de writes directos.
- [x] Agregar RPCs transaccionales para compras/pagos/saldo/CRUD de proveedor, caja, cuenta corriente y stock; Edge Function de provisioning Auth con compensación.
- [ ] Adaptar callers strict de catálogo completo y soporte; las ramas principales de compra/caja/crédito/auditoría/proveedor ya usan RPC.
- [x] Agregar pruebas focalizadas SQL/client/contrato y clasificaciones explícitas; regenerar checksum.
- [ ] Completar validaciones finales y cerrar gate; el contrato mantiene blockers de catálogo y soporte.

## Resultado final
BLOCKED: quedan writes directos de catálogo/productos (alta, edición, importación, siembra y cambios de costo/stock inicial) sin RPC strict, y los tickets de soporte siguen sin SAFE_RPC/SAFE_EDGE. No avanzar a backend real hasta cerrar estos puntos y pasar suite/build.

## F6.2B.2 — Catálogo y soporte

- Alcance añadido: RPCs seguras de catálogo y tickets; callers strict sin fallback DML; contrato actualizado in-place.
- Decisión importación: lotes atómicos de tamaño acotado, cada lote con request_id estable e idempotencia; reportar resultados confirmados por lote para reintento seguro.
- Sin remotos, commit, push ni deploy.
- [x] Inventariar writes de catálogo y soporte contra el contrato vigente.
- [x] Agregar RPCs, adaptar callers strict y probar límites de autorización/atomicidad/retry.
- [x] Cerrar strictBlockers, regenerar manifest, validar tests/build/diff-check.

### Evidencia y resultado F6.2B.2
- `write-access.json` clasifica los flujos incluidos y `strictBlockers` queda vacío; las rutas incompatibles están marcadas `LEGACY_ONLY` o explícitamente guardadas como `OUT_OF_SCOPE`.
- Catálogo y soporte usan RPCs transaccionales bajo strict; callers legacy conservan su ruta cuando strict es false. El restore integrado de backup queda explícitamente fuera de alcance en strict.
- Manifest regenerado y verificado: 42 archivos SQL ordenados.
- Tests focalizados: 9 archivos / 81 tests PASS; pruebas aisladas de SQL/PGlite y PIN: 2 archivos / 18 tests PASS.
- Suite completa excluyendo `src/test/partialReturnPreparation.test.ts`: 176 archivos / 1.622 tests PASS (timeouts ampliados para pruebas SQL/PGlite bajo carga).
- `npm run build`: PASS; permanece el aviso conocido del chunk mayor de 500 kB.
- `git diff --check`: PASS; sólo avisos informativos de normalización CRLF.
- Sin archivos staged; `src/test/partialReturnPreparation.test.ts` no fue modificado. Sin commit, push, deploy ni accesos remotos.

**Resultado F6.2B.2: PASS local.** No avanzar a backend real todavía; el límite de autorización vigente para esta fase prohíbe escrituras remotas.

## F6.2C-L — Validación Supabase local

### Cambio de alcance
- Se descarta crear un proyecto Supabase desechable.
- F6.2C se sustituye por una validación desde cero con Supabase CLI + Docker local; no se permiten vínculos ni operaciones en proyectos hospedados.
- Se mantienen prohibidos commit, push, deploy, datos reales y todo acceso a legacy (`wlqujnwxrmksheubfrha`) o staging (`acoyfwwmhaeruciyedri`).

### Preflight de entorno
- Docker Engine y Docker Desktop no están disponibles en este equipo; no se puede crear el stack local.
- Supabase CLI no está instalada globalmente ni en el repo; se usó efímeramente vía `npx` y respondió versión `2.120.0`, sin agregar dependencias al proyecto.
- `supabase/.temp/project-ref` conserva metadata de vínculo al proyecto legacy. Sólo se leyó y clasificó; no se ejecutó ningún comando Supabase ni se alteró el archivo.
- Estado: **BLOCKED** hasta disponer de Docker y aislar el checkout del marcador de proyecto remoto sin contactar el backend.
- Required Edge Functions identificadas por el contrato/callers: `checkout-manual`, `supervisor-pin`, `provision-user`; `afip-wsfe` está clasificada fuera de alcance.
- Checks locales F6.2C-L: backendContract + bootstrap SQL 2 archivos / 13 tests PASS; suite excluyendo `partialReturnPreparation.test.ts` 176 archivos / 1.622 tests PASS; build PASS; manifest PASS (42 SQL); diff-check PASS.
- El stack Supabase, preflight → bootstrap completo → seguridad final → postflight, Auth/RLS/grants de runtime, RPC contra Postgres real y las Edge Functions no se ejecutaron por ausencia de Docker.

### Validaciones hospedadas diferidas
`DEFERRED_HOSTED_VALIDATION`: Edge Functions desplegadas en Supabase real; configuración hospedada de Auth; secretos del proyecto; diferencias de ownership/roles administrados; networking/runtime hospedado.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR05, PR06, PR08 y PR09**.

La evidencia de SQL local no sustituye JWT/ACL/RLS y concurrencia del entorno hospedado. Preservar el manifiesto y las limitaciones de publicación de cada fase.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.
