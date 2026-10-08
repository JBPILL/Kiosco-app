# Verificación del catálogo restaurado

Las restauraciones 4.0 vuelven a leer un snapshot del comercio después de guardar
los productos, combos, promociones y lotes. Antes de desactivar productos ajenos
a la copia o recuperar preferencias, comparan los identificadores remapeados y los
valores persistidos de los productos restaurados: costo, precio, stock, mínimo,
categoría, proveedor, descripción, código y atributos operativos incluidos.
El tipo físico/virtual se compara cuando figura explícitamente en la copia.

Una lectura fallida, un snapshot inválido o una diferencia genera un resultado de
restauración incompleta. Las escrituras anteriores se conservan; no hay rollback
de toda la recuperación. Los errores indican el campo distinto sin incluir costos
ni importes privados. El formulario informa la cantidad de productos verificados.

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
