# F6.2D-C3A — paquete de exportación PRE_CUTOVER

## Estado

Preparación local únicamente. El exportador no se ejecutó contra ningún backend en esta fase. El mapping conserva `exportEnabled: false`; la lectura futura requiere los modos y opt-ins explícitos documentados aquí.

## Contrato del paquete

- JSON UTF-8 por tabla, filas y claves de objeto ordenadas de forma estable.
- `manifest.json` registra contrato, timestamp UTC, `PRE_CUTOVER=true`, fingerprint del schema fuente, conteos, columnas, disposición, checksums SHA-256 por archivo y digest del contenido. El timestamp se excluye del digest para que la data idéntica produzca el mismo checksum.
- `auth-mapping.json` va separado del archivo de perfiles y sólo contiene IDs técnicos, kiosco, rol, Auth UUID anterior y `new_auth_user_id: null` hasta la recreación aprobada.
- La clasificación debe cubrir cada UUID candidato como incluido o excluido con motivo/revisión. Una fila sin clasificación, una clave obsoleta, un cambio de baseline o una relación no vacía marcada `EMPTY_DOMAIN` bloquean el paquete.
- La salida debe ubicarse fuera del repositorio. No se imprimen filas ni URLs de conexión.
- Evidencia `checkout_manuales` y `anulaciones_venta_atomicas` está deshabilitada y requiere gate separado por payload, actor e invariantes destino.

## Proceso posterior, sujeto a autorización

