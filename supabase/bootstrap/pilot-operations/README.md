# Envases y devoluciones del piloto — instalación opcional

Estado: instalado y probado con JWT reales en Staging bajo autorización; comercio
de ensayo suspendido, capacidades deshabilitadas y ningún comercio habilitado.
No instalado ni activado en Production. Frontend operativo aún no habilitado.
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
   `returns/001_atomic_cash_return.sql`, y finalmente
   `returns/002_owner_envases_return.sql` para devolver efectivo y vacíos al cliente.
   Para actualizar desde la primera instalación, aplicar 001 actualizado + 002
   en una transacción con respaldo previo. No reinstalar envases/001 o 002
   después de returns/002: sus listas anteriores de acciones no incluyen la
   nueva salida de vacíos al cliente.
   La corrección posterior de la regla se instala reaplicando sólo returns/002
   actualizado en una transacción con respaldo previo. Conserva ACK históricos,
   pero impide crear solicitudes nuevas de CONSERVAR_ENVASES.

4. Ajustes de interfaz y pendientes por tipo: instalar `envases/003_pending_totals.sql`
   y `returns/003_whole_unit_quantities.sql` juntos, después de todos los anteriores,
   con respaldo y ensayo de restauración. No reaplicar versiones 001/002 después:
   reemplazarían funciones o restricciones vigentes. La instalación no activa comercios.
   El frontend que consulta pendientes requiere este módulo antes de publicarse.

Pendientes sin cliente: el Dueño declara/corrige el total por tipo con saldo esperado
para rechazar cambios sobre una lectura vieja. Las observaciones de ese registro
son opcionales: si faltan, se guarda «Sin observaciones adicionales»; la auditoría
de actor y cantidades sigue siendo obligatoria. Recepción de
pendientes (Dueño/Cajero) reduce ese total y aumenta vacíos atómicamente; no paga,
no agrega crédito al ticket ni requiere caja. Registro y recepción mantienen ID/cuerpo
para recuperar el ACK sin duplicar. No se infieren de tickets ni se descuentan vacíos
al declarar: el préstamo fue de un envase lleno, no del depósito de vacíos. Conciliar
los préstamos anteriores manualmente; el saldo inicial cero no acredita inexistencia.
El historial registra el cambio y saldo pendiente. La recepción pagada sigue separada.

Cantidades de devolución: artículos por unidad requieren enteros; pesables/unidades
fraccionables y ventas históricas fraccionadas conservan hasta tres decimales.
ACK históricos se recuperan antes de la nueva comprobación. La clasificación usa el
producto actual porque el snapshot antiguo no guarda su unidad; cantidades originales
fraccionadas conservan la capacidad de devolución aunque cambie esa clasificación.

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
- El depósito muestra todos los movimientos de los últimos 30 días mediante
  paginación; un fallo de lectura no se presenta como período vacío. La salida
  al distribuidor conserva cantidad negativa, tal como se registra en el ledger.
- La devolución consulta toda la historia del ticket por ID de línea y descuenta
  las cantidades ya recibidas. Una historia fallida/incompatible bloquea otra
  confirmación; la RPC vuelve a validar bajo lock aunque la lectura fuera reciente.
- El protocolo de checkout v1 usa pesos enteros; el ticket rechaza créditos de
  envases con centavos. La recepción en efectivo sí admite dos decimales.
- Devoluciones parciales: venta original íntegramente en efectivo, no fiscal,
  cantidades históricas por ID de línea, reposición opcional de stock/lotes y
  costo original, egreso en caja abierta y ledger en una transacción.
- El Cajero sólo puede egresar desde su propia caja abierta; el Dueño puede
  operar una caja abierta del mismo comercio. El servidor impone esa condición.
- Cambio: reintegro en efectivo y una nueva venta normal. Sin vales, cuenta
  corriente ni refunds electrónicos. ARCA/WSFE y Point permanecen excluidos.
- Una venta con recepción de envases admite devolución completa por el Dueño,
  sin devoluciones previas: entrega los vacíos al cliente y reintegra el efectivo
  neto que pagó. No permite conservar los envases del cliente ni reintegrar un
  importe mayor. Se usan importes/tipos del ledger
  histórico; la entrega exige saldo suficiente, sin recorte ni stock negativo.
  Devoluciones parciales de esos tickets y anulación heredada siguen bloqueadas.
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

La aceptación backend de Staging aprobó 51 comprobaciones y un postflight de
costos/permisos/huellas originales. Antes de repetir operaciones, consultar los
ledgers y el journal del ensayo: no volver a crear ni pagar los mismos eventos.
El piloto mantiene una única caja abierta por comercio; los ensayos no eliminan
ese índice ni habilitan cajas concurrentes del mismo comercio.

La ampliación anterior del Dueño aprobó otras 41 comprobaciones en el mismo comercio
aislado, con respaldo public nuevo y restauración previa. Se conservaron dos
tickets ficticios: mercadería $200 menos envase $100; devolver $200/conservar
vacío y devolver $100/entregar vacío. Las llamadas simultáneas recuperaron un
único ACK por operación; Cajero/Visor y segundos reintegros fueron rechazados.
Finalizó suspendido, ambas capacidades apagadas y datos originales intactos.
Los helpers reales de historial leyeron también la nueva salida DEVOLVER_CLIENTE
con JWT del Cajero. La comprobación visual del formulario usó datos ficticios
locales y operaciones remotas bloqueadas; no reemplaza aceptación frontend hosted.
Esa regla de elección fue sustituida por instrucción del usuario. La corrección
aprobó 34 comprobaciones Staging: único reintegro neto + vacíos, rechazo de la
opción retirada, faltante de vacíos sin efectos, concurrencia y recuperación de
ACK históricos intactos. El fixture sigue suspendido y sin capacidades activas.
