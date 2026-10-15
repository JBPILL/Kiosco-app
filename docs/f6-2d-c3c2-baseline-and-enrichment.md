# F6.2D-C3C-2 — baseline status y enrichment

Alcance local. Este documento y el generador no se conectan a ningún backend,
no ejecutan `CLASSIFY_ONLY` ni producen un paquete de exportación.

## Estados del artefacto

- `baselineStatus` describe exclusivamente el baseline fuente. El único valor
  aceptado es `PRE_CUTOVER_REVIEWED`.
- `classificationStatus` describe la revisión de candidatos. El draft sale como
  `PENDING_MANUAL_REVIEW`; sólo una aprobación manual puede cambiarlo a
  `APPROVED`.
- `classificationSchemaVersion` fija la forma del artefacto en
  `F6.2D-C3C-2`. Exportar exige versión y estado aprobados explícitamente;
  drafts antiguos `F6.2D-C3A-1` sin estos campos fallan cerrados.
- `baseline-reviewed.template.json` conserva su estado vacío
  `PENDING_MANUAL_REVIEW`; `approved-row-ids.template.json` deja
  `baselineStatus: null` hasta copiar el estado real revisado. Ninguna plantilla
  afirma por defecto que un baseline fue revisado.

`runClassifyOnly` valida el objeto original antes de abrir la conexión. Tras
leer los conteos, vuelve a validar baseline y conteos; nunca copia ni corrige
`baselineStatus`.

## Firmas locales de las seis semillas

Los IDs de filas de las semillas son aleatorios (`gen_random_uuid()`), no hay
marcador F4 inequívoco ni prueba local de ejecución/limpieza. Por eso el
registro no es completo y que una fila no coincida con una semilla no prueba
que sea dato real. Las firmas siguientes sólo detectan la forma inicial de
cada semilla; sus nombres y valores de catálogo se usan dentro del predicado y
no se devuelven en los resultados.

Cada coincidencia completa se etiqueta `EXACT_SIGNATURE` porque exige
simultáneamente identidad de kiosco, conjunto exacto de categorías, cardinalidad
exacta de productos y tres códigos de barras centinela exactos. Un kiosco con
coincidencia parcial queda sin firma (`HINT` debe revisarse manualmente; nunca
justifica `EXCLUDE`). Cambios posteriores al catálogo causan falsos negativos,
que son seguros. Incluso una firma completa es evidencia de contenido igual a
la semilla, no evidencia de que el registro se haya creado por ese script; la
exclusión final requiere revisión humana.

| Seed file | Kiosco + categorías exactas | Productos | Tres códigos centinela | Fuerza |
|---|---|---:|---|---|
| `seed_bazar_prisma.sql` | 9 categorías exactas, identidad del kiosco | 48 | `7792001001014`, `7792001001021`, `7792001001038` | EXACT_SIGNATURE |
| `seed_kiosco_don_pedro.sql` | 9 categorías exactas, identidad del kiosco | 97 | `7790580200012`, `7790580200029`, `7790580200036` | EXACT_SIGNATURE |
| `seed_libreria_papelera_sol.sql` | 9 categorías exactas, identidad del kiosco | 99 | `7790001000010`, `7790001000027`, `7790001000034` | EXACT_SIGNATURE |
| `seed_maxikiosco_completo.sql` | 8 categorías exactas, identidad del kiosco | 73 | `7798001000010`, `7798001000027`, `7798001000034` | EXACT_SIGNATURE |
| `seed_segundo_kiosco_barrio.sql` | 7 categorías exactas, identidad del kiosco | 41 | `7792798000014`, `7790895000508`, `7792798000021` | EXACT_SIGNATURE |
| `seed_veterinaria_huellas.sql` | 10 categorías exactas, identidad del kiosco | 46 | `7791234001010`, `7791234001027`, `7791234001034` | EXACT_SIGNATURE |

Fuente local de cada firma: el `INSERT` de `kioscos`, el conjunto `INSERT` de
`categorias` y el total/códigos centinela de `productos` del archivo indicado.
No se usan UUIDs literales como evidencia. Coincidencia sólo por nombre,
conteo o un único producto es `HINT`, no exclusión.

### Revisión C3C-5 de provenance V2

Las semillas de las dos firmas V2 contienen los códigos de barras y categorías
usados por el predicado, y esos códigos no se repiten en las otras cinco seeds
locales. Sin embargo, los comentarios describen catálogos comerciales
completos; no identifican esos códigos como artificiales, deterministas o
reservados para pruebas. No hay un generador local que pruebe su exclusividad
fuera de las seis seeds. Como el registro de fixtures sigue incompleto, la
coincidencia de categoría más al menos dos códigos sólo se reporta como
`STRONG_SEED_MATCH_V2`. No activa `matches_seed_signature` ni justifica
`EXCLUDE` por sí sola.

## Propagación conservadora por relaciones

El mapping registra `dependsOn`, pero no define un grafo estructurado con los
pares exactos de columnas FK. Por eso no se autoriza una cascada automática
sólo por `dependsOn`. El enrichment devuelve referencias padre usando nombres
de columnas estructurales del contrato fuente; son candidatos de inspección,
no prueba de constraint/FK. Antes de propagar una disposición deben cotejarse
con las FK reales del bloque 02b. Si falta esa confirmación, la relación queda
`UNRESOLVED`.

