# Resumen de bajas de inventario

## Alcance implementado

Stock muestra al dueño/superadmin una tabla por motivo: merma, pérdida, rotura,
vencimiento, robo y consumo interno. Cuenta egresos y estima su valor usando
exclusivamente el costo histórico privado; no usa el precio actual del producto.
Ventas, devoluciones, compras y ajustes no participan en esa estimación.

La tabla usa los movimientos cargados y los filtros activos del historial. Informa
su alcance y advierte si hay más registros sin cargar. No representa el total del
comercio ni un resultado fiscal. Los movimientos sin costo quedan identificados;
el costo cero conocido se conserva. No se suman cantidades de distintos productos
porque pueden corresponder a unidades y pesos diferentes.

Los ajustes históricos pueden contener conteos absolutos y los nuevos contienen
variaciones. Se presentan como cantidad registrada y no se valoran hasta disponer
de evidencia del formato de cada registro. La consulta privada sigue protegida
por la migración `supabase_fase_costos_movimientos_privados.sql`; esta presentación
no requiere SQL adicional.

## Evidencia de pruebas

- Cinco casos de cálculo: motivos separados, exclusiones, costos desconocidos,
  costo cero, cantidades fraccionarias, valores inválidos e inmutabilidad.
- Tres casos de componente: ocultamiento sin autorización, alcance incompleto,
  ausencia de costos y conjunto vacío.
- Cuatro casos de presentación: egresos antiguos/actuales, ajustes ambiguos,
  costo cero/desconocido y rechazo de costos negativos o cifras no finitas.
- El último caso de presentación falló con una estimación negativa antes de
  agregar la validación; los doce casos específicos pasan después de corregirlo.

## Validación pendiente

- Verificar filtros, carga incremental y cambio de rol en el sitio publicado.
- Confirmar lectura de snapshots privados con sesiones reales y RLS.
- Implementar el reporte de período completo en Reportes, con paginación o
  agregación autorizada en servidor. Este panel no sustituye ese reporte.
- Concurrencia real de stock, piloto de hardware y demás fases del plan siguen
  abiertas.

## Autoevaluación de esta entrega

| Eje | Nota | Evidencia y mejora |
| --- | --- | --- |
| Exactitud | 4/5 | Doce pruebas específicas; falta comprobación visual en producción. |
| Completitud | 3/5 | Panel con alcance explícito; falta reporte del período completo. |
| Claridad | 4/5 | Advierte costos faltantes y carga parcial; comprobar comprensión en piloto. |
| Acción | 4/5 | Código y pruebas listos para revisar; publicación pendiente. |
| Concisión | 4/5 | Tabla por motivo; revisar espacio en pantallas pequeñas. |

Promedio: 3,8/5. Próximas mejoras: reporte completo y comprobación con sesiones
reales. La fase sigue abierta; no se declara cumplida por estas pruebas.
