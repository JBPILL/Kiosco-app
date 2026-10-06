# Servicios rápidos y presentación de bajas

## Servicios rápidos

La capacidad guardada en Ajustes habilita cuatro accesos del POS: Fotocopias,
Impresiones, Anillado y Plastificado. Cada acceso abre el modal de cobro manual
con el concepto precargado. El cajero ingresa precio y cantidad y agrega el concepto
al ticket. Cobro Manual sigue disponible para otros conceptos.

Se reutiliza `agregarItemLibre`: el producto del ticket es inactivo y no corresponde
a una existencia vendible del catálogo. El checkout existente lo persiste para
mantener la referencia del detalle, y omite la actualización de stock. No hay
precios predeterminados ni una configuración de tarifas en esta entrega.

La prueba del acceso activo falló por ausencia del botón antes de implementar;
checkpoint RED `e678755`. Después pasó el mismo objetivo. Dos pruebas del modal
verifican concepto precargado, cambio de concepto y agregado al carrito con subtotal
correcto. La primera versión de esa prueba asumía un prefijo de ID inexistente;
se corrigió para verificar las propiedades reales del ítem libre.

## Bajas de inventario

La vista incorpora cuatro tarjetas: movimientos de bajas, estimación a costo,
movimientos con costo conocido y movimientos sin costo histórico. Si existen
registros sin costo, el importe se indica como parcial; si ningún costo está
disponible, no se presenta una pérdida conocida de cero. Carga y fallas conservan
estados visibles sin mostrar indicadores de resultados que no se obtuvieron.

Los filtros de fecha ocupan una tarjeta como las otras vistas. La tabla conserva
detalle por motivo. La cabecera de Reportes separa el título de las pestañas; las
pestañas pasan a otra línea cuando falta espacio y no recortan el último botón.

## Validación y límites

Build de producción aprobado en la entrega del rediseño. Regresiones de POS,
modal, Reportes y Bajas: 61 pruebas aprobadas. La inspección visual en navegador
y el cobro real de un servicio en Supabase permanecen pendientes. Estas pruebas
de componente no sustituyen un piloto completo de operación online/offline.

No requiere nueva migración: servicios reutilizan el esquema existente; el
reporte de bajas usa el paso 11 de la guía SQL ya preparada. La publicación debe
incluir el código y la función instalada en el entorno destino.

Autoevaluación de la entrega: exactitud 4/5 (build y regresiones; falta producción),
completitud 4/5 (accesos y diseño implementados; falta piloto), claridad 4/5 (KPI y
tarjetas compartidas; falta inspección en pantallas pequeñas), acción 4/5 (código
listo; falta publicación) y concisión 4/5 (reutiliza el modal; falta revisión con
cajeros). Promedio 4/5. Las fases completas del plan continúan abiertas.
