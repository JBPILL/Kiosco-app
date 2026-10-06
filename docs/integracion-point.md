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
