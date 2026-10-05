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

Faltan PostgreSQL/PostgREST remoto, concurrencia de cajas, clave idempotente de operación, revisión de permisos sobre costos históricos de movimientos y conciliación de stock total con stock por lote. El ajuste al alza no inventa una fecha de vencimiento para cantidades sin lote identificado.

| Criterio | Puntaje | Evidencia y mejora |
|---|---:|---|
| Exactitud | 4/5 | Función y triggers reales ejecutados; falta esquema completo y JWT real. |
| Completitud | 3/5 | Corrección y rollback cubiertos; concurrencia, permisos y conciliación pendientes. |
| Claridad | 4/5 | Se diferencia corrección futura de reparación de datos existentes. |
| Accionabilidad | 4/5 | SQL reaplicable y comando de prueba; requiere entorno remoto de prueba. |
| Concisión | 4/5 | Fixture dedicada y guía enfocada en los movimientos manuales. |

La fase de mermas y el objetivo completo siguen abiertos.
