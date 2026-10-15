# F6.2D-C3A — Exportador real de solo lectura

## Objetivo
Preparar un exportador source→artifact reproducible para un paquete `PRE_CUTOVER`, sin conectarse al legacy durante esta fase.

## Contexto y restricciones
- Contratos fuente: `source-destination-mapping.json` y `data-migration.json`.
- Baseline PRE: bloques 03–11 de `artifacts/f6-2d-legacy-inventory/sql`.
- C2 pasó en Supabase local real. Su importador no se reutiliza como lector de origen.
- No legacy, staging, import, producción, commit, push ni deploy en este trabajo.
- El export queda detrás de un opt-in explícito, exige el host de la DB legacy y una clasificación completa de UUIDs.

## Decisiones
- Queries `SELECT` con columnas estáticas allowlisted, sin `SELECT *`, funciones de negocio ni escritura.
- `BEGIN READ ONLY`; cierre por `ROLLBACK`.
- `auth.users` y sesiones/tokens nunca se consultan. Mapping técnico separado de los perfiles.
- UUIDs de negocio se preservan; filas no clasificadas bloquean el paquete.
- Sesiones sólo `CERRADA` con `fecha_cierre`; ventas y movimientos de caja asociados a las cuatro cajas abiertas quedan fuera del pre-cutover y se reportan como pendientes.
- Evidence de checkout/anulación desactivada hasta aprobación de payload e invariantes.
- El stock del producto se exporta como snapshot; kardex y costos existentes se exportan aparte; `AJUSTE` no se transforma sin semántica aprobada.
- JSON por tabla ordenado por clave; timestamp de generación se mantiene fuera del digest de contenido.

## Componentes y aceptación
1. Añadir contrato machine-readable de columnas/PK/disposition a source mapping.
2. Implementar `scripts/f6-2d-c3a-exporter.mjs` con `VALIDATE_ONLY`, `CLASSIFY_ONLY` y `EXPORT_PRE_CUTOVER`.
3. Agregar plantilla vacía de clasificación y runbook exacto.
4. Tests sintéticos C2 para determinismo, allowlists, SELECT explícitos, filtros de caja/ventas, Auth mapping, checksums y fail-closed.
5. JSON parse, `node --check`, tests, backendContract, suite sin deuda conocida, build, manifest y diff-check.

## Bloqueos antes de un export real
- Clasificar todos los candidatos como incluidos/excluidos con motivo.
- Resolver el perfil sin kiosco; seguirá en cuarentena.
- Confirmar timezone, enums/medios de pago, signo de AJUSTE y clasificación de devoluciones/envases/Point/ARCA.
- Revisar checkout/anulación evidence; por defecto no se exporta.
- Revisar outputs sanitizados de bloques 03–11 y comprobar baseline actual contra conteos conocidos.

## Progreso
- [x] contrato estructurado
- [x] exportador y clasificación fail-closed
- [x] tests/runbook
- [x] validaciones locales

## Resultado final
Preparación local PASS. Exportador `CLASSIFY_ONLY`/`EXPORT_PRE_CUTOVER` implementado y opt-in explícito; ningún modo de conexión se ejecutó. El acceso al legacy, clasificación real de candidatos y paquete con datos siguen pendientes de autorización y evidencia manual. Ningún acceso a staging, legacy o producción ocurrió; no hubo import, commit, push ni deploy.