1. Revisar manualmente el Dashboard y confirmar `wlqujnwxrmksheubfrha`; no elegir otro proyecto.
2. Copiar los resultados sanitizados de los bloques 03–11 a una copia de `baseline-reviewed.template.json`, sin filas de negocio ni PII. Completar conteos exactos de bloque 03 y métricas agregadas de bloque 11; marcar el baseline `PRE_CUTOVER_REVIEWED` sólo cuando los bloques 04–10 no dejen bloqueos sin clasificar.
3. Preparar localmente `F6_LEGACY_READONLY_DATABASE_URL` desde un gestor seguro. No pasarla en la línea de comandos ni compartirla.
4. Con una futura autorización de lectura legacy, ejecutar `CLASSIFY_ONLY`; crea únicamente candidatos UUID técnicos en un archivo local externo. No exporta payloads de negocio.
5. Revisar candidatos, dejar el perfil sin kiosco fuera, y clasificar todos los IDs en `includeIds` o `exclude` con motivo. No incluir las 9 identidades Auth sin perfil: el exportador no consulta `auth.users`.
6. Ejecutar `EXPORT_PRE_CUTOVER` sólo tras el gate correspondiente. Direct es preferido cuando la red alcanza IPv6. Si Direct no es alcanzable, el fallback autorizado es únicamente el Supabase Session Pooler oficial; en ambos casos el cliente inicia `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verifica `transaction_read_only = on` y termina con `ROLLBACK`.

## Reglas aplicadas

- Los SELECT se generan únicamente con `exportContract.tables[].columns`, identificadores validados y `ORDER BY` por clave. Ningún SELECT usa `*`; los dominios vacíos sólo ejecutan `COUNT(*)`.
- `sesiones_caja`: sólo `CERRADA` con `fecha_cierre IS NOT NULL`. Las 4 cajas abiertas no se transforman. Las 14 ventas ligadas a esas cajas quedan pendientes del `FINAL_CUTOVER_EXPORT` y sus cierres/reconciliación.
- `ventas` conserva su estado histórico; detalles y pagos sólo se consultan para las ventas seleccionadas. No se llama RPC de checkout/anulación.
- `productos.stock_actual` es el snapshot autoritativo. El kardex y los 63 costos existentes se exportan por separado. No se crean filas de costo faltantes. Sólo `INGRESO`/`EGRESO` pueden derivar `delta_stock`; `AJUSTE` detiene la exportación hasta tener signo demostrado.
- `usuarios`: se excluye `kiosco_id NULL`; rol no permitido detiene el proceso. El archivo business no contiene `auth_user_id`; el mapping separado sí, sin credenciales. No se consulta `auth.users`, tokens o sesiones.
- Dominios clientes/CC y proveedores/compras/pagos se validan con conteo y deben continuar vacíos.

## Consultas exactas

El source mapping es la fuente de columnas. Para imprimir el SQL generado sin conexión:

```powershell
node scripts/f6-2d-c3a-exporter.mjs VALIDATE_ONLY --show-sql
```

Cada tabla produce `SELECT "columna", ... FROM public."tabla" ... ORDER BY "clave"`. Los detalles/pagos filtran por ventas aprobadas; movimientos de caja por sesiones cerradas; costos de movimiento por IDs de kardex. Los metadatos del fingerprint usan una consulta explícita a `information_schema.columns`. Las consultas auxiliares sólo cuentan cajas abiertas, ventas vinculadas a ellas y perfiles sin kiosco. No se consulta `auth.users` ni ninguna relación excluida.

## Comandos futuros, NO ejecutar todavía

El bloque de baseline es un JSON sanitizado completado localmente. Las variables de conexión y rutas siguientes son locales; nunca copies su contenido al chat.

```powershell
$env:F6_LEGACY_READONLY_DATABASE_URL = '<cargar localmente desde gestor seguro>'
node scripts/f6-2d-c3a-exporter.mjs CLASSIFY_ONLY --enable-pre-cutover-export --confirm-source-ref wlqujnwxrmksheubfrha --baseline "C:\ruta\segura\baseline-reviewed.json" --output "C:\ruta\segura\c3a-candidates.json"
```

Después de revisar y completar la clasificación en una copia del archivo candidatos:

```powershell
node scripts/f6-2d-c3a-exporter.mjs EXPORT_PRE_CUTOVER --enable-pre-cutover-export --confirm-source-ref wlqujnwxrmksheubfrha --classification "C:\ruta\segura\approved-row-ids.json" --output "C:\ruta\segura\kioskopos-pre-cutover-export"
```

La conexión Direct sólo se acepta con `db.wlqujnwxrmksheubfrha.supabase.co:5432/postgres`. El fallback Session Pooler sólo acepta host regional oficial `aws-0-<region>.pooler.supabase.com`, puerto `5432`, base `postgres`, usuario exacto `postgres.wlqujnwxrmksheubfrha` y `sslmode=verify-full`. `--confirm-source-ref` debe ser exactamente `wlqujnwxrmksheubfrha`. Se recomienda `sslmode=verify-full` también para Direct; se conserva `sslmode=require` por compatibilidad histórica sólo en Direct. No se admite Transaction Pooler (puerto `6543`), pooler/host arbitrario, staging ni otro proyecto. El acceso no se hizo en esta fase; estos comandos quedan pendientes de autorización expresa.

## Reconciliación

El manifest incluye `reconciliation_metrics` con el mismo esquema de bloque 11 (`metric`, `kiosco_id`, `dimension`, `row_count`, `amount_sum`) y los SHA-256 de los resultados revisados de bloques 03/11. Comparar exactos los conteos/IDs y montos NUMERIC por kiosco/dimensión. Para pre-cutover, los conteos excluyen las 4 sesiones abiertas y las 14 ventas asociadas; no deben igualarse al conteo bruto. El resultado es sólo `PRE_CUTOVER_EXPORT`, nunca el paquete final de corte.

## Evidencia manual requerida antes de autorizar acceso

- Confirmación visual del ref legacy en Dashboard; staging permanece prohibido.
- Outputs sanitizados completos 03–11 y sus conteos agregados; ninguna PII o fila de negocio.
- Reconciliación de los cuatro abiertos y catorce ventas asociadas, y prueba de que el pre-export los deja fuera.
- Resolución de perfil `kiosco_id NULL`, clasificación de fixtures/F4/sintéticos y exclusión de las nueve cuentas Auth sin perfil.
- Compatibilidad de medios de pago, timezone/fechas, ajustes de stock, devoluciones parciales/envases compartidos, Point y dependencias ARCA.
- Decisión separada sobre evidence de checkout/anulación y confirmación de que no reejecuta efectos.
- Ruta local externa y protegida para baseline, clasificación y paquete.
