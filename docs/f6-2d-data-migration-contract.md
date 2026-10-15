# F6.2D — Contrato de migración de datos

Estado: **F6.2D-C1 MAPPING PLAN PASS; importación sigue BLOCKED**. El usuario ejecutó manualmente los bloques read-only 00–11 en el legacy y compartió resultados agregados/sanitizados. Codex no se conectó a ningún backend ni ejecutó consultas. El baseline del bloque 11 es `PRE_CUTOVER` y no habilita export/import.

## Alcance y evidencia

Este documento deriva el destino exclusivamente de `supabase/bootstrap/manifest.json`, SQL enumerado por ese manifest y `supabase/bootstrap/contract/{README.md,write-access.json,out-of-scope.json}` del checkout aislado F6.2C-L. `KNOWN_FROM_CONTRACT` significa garantizado por esos artefactos; `REQUIRES_LEGACY_READ_ONLY_INVENTORY` significa que la columna/origen, calidad, volumen o semántica debe verificarse contra legacy antes de exportar. No equivale a autorización para leerlo ahora.

Se preservan UUID de negocio (`id`) cuando existen y la identidad de kiosco. No se presume que el UUID de `auth.users` sea igual al de `public.usuarios.auth_user_id`.

## Matriz de entidades destino

FK listadas son las definidas por el bootstrap, incluyendo las referencias compuestas donde aparecen. `O` = orden de carga, según DAG abajo. Obligatoriedad es para el corte de los módulos incluidos; los registros opcionales pueden quedar vacíos, no inventarse.

