# Cierre manual transaccional: servidor preparado

El backend autenticado ya está implementado en el paso 27. Consultá
[checkout-manual-backend.md](checkout-manual-backend.md) para instalarlo.
La descripción siguiente registra el alcance original del paso 26; el POS y
la cola offline siguen pendientes de conexión.

## Estado de la fase

`supabase_fase_checkout_manual.sql` agrega una RPC privada y un registro durable
de solicitudes. Su ejecución no cambia el cobro actual: `PaymentModal.tsx` y
`offlineSyncStore.ts` todavía utilizan sus escrituras anteriores. La siguiente
fase debe conectarlos mediante un backend autenticado que valide precios,
promociones, envases y autorizaciones antes de llamar esta RPC.

Point continúa pausado. Esta operación no genera cobros en terminales, no
necesita una cuenta de Mercado Pago y no modifica los intentos existentes.

## Instalación

1. Aplicá los esquemas de ventas, caja, combos, lotes y cuenta corriente.
2. Aplicá las fases de roles/perfiles y costos privados de productos y movimientos.
3. Ejecutá completo `supabase_fase_checkout_manual.sql` en el proyecto de ensayo.

Es reaplicable. No se ejecutó remotamente desde Codex. No concedas permisos de
esta función a `authenticated` o `anon`, ni copies la clave de servicio al frontend.
El único invocador habilitado es un backend con `service_role`. Ese backend debe
verificar el JWT y obtener `p_actor_auth_id` de la identidad autenticada.

## Contrato

`confirmar_venta_manual(p_actor_auth_id uuid, p_solicitud jsonb)` recibe un snapshot
comercial ya validado por el servidor, versión 1. El cuerpo exige todas las claves:

- `version`, `id`, `kiosco_id`, `usuario_id`, `sesion_caja_id`, `fecha_hora`,
  `total`, `notas`, `cliente_id`, `detalles`, `pagos`.
- Cada detalle: `id`, `producto_id`, `cantidad`, `precio_unitario`, `subtotal`,
  `sin_envase`, `precio_envase_unitario`, `es_devolucion_envase`, `articulo_libre`,
  `componentes`.
- `articulo_libre`: null para producto físico; para concepto virtual contiene
  únicamente `descripcion` y `precio_venta`.
- `componentes`: array vacío para producto simple o concepto virtual; para combo,
  receta por unidad con `producto_id` y `cantidad`, exactamente igual a la receta
  del servidor cuando se confirma. Una receta cambiada requiere conciliación.
- Cada pago: `id`, `medio_pago`, `monto`, `referencia`.

Se conservan IDs de venta, detalle y pago al reintentar. Importes de totales,
subtotales y pagos en pesos enteros; precios unitarios con hasta dos decimales y
cantidades físicas con hasta tres. Un producto por unidad no admite fracciones.
Las referencias y notas pueden ser null; el cliente también si no hay fiado.
No se aceptan campos de costos, actor elegido por el navegador ni cuentas ajenas.

El precio de venta recibido **todavía no se recotiza dentro de SQL**. Por eso esta
RPC permanece privada: no es una autorización para aceptar un cuerpo arbitrario
del cajero. El backend pendiente debe comprobar ese snapshot contra el catálogo,
las promociones y la autorización del ajuste antes de confirmarlo.

## Garantías implementadas

- Venta, conceptos virtuales, detalles, pagos, consumo físico, FEFO, kardex con
  costos privados y cargo de cuenta corriente se confirman en una transacción.
- Misma identidad y mismo cuerpo recuperan el resultado sin duplicar efectos.
  Cambiar el cuerpo o reutilizar una venta anulada se rechaza.
- Perfil, comercio activo, usuario y caja originales se revalidan bajo bloqueo.
  El cajero sólo registra su usuario; el dueño puede procesar el de otro operador
  activo del mismo comercio. Un perfil desactivado no se sustituye automáticamente.
- Combos consumen sus componentes físicos. El producto virtual nunca pierde stock.
- FEFO toma lotes vigentes en la fecha original de la venta, conservando esa fecha
  en venta, kardex y cuenta corriente. Lotes vencidos o inactivos con cantidades
  restantes no se convierten en stock sin lote.
- Si hay tablas de reservas Point instaladas, se respetan cantidades retenidas de
  stock, lotes y crédito. No se liberan reservas ajenas. Sin esas tablas, su saldo
  reservado es cero; la aplicación de este SQL no instala ni activa Point.
- El resultado contiene identidad, total, fecha, stock resultante y saldo del
  cliente, sin costos privados. El stock devuelto es el de ese cierre: al recuperar
  un cierre antiguo hay que recargar el estado vigente, sin descontarlo otra vez.

## Conflictos offline

La caja original debe seguir abierta para una primera confirmación. Si ya está
cerrada, el stock/lote/crédito perdió disponibilidad o la receta cambió, la venta
requiere conciliación y no se registra parcialmente. No se cambia su fecha, caja
o importe para forzar la sincronización. Un reintento de un cierre ya confirmado
sí recupera el resultado aunque la caja se haya cerrado después.

El backend y la interfaz pendientes deben conservar esas ventas en la cola y
mostrar el conflicto. Ventas antiguas que ya existen sin `checkout_manuales`
requieren conciliación previa; no se deduce stock o deuda automáticamente por
encontrar una cabecera con el mismo ID.

Esta fase no cambia aún el inventario local de envases, la impresión, la emisión
ARCA ni la lógica de sincronización entre pestañas. Tampoco implementa todavía
el PIN de supervisor o la autorización de descuentos extraordinarios.

## Verificación

Pruebas PostgreSQL embebidas sobre el SQL real: cierre e idempotencia, FEFO y
costos privados, rollback por fallas de detalles/pagos/kardex/deuda, conceptos
virtuales, combos y recetas alteradas, crédito, permisos, aislamiento, total cero,
fechas originales y reservas Point. Las tablas Point usadas en estos casos
reproducen sus columnas de reservas; no ejecutan el protocolo de pagos.

Falta el ensayo con JWT/PostgREST, el esquema remoto completo y dos conexiones
reales concurrentes. El bloqueo y la clave única están implementados, pero las
pruebas embebidas seriales no acreditan por sí solas esa concurrencia.

Validación local de esta entrega: 34 casos específicos aprobados; suite completa
de 844 pruebas en 94 archivos aprobada; compilación TypeScript/Vite sin errores.
Se reprodujeron y corrigieron la ambigüedad de nombres SQL, la aceptación de un
rol nulo y las fechas relativas antes de publicar.

Evaluación: precisión 4/5 (SQL ejecutado, falta PostgREST real); completitud 3/5
(transacción preparada, backend autenticado y frontend pendientes); claridad 4/5
(alcance y contrato explícitos, faltan ejemplos de integración); accionabilidad
3/5 (SQL instalable, cobro todavía no conectado); concisión 4/5 (guía agrupada,
contrato extenso). Promedio: 3,6/5. La mejora prioritaria es conectar el backend
con validación comercial y recuperación de respuestas perdidas, y luego reemplazar
ambos caminos del POS. Esta evaluación no considera completo el plan general.
