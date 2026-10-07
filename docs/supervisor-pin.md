# Autorización de supervisor

## Estado de esta fase

Base de almacenamiento y derivación implementada. **No habilita aprobación de acciones ni incorpora todavía un endpoint público o formulario.** Los descuentos extraordinarios del cajero continúan rechazados. Falta límite de intentos, espera progresiva, aprobación con vencimiento vinculada al cuerpo original y consumo transaccional al ejecutar cada acción.

## PIN y secretos

`supabase/functions/_shared/supervisorPinCrypto.ts` es código de servidor. Admite cadenas de 4 a 6 dígitos ASCII sin recortar ni convertir números, para conservar ceros iniciales. Usa HMAC-SHA256 con un pepper aleatorio de 32 bytes y contexto del comercio, seguido de PBKDF2-SHA256 con 600.000 iteraciones, sal aleatoria de 16 bytes y resultado de 32 bytes.

El factor de trabajo corresponde a la recomendación PBKDF2 de [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). El pepper compensa parcialmente el espacio reducido del PIN cuando sólo se filtra la base de datos: debe mantenerse en el gestor de secretos del servidor, separado del hash. No reemplaza los límites de intentos ni protege si también se roba el pepper. No existe un pepper predeterminado en producción.

El registro versionado contiene algoritmo, factor, sal, hash y versión del pepper. No contiene PIN ni pepper. Rechaza formatos, versiones y factores distintos; una rotación del pepper exige conservar la versión anterior de forma segura o volver a configurar el PIN. La comparación recorre todos los bytes del hash sin salida temprana; no se afirma una garantía de tiempo constante del motor JavaScript.

## PostgreSQL

`supabase_fase_supervisor_pin_privado.sql` crea tablas privadas con RLS. Sólo el backend puede leer el hash. La configuración exige ejecución como `service_role` y un perfil activo de dueño, obtenido por identidad de autenticación; la futura Edge Function deberá resolver esa identidad desde el JWT verificado, nunca desde un campo del navegador.

La función de configuración valida el formato del hash, incrementa la revisión de forma atómica y registra comercio, actor, revisión y fecha sin duplicar el hash en auditoría. Las futuras aprobaciones deben invalidarse cuando cambie la revisión. El cliente autenticado, incluso dueño, no puede leer o escribir estas tablas ni ejecutar la configuración directamente. El respaldo comercial de la aplicación no incorpora estas tablas; un dump administrativo completo requiere protección de secretos.

## Evidencia y siguientes pasos

18 pruebas nuevas aprobadas: derivación independiente con Node Crypto, PIN de 4/6 dígitos, sales distintas, PIN/pepper/comercio incorrectos, registros debilitados o malformados, cambio de revisión/auditoría, actor inválido y prohibición de acceso del cliente. La migración se aplica dos veces en PostgreSQL local con PGlite. Compilación del proyecto comprobada.

Siguiente fase: reserva de intentos y bloqueos persistentes antes de comparar el PIN, backend de configuración/autorización con JWT, permiso efímero ligado a acción/cuerpo/operador/comercio y consumo dentro de la transacción. Después, formulario compacto en Configuración y modal numérico para acciones del cajero. Falta prueba Deno, instalación remota y piloto con sesiones reales.

## Autoevaluación

Precisión 4/5: WebCrypto contrastado con Node y SQL ejecutado; falta entorno Deno remoto. Completitud 3/5: almacenamiento listo; autorización y límites pendientes. Claridad 4/5: fronteras explícitas; interfaz pendiente. Utilidad 4/5: base ejecutable para backend; no habilita el flujo aún. Concisión 4/5: funciones pequeñas; documentación conserva detalles de operación. Promedio 3,8/5. Mejora prioritaria: límite de intentos y permisos ligados a acciones. La evaluación no presenta esta base como el sistema completo de supervisor.

## Reservas y límites persistentes