| Tabla | PK | FK destino | Dep. / O | Necesidad y tipo | Transformación / reconciliación |
|---|---|---|---|---|---|
| `kioscos` | `id` | — | 1 | REQUIRED, identidad negocio | Preservar ID; normalizar sólo columnas contractuales. Conteo/IDs exactos. |
| `usuarios` | `id` | `kiosco_id → kioscos.id`; `auth_user_id` no tiene FK fuente a `auth.users` | 2 | REQUIRED para perfiles operativos | Preservar `id`; mapear auth UUID nuevo. Sólo roles `DUEÑO`,`CAJERO`,`VISOR`; `es_superadmin` no se concede por datos de usuario. |
| `categorias` | `id` | `kiosco_id → kioscos.id` | 3 | OPTIONAL catálogo | Preservar ID; categoría huérfana => cuarentena, no borrar relación silenciosamente. |
| `proveedores` | `id` | `kiosco_id → kioscos.id` | 3 | REQUIRED si se incluyen compras | Preservar ID; `saldo_pendiente` se reconcilia con ledger, no se usa como fuente aislada. |
| `productos` | `id` | Fuente: `kiosco_id → kioscos.id`; `categoria_id → categorias.id`; `proveedor_id → proveedores.id` (FKs simples; además validar mismo kiosco) | 4 | REQUIRED, operativo e histórico | Preservar ID; `stock_actual` destino se valida contra stock/lotes/movimientos. Numéricos destino: costo/precio 2 decimales, stock 3. |
| `combo_items` | `id` | `kiosco_id → kioscos`; `combo_producto_id`,`componente_producto_id → productos` | 5 | OPTIONAL, catálogo | Conservar receta física compatible; verificar tenant, positividad y no autorreferencia. No confundir con JSON `promociones.items_combo`. |
| `promociones` | `id` | `kiosco_id → kioscos`; `producto_id → productos`; `categoria_id → categorias` | 5 | OPTIONAL, operación compatible | Mapear sólo tipos destino `NXM`,`VOLUMEN`,`PORCENTAJE`,`COMBO`; JSON y días se validan contra forma destino. |
| `producto_costos` | `producto_id` | `producto_id → productos`; `kiosco_id → kioscos` | 5 | REQUIRED si costo operativo | Es snapshot actual, no historial. Verificar con precio costo de `productos`; 2 decimales. |
| `lotes_producto` | `id` | `kiosco_id → kioscos`; `producto_id → productos` | 5 | REQUIRED si el producto usa lotes/vencimiento | Preservar ID; validar cantidad actual/inicial y fecha civil; fecha vencimiento `date`, ingreso `timestamptz`. |
| `sesiones_caja` | `id` | `kiosco_id → kioscos`; `usuario_id → usuarios` | 5 | REQUIRED historial cerrado | En OPERATIONAL_CUTOVER_REQUIRED, sólo `CERRADA` con `fecha_cierre`; reconciliar importes y cerrar abiertas. Para el set demo-only de cero filas, el blocker puede ser N/A sólo si pasa todas las condiciones de `cutoverPolicy`.
| `clientes` | `id` | `kiosco_id → kioscos` | 5 | OPTIONAL, operativo/histórico | Preservar ID; datos personales sólo si necesarios y permitidos; saldo se compara con ledger. |
| `ventas` | `id` | `kiosco_id → kioscos`; `usuario_id`,`anulada_por → usuarios`; `sesion_caja_id → sesiones_caja` | 6 | REQUIRED, historia compatible | Estados sólo `COMPLETADA`,`ANULADA`; sesión ligada debe ser cerrada. Totales 2 decimales; mantener fecha absoluta y zona origen documentada. |
| `detalles_venta` | `id` | `venta_id → ventas`; `producto_id → productos` | 7 | REQUIRED para venta migrada | Conservar cantidad/precios/subtotal y banderas de envase; validar `subtotal` vs regla fuente. No reconstruir detalle desde total. |
| `pagos_venta` | `id` | `venta_id → ventas` | 7 | REQUIRED para venta migrada | Métodos y referencias sólo según valores existentes y política de privacidad; suma contra total/saldo con diferencia exacta del modelo monetario. |
| `movimientos_stock` | `id` | `kiosco_id → kioscos`; `producto_id → productos`; `usuario_id → usuarios`; `lote_producto_id → lotes_producto` | 7 | REQUIRED compatible | En destino `delta_stock` es firmado; `cantidad` no representa delta. Conservar motivos/tipos únicamente si compatibles; reconcile `sum(delta_stock)` sólo donde el origen tenga esa semántica. |
| `movimiento_stock_costos` | `movimiento_id` | `movimiento_id → movimientos_stock`; `kiosco_id → kioscos` | 8 | OPTIONAL, costo histórico | Migrar sólo cuando el costo representa el movimiento original; no derivar retrospectivamente un costo ausente. |
| `movimientos_caja` | `id` | `kiosco_id → kioscos`; `sesion_caja_id → sesiones_caja`; `usuario_id → usuarios` | 7 | REQUIRED compatible | Sólo movimientos de sesiones cerradas; preservar tipo/motivo/importe/instante. Suma por sesión contra cierre. |
| `compras_proveedor` | `id` | Fuente: `kiosco_id → kioscos`; `proveedor_id → proveedores`; `usuario_id → usuarios`; `sesion_caja_id → sesiones_caja` (FKs simples; además validar mismo kiosco) | 6 | REQUIRED historia comercial | Estados/medios sólo enums destino. Si caja relacionada, debe ser cerrada. |
| `detalles_compra` | `id` | `compra_id → compras_proveedor`; `producto_id → productos` | 7 | REQUIRED para compra migrada | Cantidad 3 decimales; costo/subtotal 2. No inferir líneas faltantes de total. |
| `pagos_proveedor` | `id` | Fuente: `kiosco_id → kioscos`; `proveedor_id → proveedores`; `sesion_caja_id → sesiones_caja` (FKs simples; además validar mismo kiosco) | 7 | REQUIRED historia compatible | Sesión sólo cerrada; conciliar monto, saldo anterior/nuevo y efecto de caja. |
| `operaciones_escritura` | — | No aparece en el inventario de columnas/tablas observado | — | SOURCE_RELATION_ABSENT | Conteo fuente 0 en 03. No se puede importar evidencia de operación desde esta relación. |
| `movimientos_proveedor` | — | No aparece en el inventario de columnas/tablas observado | — | SOURCE_RELATION_ABSENT | No existe ledger histórico dedicado; como proveedores/compras/pagos tienen dominio vacío, no bloquea este dataset. No afirmar trayectoria de saldo ni fabricar eventos. Si el baseline final cambia, reabrir mapping. |
| `historial_precios_producto` | — | No aparece en el inventario de columnas/tablas observado | — | SOURCE_RELATION_ABSENT | Conteo fuente 0 en 03; no se migrará historial de precio desde esta tabla. |
| `movimientos_cuenta_corriente` | `id` | `cliente_id → clientes`; `kiosco_id → kioscos`; `venta_id → ventas`; `usuario_id → usuarios` | 8 | REQUIRED si hay saldo cliente | Orden temporal estable; cada saldo_resultante debe recomputarse desde saldo inicial acreditado y movimientos, dinero exacto. |
| `producto` stock snapshot | `productos.stock_actual` | tabla `productos` | 9 | REQUIRED operacional | No es tabla separada: importar como snapshot reconciliado con lotes y movimientos; diferencias no explicadas bloquean. |
| `configuración compatible` | variable | según clave puede referir kiosk/user/product | 9 | OPTIONAL/REQUIRED por lista allowlist | No hay tabla genérica de configuración confirmada en este bootstrap. Importar únicamente campos de `kioscos`/`productos` listados en allowlist; todo otro recurso requiere decisión/inventario. |

### Tablas fuera de migración de datos operativos

