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
No se hicieron solicitudes reales. El cliente se conecta localmente al
procesador privado de notificaciones; no hay endpoint desplegado ni conexión
al checkout.

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

La conciliación está conectada localmente al procesador de notificaciones.
Un pago confirmado no crea por sí solo la venta; esa coordinación exactamente
una vez sigue pendiente.

## Procesamiento conectado a la conciliación

`pointNotificationProcessor.ts` resuelve el comercio e intento desde el ID de
orden, verifica la aplicación y consulta al proveedor con ese comercio.
Conecta esa respuesta con la conciliación y solicita la persistencia del
resultado. Una orden aún sin vincular queda pendiente, al igual que fallas de
red o de escritura. El resultado incluye el estado realmente persistido para
no presentar una evaluación antigua como estado actual.

`supabase_fase_point_procesamiento.sql` bloquea recepción e intento y actualiza
ambos en una transacción. Comprueba sus identidades, deduplica procesamiento,
conserva estados finales y deriva mensajes contradictorios a conciliación.
No cambia una venta confirmada ni crea una venta nueva.

Los adaptadores de base/configuración y el entrypoint del procesador se
prepararon en la siguiente etapa. Falta programar su ejecución y completar
la transacción de venta.
Los datos de cuenta esperada deben provenir de configuración privada del
comercio. El frontend nunca debe suministrar esa identidad ni el estado final.
No se ejecutó esta migración remotamente ni se comprobó concurrencia real.

## Adaptadores y procesador privado

La Edge Function `point-process` procesa una recepción por UUID y conecta las
tablas privadas, la cuenta del comercio, el cliente del proveedor y la RPC
de persistencia. El endpoint usa `POINT_WORKER_SECRET` (mínimo 32 caracteres).
La configuración `POINT_ACCOUNTS_JSON` se guarda exclusivamente como secreto
del servidor: cada UUID de comercio tiene applicationId, accountId, accessToken
y modo explícito sandbox o production. No se devuelve esa configuración.

Diez pruebas de configuración, HTTP y procesamiento pasaron. El chequeo local
de TypeScript cubre módulos compartidos, no los imports remotos del entrypoint
Deno. No está desplegado ni se configuraron secretos reales.

La ejecución todavía es por recepción individual. Falta un despachador con
reintentos y recuperación para que toda notificación se procese automáticamente.
Solo habilitar ese despliegue después de completar y validar el flujo de cobro.
El endpoint del procesador requiere también gateway sin JWT y su autenticación
privada propia; nunca invocarlo ni distribuir su clave desde el navegador.

## Identidad histórica de la cuenta

El intento guarda ahora application_id, account_id y modo. La reserva exige
esos datos y un trigger protege la identidad del intento frente a actualizaciones
directas. También impide cambiar un ID de orden o pago ya asignado.
El procesador exige coincidencia con la configuración privada antes de consultar;
no reasigna una orden a la cuenta actual del comercio si esta cambió.

Catorce pruebas locales de configuración y PostgreSQL pasaron, incluyendo
inmutabilidad, rechazo de inserciones sin cuenta y cambios de configuración.
Los intentos antiguos no se completan automáticamente con datos actuales;
si carecen de vínculo histórico quedan para revisión. La migración retira
la reserva anterior de seis parámetros y usa nueve parámetros obligatorios.
Si se instaló una versión anterior de la migración Point, hay que reaplicar
el archivo de intentos y después el de procesamiento antes de desplegar este
procesador. No se ejecutaron estas migraciones en el proyecto remoto.

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
accionabilidad 4/5 y concisión 4/5. Existen persistencia de intentos, recepción
de webhooks y procesamiento privado preparados localmente; faltan creación
autenticada de órdenes, confirmación transaccional de ventas, despacho de la
cola, UI y validación real para completar la integración.

### Cálculo comercial compartido

El POS utiliza `src/lib/promocionesEngine.ts` y `src/lib/carritoImportes.ts`
para promociones, depósitos de envases, descuentos, recargos y total. Estos
módulos no dependen de Zustand, Supabase ni almacenamiento del navegador.
Se conserva la API pública de los stores para sus consumidores existentes.

