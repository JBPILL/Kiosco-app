# Baseline canónico KioskoPOS — checkout piloto

Estado: **candidato local, ONE_SHOT_EMPTY_DB, no autorizado para instalar en Supabase**.

Este paquete separa el esquema reconstruible desde cero de los SQL históricos incrementales. Define sólo el dominio que necesita el piloto de checkout manual, cancelación pendiente y anulación atómica. No es una migración para una base existente y no contiene datos, identificadores comerciales, claves ni project refs.

## Orden de aplicación

Aplicar cada archivo completo, en este orden, sólo en una instancia vacía y desechable de Supabase, con `current_user=postgres`:

1. `001_domain.sql`
2. `002_identity_helpers.sql`
3. Los módulos `steps/003` a `steps/041` en orden lexicográfico.
4. Para la validación C2 local solamente, importar la fixture sintética en la ventana que abre `steps/041_catalog_support_write_hardening.sql`.
5. `steps/042_post_import_triggers.sql` instala los mismos triggers operativos sólo después de cargar el historial.
6. `900_final_security.sql` como último SQL de instalación; luego ejecutar `postflight.sql`.

La secuencia canónica completa y sus checksums están en `manifest.json`. La única ventana de importación local está entre `steps/041_catalog_support_write_hardening.sql` y `steps/042_post_import_triggers.sql`; no se deshabilita, elimina ni altera el estado de ningún trigger. Las definiciones de funciones se instalan antes; los triggers operativos se crean después de la historia. Esta ventana sólo admite el fixture sintético indicado en `scripts/f6-2d-migration.mjs`, en Supabase local aislado y sobre base vacía. No es un canal habilitado para importar datos reales.

La secuencia tiene transacciones por módulo. No conectar un frontend durante instalación/importación. Si falla cualquier paso, detenerse y descartar/restablecer solamente la instancia Supabase local; no reanudar sobre el esquema parcial ni convertirlo en migración incremental. `preflight.sql` debe confirmar base vacía antes de empezar y `postflight.sql` debe aprobar después del hardening.

`auth.users`, `auth.uid()`, `auth.role()` y los roles `anon`, `authenticated`, `service_role`, `postgres` son prerequisitos administrados por Supabase. No se crean ni reemplazan aquí. No hace falta una extensión de PostgreSQL adicional para este alcance; se usan tipos y funciones core disponibles en PostgreSQL moderno.

## Modelo de datos incluido

El detalle normativo (tipos, nulabilidad, PK, FK, UNIQUE, CHECK, defaults e índices) está en `001_domain.sql` y los módulos ordenados. El conjunto incluye:

| Dominio | Objetos | Uso del piloto |
| --- | --- | --- |
| Identidad/comercio | `kioscos`, `usuarios` | comercio activo, rol, actor Auth único por perfil |
| Catálogo | `categorias`, `productos`, `promociones` | productos pesables, precios, flags de combo y campos que consulta la cotización |
| Receta física | `combo_items` | componentes físicos consumidos; FK de producto según relaciones que usa el código |
| Stock | `lotes_producto`, `movimientos_stock`, `delta_stock`, `producto_costos`, `movimiento_stock_costos` | FEFO, magnitud no negativa, delta firmado del kardex, lote efectivamente consumido y costo histórico exigido por anulación |
| Caja | `sesiones_caja`, `movimientos_caja` | sesión activa y movimientos compensatorios |
| Venta/crédito | `ventas`, `detalles_venta`, `pagos_venta`, `clientes`, `movimientos_cuenta_corriente` | cierre online, pagos mixtos, cargo y compensación de cuenta corriente |
| Auditoría/compensación | `auditoria_operaciones`, `anulaciones_venta_atomicas` | actor, motivo, resultado idempotente y evidencia histórica |
| Checkout durable | `checkout_manuales`, `checkout_manual_entradas`, `checkout_manual_cancelaciones` | resultado, snapshot, recuperación, cancelación y protección contra carreras |
| Política de supervisor | `supervisor_politicas`, `supervisor_politica_auditoria`, más tablas PIN/autorización creadas por `steps/017`–`steps/023` | requisito de lectura del Edge en cada cierre y autorización cuando se exceda el umbral |
| Guard de devoluciones | `devoluciones_venta` | sólo permite a anulación detectar que existe devolución; no implementa devoluciones parciales |