`auth.users`: recreación/invitación controlada; jamás copiar tokens ni secretos. `checkout_manual_entradas`, `checkout_manual_cancelaciones`, supervisor PIN/secretos/intentos/autorizaciones, tickets de soporte, solicitudes de cajón y operaciones de stock en vuelo son estado de seguridad/transitorio: iniciar vacíos o reaprovisionar de forma local al destino. `supervisor_politicas` es configuración de seguridad: volver a establecer y aprobar en destino, no copiar a ciegas; `supervisor_politica_auditoria` no se carga por defecto. `devoluciones_venta` está fuera de scope (devoluciones parciales); cualquier venta relacionada debe ser clasificada y no transformada como venta ordinaria. `auditoria_operaciones`, auditorías de política/config y backups requieren política de retención/privacidad y no se incluyen automáticamente. `electronica_*` queda OUT_OF_SCOPE por el límite ARCA/Point/electrónica hasta que contrato de producto lo cambie. No migrar recursos no presentes en bootstrap.

`checkout_manuales` y `anulaciones_venta_atomicas` requieren tratamiento especial: mantener sólo evidencia histórica coherente de ventas ya completadas/anuladas si el conjunto origen conserva solicitud/resultado y las claves no reejecutables; de lo contrario, migrar la venta como archivo histórico no anulable y no fabricar idempotency records. Confirmar columnas/invariantes del legacy antes de decidir por fila. Ninguna venta reactivará checkout/cancelación.

### Inventario explícito de tablas fuera de carga

| Tabla/objeto del bootstrap | Clasificación | Tratamiento |
|---|---|---|
| `auditoria_operaciones` | OPTIONAL / privacy review | No cargar automáticamente; verificar PII, política de retención y trazabilidad antes de incluir. |
| `checkout_manual_entradas` | OUT_OF_SCOPE operational | Reinitializar vacío; no reusar challenges, snapshots ni autorizaciones. |
| `checkout_manual_cancelaciones` | OUT_OF_SCOPE operational | Reinitializar vacío; no copiar cancelaciones pendientes ni resoluciones. |
| `devoluciones_venta` | OUT_OF_SCOPE | Excluir devoluciones parciales; venta relacionada va a cuarentena. |
| `operaciones_stock` | OUT_OF_SCOPE transient | No copiar requests/resultados/cancelaciones idempotentes; stock histórico compatible se migra como ledger. |
| `supervisor_autorizaciones` | OUT_OF_SCOPE security state | Reinitializar vacío; nunca migrar grants temporales. |
| `supervisor_pin_config_auditoria` | OUT_OF_SCOPE security audit | Excluir por defecto; PIN y evidencia deben renovarse en destino. |
| `supervisor_pin_intentos`, `supervisor_pin_limites` | OUT_OF_SCOPE transient/security | Reinitializar límites e intentos en destino. |
| `supervisor_pin_secretos` | OUT_OF_SCOPE secret | No exportar ni migrar; registrar un PIN nuevo usando flujo destino. |
| `supervisor_politica_auditoria` | OUT_OF_SCOPE security audit | Excluir por defecto; no copiar actor_auth_id como autoridad. |
| `tickets_soporte` | OUT_OF_SCOPE por defecto | Tickets incluyen posibles datos personales/diagnósticos; conservar fuera del destino hasta política explícita. |
| `electronica_unidades`, `electronica_reparaciones`, `electronica_solicitudes` | OUT_OF_SCOPE | Excluidas por decisión de dominio; revisar sólo si cambia el alcance ARCA/Point/electrónica. |
| `supervisor_politicas` | REINITIALIZE / config | Volver a establecer el umbral de descuento mediante aprobación del dueño; no copiar sin revisión. |
| `auth.users` y sesiones Auth | RECREATE / NO TOKENS | Crear/invitar usuarios en el Auth destino; no copiar credenciales, hashes, tokens ni sesiones. |
| storage buckets / objetos | REQUIRES_INVENTORY | Backend contract no declara bucket requerido; no migrar objetos hasta identificar propietario, PII y necesidad. |

`kioscos.estado_suscripcion` no importa estado de planes/subscriptions legacy. En el destino se establece sólo el valor operativo permitido por una decisión explícita; no se hereda una suspensión/comercial entitlement por accidente. `kioscos.capacidades_operativas` y `equipos_comercio` usan allowlist de claves compatible, no copia ciega de JSON legacy.
## DAG de carga (FK observadas en legacy)

1. Crear/matchear los nuevos `auth.users` mediante invitación/provisioning; guardar el UUID nuevo en el mapping privado. No migrar sesiones/tokens.
2. `kioscos`.
3. `usuarios` (FK `kiosco_id → kioscos`; el `auth_user_id` fuente no tiene FK a `auth.users`).
4. `categorias`, `proveedores`, `clientes` y sesiones cerradas (`sesiones_caja`, que dependen de kiosco/usuario).
5. `productos` (kiosco y FKs opcionales a categoría/proveedor); luego `combo_items`, `promociones`, `producto_costos` y `lotes_producto`.
6. Cabeceras `ventas` y `compras_proveedor` (kiosco, usuario/sesión opcionales; compra además proveedor).
7. `detalles_venta`, `pagos_venta`, `detalles_compra`, `pagos_proveedor`, `movimientos_caja` y `movimientos_stock` (los movimientos de stock dependen de producto, lote opcional y usuario opcional).
8. `movimiento_stock_costos` y `movimientos_cuenta_corriente` (movimiento de cuenta depende de cliente/kiosco, y venta/usuario opcionales).
9. `checkout_manuales` y `anulaciones_venta_atomicas` sólo si pasa su regla de evidencia histórica; ambos dependen de ventas y kiosco. Configuración compatible al final.
10. Reconciliar snapshots `productos.stock_actual`, `clientes.saldo_deudor` y `proveedores.saldo_pendiente`; no recalcular hasta entender el ledger observable.

