# Verificación de mermas y movimientos manuales

`src/lib/stockMigration.test.ts` ejecuta `supabase_fase_mermas_trazables.sql` real en PostgreSQL local con PGlite, junto con funciones de roles y la migración de costos privados. La base usa un esquema mínimo, perfiles ficticios y emulación de identidad de sesión.

## Fallas reproducidas y corregidas

- El ajuste de inventario hacia abajo cambiaba el stock total y dejaba intactos los lotes. Ahora todo delta negativo sin lote específico descuenta por FEFO.
- Una cantidad con más de tres decimales podía redondearse a cero y producir un movimiento sin cambiar stock. Se rechaza antes de escribir, respetando la precisión de tres decimales del stock.
- La función contemplaba operaciones de servicio pero no concedía ejecución a `service_role`. Se agregó ese permiso; el navegador sigue usando su sesión autenticada.

## Casos locales

15 casos: egreso FEFO con costo congelado, lote específico, costo histórico inmutable después de editar producto/movimiento, ajuste a cero, ajuste al alza, stock insuficiente, lote insuficiente, rollback de stock y lotes si falla el insert del kardex, ingreso con lote, ajuste a la baja, precisión inválida, comercio ajeno, perfil desactivado, acceso anónimo y backend de servicio.

```powershell
npm test -- --run src/lib/stockMigration.test.ts
npm test -- --run --silent --reporter=dot
npm run build
```

El rollback probado ocurre dentro de una llamada a la función PostgreSQL. No demuestra la conciliación entre varios dispositivos, idempotencia de reintentos ni la configuración real de políticas del servidor.

## Aplicar la corrección en Supabase

Si ya ejecutaste la versión anterior, volvé a ejecutar el archivo completo `supabase_fase_mermas_trazables.sql` en SQL Editor. Sus `ADD COLUMN IF NOT EXISTS`, reemplazos de función y triggers permiten actualizar esa instalación sin borrar movimientos ni recalcular costos históricos.

Los ajustes anteriores que dejaron stock/lotes inconsistentes no se reparan automáticamente: requiere recuento físico y conciliación identificando cada producto/lote. La corrección afecta operaciones nuevas.

En base de prueba con el esquema real: comprobá ingreso con vencimiento, baja de lote, egreso FEFO, ajuste a cero y rechazo de cantidad inválida. Verificá que cambian stock, lotes y movimiento juntos y que el costo histórico no cambia al editar el costo del producto.

## Pendientes y autoevaluación

### Protección de reintentos

`supabase_fase_stock_idempotente.sql` agrega una RPC que conserva solicitud y resultado en una tabla protegida. La clave primaria y el bloqueo de la fila serializan la misma identidad de operación. La merma y su resultado quedan en la misma transacción; si falla el kardex, también se revierte la reserva de la identidad. Repetir la misma solicitud devuelve el movimiento original, y reutilizar la identidad con parámetros diferentes se rechaza.

La pantalla conserva el UUID en localStorage antes de enviar y lo retira después de recibir el resultado y refrescar los datos. Una solicitud idéntica pendiente usa el mismo ID incluso después de recargar la aplicación. La nueva RPC requiere ejecutar el SQL adicional después de la migración de mermas. El frontend no vuelve a la RPC antigua ante un error.

Dos casos SQL prueban repetición exacta, rechazo de parámetros diferentes y reutilización después de una operación fallida. Tres casos de frontend prueban conservación del UUID, nueva identidad tras confirmación, separación por comercio/solicitud e identidad de comercio obligatoria. Estos casos no prueban dos conexiones concurrentes reales ni la caída de red real en el navegador.

La identidad local se guarda por comercio/producto. Mientras exista un pendiente, cambiar cantidad, motivo o lote de ese producto se rechaza y se indica reintentar la solicitud original. La firma ordena los campos para evitar crear una identidad diferente por su orden. Registros dañados y fallas de lectura/escritura no provocan el envío de una operación nueva. Si falla la eliminación después del éxito, se conserva el pendiente y se informa que el movimiento ya se aplicó. El almacenamiento se actualizó antes de publicar este módulo.

