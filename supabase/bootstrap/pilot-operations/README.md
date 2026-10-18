# Envases y devoluciones del piloto — instalación opcional

Estado: desarrollo local; no instalado ni activado en Staging o Production.
Estos archivos no pertenecen al manifest histórico de 43 SQL. No reinstalar ese
bootstrap sobre un comercio existente para incorporar este módulo.

## Orden y condiciones

Partir de un destino cuyo baseline endurecido y módulo comercial ya estén
verificados. Revisar esquema existente y respaldar antes de autorizar cualquier
instalación. Los módulos se prueban localmente contra el baseline completo; eso
no sustituye JWT/RLS, concurrencia y permisos del servicio hospedado.

1. `pilot-operations/001_capabilities.sql`.
2. Envases: `envases/001_shared_ledger.sql`, después
   `envases/002_checkout_receipts.sql`.
3. Devoluciones: instalar los tres requisitos privados de la raíz, en orden:
   `supabase_fase_devolucion_registro_privado.sql`,
   `supabase_fase_devolucion_calculo_historico.sql`,
   `supabase_fase_devolucion_preparacion_privada.sql`, y después
   `returns/001_atomic_cash_return.sql`.

El ledger de devoluciones rechaza una instalación con devoluciones antiguas sin
importe verificable; requiere conciliación, no inventar historial. Conciliar
físicamente los vacíos de cada comercio; no sumar los saldos locales de puestos.
Resolver previamente los tickets/carritos y colas heredados que recibieron
envases: no incluir esos mismos vacíos en el saldo inicial y volver a ingresarlos
al confirmar un ticket pendiente. No habilitar con esa conciliación incompleta.

## Habilitación separada

La instalación no habilita comercios. `piloto_operaciones_capacidades` es privada
y sus capacidades son falsas por defecto; sólo un operador de base autorizado
puede habilitar un comercio concreto después del ensayo. El navegador no puede
modificarla. El estado comercial operativo sigue siendo obligatorio.

Frontend, además de strict y checkout manual transaccional activos:

- `VITE_KIOSKO_ENVASES_TRANSACCIONAL=true` para envases.
- `VITE_KIOSKO_DEVOLUCIONES_EFECTIVO=true` para devoluciones.

El cierre de tickets con envases requiere además instalar la versión compatible
de `checkout-manual` con `KIOSKO_ENVASES_TRANSACCIONAL=true`. No desplegar ni
configurar automáticamente a partir de esta guía. La bandera de la pantalla no
otorga permisos SQL. Deshabilitar nuevas operaciones conserva recuperación de
ACK previos. Nunca usar la desactivación de strict como mecanismo de habilitación.

## Alcance inicial y límites explícitos

- Envases: catálogo/precios del comercio, saldo compartido, ajuste contra saldo
  esperado, recepción con egreso de caja, descuento en ticket y entrega exacta al
  distribuidor. La recepción en ticket cambia saldo sólo al confirmar la venta.
- El protocolo de checkout v1 usa pesos enteros; el ticket rechaza créditos de
  envases con centavos. La recepción en efectivo sí admite dos decimales.
- Devoluciones parciales: venta original íntegramente en efectivo, no fiscal,
  cantidades históricas por ID de línea, reposición opcional de stock/lotes y
  costo original, egreso en caja abierta y ledger en una transacción.
- El Cajero sólo puede egresar desde su propia caja abierta; el Dueño puede
  operar una caja abierta del mismo comercio. El servidor impone esa condición.
- Cambio: reintegro en efectivo y una nueva venta normal. Sin vales, cuenta
  corriente ni refunds electrónicos. ARCA/WSFE y Point permanecen excluidos.
- Una venta con recepción de envases no admite devolución ni anulación heredada
  hasta implementar conciliación de vacíos y crédito. Se rechaza sin efectos.
- El catálogo usado por la cotización existente tiene un máximo operativo de
  100 tipos activos. Más tipos fallan de forma cerrada; revisar antes de habilitar.
- Identidad/cuerpo se conservan en IndexedDB antes de enviar. No borrar colas
  para resolver una respuesta incierta. Recuperar la misma solicitud original.
- Un ACK financiero no demuestra entrega física de efectivo. Verificar pago
  anterior y marcar entrega localmente; no repetir automáticamente el pago.
  Esa marca es del dispositivo, no garantiza coordinación física entre cajas.
- El cierre de caja comprueba las operaciones recuperables de este dispositivo,
  incluso confirmadas pendientes de verificar entrega. No es un inventario global
  de colas de todos los terminales; conciliar los puestos antes de cerrar turno.

## Gates antes de uso real

Revisión del diff/SQL, suite y build finales, manifest base intacto, secret scan y
audit. Después: autorización de destino Staging, instalación revisada y backup,
JWT Dueño/Cajero/Visor/otro comercio, reintentos y concurrencia reales, aceptación
de los flujos y conciliación física. Production requiere autorización posterior.
No crear pagos o ventas de ensayo en Production. La impresora sigue pendiente
de disponibilidad del usuario.