**Ausencias y límites:** `operaciones_escritura`, `movimientos_proveedor` e `historial_precios_producto` no aparecen en el inventario de relaciones con columnas. El ledger dedicado de proveedor, por tanto, no está disponible para reconstruir su historia. Los `pagos_proveedor` sí exponen `saldo_anterior` y `saldo_nuevo`, pero eso no sustituye un ledger de cargos y no demuestra el saldo en los intervalos sin pagos.

**FK observadas:** todas las referencias de proveedor/kiosco son constraints simples independientes; la igualdad de tenant se debe validar por separado. `movimientos_stock.lote_producto_id → lotes_producto.id`; `ventas` y `compras_proveedor` apuntan opcionalmente a sesión; `detalles_compra` depende de compra/producto, y detalles/pagos de venta dependen de `ventas`.

## Transformación determinista y cuarentena

- Exportar valores originales a un bundle inmutable con hash SHA-256 por archivo y conteos; transformar en otro directorio, conservar `source_id`, `source_table`, `source_row_hash` y versión del transform.
- Preservar IDs UUID de negocio. Rechazar UUID malformado, duplicado o colisión entre tenants; prohibido regenerar silenciosamente IDs relacionados.
- Aplicar defaults sólo si el destino declara ese default y la fuente representa ausencia; registrar cada default aplicado. No convertir `NULL` a cero/vacío sin regla aprobada.
- Enum fuera de CHECK, precisión superior a NUMERIC destino, monto no representable, fecha inválida, FK huérfana, código duplicado con unicidad aplicable, registro sin kiosco o relaciones cruzadas => cuarentena y NO-GO; no descartar ni adivinar.
- `timestamp without time zone` requiere zona fuente probada; convertir a UTC conservando instante y registrar zona/regla. `date` no cambia de zona. Sin zona verificable: blocker.
- `productos.stock_actual`, `clientes.saldo_deudor`, `proveedores.saldo_pendiente`, totales y saldos derivados no se recalculan hasta conocer invariantes de origen y comparar todos los movimientos. Diferencia no explicada bloquea.
- El inventario 01–02 ya confirma nombres/tipos/nullability-defaults, PK/FK/UNIQUE/CHECK, índices, triggers, funciones, RLS/policies/grants. La compatibilidad de enums/datos y la comparación completa con el target siguen `REQUIRES_LEGACY_READ_ONLY_INVENTORY`/validación de datos; no hay mapeo de valores por fila aprobado.

## Auth y mapping

Archivo privado fuera de Git: `auth-map.csv` con columnas `legacy_business_user_id,new_auth_user_id,profile_id,kiosco_id,role,identity_status,invite_status`. No incluir email/password en reportes ni logs; el CSV debe tener permisos restrictivos y destruirse según retención después de conciliar. `profile_id` conserva `public.usuarios.id`; `legacy_business_user_id` es referencia de trazabilidad, no credencial.

Estrategia destino: recrear/invitar usuarios en Auth nuevo; crear perfil con `provision-user` como Edge Function autenticada por caller autorizado, usando credenciales administrativas sólo en servidor. Reconciliar por correspondencia explícita aprobada (email verificado + revisión humana de identidad, o identificador de negocio inequívoco); no auto-emparejar sólo por nombre/email no verificado. Casos sin correspondencia se dejan deshabilitados y se resuelven por invitación/reset con titular; bloquear la habilitación del usuario hasta confirmar kiosco y rol. No migrar hashes Auth salvo validación documentada de compatibilidad Supabase/Postgres y decisión de seguridad posterior; decisión actual: no hacerlo. Nunca importar `app_metadata` de origen como autoridad; rol/kiosco se otorgan desde mapping validado.

## Definición de históricos compatibles