El servidor puede suministrar un contexto explícito de fecha y día de semana;
`contextoPromocionesArgentina` calcula ambos en Buenos Aires. Esto evita que
el cambio de día UTC adelante o venza una promoción del comercio. El frontend
conserva su contexto local por defecto. Se validaron 59 pruebas de promociones,
carrito y fecha comercial, incluyendo el límite de medianoche y la vigencia
de combos. Aún falta conectar estos módulos a una cotización autoritativa que
cargue precios y promociones del comercio desde el servidor; extraer el cálculo
no valida importes recibidos del cliente ni habilita cobros Point.

`supabase/functions/_shared/pointQuote.ts` reconstruye un ticket desde líneas
de producto, servicio y devolución, con catálogo/promociones/envases y permisos
suministrados por el backend. Usa precios del catálogo para productos y del
registro de envases para devoluciones; los servicios requieren permiso explícito
para su importe manual. Conserva depósitos fuera de la base porcentual y calcula
el total en centavos para Point. Cuatro pruebas cubren el ticket combinado,
comercio ajeno, permisos, importes no finitos y cantidades/identidades inválidas.

`leerSolicitudCotizacionPoint` valida el
JSON externo con campos permitidos, UUID normalizados y tipos numéricos sin
coerción; rechaza precios de catálogo, total, credenciales y permisos enviados
por el cliente. La capa HTTP debe usar ese lector y obtener los permisos y datos
con identidad autenticada. Los tipos de envase actuales se almacenan localmente.
`supabase_fase_envases_precios_compartidos.sql` prepara un catálogo remoto por
comercio y un reemplazo transaccional autorizado al dueño. Tres pruebas locales
validan reaplicación, actualización, rollback y permisos. El modal de precios de
envases permite publicar el catálogo del puesto como dueño y cargar precios
compartidos explícitamente, conservando el inventario local de vacíos. Avisos
identifican tipos locales sin precio remoto activo. Falta validar este flujo con
sesiones reales.
La cotización no reserva stock ni confirma ventas.

`cotizarCobroPoint` deriva el saldo Point del total cotizado, restando aportes
netos de efectivo, transferencia, tarjeta, Mercado Pago manual y cuenta
corriente. Valida enteros en centavos, identidades únicas y saldo Point positivo.
El efectivo recibido y su vuelto no forman parte de esa resta. Fiado exige
cliente; el backend todavía debe comprobar su pertenencia, límite crediticio y
autorización, y confirmar todos los medios una sola vez junto con la venta.
Esta división no acredita los medios manuales ni reemplaza el control del cajero.

`pointQuoteAuthorization.ts` vincula perfil activo al usuario autenticado y
comercio con suscripción activa. Dueño y cajero pueden cotizar; ajustes manuales
requieren dueño en esta integración y servicios requieren capacidad explícita.
La validación de fiado comprueba cliente activo del comercio, saldo y límite,
conservando el significado existente de límite cero sin tope. Estos controles
deben ejecutarse con registros consultados por el backend y revalidarse bajo
bloqueo al confirmar la venta: una cotización no reserva crédito. Las pruebas de
estas funciones aún no prueban autenticación HTTP ni RLS con usuarios reales.

### Endpoint de cotización autenticada

`point-quote/index.ts` verifica el token mediante Supabase Auth, exige un perfil
activo único y consulta su comercio, productos, promociones paginadas, precios
remotos de envases y cliente. Todas las consultas de negocio se filtran por el
comercio del perfil. No confía en un ID de comercio enviado por el navegador.
`pointQuoteHttp.ts` valida el cuerpo con límite de 200 kB, aplica permisos y
crédito y devuelve sólo importes y líneas comerciales, sin costos. Tres pruebas
del manejador cubren sesión inválida, campos inyectados, CORS y ausencia de costos.

