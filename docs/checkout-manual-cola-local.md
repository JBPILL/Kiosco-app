# Cola transaccional local del cobro manual

## Alcance de esta fase

Se incorpora `ManualCheckoutOutbox`, una base IndexedDB independiente de la cola
antigua, y un cliente autenticado para `checkout-manual`. Esta documentación
describe su fase inicial. La conexión opcional del POS y `offlineSyncStore` ya
está implementada; consultá [checkout-manual-pos.md](checkout-manual-pos.md)
para activarla en ensayo y conocer sus límites.

No hay un SQL adicional para esta fase. El backend requiere los pasos 26 y 27
y la Edge Function descrita en [checkout-manual-backend.md](checkout-manual-backend.md).

## Garantías de la cola

- La entrada se valida y guarda en una transacción IndexedDB antes de enviar.
  Un fallo de almacenamiento impide la llamada al servidor.
- Cada ticket tiene un único cobro por comercio y operador. Dos conexiones
  no pueden asignarle IDs diferentes. Cambiar el cuerpo del mismo ID se rechaza.
- Un error remoto, una respuesta perdida o una confirmación inválida conservan
  la solicitud original. No se generan IDs sustitutos ni se borran pendientes.
- Una confirmación válida se conserva. Recuperarla no llama nuevamente al
  servidor ni aplica decrementos locales de stock o cargos de deuda.
- Una respuesta tardía de error no reemplaza una confirmación ya guardada.
  Dos confirmaciones contradictorias se rechazan.
- La sincronización conserva operador, comercio, caja, fecha y pagos originales.
  El cliente exige la sesión original; el backend vuelve a verificar JWT y permisos.
- Los resultados exigen identidad, total, fecha, conjunto físico de productos y
  saldo coherentes. Se rechazan campos adicionales, incluido el costo privado.

## Criterios de conexión del POS

`cerrarCobroManualLocal` debe recibir una entrada comercial congelada y una
`ticketClave` única durante **toda la vida de esa venta**, incluso al reabrir el
modal. El carrito ahora renueva el ID de la última pestaña al completar una
venta, conservando su nombre. Esto evita reutilizar la identidad de un ticket
cerrado para el siguiente cobro. La fase de conexión persiste su asociación con
el cobro y ofrece recuperación desde el panel de pendientes después de recargar.

Antes de crear una nueva entrada, el POS debe consultar
`recuperarCobroManualLocal` y ofrecer continuar la original si existe. No debe
convertir cambios de precio, pagos, ajustes o usuario en una nueva solicitud de
un cobro ya realizado. Un conflicto requiere conciliación explícita.

La confirmación almacenada es el stock del momento de ese cierre. Para recobrar
un cierre viejo se recarga el inventario vigente; no se resta nuevamente su
cantidad. La fase de conexión reclama una sola presentación automática; no
garantiza una impresión física única. El cajón y la emisión fiscal no se repiten
al sincronizar; los comprobantes provisionales quedan identificados.

La fase de conexión agrega el bloqueo del carrito, recuperación visual y
comprobante offline provisional. La cola antigua no contiene
recetas ni cotización completas; sus registros requieren conciliación, no una
conversión automática que suponga esos datos.

## Verificación

Las pruebas usan `fake-indexeddb` y Dexie con transacciones y dos conexiones,
no sólo mocks del guardado. Cubren reapertura, fallo de escritura, unicidad,
confirmaciones incompletas y errores tardíos. Las pruebas del cliente verifican
JWT, contexto original y ausencia de reenvíos automáticos ante errores.

Esto verifica la persistencia y el contrato del nuevo cliente. No demuestra
todavía el flujo de cobro completo ni persistencia física en navegadores reales.

Suite completa: 888 pruebas aprobadas en 97 archivos. Después de agregar la
renovación del ID del carrito se aprobaron 58 pruebas específicas de carrito,
cliente y cola (incluido ese caso nuevo). La suite completa anterior no incluía
ese último caso. No se ejecutó el nuevo cierre en Supabase remoto.
La compilación final TypeScript/Vite pasó sin errores.

Evaluación: precisión 4/5 (IndexedDB de prueba, falta navegador real);
completitud 3/5 (POS y cola antigua pendientes); claridad 4/5 (contrato explícito,
falta recuperación visual); accionabilidad 3/5 (API preparada, sin controles
visuales); concisión 4/5 (guía de una fase con pendientes concretos). Promedio
3,6/5. Prioridad: conectar la identidad durable al carrito y sustituir ambos
caminos de escritura. El plan general continúa activo.