- **Ventas:** sólo tickets completos con cabecera válida; conserva estado, instante, vendedor si mapeado, caja cerrada opcional y total. Venta anulada debe conservar actor/fecha/motivo y ledger inverso compatible. Ventas con devolución parcial, ARCA/CAE, Point o significado de pago externo no modelado quedan fuera/cuarentena; no convertirlas a `COMPLETADA`.
- **Detalle y pagos:** conservar todas las líneas y medios como se registraron. Exigir suma de líneas/ajustes/envases y suma de pagos/cuenta corriente compatible con total y reglas fuente. Si legado sólo guarda total o los métodos no son equivalentes, el ticket no es historia transaccional compatible.
- **Movimientos de stock:** conservar sólo eventos cuyo tipo, signo, producto/lote y motivo se puedan mapear sin alterar significado. No calcular neto a partir de `cantidad` positiva: la documentación del contrato exige `delta_stock` signed. Conciliar stock inicial + delta neto = snapshot, teniendo en cuenta combos, anulaciones y productos virtuales según reglas source verificadas.
- **Compras/pagos proveedor:** compra conserva cabecera y líneas; pago conserva monto, estado y relación de caja cerrada. El inventario legacy no contiene `movimientos_proveedor` ni `operaciones_escritura`; `proveedores.saldo_pendiente` y los campos `saldo_anterior`/`saldo_nuevo` de pagos no bastan para reconstruir cargos históricos faltantes. Se bloquea la compatibilidad completa de ledger hasta definir si se permite un saldo inicial auditable en destino; no inventar movimientos.
- **Caja:** incluir sesiones cerradas y movimientos compatibles. Saldo inicial, flujo de movimientos, ventas/pagos en efectivo/compras y cierre declarado deben cuadrar según fórmula del origen. No migrar la sesión abierta ni asociar nuevas ventas a sesiones antiguas.
- **Cuenta corriente:** cada cargo/abono debe apuntar cliente del mismo kiosco; preservar venta cuando existe, monto, timestamp, medio y saldo resultante. Si saldo inicial no está respaldado por ledger, NO-GO hasta definir evento de apertura auditable, no fabricar filas.

## Reconciliación obligatoria (exacta)

Por cada tabla incluida: conteo antes/después; IDs únicos y conjunto de PK igual; FKs huérfanas = 0; tenants cruzados = 0; hash de filas normalizadas iguales excepto transformación aprobada. Conciliar por kiosco y, donde aplique, por moneda/currency (el bootstrap no declara moneda: confirmar legacy/política; diferencias de moneda bloquean).

- Dinero usa precisión destino `NUMERIC(12,2)`: tolerancia 0.00. Cantidad usa escala 3; tolerancia 0.001 sólo si la regla de redondeo fuente/destino está aprobada; por defecto igualdad exacta a escala destino.
- Venta: cantidad, total cabeceras, detalle, pagos por medio, anuladas/completadas, fecha mínima/máxima.
- Clientes/proveedores: saldo agregado y saldo por contraparte; ledger recomputado en orden `(timestamp,id)` contra snapshot; diferencia cero.
- Caja: conteo de sesiones cerradas; montos inicial/declarado/sistema/diferencia; movimientos por sesión y tipo; diferencia 0.00 según fórmula fuente.
- Stock: por `(kiosco,producto)`, snapshot, cantidad por lote/fecha, `SUM(delta_stock)` por motivo/tipo, relación de movimientos a lote; reconciliar fórmulas de virtuales por separado.
- Compras: total cabecera vs detalle, pagos, cargos proveedor, movimientos de caja vinculados.
- Auth: perfiles operativos elegibles = mapeos confirmados; cada `auth_user_id` destino único, perfil con kiosco/rol aprobado; tokens importados = 0.

## Riesgo de triggers legacy y requisito para F6.2D-C2

El inventario comunicado reporta triggers con efectos laterales en `detalles_compra` (impacto stock), `detalles_venta` (descuento stock), `movimientos_stock` (captura/registro de costo), `productos` (auditoría/protección de costo), `usuarios` (protección de privilegios), `ventas` (validaciones/auditoría/anulación) y `sesiones_caja` (protecciones de cierre). Estos efectos se consideran `REQUIRES_LEGACY_READ_ONLY_INVENTORY` hasta recibir la metadata detallada de triggers y funciones asociadas.

Consecuencia de importación: no se debe insertar historia con todos los triggers operativos activos y luego cargar snapshots/ledgers de stock, porque puede repetir efectos (por ejemplo, doble impacto de stock). Tampoco se deben copiar las funciones, ACL/grants, policies RLS ni triggers de seguridad del legacy al destino. El destino conserva sólo el bootstrap endurecido validado en F6.2B/F6.2C-L.

El plan C1 prohíbe desactivar/eliminar triggers y usar RPC de negocio para replay histórico. F6.2D-C2 debe diseñar e implementar sólo en local un camino importador destino-only, dedicado y transaccional, compatible con validaciones y sin repetir efectos laterales. No ejecutar una carga durante C1.
## Freeze, corte y rollback

1. Preparar destino limpio desde bootstrap canónico y validar postflight; importar sólo bundle local preparado y aprobado. No se autoriza aquí ninguna escritura.
2. Anunciar ventana; congelar escrituras de negocio en origen con control operativo (deshabilitar frontend/roles y detener integraciones/colas autorizadas). Mantener lectura.
3. Cerrar y reconciliar toda caja abierta; resolver checkout manual pendiente/outbox por el procedimiento del producto. Debe quedar cero operación pendiente; nunca borrar IndexedDB/outbox para forzar el corte.
4. Tomar export final consistente en snapshot transaccional; añadir delta posterior a export inicial si hubo ensayo. Hash y conteos de origen; firma/registro de operador y hora UTC.
5. Transformar en cuarentena local, aprobar errores; importar en orden DAG dentro de destino aislado. Validar constraints/reconciliación completa y auth mapping antes de apuntar frontend.
6. GO sólo con conteos/IDs exactos, saldos/stock/caja cero diferencia, login/provisioning y smoke controlado aprobados. Habilitar frontend y escrituras en destino de forma atómica y monitorizada; origen queda congelado y preservado.

