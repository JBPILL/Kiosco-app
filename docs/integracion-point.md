# Integración Terminal Point

El usuario eligió Terminal Point y confirmará el modelo al instalar en el local.
El desarrollo puede continuar en entorno de prueba; la selección y validación
de la terminal real quedan como requisito para habilitar producción.
Pendiente confirmar vinculación a la cuenta del comercio.
El repositorio tiene una Edge Function ARCA;
todavía no tiene una función desplegada para Point.

## Contrato del proveedor consultado

La [documentación oficial](https://www.mercadopago.com.ar/developers/es/docs/mp-point/payment-processing)
describe Orders API: listar terminales, enviar una orden `point` con terminal,
importe decimal, referencia y `X-Idempotency-Key`. El Access Token se usa en
backend. La creación devuelve `created`, que no confirma el cobro.
La cancelación de una orden recibida por la terminal puede ser asíncrona;
HTTP 202 no acredita la cancelación definitiva. Hay que guardar los IDs de
orden y pago para seguimiento y conciliación.

## Implementado localmente

`supabase/functions/_shared/pointOrder.ts` construye el cuerpo desde un intento
validado en servidor. Valida UUID, terminal y centavos enteros positivos;
reutiliza la referencia del intento y no incluye datos personales.
Tres pruebas comprueban importes, identidad estable y entradas inválidas.
No hace solicitudes externas ni habilita cobros en la interfaz.

`pointClient.ts` agrega un cliente de uso servidor con URL fija de Mercado Pago,
creación con clave estable, consulta y cancelación. Rechaza IDs manipulados,
deshabilita redirecciones y limita el tiempo de espera. Devuelve IDs y estados
del proveedor; no interpreta `created` ni HTTP 202 como cobro o cancelación
definitiva. Los errores omiten credenciales y cuerpos del proveedor.
Los cortes de conexión y respuestas inválidas se consideran inciertos para
que el futuro orquestador consulte y concilie antes de repetir el cobro.

Siete pruebas simuladas cubren cuerpo, identidad, cancelación pendiente,
errores sin secretos, rutas manipuladas y respuestas incompletas.
No se hicieron solicitudes reales. El cliente todavía no está conectado a
un endpoint desplegado, a persistencia ni al checkout.

## Persistencia preparada

`supabase_fase_point_intentos.sql` crea una tabla privada de servidor y una
función de reserva. Congela comercio, checkout, terminal, importe y solicitud
para la identidad del intento. Bloquea otro intento activo del mismo checkout,
incluidos resultados inciertos y pagos confirmados. Solo una cancelación o
rechazo confirmados permiten un nuevo intento. El servicio deberá comprobar
esos estados con el proveedor antes de marcarlos como definitivos.

Cinco pruebas ejecutan la migración dos veces en PostgreSQL local y verifican
reintentos, diferencias de importe, unicidad, resultado incierto y permisos.
La migración no se aplicó remotamente y no habilita cobros. La Edge Function
todavía debe validar al usuario y el comercio, calcular el importe del carrito
en servidor, persistir el intento y coordinar los estados con el proveedor.
No almacenar credenciales ni costos privados en la solicitud.

La prueba local usa un esquema mínimo y roles simulados. No acredita JWT,
PostgREST ni concurrencia entre procesos del Supabase remoto. La restricción
única y el bloqueo de fila son la protección declarada para concurrencia;
su validación con solicitudes simultáneas queda pendiente.

## Firma de notificaciones

`pointWebhook.ts` verifica HMAC-SHA256 sobre el identificador y metadatos
firmados, con Web Crypto. La construcción del manifiesto se contrastó con el
[SDK oficial](https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts)
y el uso del ID del query con la
[documentación de Point](https://www.mercadopago.com.ar/developers/es/docs/mp-point/notifications).
Rechaza parámetros repetidos, firmas malformadas y discrepancias entre ID
firmado y cuerpo. Solo devuelve el ID, nunca una aprobación del pago.

Cuatro pruebas usan HMAC independiente de Node para probar autenticidad,
manipulación y consistencia del cuerpo. No se probaron notificaciones reales.
La firma no elimina reenvíos: sigue pendiente registrar recepción durable,
deduplicar procesamiento y consultar la orden antes de confirmar la venta.
No se impone una ventana temporal hasta validar el comportamiento de reintentos
del proveedor; el timestamp se conserva como parte exacta del manifiesto.
El endpoint público se preparó localmente en la siguiente etapa; su despliegue
y validación real siguen pendientes.

## Recepción durable preparada

La Edge Function `point-webhook` usa `POINT_WEBHOOK_SECRET` y
`POINT_APPLICATION_ID` como secretos/configuración del servidor. Verifica la
firma y guarda únicamente la identidad firmada en la tabla privada de
notificaciones, sin almacenar el estado monetario enviado en el cuerpo.
Responde 200 después de persistir y 503 si no puede guardar. La migración
`supabase_fase_point_notificaciones.sql` evita duplicar una recepción y deja
el trabajo pendiente para procesar la orden desde el proveedor.

Catorce pruebas locales del receptor, la firma y las dos migraciones pasaron.
La compilación TypeScript de la aplicación cubre los módulos compartidos por
las pruebas; no compila el entrypoint Deno con sus dependencias remotas.
Pendiente comprobar ese runtime, desplegar y probar notificaciones reales.

El receptor todavía no procesa el pago: **no desplegarlo como integración
terminada**. Primero completar el procesador, la creación autenticada y la
confirmación transaccional de la venta. Luego aplicar las dos migraciones Point,
configurar secretos en Supabase y desplegar `point-webhook` con verificación JWT
desactivada para permitir llamadas del proveedor. Su autenticación es HMAC,
no la ausencia de JWT. Configurar la URL en Mercado Pago solo en esa etapa.
No guardar secretos en archivos, Git o variables VITE.

## Conciliación de la respuesta del proveedor

`pointReconciliation.ts` compara la orden obtenida por el cliente servidor con
el intento guardado: referencia, ID, terminal, cuenta, país, tipo e importe.
Solo acredita un pago `processed/accredited` con importe pedido y pagado
coincidentes. Los estados se contrastaron con los
[estados oficiales de Point](https://www.mercadopago.com.ar/developers/en/docs/mp-point/resources/status-order-transaction).
Los importes se comparan como centavos enteros; formatos inválidos, respuestas
incompletas y estados desconocidos quedan para conciliación.

Ocho pruebas del cliente y conciliación pasaron. Es una validación conservadora:
una respuesta real que omita terminal o importe pagado no confirma la venta.
Debe ajustarse con evidencia del entorno de prueba si el proveedor entrega
esos datos mediante otra consulta. No se probaron cuotas, pagos reales ni
respuestas del modelo de terminal del comercio.

La conciliación todavía no está conectada al procesador de notificaciones o
a una transacción de venta. Un pago confirmado no crea por sí solo la venta;
esa coordinación exactamente una vez sigue pendiente.

## Siguiente implementación

1. Configuración privada por comercio: terminal y credenciales en servidor.
   Para cuentas de terceros se requiere el flujo de autorización apropiado.
2. Intento persistente con carrito, importe calculado por servidor y clave estable.
3. Edge Function autenticada que compruebe comercio y terminal antes de enviar.
4. Webhook verificado y consulta del proveedor antes de aprobar la operación.
5. Confirmación de venta exactamente una vez, recuperación y conciliación.
6. UI con pendiente, aprobado, rechazado y cancelación en curso.
7. Validación en entorno de prueba y después con el hardware del comercio.

Reabrir o recargar la pantalla debe recuperar el intento existente. Un timeout
no debe habilitar un segundo cobro ni confirmar una venta. Una respuesta
desconocida queda pendiente de conciliación. Las credenciales nunca deben ir
en variables `VITE_*`, Git ni capturas del chat.

Autoevaluación: precisión 4/5, completitud 2/5, claridad 4/5,
accionabilidad 4/5 y concisión 4/5. Hay una base probada; faltan persistencia,
backend, webhook, UI y validación real para completar la integración.