Configurar `POINT_ALLOWED_ORIGINS` con los orígenes exactos del POS separados por
coma. La función todavía no está desplegada ni validada con Supabase real.
El build del frontend no comprueba las importaciones remotas del entrypoint.
Una cotización no crea una orden Point, no reserva stock/crédito ni confirma
una venta; debe congelarse con el intento antes de iniciar el cobro.

### Creación desde el intento persistido

`pointOrderCreation.ts` usa exclusivamente identidad, terminal e importe del
registro congelado. Reutiliza una orden ya vinculada y conserva la clave estable
del intento al crear. La respuesta debe coincidir con referencia, cuenta,
terminal y monto; errores e inconsistencias persisten `CONCILIAR`. Producción
requiere habilitación explícita del backend y está desactivada por defecto.

`supabase_fase_point_vincular_orden.sql` vincula el ID del proveedor bajo bloqueo
y permite recuperar una creación incierta sin cambiar de intento. No acepta
otra orden ni regresa estados de pago/venta confirmados. Vincular una orden no
confirma un pago: el procesador debe consultarla y conciliarla. Once pruebas de
migraciones Point y tres de creación pasaron localmente. Falta conectar reserva,
cotización autenticada y creación en el endpoint de cobro y validar con el
proveedor; este código todavía no está desplegado.

`pointCheckoutStart.ts` coordina cotizar, reservar y crear. Antes de acceder al
proveedor exige que la reserva haya terminado; recupera el snapshot existente
en reintentos y verifica ticket, usuario, cuenta, modo y terminal. La comparación
de entradas ignora el orden de claves JSONB y conserva el orden de líneas/pagos.
Tres pruebas cubren esa recuperación, ticket modificado y fallo de reserva sin
acceso al proveedor. Falta la confirmación transaccional de la venta; no hay un
cobro habilitado en el POS.

`point-start/index.ts` conecta ese coordinador con autenticación, cotización,
reserva SQL, cliente del proveedor y vinculación de orden. Obtiene la terminal
del registro de equipos del comercio y la cuenta de configuración privada.
`pointCheckoutRecord.ts` exige snapshot versión 1 y verifica importes, entrada,
líneas y división de pagos antes de reutilizarlo. No acepta snapshots anteriores
sin esa información. Los errores HTTP devuelven una indicación genérica de
recuperar el intento, sin exponer datos internos. Nueve pruebas de lectura,
despacho HTTP y coordinación pasaron localmente.

El entrypoint no está desplegado ni ejecutado con datos reales. No configurar
`POINT_PRODUCTION_ENABLED=true` hasta validar reservas de stock/crédito,
confirmación transaccional, recuperación en UI y conciliación completa en el
entorno de prueba. Esta variable está desactivada por defecto; la etiqueta
`modo=sandbox` de configuración no sustituye credenciales y dispositivos de
prueba válidos del proveedor. Todavía no se realizaron cobros desde esta sesión.

### Comprobación local de entrypoints Deno

Se ejecutó con Deno 2.9.6 y terminó sin errores:

```powershell
npx --yes deno check --no-config --no-lock --node-modules-dir=none supabase/functions/point-quote/index.ts supabase/functions/point-start/index.ts supabase/functions/point-process/index.ts supabase/functions/point-webhook/index.ts
```

Comprueba tipos e importaciones remotas de los cuatro entrypoints y sus módulos
compartidos. No inicia servidores, ejecuta consultas de negocio, aplica SQL ni
envía cobros. La comprobación local no demuestra despliegue o funcionamiento en
el runtime administrado de Supabase; eso sigue pendiente. Deno se obtuvo mediante
la ejecución temporal de npm, sin añadirlo a las dependencias del proyecto.

Validación de regresiones del estado actual: `npm test` terminó con 599 pruebas
aprobadas en 61 archivos. Esto cubre pruebas locales y simulaciones; no cambia
las verificaciones pendientes de despliegue, sesiones reales, hardware y cobros.