Se agregaron cuatro casos que fallaban antes de corregirlo: cambio de cantidad pendiente, distinto orden de campos, identidad dañada y cuota agotada. Los siete casos locales del módulo cubren ahora estos escenarios más reintento/confirmación, separación de productos/comercios y comercio obligatorio. No prueban cuota real del navegador ni flujo visual completo.

La pantalla de stock muestra los pendientes locales con producto, tipo, cantidad y motivo. Permite consultar estado, reintentar los datos originales conservados y cancelar la solicitud pendiente. La consulta sin registro no elimina el pendiente. Una cancelación reserva el ID en el servidor en la misma transacción: si la petición original llega tarde se rechaza, y si ya se aplicó se devuelve su resultado sin revertirla. Los cambios se refrescan antes de liberar la identidad local.

Tres casos SQL prueban consulta de ausencia y denegación de otro comercio, cancelación seguida de llegada tardía, y cancelación de una operación aplicada. Cinco casos de componente prueban conservar una consulta ausente, cancelación confirmada, caída de red, reenvío de parámetros/ID originales y rechazo de una respuesta aplicada sin identificador de movimiento. La consulta/cancelación usa la RPC `resolver_operacion_stock`, incluida en el mismo archivo SQL adicional; reaplicarlo si se instaló antes de agregar esta función.

Pendiente: concurrencia real entre conexiones, sincronización de varios dispositivos, comportamiento ante datos locales dañados sin identidad recuperable y política de retención de operaciones. No borrar manualmente un pendiente con respuesta incierta: puede haberse aplicado. Una operación deliberadamente nueva después de confirmar recibe otra identidad. La RPC anterior conserva su comportamiento para clientes antiguos.

### Costos históricos protegidos

`supabase_fase_costos_movimientos_privados.sql` copia snapshots históricos conocidos a `movimiento_stock_costos`, con RLS para dueño del mismo comercio/superadmin y SELECT concedido al backend. Los clientes no tienen permiso de escritura directa. La columna pública se normaliza a NULL y los nuevos costos se capturan desde `producto_costos` en un trigger AFTER INSERT. No se calculan referencias para históricos desconocidos. Reaplicar la versión actual de mermas mantiene la columna pública en NULL.

El historial del dueño solicita la relación privada y conserva el valor cero real o NULL desconocido. Cajeros no solicitan esa relación. La función de integración descarta cualquier costo recibido en la columna pública y no conserva el objeto anidado del costo privado.

Cinco casos SQL adicionales prueban cajero leyendo movimientos públicos sin costos, aislamiento de otro dueño, rechazo de update privado, reaplicación de migraciones y conservación de un costo histórico distinto del costo actual sin inventar el desconocido. Dos casos de integración de datos prueban privado/cero/desconocido, restricción por rol y ausencia de mutación. La suite SQL de stock contiene 25 casos en total. La relación por PostgREST y la pantalla con sesiones reales siguen pendientes de verificación remota.

Faltan PostgreSQL/PostgREST remoto, concurrencia de cajas, valuación de mermas en reportes usando estos snapshots y conciliación de stock total con stock por lote. El ajuste al alza no inventa una fecha de vencimiento para cantidades sin lote identificado.

| Criterio | Puntaje | Evidencia y mejora |
|---|---:|---|
| Exactitud | 4/5 | Función y triggers reales ejecutados; falta esquema completo y JWT real. |
| Completitud | 3/5 | Corrección y rollback cubiertos; concurrencia, permisos y conciliación pendientes. |
| Claridad | 4/5 | Se diferencia corrección futura de reparación de datos existentes. |
| Accionabilidad | 4/5 | SQL reaplicable y comando de prueba; requiere entorno remoto de prueba. |
| Concisión | 4/5 | Fixture dedicada y guía enfocada en los movimientos manuales. |

La fase de mermas y el objetivo completo siguen abiertos.