No incluye tablas ni columnas fiscales, ARCA/WSFE, nota de crédito, refunds externos, Point, catálogo de envases compartido ni operaciones de devolución parcial. `productos` y `detalles_venta` conservan los campos de envase que el payload actual necesita, pero el piloto no debe enviar líneas de envases porque no se instala el modelo remoto compartido.

## Contrato del kardex de stock

`movimientos_stock.cantidad` es una magnitud no negativa; `delta_stock` conserva el efecto firmado sobre `productos.stock_actual`. Para `INGRESO`, `delta_stock = cantidad`; para `EGRESO`, `delta_stock = -cantidad`. `AJUSTE` no tiene una dirección implícita en su tipo: `cantidad = abs(delta_stock)` y el signo de `delta_stock` expresa si el conteo físico aumenta o reduce stock.

La RPC `registrar_movimiento_stock` recibe `p_cantidad` como cantidad a ingresar/egresar para esos tipos. Para `AJUSTE`, recibe el stock físico objetivo y calcula `delta_stock = objetivo - stock_anterior`; la fila guarda la magnitud de ese delta. Los INSERT directos de ajuste existentes que envían un delta firmado quedan normalizados por un trigger antes de evaluar el CHECK de `001_domain.sql`. El constraint original `cantidad >= 0` se conserva. No se infiere saldo total del kardex sumando `cantidad`; usar `sum(delta_stock)` para reconciliar cambios netos.

Los SQL de checkout y anulación escriben cantidades positivas para `EGRESO`/`INGRESO`; el trigger completa `delta_stock` sin alterar esos contratos. `steps/005_stock_history.sql` es una adaptación del snapshot histórico: el SQL histórico original permanece intacto. La pantalla actual (`StockPage`/`presentarMovimientoStock`) muestra ajustes a partir de `cantidad` sin leer `delta_stock`; las exportaciones (`exportUtils`) imprimen el signo desde `cantidad`, y el backup de `ConfigPage` no selecciona la columna nueva. Por ello, los ajustes descendentes no deben considerarse listos para uso de UI, exportación o backup hasta una fase posterior que actualice esos consumidores. La instalación endurecida tampoco concede DML directo al cliente.

## Resolución de combos

El contrato relacional activo es `public.combo_items`: `comboStore` lee/escribe esa tabla, `useProducts` y `adminStore` la limpian, `pointQuoteBackend` carga sus componentes, `confirmar_venta_manual` contrasta la receta, y las pruebas de combo/checkout/anulación preparan `combo_items`. La relación `componente:productos!combo_items_componente_producto_id_fkey` requiere ese nombre de FK.

`promociones.items_combo` es un campo JSON para productos de una promoción de tipo COMBO; no es la receta física. La tabla histórica `public.items_combo` del master no aparece como almacenamiento actual consumido por POS/checkout y queda **LEGACY / NO incluida**. No se fusiona con el JSON de promoción ni con `combo_items`.

## Seguridad final

`900_final_security.sql` reemplaza cualquier policy intermedia de los módulos por un conjunto de lectura acotado por kiosco. RLS queda habilitado en las tablas del dominio. `anon` no tiene acceso a tablas/RPC de negocio; `authenticated` recibe sólo `SELECT` sobre catálogo, ventas, caja, stock, clientes e historial, más los RPC expresamente permitidos. Ningún rol API recibe `CREATE` sobre `public`.

- `confirmar_venta_manual(uuid,jsonb)`: `EXECUTE` sólo a `service_role` (y owner `postgres`); el navegador no la llama. El Edge autenticado valida sesión y actor antes de usar su cliente administrativo.
- `confirmar_venta_manual_interna_supervisor` y funciones internas/trigger: sin `EXECUTE` para roles API.
- `anular_venta_atomica(uuid,text,uuid)`: `EXECUTE` para `authenticated`; el cuerpo valida `auth.uid()`, perfil dueño activo y kiosco. `PUBLIC` y `anon` no reciben `EXECUTE`.
- `cancelar_checkout_manual` y funciones de lectura/recuperación: sólo las firmas usadas por clientes autenticados, con autorización validada dentro de cada RPC.
- SECURITY DEFINER: owner normalizado a `postgres`, `search_path=pg_catalog,public`; los cuerpos del paquete usan nombres de objetos `public.`/`auth.` calificados. Funciones de trigger no se exponen como RPC.
- Acceso `service_role`: exclusivamente servidor. Nunca colocar su clave en una variable `VITE_*` o código/navegador.

