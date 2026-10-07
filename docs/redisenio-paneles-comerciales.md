# Paneles comerciales: unificación visual

## Cambios

- Clientes, Promociones y Stock usan `IndicatorCard`: ícono con color,
  borde, sombra, cifra legible y explicación del indicador. Los importes largos
  pueden ocupar varias líneas en lugar de quedar recortados.
- Los filtros se distribuyen en varias líneas cuando el ancho lo requiere.
- Rotación utiliza una tabla de ancho fijo de siete columnas. Costo y precio
  se agrupan; días sin movimiento y última venta también. Todos los datos,
  estados y acciones se conservan. En pantallas pequeñas, cada fila se presenta
  como una tarjeta con etiquetas; no hay desplazamiento horizontal de la tabla.
- Bajas mantiene las dos fechas y el refresco en la misma fila del grupo de
  filtros. En pantallas angostas, el grupo completo pasa debajo del título.
- `RefreshButton` reemplaza los refrescos de Bajas, Rotación, Balance, Stock,
  Electrónica, Caja, Configuración, Catálogo e Historial de tickets. Sólo muestra
  el ícono, con título y nombre accesible; se anima y deshabilita mientras carga.
- Stock conserva un único refresco global. Los refrescos de caja y su historial
  siguen separados porque consultan conjuntos de datos diferentes.

No agrega SQL ni modifica fórmulas, permisos o registros comerciales.

## Verificación y evaluación

Las pruebas específicas cubren consulta, filtros y permisos de Bajas, datos de
Rotación, acciones de Electrónica, accesibilidad y estado ocupado del refresco,
y contenido de indicadores. La compilación comprueba los tipos de todos los
paneles modificados. No se comprobó el diseño en el navegador de producción.
Resultado: 915 pruebas aprobadas en 102 archivos y compilación TypeScript/Vite
aprobada. Vite conserva el aviso existente de tamaño de chunks.

| Eje | Puntaje | Evidencia o mejora |
| --- | --- | --- |
| Precisión | 4/5 | Datos y acciones conservados; falta revisar el renderizado con datos reales en producción. |
| Completitud | 4/5 | Paneles solicitados y refrescos unificados; queda la comprobación visual en el equipo del comercio. |
| Claridad | 4/5 | Etiquetas de filas y explicaciones de KPI; falta observar su lectura con el zoom del cajero. |
| Accionabilidad | 4/5 | Componentes integrados sin migraciones; depende del despliegue del frontend. |
| Concisión | 4/5 | Se retiraron duplicados y se agruparon columnas; conserva explicaciones necesarias. |

Promedio 4/5. Mejora siguiente: revisar anchos y zoom con el navegador del comercio.
La evaluación no equivale a confirmar un despliegue Vercel ni a una prueba visual.
