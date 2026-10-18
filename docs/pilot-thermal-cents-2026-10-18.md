# Centavos en tickets térmicos — 18/10/2026

## Problema y corrección
La salida USB/serie ESC/POS redondeaba con Math.round el precio unitario,
importe de artículo, subtotal, ajuste, total, abono y vuelto. Una venta de
$2.501,25 podía imprimirse como $2.501. Se reutiliza formatNumero, el formato
argentino existente de hasta dos decimales, conservando la presentación compacta
de precios enteros. La corrección afecta sólo el buffer de impresión; no cambia
la venta, cálculo de totales, persistencia, stock ni movimientos de caja.

## Validación
Pruebas sobre los bytes generados para 58 y 80 mm: artículo con precio fraccional,
descuento, subtotal, total, abono y vuelto, importes enteros y entrada inmutable.
Dirigidos de impresión: 6 PASS en dos archivos. Build PASS, 611 módulos.
Audit de producción: cero vulnerabilidades. Escaneo local: mismos 44 candidatos
sintéticos conocidos, sin candidatos nuevos; binarios e historial no escaneados.
Suite completa: 1874 PASS / 1 skipped / 199 archivos, 246 s, maxWorkers=2.
Diff de trabajo e índice sin errores. Build conserva el aviso conocido de chunks
mayores a 500 kB; suite informa sourcemaps de html5-qrcode incompletos, sin fallos.

## Pendientes
El ensayo físico de tickets y etiquetas requiere impresora disponible. Las pruebas
de bytes no prueban el resultado sobre papel ni el firmware de un equipo real.
ARCA queda en pausa por decisión del usuario; certificación a su cargo. PR #1
continúa fuera de este bloque y no se integra. No se aplica SQL ni se modifica
configuración o credenciales remotas.
