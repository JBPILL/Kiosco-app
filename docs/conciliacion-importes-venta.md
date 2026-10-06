# Conciliación de importes de venta

El detalle guardado por PaymentModal usa una distribución proporcional en pesos
enteros cuya suma coincide exactamente con el total cobrado. El resto del
redondeo se asigna por mayor fracción; los empates conservan el orden del ticket.
Se mantiene el prorrateo existente, incluyendo líneas negativas de envases.
También se reconcilian fracciones de productos pesables sin ajuste global.

El mismo cálculo se ejecuta antes de insertar la cabecera o encolar la venta y
se reutiliza en ambos caminos. No modifica el carrito original.

Validación: cinco pruebas unitarias (descuento, devolución, pesables, total cero,
entrada inválida). La compilación se valida con `npm run build`.
Este cambio no vuelve atómica la persistencia de venta, pagos, stock y deuda.
El cierre transaccional Point y el flujo manual siguen pendientes.
No requiere una migración SQL.

Autoevaluación: precisión 4/5 (casos unitarios; falta prueba remota de venta),
completitud 3/5 (se corrige el redondeo; falta la transacción integral), claridad
4/5 (algoritmo documentado; falta ejemplo visual), accionabilidad 4/5 (integrado
en ambos caminos; publicación pendiente), concisión 4/5 (detalle breve; hay
evidencia complementaria en las pruebas). Promedio 3.8/5. Próxima mejora:
persistir venta, pagos y consumo de recursos en una única transacción.
