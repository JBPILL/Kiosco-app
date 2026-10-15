# F6.2D-C3B-1 — semántica de stock y evidence cerrada

## Estado y límites

Revisión local de código, contratos y resultados agregados entregados manualmente por el usuario. No se consultó ningún backend. No se ejecutó `CLASSIFY_ONLY`, exportación ni importación; no hubo commit, push ni deploy.

## Decisiones cerradas

### Perfil con `kiosco_id IS NULL`

El único perfil sin kiosco queda excluido y en cuarentena. El destino exige `kiosco_id` para perfiles operativos; no se infiere ni asigna un kiosco. Aun si `es_superadmin=true`, ese estado global no satisface el contrato de perfil operativo.

### Stock histórico

Resultado agregado del origen:

| Tipo | Filas | Suma de `cantidad` | Negativas | Positivas | Min / max |
|---|---:|---:|---:|---:|---:|
| INGRESO | 3 | 3.000 | 0 | 3 | — / — |
| EGRESO | 119 | -160.000 | 113 | 6 | -8.000 / 1.000 |
| AJUSTE | 0 | — | 0 | 0 | — / — |

La suma firmada cruda total es `-157.000`, igual al baseline histórico recibido. El código muestra dos convenciones: escritores directos enviaban `EGRESO.cantidad` negativa antes de la normalización; el trigger SQL valida esa salida y almacena magnitud positiva en `cantidad` junto con delta negativo. Los agregados no atribuyen cada fila a un escritor concreto ni a una etapa del esquema, pero el contrato de `EGRESO` es inequívoco: representa una salida de stock.

**Regla del export:** canonicalizar al modelo destino sin `Number` de JS. Para `EGRESO`, `cantidad=abs(source.cantidad)` y `delta_stock=-abs(source.cantidad)`. Si el origen ya tiene cantidad negativa, ese valor exacto se conserva como delta; si tiene cantidad positiva, es magnitud según el contrato del trigger y se deriva delta negativo. Para `INGRESO`, se exige cantidad positiva y se copia a `cantidad` y `delta_stock`. Se rechazan ceros, `INGRESO` negativo y tipos desconocidos. `AJUSTE` continúa bloqueado porque no hay filas observadas ni semántica histórica aprobada.

La suma raw `cantidad` por tipo se mantiene en las métricas de origen y la suma canonical `delta_stock` se reporta aparte. No comparar directamente `-157.000` con el neto canonical, porque las seis cantidades positivas de `EGRESO` son magnitudes y deben contribuir negativamente. El snapshot `productos.stock_actual` sigue siendo autoritativo y se concilia separado del kardex. Este formato cumple las restricciones de magnitud/dirección del destino; los otros gates de importación permanecen separados.

### Medios de pago y dominios vacíos

Los únicos valores observados en `pagos_venta` son `EFECTIVO` (21), `MERCADOPAGO` (2), `TARJETA` (2) y `TRANSFERENCIA` (3). Todos están dentro del contrato del cliente; se preservan literalmente, sin conversión. Los dominios de clientes/cuenta corriente y proveedores/compras permanecen vacíos según el baseline y se validarán de nuevo en el baseline final.

### Timestamps, fechas y zona horaria

El origen reportó `TimeZone=UTC`; los instantes incluidos son `timestamptz` y las fechas puras son `date`. El export serializa `timestamptz` como ISO 8601 UTC con `Z` y seis dígitos fraccionales, conservando microsegundos; serializa `date` como `YYYY-MM-DD`, sin zona. No convierte timestamps sin zona ni cambia la hora de pared.

### NUMERIC y moneda

`pg` entrega `NUMERIC` como texto. El export exige cadenas decimales exactas para importes y cantidades, rechaza `Number` de JavaScript y calcula métricas con aritmética decimal `BigInt`. No redondea ni convierte moneda. La unidad monetaria de la aplicación sigue siendo ARS según el contrato existente.

### Evidence de checkout y anulación

`checkout_manuales` y `anulaciones_venta_atomicas` quedan `EVIDENCE_ONLY_DISABLED` y se omiten por completo del paquete. No hay una necesidad funcional demostrada que justifique migrar esos registros. No se exportan `solicitud` ni `resultado`, ni proyecciones: incluyen notas, pagos/detalles, snapshots de stock y saldos de clientes. Para la auditoría se usan sólo los conteos y agregados del baseline externo; nunca se vuelve a ejecutar checkout o anulación durante migración.

## Cambio implementado

- El exporter preserva el delta firmado de los egresos negativos y canonicaliza las magnitudes positivas según el contrato del tipo; métricas source y delta destino quedan separadas.
- `timestamptz` se canoniza a UTC `Z` sin truncar microsegundos; `date` se conserva como fecha.
- Todas las columnas `NUMERIC` del allowlist deben llegar como decimal string; los `Number` de JS se rechazan.
- Las relaciones de evidence deshabilitadas no generan archivos ni aceptan filas; el manifest enumera las relaciones omitidas.
- `data-migration.json` y el mapping registran resultados y la canonicalización compatible con los checks del destino.

## C3B-2 — modalidad de conexión de sólo lectura

Direct es la modalidad preferida cuando la red permite llegar al endpoint IPv6 `db.wlqujnwxrmksheubfrha.supabase.co:5432`. Si Direct no es alcanzable, el único fallback autorizado es Session Pooler: host regional oficial `aws-0-<region>.pooler.supabase.com`, puerto `5432`, base `postgres`, usuario `postgres.wlqujnwxrmksheubfrha`, confirmación exacta `--confirm-source-ref wlqujnwxrmksheubfrha` y `sslmode=verify-full`. El puerto `6543` de Transaction Pooler y cualquier host/ref/user distinto se rechazan. Ambos modos usan la misma transacción `REPEATABLE READ READ ONLY`, comprueban `transaction_read_only = on`, ejecutan sólo `SELECT` y hacen `ROLLBACK` al terminar o al fallar. El modo sólo crea el archivo local de candidatos; no exporta filas de negocio. Esta documentación no autoriza ejecutar `CLASSIFY_ONLY`.

## Gate siguiente

Los resultados de probes de stock, zona horaria, tipos temporales, pagos y claves JSON ya fueron entregados y reflejados en el contrato. Tras validar este gate local, `CLASSIFY_ONLY` puede autorizarse como operación separada de sólo lectura para producir la lista técnica de UUID candidatos y permitir clasificación manual. Esa autorización no incluye `EXPORT_PRE_CUTOVER` ni importación.

La clasificación synthetic/F4 sigue requiriendo decisión manual basada en evidencia verificable; no se infiere por fecha, nombre o monto. El perfil `kiosco_id NULL` queda fuera de candidatos operativos.