La instalación no abre operaciones de negocio hasta el paso final; aun así, la comprobación real de ACL/RLS/ownership/search_path queda pendiente de PostgreSQL real. Esta revisión estática no equivale a `SEGURIDAD_BASELINE=PASS`.

## Mapa a SQL histórico

Los archivos `steps/` derivan de snapshots locales de estos fuentes. Se preservan los SQL históricos originales; los módulos del baseline pueden contener adaptaciones locales explícitas como el contrato de `delta_stock` en `steps/005_stock_history.sql`. La secuencia eligió sólo los cambios necesarios para el contrato actual; no incluye todo el listado histórico 01–50.

| Objeto/contrato | Baseline | Fuente histórica | Diferencia/justificación |
| --- | --- | --- | --- |
| Usuarios | `001_domain.sql`, `002_identity_helpers.sql`, `steps/003_profile_integrity.sql` | `supabase_master_fase1_consolidacion.sql`, `supabase_seguridad_roles_rls.sql`, `supabase_fase_seguridad_perfiles.sql` | Perfil ligado de forma única a `auth.users`; no carga perfiles de producción ni el superadmin como flujo normal. |
| Ventas/pagos/caja | `001_domain.sql` | `supabase_master_fase1_consolidacion.sql` | Sólo columnas que checkout/anulación consumen; no instala reportes, proveedores, compras ni campos ARCA. DML de caja/venta no se concede al navegador. |
| Cuenta corriente | `001_domain.sql` | `supabase_master_fase1_consolidacion.sql`, `supabase_actualizacion_completa.sql` | Conserva cargo/abono e historial; los fixtures del piloto excluyen abonos posteriores. |
| Stock/lotes | `001_domain.sql`, `steps/005_stock_history.sql`, `steps/006_private_stock_costs.sql` | `supabase_actualizacion_completa.sql`, `supabase_fase_mermas_trazables.sql`, `supabase_fase_costos_movimientos_privados.sql` | FEFO y kardex conservados; costo privado y movimiento-costos están incluidos porque checkout/anulación los exigen. |
| Combos | `001_domain.sql` | `supabase_master_fase1_consolidacion.sql`, `supabase_combos.sql`, `supabase_fase_seguridad_combos.sql` | Sólo `combo_items` relacional actual. `items_combo` relacional del master se omite; `promociones.items_combo` JSON sí queda. Se omiten policies `USING(true)`. |
| Checkout/cola/cancelación | `steps/008`–`steps/028` | Fases checkout manual 20–28, 29–38, 44–48 | Secuencia final consolidada por snapshots, incluidos locks, política congelada, caja compartida e inmutabilidad. `steps/025` se coloca después de política congelada. |
| Anulación | `steps/007_annulment_audit.sql`, `steps/029_atomic_annulment.sql` | Fase auditoría 04 y `supabase_fase_anulacion_venta_atomica.sql` | Compensa movimientos y conserva operación original; fiscalización y devoluciones parciales quedan fuera. |
| RLS/grants | `900_final_security.sql` | `supabase_seguridad_roles_rls.sql`, policies históricas de combos/lotes/ventas y grants de cada fase | Sustituye permisos anchos por lectura por kiosco y RPC explícitas. No copia `USING(true)` como acceso cliente. |

## Gaps detectados

| Capacidad ausente o limitada | Clasificación | Consecuencia |
| --- | --- | --- |
| `envases_tipos_comercio`/stock compartido de envases | **NECESARIO DESPUÉS / fuera de piloto** | No incluir líneas de devolución de envase ni probar sincronización entre terminales. |
| ARCA, CAE, nota de crédito, refund electrónico, Point | **FUERA DE PILOTO** | No instalar Edge ni credenciales de esos medios. |
| Devoluciones parciales | **NECESARIO DESPUÉS** | `devoluciones_venta` es sólo un guard mínimo; no hay detalle/cálculo ni flujo de escritura. |
| Abonos de cuenta corriente posteriores | **FUERA DE PILOTO / requiere política** | Anulación de fiado sólo se valida para el caso sin abonos posteriores. |
| Reportes de auditoría de PIN/política y módulos de backup/compras | **NECESARIO DESPUÉS o NO DETERMINADO** | No son prerequisito del cierre normal; decidir antes de habilitar sus pantallas/funciones. |
| Frontend/build de staging y valor efectivo del flag | **NO DETERMINADO** | Sigue pendiente; el `.env.local` del ref anterior no debe usarse para construir staging. |

