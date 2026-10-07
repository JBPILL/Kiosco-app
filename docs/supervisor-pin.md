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
