# Historial y comprobante

Las acciones del historial ocupan una fila propia con tres columnas desde
420 px y botones de al menos 40 px de alto; en pantallas menores se distribuyen
verticalmente con separación. Las notas ya no comprimen los botones y omiten
la metadata interna `[PROMOS:...]` únicamente en su presentación.

El detalle del comprobante usa tipografía monoespaciada, descripción en una
línea independiente que puede envolver, cantidad por precio e importe a la
derecha. Las promociones se presentan en negro como texto para impresión
térmica. Los importes y operaciones financieras permanecen sin cambios.

No se ejecutaron pruebas automatizadas ni inspección visual en navegador para
esta solicitud. La compilación se ejecuta por el requisito del proyecto.
Revisar en el despliegue los anchos de 58 y 80 mm, PDF e impresión física.

El usuario confirmó que el SQL de caja compartida se aplicó con éxito. Eso no
demuestra todavía el cobro remoto con cajero y PIN.

Autoevaluación: precisión 4 (cambio de presentación, falta vista desplegada);
integridad 3 (faltan vista y papel real); claridad 4 (descripción y precio
separados); utilidad 4 (código listo, despliegue pendiente); concisión 4
(dos componentes modificados). Media 3,8. Prioridad: comprobar ticket de 58 mm
y botones del historial en celular. La aceptación visual sigue pendiente.