La migración `supabase_fase_supervisor_pin_intentos.sql` agrega contadores privados por comercio y operador, junto con reservas auditadas. Sólo el backend puede reservar/finalizar. No se guarda el PIN ni el pepper en la reserva. Las reservas pendientes y fallidas cuentan: máximo cinco por operador y diez por comercio en ventanas de 15 minutos basadas en el reloj del servidor. Una reserva vence en 30 segundos. El éxito libera sólo su cupo y una sola vez, sin reducir los fallos anteriores. Una respuesta perdida o un fallo del gestor de secretos conserva el consumo de intento.

Todas las operaciones bloquean primero el contador del comercio y después el del operador. La finalización exige el mismo actor activo y revisión del PIN; una reserva vencida o anterior a un cambio de PIN se registra como inválida. El resultado final no puede reescribirse por reintentos. La migración es reaplicable sin reiniciar contadores.

`supervisorPinVerification.ts` conecta reserva, recuperación del pepper según versión, comparación criptográfica y finalización mediante dependencias del servidor. El resultado SQL prevalece si la reserva caducó o cambió el PIN. El módulo sólo devuelve estado e identificador; no entrega hash o pepper al cliente y todavía no concede permisos para realizar acciones.

Evidencia de esta fase: 31 pruebas en tres archivos cubren criptografía, permisos, límites por operador/comercio, ventanas, caducidad, revisión, finalización idempotente y fallos de secretos. PGlite usa una conexión: falta concurrencia PostgreSQL real. Compilación correcta.

Siguiente trabajo: espera progresiva además de la ventana fija, retención de auditoría, backend con JWT y permisos efímeros ligados a acciones, consumo transaccional y UI. No hay endpoint público del PIN activo ni despliegue remoto realizado.

Autoevaluación: precisión 4/5 (protocolo y SQL comprobados; concurrencia real pendiente), completitud 3/5 (límites persistentes listos; permisos/UI y espera progresiva pendientes), claridad 4/5 (política explícita; sin pantalla aún), utilidad 4/5 (verificador conectable al backend; entorno remoto pendiente), concisión 4/5 (funciones acotadas; documentación por fases acumulada). Promedio 3,8. Mejora prioritaria: aprobación ligada a acción e integración del servidor. El usuario debería coincidir con que este avance todavía no activa el supervisor completo.

## Permisos ligados a descuentos

`supabase_fase_supervisor_autorizacion_descuento.sql` vincula la reserva de PIN a la entrada original del checkout antes de comparar el código. La operación permitida en esta fase es DESCUENTO, porcentual o fijo. El comercio y operador deben corresponder al perfil activo de la identidad autenticada; los campos ajenos al contrato se rechazan.

Una verificación válida y reciente permite emitir un permiso privado por dos minutos, ligado al intento, identidad, comercio, revisión del PIN, acción y cuerpo JSON original. Recuperar la respuesta perdida devuelve el mismo ID y plazo; no renueva el permiso. Cambiar importe, operador, ID de checkout u otro campo impide consumirlo. Cambiar el PIN invalida permisos anteriores. Consumirlo dos veces se rechaza.

El consumo no está concedido directamente a service_role ni al navegador: deberá ejecutarse desde la función financiera SECURITY DEFINER dentro de su transacción. La prueba verifica rollback del consumo, pero la integración con la venta todavía falta. No se debe consumir mediante una llamada separada y luego intentar guardar la venta.

`supervisorDiscountAuthorization.ts` conecta lectura estricta de la entrada, reserva ligada al cuerpo, verificación limitada y emisión. Sólo devuelve estado, identificador del permiso y vencimiento. La identidad del actor deberá proceder del JWT verificado por el futuro endpoint. Un PIN válido con emisión fallida no se comunica como autorización concedida.

Evidencia: 41 pruebas enfocadas en cuatro archivos, incluidas criptografía real, SQL, consumo único, caducidad, revisión, identidad, entrada cambiada y rollback. La migración se reaplica dos veces. Compilación correcta. No se activó ningún endpoint ni se aplicó SQL remoto.

Siguiente paso: integrar consumo en cierre de venta, backend HTTP con JWT y formulario/modal de supervisor. Después extender acciones de anulación, precio y cajón, y añadir espera progresiva. Los descuentos extraordinarios del cajero siguen bloqueados en la aplicación actual.