Rollback: antes de habilitar escrituras nuevas, cualquier fallo (export/import/reconcile/Auth/frontend/smoke) = NO-GO, mantener origen como fuente de verdad, mantener destino aislado, corregir bundle/transform y repetir en destino limpio. Después de habilitar escrituras en destino, no volver a escribir en origen ni apuntar atrás automáticamente: congelar ambos, exportar/conciliar el delta del destino y tomar decisión explícita de recuperación; si no se puede reconciliar, detener operaciones y preservar ambos estados para recuperación. No borrar proyectos ni datos.

## Gate y preguntas pendientes del inventario legacy

`F6.2D-C1` define el plan y mapping fuente→destino. La migración ejecutable continúa bloqueada. Los resultados de inventario recibidos identifican 4 kioscos, 6 perfiles, 285 productos, 284 costos actuales, 122 movimientos de stock, 28 ventas, 118 detalles, 28 pagos, 7 sesiones de caja (4 abiertas), y dominios vacíos de clientes/CC y proveedores/compras/pagos. El bloque 11 es `PRE_CUTOVER`.

## F6.2D-C1 — Mapping explícito

La fuente machine-readable es [`source-destination-mapping.json`](../supabase/bootstrap/contract/source-destination-mapping.json). Su allowlist de columnas es un contrato de planificación sujeto a revalidación contra la revisión final del bootstrap y al baseline final; no es un formato de exportación ni autoriza cargar filas.

| Dominio/tabla | Clasificación C1 | Regla fuente→destino |
|---|---|---|
| `kioscos` | REQUIRED | Preservar UUID y atributos operativos compatibles. Excluir secretos AFIP/ARCA, comercial/subscripciones y capacidades fuera de alcance. |
| `usuarios` | CONDITIONAL | Preservar `usuarios.id`; mapear Auth UUID nuevo. Cinco perfiles tienen kiosk válido; el sexto tiene `kiosco_id NULL` y queda bloqueado hasta decisión explícita. Excluir `pin_hash`. |
| `auth.users` | CONDITIONAL / RECREATE | Recrear/invitar y vincular individualmente; excluir los 9 Auth users sin perfil y no copiar hashes, sesiones ni tokens. |
| `categorias` | REQUIRED | Preservar IDs y tenant; validar nombres y FK. |
| `productos` | REQUIRED | Preservar IDs, relaciones y snapshot de `stock_actual`; `precio_costo` fuente no se utiliza. |
| `producto_costos` | REQUIRED | 284 filas son fuente de costo vigente; preservar importes exactos. No crear la fila faltante. |
| `combo_items`, `promociones` | OPTIONAL | Mantener sólo filas compatibles, válidas y en el mismo tenant. |
| `lotes_producto` | CONDITIONAL | Preservar lote/cantidades/fechas; no reproducir consumo de stock. |
| `sesiones_caja`, `movimientos_caja` | CONDITIONAL | La regla estándar bloquea por 4 sesiones abiertas, 14 ventas ligadas y 1 movimiento de caja ligado. El set demo-only de cero filas puede marcar sólo estos blockers N/A tras validación local fail-closed.
| `ventas`, `detalles_venta`, `pagos_venta` | REQUIRED / CONDITIONAL | Preservar historia compatible e IDs. Excluir ARCA/CAE/Point y filas parciales/envases compartidos fuera de scope. La venta anulada entra con estado final; no ejecutar su anulación. |
| `movimientos_stock`, `movimiento_stock_costos` | CONDITIONAL | Cargar kardex compatible sin modificar snapshot; convertir tipos/dirección a `delta_stock`; sólo 63 costos existentes, sin completar los 59 ausentes. |
| `clientes`, `movimientos_cuenta_corriente` | EMPTY_DOMAIN | Cero filas; no fabricar clientes, saldos iniciales o ledger. |
| `proveedores`, `compras_proveedor`, `detalles_compra`, `pagos_proveedor` | EMPTY_DOMAIN | Cero filas; ausencia de `movimientos_proveedor` no bloquea este dataset vacío. No crear saldos/eventos. |
| `checkout_manuales`, `anulaciones_venta_atomicas` | EVIDENCE_ONLY | Evidencia no reejecutable, sólo tras revisión de payload, actor, privacidad e invariantes de triggers del target. No invocar checkout/anulación. |
| `operaciones_escritura`, `movimientos_proveedor`, `historial_precios_producto` | OMIT | Relaciones ausentes en legacy; no sintetizar equivalentes. |
| Recursos excluidos | OMIT | Fixtures/sintéticos, secretos, Auth tokens/sesiones, planes/suscripciones, AFIP/CAE, Point, devoluciones parciales, envases compartidos y controles legacy. |

