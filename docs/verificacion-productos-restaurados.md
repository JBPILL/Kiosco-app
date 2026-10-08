# Verificación del catálogo restaurado

Las restauraciones 4.0 vuelven a leer un snapshot del comercio después de guardar
los productos, combos, promociones y lotes. Antes de desactivar productos ajenos
a la copia o recuperar preferencias, comparan los identificadores remapeados y los
valores persistidos de los productos restaurados: costo, precio, stock, mínimo,
categoría, proveedor, descripción, código y atributos operativos incluidos.
El tipo físico/virtual se compara cuando figura explícitamente en la copia.

También se comparan los lotes (producto destino, número, vencimiento, cantidades
y actividad) y las promociones (relaciones, condiciones, importes, fechas, días
y componentes). Las estructuras JSON se comparan por contenido, sin depender
del orden de claves de los objetos. Una copia sólo de promociones también
requiere la lectura final. El resumen incluye cantidades verificadas de lotes
y promociones. El formulario muestra cada colección cuya comparación final
terminó, incluidas recetas de combos y cantidades cero. Si una comparación falla,
no presenta las siguientes como comprobadas. Los formatos antiguos sin lectura
final no muestran este apartado.

Las recetas recuperadas mediante `restaurar_combo_backup` se vuelven a comparar
con el snapshot final por ID de producto destino y cantidad de cada componente.
El orden no importa; faltantes, duplicados o cantidades diferentes bloquean el
reemplazo. La conversión de combo a físico debe dejar una receta vacía.
La confirmación inicial del RPC por número de componentes no sustituye esta lectura.

Una lectura fallida, un snapshot inválido o una diferencia genera un resultado de
restauración incompleta. Las escrituras anteriores se conservan; no hay rollback
de toda la recuperación. Los errores indican el campo distinto sin incluir costos
ni importes privados. El formulario informa las cantidades verificadas.

La comparación verifica el estado leído en ese momento. No impide cambios
posteriores de otro usuario. Tampoco certifica balances, historial contable,
permisos remotos ni toda la restauración del comercio. Los formatos 2.0/3.0
mantienen su recuperación anterior sin esta comprobación final.

Los saldos de clientes y proveedores existentes siguen conservándose según la
política de `respaldo-ampliado.md`; no se reemplazan con una foto anterior.
Los nuevos registros recuperan su saldo inicial respaldado. Esto no reconstruye
el historial de cuenta corriente.

También se corrigió el mínimo de stock ausente: se utiliza 5, evitando enviar NaN.

## Evidencia y autoevaluación

Ampliación del 08/10/2026: 60 pruebas dirigidas en dos archivos aprobadas.
Incluye diferencias persistidas, lote con producto remapeado y copias sólo de
promociones. Son pruebas locales con servidor simulado, no una restauración real.

Ampliación de recetas: 69 pruebas dirigidas en esos dos archivos aprobadas,
incluyendo RPC inicialmente exitoso y snapshot final con cantidad alterada.

Resumen de interfaz: 43 pruebas dirigidas en dos archivos aprobadas; tres cubren
conteos completos/cero, comprobación parcial y formatos sin verificación final.

Pasaron 98 pruebas en ocho archivos de respaldo. Pruebas de diferencias en
precios, costos, stock y tipo de producto; registros
ausentes/duplicados; lectura fallida y comparación con identificadores remapeados.
La comprobación de restauración remota completa permanece pendiente.

| Criterio | Nota | Evidencia o mejora pendiente |
| --- | --- | --- |
| Exactitud | 4/5 | Comparación de valores persistidos probada; falta ensayo remoto. |
| Completitud | 3/5 | Catálogo comprobado; no certifica balances ni recuperación integral. |
| Claridad | 4/5 | La interfaz distingue productos verificados; formatos antiguos sin comprobación. |
| Acción posible | 4/5 | Comparación automática 4.0; requiere backend de respaldo instalado. |
| Concisión | 4/5 | Informe separado del historial extenso de migraciones. |