Autoevaluación: precisión 4/5 (contratos y rollback comprobados; concurrencia remota pendiente), completitud 3/5 (permiso ligado a descuento listo; integración financiera/UI pendiente), claridad 4/5 (estado explícito; sin pantalla aún), utilidad 4/5 (módulo backend y SQL ejecutables; despliegue pendiente), concisión 4/5 (acciones acotadas; documentación acumulada extensa). Promedio 3,8. Mejora prioritaria: consumir permiso en la misma transacción que confirma la venta. El usuario debería coincidir con que la función de supervisor aún no está operativa para el cajero.

## Consumo dentro de la venta

`supabase_fase_checkout_manual_supervisor.sql` incorpora `confirmar_venta_manual_autorizada`: exige la entrada y snapshot originales preparados, consume el permiso de descuento y confirma la venta en la misma transacción. Un error de stock u otra validación financiera revierte también el consumo, permitiendo reintentar con el mismo permiso vigente. Toma el bloqueo del checkout antes de leer la preparación, siguiendo el orden del circuito existente.

Una venta ya confirmada recupera el resultado mediante las verificaciones del RPC original, sin exigir otro permiso ni repetir efectos. El navegador no puede ejecutar esta función; sólo el servidor de cobro tiene permiso. El consumo privado sigue sin ejecución directa para service_role.

Evidencia: 97 pruebas aprobadas en cuatro archivos. Los casos nuevos cubren venta con descuento, rollback por stock insuficiente y reintento, recuperación de confirmación sin permiso nuevo, snapshot cambiado, permiso ausente o vencido y ejecución con roles SQL. Las migraciones se reaplican en PGlite. No se comprobó concurrencia con conexiones reales ni se aplicó esta migración en Supabase remoto.

La Edge Function y la interfaz todavía no usan este RPC. Los descuentos extraordinarios del cajero siguen bloqueados. La siguiente integración debe impedir que una preparación que requiere supervisor se confirme por el circuito ordinario; no basta con elegir el RPC según un dato opcional del navegador. Después faltan endpoint con JWT, configuración de PIN, modal compacto, otras acciones protegidas y espera progresiva.

Autoevaluación: precisión 4/5 (transacción y roles comprobados; concurrencia real pendiente), completitud 3/5 (consumo financiero listo; conexión HTTP/UI pendiente), claridad 4/5 (límites explícitos; documentación acumulada extensa), utilidad 4/5 (RPC ejecutable; requiere instalación e integración), concisión 4/5 (función acotada; registro por fases extenso). Promedio 3,8. Mejora prioritaria: conectar el servidor sin permitir eludir la autorización mediante la confirmación ordinaria. Esta fase todavía no habilita el supervisor para el cajero.

## Permisos al recuperar una preparación

El backend comprueba el límite porcentual del cajero antes de recuperar una preparación existente. Una preparación creada por el dueño no concede su permiso a otro operador. La regresión prepara un descuento del 20% como dueño, verifica que el cajero no invoque la confirmación y comprueba que el dueño conserve su reintento. Pasaron las 21 pruebas del archivo de backend.

Esta corrección no conecta todavía el permiso efímero. Para descuentos fijos, la decisión depende de la base comercial original (excluye envases): falta conservar esa decisión autorizada en la preparación y exigirla al confirmar, sin volver a cotizar con precios nuevos. Ése es el próximo requisito antes de habilitar descuentos extraordinarios desde la interfaz. No se despliega automáticamente la Edge Function mediante este push.

Autoevaluación: precisión 4/5 (regresión directa; sin piloto remoto), completitud 3/5 (porcentaje protegido en recuperación; descuento fijo y conexión pendientes), claridad 4/5 (alcance documentado; documentación extensa), utilidad 4/5 (corrige backend; despliegue pendiente), concisión 4/5 (cambio pequeño; fases acumuladas). Promedio 3,8. Mejora prioritaria: persistir y hacer cumplir la decisión de supervisor para todas las preparaciones. La evaluación no considera completo el flujo de supervisor.