### DAG de carga propuesto

1. `kioscos`.
2. Recreación Auth aprobada y `usuarios` operativos (el perfil con kiosk NULL no entra hasta resolverse).
3. `categorias`, `proveedores`, `clientes`.
4. `productos` con snapshot autoritativo de stock.
5. `producto_costos`, `combo_items`, `promociones`, `lotes_producto`.
6. `sesiones_caja` cerradas.
7. `ventas` y `compras_proveedor`.
8. `detalles_venta`, `pagos_venta`, `detalles_compra`, `pagos_proveedor`, `movimientos_stock`, `movimientos_caja`, `movimientos_cuenta_corriente`.
9. Evidencia opcional `movimiento_stock_costos`, `checkout_manuales` y `anulaciones_venta_atomicas`, sujeta a la estrategia local de importación y nunca ejecutada como operación de negocio.

El orden sigue FK del bootstrap y dependencias de tenant. La matriz JSON contiene dependencias y transformación por entidad. En particular, `INGRESO → delta_stock=+cantidad`, `EGRESO → delta_stock=-cantidad`; para `AJUSTE` no se infiere dirección por `tipo`: la semántica fuente debe probar el signo antes de admitir la fila. `productos.stock_actual` es snapshot independiente y autoritativo.

### Históricos, triggers y corte

- La venta anulada (1 por 2,240.00 en el baseline PRE) conserva estado final. Importarla no llama RPC de anulación, no repone stock, no mueve caja/cuenta corriente y no duplica auditoría. El registro de `anulaciones_venta_atomicas` queda condicionado a que el trigger destino endurecido acepte evidencia histórica con actor mapeado; de lo contrario se retiene como evidencia externa bajo política aprobada y se preserva la venta anulada.
- No deshabilitar ni eliminar triggers. Tampoco importar por RPC operativas que cambien stock/caja/saldos. F6.2D-C2 debe diseñar y probar localmente un canal de importación destino-only con principal no-browser, transacción, validaciones tenant/FK y prevención explícita de side effects duplicados. No está implementado ni autorizado en C1.
- `OPERATIONAL_CUTOVER_REQUIRED`: congelar escrituras, resolver operaciones pendientes, cerrar/reconciliar cajas abiertas, tomar `FINAL_BASELINE` y preparar delta/export. El origen sigue como fuente de verdad hasta reconciliación y GO.
- `DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE`: únicamente si el validator local confirma todas las precondiciones de `data-migration.json`; no requiere cierre de cajas ni delta/export final. No exime preparar destino limpio, bootstrap, seguridad, Auth, topología ni smoke tests.

### Auth y reconciliación

El mapping privado `legacy_business_user_id → new_auth_user_id → profile_id → kiosco_id → role` requiere aprobación individual de identidad y rol. Se preserva `usuarios.id`; el `auth_user_id` destino es nuevo. No autoelevar desde metadata ni migrar sesiones/hash/token. Los 9 usuarios Auth sin perfil quedan excluidos. El único perfil con `kiosco_id NULL` no se etiqueta como huérfano: queda en cuarentena hasta que el dueño confirme el kiosco correcto o decida excluir/deshabilitarlo.

Reconciliar conteos y conjuntos de PK exactamente; FK huérfanas y tenants cruzados en cero; dinero NUMERIC con tolerancia 0.00; cantidades a escala 3 exactas; costos por producto; snapshot de stock por kiosk/product separado del kardex; ventas, líneas, pagos y estado de anulación; sesiones/movimientos de caja cerrados y su fórmula; dominios cliente/CC y proveedor/compra en cero. El inventario 11 actual es sólo PRE; repetir baseline después del freeze. Timestamps se comparan como instantes tras regla de zona probada, fechas DATE sin conversión horaria.

### Blockers para C2

1. Decisión explícita sobre el perfil con `kiosco_id NULL`.
2. Para el camino operativo, cierre/reconciliación de cuatro cajas, 14 ventas asociadas y 1 movimiento de caja ligado, seguido de `FINAL_BASELINE`. Para el set demo-only, sólo el resultado PASS del validator sustituye este requisito.
3. Clasificación fila/conteo de fixtures y datos sintéticos, devoluciones parciales, envases compartidos, Point y registros AFIP/CAE mezclados.
4. Confirmar semántica de enums, medios de pago, zona horaria, moneda y redondeo contra filas reales antes de cualquier export.
5. Diseñar y validar en local el importador histórico seguro frente a triggers y permisos del bootstrap endurecido.
6. Decidir si JSON de checkout y evidencia de anulación pueden retenerse sin reejecución ni autoridad falsificada.
7. Revalidar las columnas source→target frente a la revisión final del bootstrap.

