# Electrónica: unidades, garantías y reparaciones

## Activación

Aplicá `supabase_fase_electronica.sql` en SQL Editor después de las migraciones
de perfiles/roles y rubros especializados. No crea ventas ni altera stock al
aplicarse. Seleccioná **Electrónica y Celulares** en Super Admin y volvé a entrar.
El dueño encuentra **Electrónica** en el menú. No se habilita en veterinarias,
kioscos ni librerías. El cajero continúa cobrando desde Punto de Venta.

## Unidades y garantías

1. Buscá una venta por su ID completo o los ocho caracteres del ticket.
2. Elegí el artículo y registrá cada serie o IMEI vendido. Se requiere una venta
   completada y sincronizada, con una cantidad entera de unidades físicas.
3. Opcionalmente, registrá una fecha de garantía y sus condiciones internas.

Las series se normalizan a mayúsculas; el IMEI exige 15 dígitos y dígito de control
válido. Esta validación comprueba su formato, no la autenticidad del equipo.
Supabase impide duplicados y registros que excedan la cantidad vendida. El registro
no descuenta stock nuevamente. La garantía describe las condiciones ingresadas por
el comercio; no certifica condiciones del fabricante ni cobertura legal.
Su fecha se compara con el día de la venta en Argentina y tiene un máximo de diez años.
Las ventas anuladas se señalan en la lista y no admiten registros nuevos.

## Reparaciones

Registrá cliente, contacto opcional, equipo y falla declarada. Podés añadir
diagnóstico y presupuesto durante el trabajo. No ingreses contraseñas ni PIN de
desbloqueo. El presupuesto no representa un cobro.

El flujo pasa por recepción, diagnóstico, presupuesto, autorización, reparación,
listo para retirar y entrega. Los cambios permitidos se muestran en el formulario;
entregadas y canceladas quedan cerradas. La autorización, entrega y cancelación
requieren confirmación. La versión de la orden evita que un puesto sobrescriba
cambios realizados por otro; ante conflicto, actualizá y revisá la orden.

Ningún estado crea una venta, un movimiento de caja o una salida de repuestos.
Registrá esos movimientos por sus operaciones correspondientes cuando ocurran.
Esta etapa requiere conexión para escribir. Ante un corte, reintentá el mismo
formulario: la solicitud conserva su identidad para evitar duplicados.

## Alcance de esta etapa

El registro de identificadores se realiza después de la venta; todavía no exige
elegir una unidad en el checkout ni identifica dispositivos en devoluciones o
reventas. Conserva el vínculo histórico de la unidad con la venta original.
Las reparaciones pueden corresponder a equipos traídos de otro comercio.
Las garantías se ingresan junto con la unidad, sin un flujo de reclamos o ampliaciones.

Estos registros se almacenan en Supabase y no están incluidos en el respaldo
operativo JSON de seis colecciones ni en el Excel maestro existente. La ampliación
del respaldo integral sigue siendo una tarea del plan. La migración no se ejecutó
remotamente desde Codex. Las pruebas locales no sustituyen un ensayo con dos
sesiones reales en Supabase.

## Validación local

38 pruebas específicas aprobadas: permisos y aislamiento de comercio, IMEI,
garantías, límite de unidades por venta, idempotencia, rollback, estados de órdenes,
versiones concurrentes y formularios. Suite completa: 775 pruebas en 88 archivos.
Compilación TypeScript/Vite aprobada. Las pruebas SQL usan PostgreSQL embebido.