## Edge Functions

- `checkout-manual`: **OBLIGATORIA**, desplegar sólo luego de instalar y verificar este baseline en staging; `verify_jwt=true`, client key server-side y actor tomado de sesión Auth.
- `supervisor-pin`: **CONDICIONAL** para un caso de descuento que exceda política y requiera aprobación. Las tablas/RPC base de política/PIN quedan incluidas; no desplegar hasta habilitar y ensayar ese caso.
- `afip-wsfe`: **EXCLUIDA**, inventario solamente; ARCA queda apagado.
- Point y otras Edge Functions: no requeridas para el piloto manual.

## Validación y estado

En esta máquina no se detectaron `psql`, `postgres`, `pg_ctl`, Docker ni Supabase CLI/servicio PostgreSQL. `@electric-sql/pglite` sí está declarado e instalado en el proyecto; cualquier ejecución con PGlite es auxiliar y no demuestra ownership, grants, roles Supabase, concurrency o runtime de Auth.

Procedimiento pendiente para validación real: disponer de un PostgreSQL local desechable autorizado, con los prerequisitos Supabase/Auth documentados o un entorno local Supabase ya existente; crear una base nueva vacía, ejecutar los cuatro grupos en orden y verificar catálogos de tablas/constraints/índices, funciones/firma/owner/search_path, triggers, RLS/policies y ACL. No instalar herramientas para esta fase sin autorización y no sustituir esa validación con PGlite.

**BASELINE_CANONICO=PENDIENTE** (paquete local candidato creado; falta ejecución completa y verificación real).
**VALIDACION_POSTGRES_REAL=PENDIENTE** (motor ausente).
**SEGURIDAD_BASELINE=PENDIENTE** (revisión estática aplicada; falta validar ACL/ownership/RLS en PostgreSQL Supabase real).

No autorizar aún la instalación remota en `acoyfwwmhaeruciyedri`. No conectar ni tocar `wlqujnwxrmksheubfrha`.

## F6.2B — contrato local de dependencias de la aplicación

`contract/out-of-scope.json` clasifica los recursos excluidos bajo strict pilot. `src/test/backendContract.test.ts` extrae las dependencias literales de `src/` (relaciones, RPC, Edge Functions y Auth), resuelve los pocos usos dinámicos mediante un mapa cerrado y las compara con las definiciones del bootstrap y las exclusiones. No se detectaron buckets de Storage. `contract/write-access.json` registra el modo de escritura por flujo.

Las tablas de proveedores/compras/pagos y soporte están en `steps/030_application_relations.sql`. Los pasos posteriores agregan stock idempotente, auditoría de cajón/supervisor, electrónica, reportes, backup y restauración de combos. Los recursos comerciales, fiscales, Point, envases compartidos, devoluciones parciales y `v_resumen_caja` no se consumen bajo el perfil estricto declarado.

**El contrato todavía no está completo para habilitar toda la aplicación.** El bootstrap mantiene sin DML directo los libros sensibles. `proveedorStore` escribe una compra, sus detalles, stock, saldo del proveedor y caja con múltiples peticiones; `cajaStore` escribe sesiones/movimientos desde navegador; `clienteStore` separa cambio de saldo y movimiento de cuenta corriente; hay escrituras de stock directas fuera de las RPC idempotentes; y el alta Auth crea primero la identidad y luego el perfil desde el cliente. Estas rutas necesitan RPC transaccionales y callers adaptados, o guards que las deshabiliten hasta tenerlos. El SQL mantiene sin grants DML `compras_proveedor`, `detalles_compra`, `pagos_proveedor`, `movimientos_stock`, sesiones/caja, cuenta corriente y perfiles. Por esto el paquete no se puede conectar aún a todas las pantallas que siguen habilitadas.

### Orden, checksums y pre/postflight

`manifest.json` fija el perfil `ONE_SHOT_EMPTY_DB`, el orden completo de los 43 archivos SQL y SHA-256 por archivo: 41 archivos pre-import y 2 archivos post-import (`steps/042_post_import_triggers.sql` y `900_final_security.sql`). Para comprobarlo localmente:

```text
node supabase/bootstrap/verify-manifest.mjs --check
```