Antes de incorporar componentes físicos al cierre de venta Point, aplicar
`supabase_fase_seguridad_combos.sql`: el código usa `combo_items`, mientras que
la migración maestra contiene también `items_combo`. El script antiguo de la
primera permite acceso general. La nueva migración instala guardas por comercio
y rol que sobreviven a esas políticas permisivas; cuatro pruebas locales cubren
aislamiento, escritura, referencias y cantidades. No constituye todavía la
reserva de componentes ni el cierre transaccional de la venta.

### Consumo físico congelado en la cotización

`pointStockPlan.ts` agrega consumo directo y componentes de combos en un plan
ordenado por producto físico. Excluye servicios y devoluciones de envases;
no descuenta el stock virtual del combo. Rechaza recetas inexistentes,
componentes ajenos/inactivos/virtuales, cantidades que requieren más de tres
decimales y stock conjunto insuficiente al cotizar. El backend carga recetas
desde `combo_items`, pagina componentes y consulta productos por grupos de 100
para evitar una URL extensa. Los precios de envases se leen desde el catálogo
compartido completo, limitado a 100 tipos activos.

La cotización persistida incluye `consumoStock`; la lectura del snapshot exige
ese plan con cantidades válidas e identidades sin duplicar. Diecinueve pruebas
de cotización, consumo, snapshots e inicio HTTP pasaron; ambos entrypoints de
cotización/inicio también pasaron `deno check`.

Este plan no reserva stock ni lotes: la disponibilidad puede cambiar antes de
cobrar. Todavía debe aplicarse bajo bloqueo en la reserva/cierre transaccional,
con FEFO, crédito y liberación segura en cancelaciones. No habilitar producción
basándose sólo en la cotización o esta comprobación de stock.
# Recuperación de una respuesta de creación perdida

## Reserva física antes del cobro

La siguiente migración, `supabase_fase_point_reserva_lotes.sql`, agrega
`reservar_lotes_point`, que ejecuta la reserva física y la asignación FEFO en una
misma transacción. `point-start` ahora exige este RPC. Los lotes se ordenan por
vencimiento, ingreso e ID, y sus cantidades retenidas se excluyen de asignaciones
nuevas. Las reservas impiden reducir un lote por debajo de lo retenido, desactivarlo
o cambiar su producto, comercio o fechas. Las cantidades sin lote permanecen
reservadas en el producto. Los reintentos recuperan la asignación original.
Cinco pruebas PostgreSQL locales aprobaron. Sigue pendiente consumir esas reservas
al confirmar la venta, reservar crédito y mostrar disponibilidad en el POS.
No se probó concurrencia real ni se aplicó esta migración en Supabase desde Codex.

`supabase_fase_point_reserva_stock.sql` guarda las cantidades del plan físico
congelado en una tabla privada. `point-start` exige que `reservar_stock_point`
confirme la reserva antes de llamar al proveedor. La operación bloquea intento,
caja y productos ordenados por ID; descuenta las reservas activas de la disponibilidad
y revierte todas las líneas si alguna falla. El stock físico no se modifica al reservar.

Los reintentos reutilizan la reserva. `CONCILIAR` y un pago confirmado sin venta
conservan las cantidades; cancelación/rechazo definitivos o una venta confirmada
dejan de retener disponibilidad. Un trigger impide bajar el stock por debajo de
las reservas activas y cambiar el producto a inactivo, combo u otro comercio.

La reserva física por sí sola no reserva lotes FEFO ni crédito, no muestra disponibilidad
reservada en el POS y no confirma una venta. El checkout manual existente usa
varias escrituras: puede haber guardado la venta antes de recibir un rechazo de
stock. Por eso la integración Point debe permanecer deshabilitada en producción
hasta completar el checkout transaccional y probar el circuito completo.
No se desplegó este endpoint ni se enviaron cobros. Ocho pruebas locales de reserva
e inicio aprobaron; no prueban concurrencia entre conexiones de Supabase.