- Con `kiosco_id` directo: `usuarios`, `categorias`, `productos`,
  `producto_costos`, `combo_items`, `promociones`, `lotes_producto`,
  `sesiones_caja`, `ventas`, `movimientos_stock`,
  `movimiento_stock_costos`, `movimientos_caja`, `clientes`,
  `movimientos_cuenta_corriente`, `proveedores`, `compras_proveedor`,
  `pagos_proveedor`, `checkout_manuales` y
  `anulaciones_venta_atomicas`. Una coincidencia de kiosco no basta si hay FK
  cruzada: se debe verificar que cada padre pertenece al mismo kiosco.
- Sin `kiosco_id` directo: `detalles_venta`, `pagos_venta` y
  `detalles_compra`; requieren validar la FK al padre y propagar sólo cuando el
  padre esté clasificado y su tenant sea coherente.
- Padres estructurales del mapping: producto→categoría/proveedor;
  costos→producto; combo→productos componentes; promoción→producto/categoría;
  lote→producto; sesión→usuario; venta→usuario/sesión; líneas y pagos de venta
  →venta; costo de movimiento→movimiento; caja→sesión/usuario; cuenta corriente
  →cliente/venta; compra→proveedor/sesión; línea de compra→compra/producto;
  pago de proveedor→proveedor/sesión; evidence disabled→venta.
- Sesiones abiertas, ventas ligadas y movimientos de caja ligados siguen siendo blockers para `OPERATIONAL_CUTOVER_REQUIRED`. Para el set demo-only de cero filas, C3D-4 permite N/A sólo tras el validator local y sus condiciones fail-closed; el enrichment no cambia filas ni las convierte en exportables.

Nunca propagar una etiqueta si la FK apunta a otro kiosco, falta el padre,
existe una relación ambigua o depende de los payloads evidence deshabilitados.

## Consulta propuesta (generador local, sin conexión)

`scripts/f6-2d-c3c2-enrichment.mjs` toma sólo `candidateIds` del artefacto
`c3a-candidates.json`, valida UUIDs y entidades contra una allowlist, y escribe
un script de `psql` por stdout. No importa `pg`, no lee credenciales y no abre
conexiones.

Generación futura, cuando se autorice preparar el archivo local:

```powershell
node scripts/f6-2d-c3c2-enrichment.mjs C:\KioskoPOS-Migration\c3a-candidates.json > C:\KioskoPOS-Migration\enrichment-read-only.sql
```

El SQL contiene un único `WITH ... SELECT`, con una CTE limitada a los UUIDs
actuales. La proyección se limita a entidad, UUID técnico, kiosco, hasta tres
FKs padre, estado, fecha de cierre, y para usuarios rol/superadmin/activo. Los
datos de kiosco/catálogo para firmas aparecen sólo dentro del predicado; no se
proyectan. La firma completa devuelve un ID técnico con `EXACT_SIGNATURE`; V2
devuelve `STRONG_SEED_MATCH_V2` con `matches_seed_signature=false`; una
coincidencia sólo de nombre devuelve el ID técnico con `HINT` y booleano false.
Ninguna etiqueta produce una disposición automática. No selecciona nombres,
importes, teléfonos, direcciones, correo, Auth IDs, hashes, tokens, JSON
evidence ni credenciales. Para venta, el estado incluye únicamente el estado
de la venta y de su sesión asociada.

El script psql abre `REPEATABLE READ READ ONLY`, captura
`SHOW transaction_read_only`, ejecuta la consulta sólo si el valor es `on`, y
termina con `ROLLBACK`. `ON_ERROR_STOP` hace que ante error psql cierre la
sesión; PostgreSQL revierte automáticamente la transacción abierta al cerrar
la conexión. El operador debe cerrar la conexión psql después de un error y no
reintentar sobre una sesión abortada.

Este paquete local no confirma por sí mismo la URL/proyecto. Antes de cualquier
ejecución futura, el operador debe verificar manualmente que la conexión es
legacy `wlqujnwxrmksheubfrha`; staging sigue prohibido. La consulta no da
permiso para conectarse ni para clasificar filas.

## Gate

`FIXTURE_REGISTRY_COMPLETENESS` sigue `INCOMPLETE`. La consulta puede aportar
evidencia estructural acotada y detectar coincidencias con estas seis semillas,
pero los candidatos sin coincidencia permanecen `UNRESOLVED`; ningún UUID se
incluye o excluye automáticamente.


## F6.2D-C3D-4 — política de corte sólo demos y cero filas

El estado `NOT_APPLICABLE_DEMO_ONLY_SOURCE` se concede sólo para el set revisado y sólo si `VALIDATE_DEMO_ONLY_ZERO_ROW_CUTOVER` pasa las condiciones fijadas en `supabase/bootstrap/contract/data-migration.json`. Si falla una precondición, se conserva `CUTOVER_BLOCKER`. Ninguna fila de caja demo se cierra o modifica artificialmente.