## Decisión durable y protección del circuito ordinario

`supabase_fase_checkout_manual_politica_supervisor.sql` persiste `requiere_supervisor`, calculado exclusivamente por la cotización del backend. La decisión considera el importe fijo respecto de la base comercial sin depósitos de envases, incluso cuando prepara un dueño. Un reintento conserva la decisión original y no vuelve a cotizar. Una preparación antigua de descuento fijo sin decisión requiere dueño o autorización: no se reconstruye la base a partir de importes finales ni se modifica retrospectivamente.

La confirmación ordinaria rechaza las preparaciones protegidas si actúa un cajero. La implementación financiera interna pierde EXECUTE para service_role; el cierre autorizado consume el permiso y llama esa implementación dentro de la misma transacción. Las confirmaciones existentes siguen recuperándose sin duplicar efectos. El endpoint público y el modal de PIN continúan pendientes, por lo que no se habilitan aún descuentos extraordinarios del cajero.

Evidencia: 95 pruebas aprobadas entre backend y SQL, incluidos decisiones true/false/legacy, depósitos excluidos, conservación de la decisión, cierre interno inaccesible y cierre autorizado. Compilación aprobada. Migración reaplicada dos veces en PGlite; sin instalación remota ni concurrencia real. La nueva Edge Function de checkout requiere esta migración antes de desplegarla.

Autoevaluación: precisión 4/5 (decisión y rutas SQL comprobadas; piloto pendiente), completitud 3/5 (protección durable lista; HTTP de PIN/UI pendiente), claridad 4/5 (compatibilidad histórica explícita; documentación acumulada), utilidad 4/5 (SQL y backend conectados; instalación remota pendiente), concisión 4/5 (una decisión booleana; dos wrappers financieros necesarios). Promedio 3,8. Mejora prioritaria: implementar endpoint autenticado de supervisor y conectar el permiso al checkout. El avance todavía no completa el plan.

## Endpoint de configuración y autorización

La función `supervisor-pin` usa el JWT verificado con `auth.getUser` y el perfil/comercio del servidor. Sólo el dueño configura el PIN. Dueño y cajero pueden consultar su existencia y solicitar autorización para la entrada de su propia sesión. El estado devuelve únicamente un booleano; el hash y los peppers permanecen privados. El backend conecta reserva, finalización y emisión por sus parámetros SQL nombrados; no acepta identidad o rol enviados por el navegador.

La configuración deriva el hash antes de guardarlo y devuelve éxito únicamente después de confirmar la revisión SQL. Los secretos se cargan por versión desde `SUPERVISOR_PIN_PEPPERS_JSON` y `SUPERVISOR_PIN_PEPPER_VERSION`, sin fallback. Se conservan las versiones anteriores para verificar sus hashes. Campos adicionales, PIN numérico/malformado, comercio ajeno y perfil inactivo se rechazan. Las respuestas no se cachean ni exponen detalles de errores; el código no registra solicitudes con PIN.

Pruebas locales de HTTP y secretos cubren estas fronteras con criptografía real, además de bloqueo 429 y configuración fallida. Compilación del frontend y módulos importados por pruebas aprobada. Falta comprobar el entrypoint/adaptador en Deno y JWT/PostgREST real; no se desplegó la función. La guía es `docs/desplegar-supervisor-pin.md`. Esta fase no agrega SQL: el paquete 18–33 sigue siendo el mismo conjunto de migraciones.

Siguiente paso: conectar el permiso al checkout, conservarlo junto a la entrada inmutable y presentar formulario de dueño y modal de cajero. Permanecen pendientes espera progresiva, retención, otras acciones protegidas y piloto remoto.

Autoevaluación: precisión 4/5 (HTTP y secretos probados; Deno/adaptador remoto pendiente), completitud 3/5 (endpoint escrito; conexión checkout/UI pendiente), claridad 4/5 (contrato y despliegue documentados; sin pantalla aún), utilidad 4/5 (función preparada; requiere secretos e instalación), concisión 4/5 (tres acciones acotadas; guía técnica separada). Promedio 3,8. Mejora prioritaria: conectar el permiso al cobro sin cambiar el cuerpo original. No se considera habilitado el supervisor ni terminado el plan.