El SQL 04 fue corregido estáticamente: separa `perfiles_kiosco_id_null`, `perfiles_kiosco_existente` y `perfiles_kiosco_inexistente`. La métrica anterior `matched_kiosco_id IS NULL` mezclaba kiosk NULL con kiosk no encontrado; no se ejecutó SQL para corregirla.

## Estado de C1 y pendientes para C2

Las preguntas anteriores sobre el inventario estructural se sustituyen por los blockers concretos de C2 enumerados arriba. Los bloques 00–11 fueron ejecutados manualmente por el usuario y sus resultados agregados se usan como `PRE_CUTOVER`; Codex no ejecutó SQL ni consultó el backend. No se exportaron datos completos/PII y no se creó carga.

**F6.2D-C1: PASS para plan/mapping; BLOCKED para exportación/importación.** Sin acceso remoto, export, import, commit, push ni deploy.





## F6.2D-C2 — carga sintética local

La ruta local queda organizada por fases canónicas del manifest: preflight, 41 SQL pre-import hasta `steps/041_catalog_support_write_hardening.sql`, fixture sintética, `steps/042_post_import_triggers.sql`, `900_final_security.sql` y postflight. El trigger de costo de stock no se desactiva; el checkout valida la función que provee su comportamiento, y los triggers se crean sólo después de importar. El archivo 042 no elimina triggers anteriores: exige una base limpia.

`node scripts/f6-2d-migration.mjs DRY_RUN` y `VALIDATE_ONLY` validan manifest, mapping y fixture sin DB. `IMPORT_LOCAL --target local` acepta únicamente `F6_LOCAL_DATABASE_URL` con host loopback, puerto 54322 y base `postgres`, rechaza un checkout linkeado y ejecuta preflight antes de cualquier SQL. Nunca recibe un bundle real. Sólo agrega placeholders sintéticos locales de `auth.users` por UUID, sin crear usuarios Auth ni credenciales. Importa columnas allowlisted y rechaza columnas/recursos fuera de alcance. Una caja abierta o perfil sin kiosco falla antes de insertar.

La reconciliación local compara conteos, snapshot de stock, costos NUMERIC, evidencia y ausencia de duplicación de movimientos/auditoría; las constraints/FK y postflight comprueban integridad estructural y seguridad. Si falla una etapa, la corrida se descarta y se reinicia únicamente el stack local desde vacío.

El fixture contiene cuatro kioscos sintéticos, un perfil DUEÑO mapeado, catálogo, combo/promoción, lote agotado, snapshot de stock separado del kardex, movimientos con/sin costo, ventas completada y anulada, detalles/pagos, caja cerrada y evidencias sintéticas. Clientes/CC y proveedores/compras/pagos permanecen vacíos. El ejemplo de perfil `kiosco_id = NULL` se rechaza: el target lo declara `NOT NULL`; la fila real continúa en cuarentena y requiere decisión del dueño antes de C3.

El importador y la fixture están implementados, pero el gate C2 requiere además ejecutar el one-shot en Supabase local real. La validación PGlite no sustituye Docker/Supabase local.

### Resultado de ejecución C2 actualizado

La validación de artefactos y la simulación completa en PGlite pasan; sin embargo, C2 no puede declararse PASS porque la instancia Supabase local no es alcanzable desde este proceso: Docker/psql/CLI no están disponibles en este shell, `npx --offline supabase status` no encontró la CLI en caché, y un intento SELECT-only al puerto local 54322 terminó inesperadamente incluso con ejecución ampliada. No se ejecutó `IMPORT_LOCAL` ni se envió SQL. Reanudar sólo cuando este checkout pueda hablar con el stack local confirmado; el importador exige URL loopback y la base vacía.


### F6.2D-C3D-4 — corte demo-only sin filas

El contrato distingue `OPERATIONAL_CUTOVER_REQUIRED` de `DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE`. La excepción cubre únicamente sesiones abiertas, ventas ligadas y movimientos de caja ligados; no se generaliza a otros dominios.

El set revisado registra 4 sesiones abiertas, 14 ventas ligadas y 1 movimiento de caja ligado. El validator local ya pasó para este set y su decisión es: `NOT_APPLICABLE_DEMO_ONLY_SOURCE` sólo después de que `VALIDATE_DEMO_ONLY_ZERO_ROW_CUTOVER` valide clasificación aprobada y completa, provenance de exclusión, integridad/reconciliación del paquete cero-filas, atribución de blockers a kioscos excluidos, relaciones sin huérfanos ni cruces de kiosco, y fingerprints/checksums fijados en el contrato. El estado validado de este set es `NOT_APPLICABLE_DEMO_ONLY_SOURCE`; cualquier cambio de evidencia o falla de una precondición vuelve a `CUTOVER_BLOCKER`.

En ese resultado, `finalDataDeltaRequired=false` y `finalDataExportRequired=false`. No se cierran ni modifican registros demo. La excepción no elimina preparación del destino, bootstrap, validación de seguridad, configuración Auth, resolución de topología ni smoke tests.
