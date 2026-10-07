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

## Proveedores y Ventas Diarias

Proveedores incorpora las tarjetas compartidas, sombras y bordes consistentes
en directorio, recepción e historial. La carga rápida ocupa una tarjeta junto
a una guía sobre stock, pago y deuda; el acceso para crear un proveedor conserva
el formulario existente. Los filtros y pestañas pueden acomodarse en varias filas.

Ventas Diarias incorpora encabezado con distintivo, fecha accesible, refresco
animado, tarjetas compartidas y estado vacío con ayuda. La ganancia y los costos
siguen visibles sólo para el dueño; las fórmulas y acciones de tickets se conservan.

Validación de esta ampliación: 26 pruebas aprobadas en los dos archivos de interfaz
de Proveedores y Reportes; compilación TypeScript/Vite aprobada. No requiere SQL.
Evaluación: precisión 4/5 (falta revisión visual real), completitud 4/5 (paneles y
carga rápida cubiertos, falta navegador), claridad 4/5 (ayudas y etiquetas,
pendiente lectura con zoom), accionabilidad 4/5 (integrado, depende de despliegue),
concisión 4/5 (guía contextual sin agregar pasos al registro). Promedio 4/5.
Siguiente mejora: inspeccionar pantallas grandes y pequeñas con datos del comercio.

## Caja y Dinero del Turno — 7 de octubre de 2026

- Cinco indicadores compartidos con íconos, sombras y textos explicativos; valores largos pueden envolver sin truncarse.
- Efectivo separado de otros medios de cobro; se aclara que los fiados quedan pendientes en cuenta corriente.
- Tarjetas del turno y movimientos con bordes y sombras consistentes, acciones adaptables y estado vacío didáctico.
- Se retira el refresco duplicado del turno: verificarSesionActiva recarga movimientos y resumen. El historial conserva su control específico.
- Se mantienen las condiciones de ocultamiento de efectivo y esperado en arqueo ciego y todos los manejadores financieros.
- Validación: 17 pruebas en tres archivos (incluidas dos de interfaz) y npm run build correctos. No se realizó revisión visual en navegador ni impresión física.

### Autoevaluación

| Eje | Nota | Evidencia y mejora |
| --- | --- | --- |
| Exactitud | 4/5 | Pruebas de interfaz y stores correctas; falta confirmar impresión física. |
| Completitud | 4/5 | Panel del turno y movimientos adaptados; falta revisión visual en tamaños reales. |
| Claridad | 4/5 | Ayudas distinguen efectivo, cobros digitales y fiados; confirmar lectura con cajero. |
| Acción | 4/5 | Código listo para publicar, sin migración SQL; despliegue remoto aún sin inspeccionar. |
| Concisión | 4/5 | Reutiliza IndicatorCard y elimina un control duplicado; CajaPage sigue siendo extenso. |

Promedio: 4/5. Mejora prioritaria: revisar el panel en navegador a ancho de escritorio y móvil. La aceptación estética final corresponde al usuario.