## Permiso en el backend de checkout

El handler `checkout-manual` acepta `x-supervisor-autorizacion` como UUID separado del cuerpo comercial inmutable. No admite PIN ni identidades en ese encabezado. La cotización sigue verificando precios, promociones, recetas y crédito en el servidor antes de preparar; la presencia del UUID no prueba autorización. La función SQL verifica y consume el permiso al confirmar.

Para cajeros, una decisión protegida (porcentaje extraordinario, fijo protegido o fijo antiguo sin decisión) llama exclusivamente al RPC autorizado. El error no habilita un fallback al cierre ordinario. Al recuperar una preparación existente puede llamar sin permiso: el SQL devuelve una confirmación ya existente, o rechaza la venta todavía pendiente. Así una respuesta perdida no obliga a cobrar nuevamente ni a emitir otro permiso para una venta confirmada.

Sólo los errores SQL conocidos de permiso ausente, vencido/consumido o PIN modificado se traducen a SUPERVISOR_REQUERIDO. Otros fallos conservan CIERRE_NO_CONFIRMADO sin filtrar texto SQL. La aprobación y el cierre permanecen transacciones distintas, pero el consumo y los efectos financieros comparten la transacción del cierre.

Pruebas de backend cubren header malformado, cuerpo conservado, ambos descuentos, recuperación sin recotizar y fallo sin fallback; la suite SQL cubre consumo/reversión/confirmación. Falta transmitir y conservar el permiso en la cola del frontend y agregar el formulario/modal. No se desplegaron las funciones ni se agregaron SQL en esta fase.

Autoevaluación: precisión 4/5 (coordinador y SQL comprobados; Deno y JWT remotos pendientes), completitud 3/5 (backend conectado; cola e interfaz pendientes), claridad 4/5 (permiso separado del cuerpo; documentación extensa), utilidad 4/5 (handler listo para integración; requiere despliegue), concisión 4/5 (campo separado y callback; alias de errores acotados). Promedio 3,8. Mejora prioritaria: guardar el permiso con la entrada local y conectarlo al modal de cajero. El plan general sigue activo.

## Permiso durable en el cliente

La cola Dexie conserva únicamente identificador y fecha de vencimiento del permiso, separados de la entrada. No guarda PIN, hash ni pepper. El guardado exige el mismo cuerpo original, un cobro pendiente y ninguna cancelación solicitada; no crea un checkout nuevo ni modifica importes. Renovar el permiso conserva la misma solicitud. No requiere cambio de índices o versión de Dexie.

El envío lee el permiso durable y agrega `x-supervisor-autorizacion` al request de checkout. Comprueba nuevamente el operador después de obtener el JWT y leer la cola para evitar usar una sesión cambiada. Un permiso con fecha local vencida también puede viajar: el reloj del cliente no decide el resultado y el servidor puede recuperar una venta ya confirmada. Si la venta sigue pendiente, el servidor rechaza el permiso vencido.

Pruebas nuevas cubren persistencia/reapertura, cuerpo cambiado, cancelación, confirmación, entrada inexistente, formato de permiso, header separado y cambio de sesión durante el envío. No hay aprobación visual por tener un UUID local: el SQL continúa siendo la autoridad. Falta el servicio del cliente para solicitar el permiso, el formulario del dueño y el modal del cajero. No se agrega SQL ni se activa Point.

Autoevaluación: precisión 4/5 (cola y envío probados; piloto real pendiente), completitud 3/5 (permiso durable conectado; interfaz y petición de PIN pendientes), claridad 4/5 (datos separados; documentación acumulada), utilidad 4/5 (base de recuperación lista; despliegue pendiente), concisión 4/5 (campo sin índice nuevo; validación compartida). Promedio 3,8. Mejora prioritaria: conectar el servicio de supervisor con el formulario/modal. El plan general permanece incompleto.
