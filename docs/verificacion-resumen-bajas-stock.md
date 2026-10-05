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
- Validar en Supabase el reporte completo implementado mediante agregación
  autorizada en servidor. El panel de Stock conserva su alcance cargado.
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

Promedio: 3,8/5 en la entrega del panel. Próximas mejoras: comprobación con sesiones
reales. La fase sigue abierta; no se declara cumplida por estas pruebas.

## Reporte del período completo

La pestaña **Reportes > Bajas de Inventario** permite seleccionar Desde/Hasta y
consulta `resumir_bajas_stock(uuid,date,date)`. La función agrupa todas las bajas
del comercio y rango en una sola consulta, devuelve un objeto JSON con hasta seis
motivos y no depende del límite de filas REST. Los días incluyen desde medianoche
argentina hasta la medianoche siguiente a Hasta, exclusiva. Usa snapshots privados
y conserva los costos desconocidos, cero reales y registros con valores inválidos.

Requiere aplicar `supabase_fase_reporte_bajas_stock.sql` (paso 11 de la guía).
La función es STABLE y SECURITY DEFINER con autorización explícita por identidad,
perfil activo, rol y comercio. El cajero no puede ejecutarla para obtener costos.
No cambia stock, lotes, movimientos ni balance fiscal. Reaplicar el SQL reemplaza
la función y conserva los datos. No se ofrece un fallback a precios actuales.

Seis pruebas PostgreSQL cubren más de mil registros, motivos separados, snapshot
conservado tras cambiar el precio actual, límites del día, permisos, conjunto vacío
y valores NaN. Seis pruebas de interfaz cubren alcance completo, rol, rango inválido,
migración faltante, red, respuesta inválida y respuestas tardías. Cuatro pruebas de
validación rechazan totales inconsistentes, motivos duplicados y cifras inválidas.
La navegación del dueño y la ausencia de pestaña del cajero tienen dos regresiones.

La migración y la pestaña todavía requieren publicación y validación con las
sesiones reales del entorno destino. El esquema de prueba es mínimo y las
identidades se emulan; no constituye evidencia de JWT/PostgREST remoto.

Autoevaluación del reporte completo: exactitud 4/5 (pruebas locales; falta esquema
remoto), completitud 4/5 (rango completo implementado; falta piloto), claridad 4/5
(alcance y costos faltantes visibles; falta inspección visual), acción 4/5 (SQL y
guía listos; falta instalación) y concisión 4/5 (tabla por motivo; falta revisar en
pantalla pequeña). Promedio 4/5. Mejoras pendientes: instalar/verificar con sesiones
reales e inspeccionar la interfaz publicada. No se declara terminada la fase.
Validación final local: 510 pruebas en 38 archivos y build exitoso (tsc -b && vite build). Continúa el aviso existente de tamaño del chunk principal.