Antes de una futura instalación, configurar el entorno libpq (`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`, `PGSSLMODE`) fuera de la línea de comandos; suministrar `F6_EXPECTED_PROJECT_REF` (opcional) y `F6_ACTUAL_PROJECT_REF` (ref observado del destino). Después ejecutar `--preflight`, que exige base vacía y `current_user=postgres`. El preflight compara los refs que le entrega el operador; no obtiene independientemente el project ref del servidor.

Para C2-L, el único comando one-shot es `node scripts/f6-2d-migration.mjs IMPORT_LOCAL --target local`. El orquestador ejecuta preflight, los 41 archivos pre-import, importa la fixture sintética, reconcilia antes de triggers, aplica 042 y verifica los 15 triggers esperados, aplica 900, ejecuta postflight y reconcilia de nuevo. Para F6.3A existe además `IMPORT_ZERO_ROW_PACKAGE_LOCAL --target local --package <directorio>`: requiere antes el PASS de `VALIDATE_DEMO_ONLY_ZERO_ROW_CUTOVER`, valida íntegramente el paquete real aprobado y acepta sólo 0 filas de negocio y 0 Auth mappings. Su ventana de importación es un no-op explícito (no ejecuta INSERT); luego reconcilia que las 42 tablas contractuales y Auth estén vacías, verifica RLS, DML API denegado y PUBLIC EXECUTE revocado, instala 042/900 y repite la reconciliación. Este modo es local-only y no habilita importación de paquetes con datos. La metadata FK se normaliza como arrays ordenados `sourceColumns`/`destinationColumns`; el SQL castea los nombres de catálogo a `text[]` para que el driver PostgreSQL no los devuelva como `name[]` textual. `VALIDATE_ONLY` valida el contrato estructural y la reconciliación rechaza metadatos FK con tipos o longitudes inválidas. Si falla la reconciliación pre-trigger, se detiene antes de 042 y 900; se debe descartar/restablecer solamente el stack Supabase local antes de repetir. Los marcadores `PASS` y el resumen JSON dejan evidencia de cada gate. `IMPORT_LOCAL` además exige `F6_LOCAL_DATABASE_URL`, destino `local`, host loopback, puerto 54322, base `postgres`, usuario `postgres` y checkout sin vínculo remoto.

Para una instalación manual de validación distinta de C2, aplicar cada archivo listado en `manifest.json`, en ese orden y completo; detenerse ante el primer error y descartar/restaurar la instancia de ensayo. Ejecutar `--postflight` al final para validar estructura, RLS, RPC esenciales y la frontera de escritura directa. `preflight.sql` y `postflight.sql` son checks, no migraciones.

### F6.3B — bootstrap remoto futuro

`docs/f6-3b-production-bootstrap.md` describe el runner separado de producción. `PLAN_PRODUCTION_BOOTSTRAP` es offline. `PRODUCTION_BOOTSTRAP_REMOTE` exige la variable segura `F6_PRODUCTION_DATABASE_URL`, `--enable-production-bootstrap` y `--confirm-target-ref`; bloquea legacy/staging, hosts/ref no coincidentes, TLS inseguro y cualquier paquete con filas. El importador local permanece loopback-only. Un fallo tras comenzar SQL deja `TAINTED_BOOTSTRAP`; se debe recrear el destino mediante un gate aparte, nunca reanudar ni reparar incrementalmente.

Validación local disponible: `src/test/kioskoBootstrapSql.test.ts` ejecuta el orden completo con PGlite, verifica relaciones/RLS, ACL seleccionadas y pre/postflight. **No sustituye Supabase/PostgreSQL real**; ownership, concurrencia, comportamiento Auth, Realtime, Edge Function y seguridad efectiva siguen pendientes en una instancia desechable autorizada.

El baseline incluye `platform_initial_admin_bootstrap_state` como tabla destino-only vacía, clasificada en `data-migration.json.reinitialize`. La seguridad final habilita RLS y revoca incluso el acceso de `service_role` a esa tabla; sólo el operador conectado como `postgres` puede gestionar su estado. Tras el bootstrap zero-row, `scripts/f6-3b-initial-platform-admin.mjs` prepara en un rehearsal local el SuperAdmin global (`rol=VISOR`, `es_superadmin=true`, kiosco NULL) y el primer Dueño. No ejecutar el runner contra un proyecto hosted sin un gate posterior explícito.
