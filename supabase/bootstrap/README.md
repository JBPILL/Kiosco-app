# Baseline canónico KioskoPOS — checkout piloto

Estado: **candidato local, ONE_SHOT_EMPTY_DB, no autorizado para instalar en Supabase**.

Este paquete separa el esquema reconstruible desde cero de los SQL históricos incrementales. Define sólo el dominio que necesita el piloto de checkout manual, cancelación pendiente y anulación atómica. No es una migración para una base existente y no contiene datos, identificadores comerciales, claves ni project refs.

## Orden de aplicación

Aplicar cada archivo completo, en este orden, sólo en una instancia vacía y desechable de Supabase, con `current_user=postgres`:

1. `001_domain.sql`
2. `002_identity_helpers.sql`
3. Todos los archivos de `steps/` en orden lexicográfico (`003` a `029`).
4. `900_final_security.sql` como último paso.

La secuencia tiene transacciones por módulo. No conectar un frontend ni crear fixtures durante la instalación; las tablas quedan con RLS habilitado y sin acceso API mientras se monta el paquete. Si falla cualquier paso, detenerse: no reanudar sobre el esquema parcial ni convertirlo en una migración incremental. Usar una instancia vacía nueva o restaurar el proyecto de ensayo bajo un procedimiento administrativo explícito.

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