Autoevaluación de esta fase: precisión 4/5 (pruebas locales, sin concurrencia real),
completitud 2/5 (faltan FEFO, crédito, confirmación e interfaz), claridad 4/5
(se explicita la diferencia entre stock físico y disponible), accionabilidad 3/5
(migración lista, producción aún requiere el checkout completo), concisión 4/5
(detalle concentrado en esta guía). Promedio 3.4/5. La siguiente mejora prioritaria
es integrar FEFO y la confirmación de venta sin escrituras parciales.

## Caja original del cobro

El inicio de un intento nuevo verifica una única sesión `ABIERTA` del usuario y
comercio autenticados. Su identificador queda congelado como `sesionCajaId` en
el snapshot versión 2. Los reintentos recuperan esa caja sin elegir un turno nuevo.
El lector rechaza snapshots antiguos sin caja; no se les asigna una caja actual.
No se modificaron intentos remotos. Antes de desplegar sobre intentos existentes,
conciliar cualquier orden pendiente y revisar su caja original.

La comprobación previa no mantiene un bloqueo de caja mientras se cobra: la reserva
y la confirmación transaccionales aún deben definir y proteger el cierre de turno.
Validación dirigida: siete pruebas en tres archivos aprobadas.

La migración `supabase_fase_point_caja.sql` agrega una segunda validación dentro
de la transacción de creación del intento. Bloquea la fila de caja y exige que siga
abierta para el usuario y comercio congelados. Un reintento de una identidad ya
existente sigue comparando su solicitud original y puede recuperarse después del
cierre del turno. El bloqueo termina al guardar el intento; no se mantiene durante
la interacción con la terminal y no impide cerrar una caja con un pago pendiente.
Tres pruebas PostgreSQL locales aprobaron reserva, rechazo y recuperación. La
concurrencia real entre conexiones y la aplicación remota siguen sin verificar.

`supabase_fase_point_cierre_caja.sql` bloquea el cierre mientras exista un intento
sin resolver o un pago sin venta confirmada. El bloqueo por Point conserva la caja
en la interfaz y no se convierte en un cierre offline. Se permiten cierres tras
cancelación/rechazo definitivos o venta confirmada. Las catorce pruebas locales de
caja y migración aprobaron; la concurrencia y el funcionamiento remoto siguen pendientes.

La sincronización de cierres offline también reconoce el rechazo Point: muestra
el motivo y conserva tanto la caja abierta como el arqueo pendiente. El cierre
pendiente sólo se elimina después de recibir exactamente la identidad de la fila
actualizada; una respuesta sin filas no se considera confirmación. Se filtra por
comercio y estado abierto. Validación local de caja: 35 pruebas en dos archivos.

El cierre inmediato también exige la identidad de la fila actualizada. Una
denegación SQL/PostgREST no se convierte en cierre offline; el rechazo Point
conserva su mensaje específico. Ante una falla de conexión, el arqueo debe
persistir localmente antes de retirar la caja de pantalla. Si falla el almacenamiento,
la caja permanece abierta. El aviso distingue cierre remoto de pendiente de
sincronización. Validación ampliada: 38 pruebas locales de caja aprobadas.

El procesador de notificaciones puede recuperar una orden que todavía no quedó
vinculada al intento local. Consulta la orden con las cuentas privadas de la
aplicación receptora y busca el intento existente por su `external_reference`.
Verifica comercio, cuenta, modo, terminal e importe antes de ejecutar
`vincular_orden_point`; después vuelve a consultar y conciliar por el circuito normal.
No crea otro intento ni realiza un nuevo cobro. Si falta evidencia, la recepción
queda pendiente. Esta recuperación requiere la migración de vinculación existente.

Validación local ampliada: diez pruebas dirigidas de recuperación y procesamiento
aprobadas. Se verifican cuentas, terminales, referencias y origen inconsistentes,
fallas de persistencia y una nueva consulta del estado financiero tras recuperar.
La suite completa aprobó 613 pruebas en 64 archivos y `npm run build` terminó sin
errores; persiste la advertencia de tamaño de chunks. Estas pruebas locales no
acreditan el estado de las migraciones ni los datos del Supabase remoto.
No se probó con una terminal real ni se desplegó esta actualización.

