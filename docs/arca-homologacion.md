# Preparar ARCA en homologación

Estado: preparación local disponible; **no hay emisión fiscal activada**.
Actualización 20/10/2026: certificado recibido, par criptográfico comprobado y
WSAA homologación PASS tras la autorización WSASS de `wsfe` por el titular.
WSFE se consultó después de este estado inicial; ver la adenda final con código 602. No se emitieron comprobantes. Los resultados históricos
inferiores se conservan.
En el ensayo asistido del 18/10 ya se generaron la clave y el CSR del titular;
para retomarlo se conservan esos mismos archivos, sin repetir el paso 1.
Homologación significa conversar con los servicios de prueba de ARCA y recibir
sus respuestas reales. Una simulación local o un CAE aleatorio no la validan.

## 1. Generar la clave cifrada y el CSR

En una terminal PowerShell 7.4+ abierta en este repositorio:

```powershell
pwsh -NoProfile -File .\scripts\preparar-arca-homologacion.ps1
```

Si `pwsh` no está en PATH, en esta instalación de Codex está disponible aquí:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe" -NoProfile -File .\scripts\preparar-arca-homologacion.ps1
```

Ingresar los datos sólo en esa terminal: CUIT del titular que entrará a WSASS,
nombre de organización, alias del sistema y contraseña de cifrado de al menos
12 caracteres, repetida. No se necesitan contraseña fiscal ni acceso a internet
para este paso. La contraseña se ingresa oculta; el programa no la guarda.
El alias de WSASS sólo admite letras y números, por ejemplo
`KioskoPOSHomologacion20261018`; no usar guiones ni espacios.

Los archivos quedan en una carpeta nueva dentro de
`~/KioskoPOS-Privado/ARCA-Homologacion/`, con acceso exclusivo del usuario Windows:

- `solicitud-homologacion.csr`: solicitud pública que se presenta en WSASS.
- `clave-homologacion-cifrada.pem`: clave privada cifrada, conservar localmente.

No pegues ninguno en el chat ni los agregues a Git. La clave y su contraseña
deben conservarse: el certificado de ARCA sólo funcionará con esa misma clave.
El programa rechaza destinos dentro del repositorio y directorios ya existentes;
no sustituye ni rota una clave anterior.

En la preparación asistida del 18/10 se generó la contraseña aleatoriamente y
se conservó en `proteccion-clave.dpapi`, cifrada por Windows para el usuario
actual, dentro del mismo directorio privado. No se imprimió ni se envió a ARCA.
Ese archivo tampoco debe compartirse ni agregarse a Git; su protección depende
de la identidad Windows y del equipo, no sustituye un respaldo portable.

Usa APIs criptográficas de .NET: RSA 3072, CSR PKCS#10 firmado SHA256 y clave
PKCS#8 cifrada AES256/PBKDF2-SHA256. No instala OpenSSL ni genera un certificado
autofirmado para presentarlo como emitido por ARCA.

## 2. Trámite personal en ARCA

El titular inicia sesión por sí mismo con clave fiscal. Si no tiene WSASS,
adhiere el servicio desde el Administrador de Relaciones. En WSASS crea un
certificado nuevo, elige un alias y presenta únicamente el CSR. Su CUIT debe
coincidir con el serialNumber de la solicitud; guarda el certificado devuelto.
Después crea la autorización del alias para `wsfe`, indicando el contribuyente
representado. Este último puede diferir del titular del certificado.

Guías oficiales: [certificados y acceso a WSASS](https://www.afip.gob.ar/ws/documentacion/certificados.asp),
[generación del CSR](https://www.afip.gob.ar/ws/WSASS/html/generarcsr.html),
[obtención del certificado](https://www.afip.gob.ar/ws/WSASS/html/crearcertificado.html)
y [autorización del servicio](https://www.afip.gob.ar/ws/WSASS/html/crearautorizacion.html).

## 3. Qué falta para probar facturación

El certificado y la clave se instalarán por canal seguro sólo del lado servidor,
primero en Staging. No usar localStorage ni las columnas públicas del kiosco.
La integración debe verificar JWT/rol/tenant, persistir una operación estable,
coordinar numeración y consultar el comprobante ante una respuesta incierta.
No desplegar la Edge legacy `afip-wsfe` como solución: requiere ese rediseño.

Los próximos ensayos son WSAA con certificado autorizado, parámetros de WSFE,
emisión de prueba, reintento idéntico y recuperación mediante FECompConsultar.
Hasta superarlos, se mantiene el guard estricto de facturación y no se promete
homologación finalizada. No se emitirán comprobantes de producción ni se usará
una venta real para estos ensayos.

[WSAA y asociación del certificado](https://www.afip.gov.ar/ws/documentacion/wsaa.asp)
y [documentación oficial de homologación](https://www.afip.gob.ar/fe/ayuda/homologacion_externa.asp).
El PDF enlazado actualmente indica una revisión posterior al 17/10/2026;
confirmar contrato y WSDL del entorno antes de asumir esa revisión vigente.

## Ensayo asistido — 18/10/2026

El titular inició sesión y autorizó adherir WSASS y solicitar un certificado.
Se abrió el servicio TESTING/HOMOLOGACIÓN; no había certificados previos.
La clave y el CSR reales se generaron localmente con custodia cifrada fuera
de Git. WSASS exige alias de letras/números: no acepta guiones.

La solicitud con alias válido devolvió error interno de mensajería:
`EJBTransactionRolledbackException: Could not send Message`. Se consultaron
certificados/aliases antes de un único reintento con el mismo CSR y alias;
el error se repitió. La lista final continuó sin certificados. No asumir éxito,
no cambiar de clave/alias para reintentar a ciegas ni usar ese resultado como CAE.
WSFE no fue autorizado y no se emitieron comprobantes de ningún entorno.
Conservar la solicitud para retomar cuando WSASS pueda procesarla.

Herramienta publicada en master en 72839fa junto con la corrección del Excel
(3d1f3e7). Suite final conjunta: 1870 PASS / 1 skipped / 198 archivos; build PASS,
611 módulos. Pruebas nativas de cifrado/CSR/ACL PASS. Audit 0; escaneo de fuentes
sin secretos nuevos. Ambos checks Vercel success. Estos resultados validan el
código y la preparación local, no la emisión de un certificado ni un CAE de ARCA.

## Certificado y ensayo WSAA — 20/10/2026

El titular proporcionó el certificado público emitido por Computadores Test.
Formato X.509 PASS; CN `KioskoPOSHomologacion20261018`, RSA 3072, vigencia
20/10/2026 16:21:18 UTC a 19/10/2028 16:21:18 UTC. Comparación SPKI derivado
de la clave original descifrada sólo en memoria: `CERTIFICATE_PRIVATE_KEY_MATCH=PASS`.
No se regeneró clave ni CSR; el certificado recibido se conservó fuera del checkout.

La herramienta local `scripts/probar-wsaa-homologacion.ps1` usa PowerShell 7.4+
y las APIs criptográficas de .NET ya disponibles, sin dependencias nuevas.
Recibe rutas mediante `-Certificado`, `-ClaveCifrada` y `-ProteccionDpapi`;
`-Servicio` es `wsfe` por defecto. No requiere variables de entorno nuevas.
Sin `-Conectar` sólo valida el par, construye el TRA y verifica la firma CMS.
Con `-Conectar` hace un único POST al endpoint fijo de homologación, sin
redirecciones, sin persistir el ticket ni emitir comprobantes. No ejecutarla con
transcripción, depuración de variables o captura de memoria habilitada.

Con autorización expresa del titular se ejecutó una única llamada. Resultado:

```text
CERT_KEY_MATCH=PASS
TRA_GENERATION=PASS
CMS_SIGNATURE=PASS
WSAA_HOMOLOGACION=FAIL
STAGE=LOGIN_CMS
CODE=WSAA_FAULT:ns1:coe.notAuthorized
TOKEN_RECEIVED=false
SIGN_RECEIVED=false
WSFE_READY=false
```

No interpretar el rechazo como autenticación completada. El diagnóstico apunta
a la autorización del certificado para `wsfe`; comprobar en WSASS **Crear
Autorización a Servicio**, seleccionar el alias existente, el contribuyente
representado y el servicio correspondiente. No cambiar el certificado ni la clave
para resolver un permiso. [Instrucciones oficiales](https://www.afip.gob.ar/ws/WSASS/html/crearautorizacion.html).
No se reintentó tras el rechazo ni se hizo una llamada a WSFE.

La Edge legacy continúa sin desplegarse: no constituye una pasarela fiscal segura.
El diagnóstico local no modifica Supabase, Staging, master ni Production.
No hubo commit, push o deploy de este bloque por restricción expresa del titular.

### Autorización resuelta y autenticación real confirmada
El titular creó la autorización del mismo alias al servicio `ws://wsfe` y confirmó
el contribuyente representado. Se hizo un único reintento tras ese cambio externo:
`WSAA_HOMOLOGACION=PASS`, `TOKEN_RECEIVED=true`, `SIGN_RECEIVED=true`;
`expirationTime=2026-10-21T04:41:57.766Z` (01:41 hora argentina).
El TA sólo existió en memoria del proceso de diagnóstico; no se registró en
Supabase, disco, logs ni Git. No volver a solicitar otro TA a ciegas: WSAA puede
rechazar solicitudes mientras haya un ticket vigente.

`PrepareWsfeDiagnostic` prepara una consulta `FEParamGetPtosVenta` usando el TA
en memoria y un CUIT representado con dígito verificador válido; rechaza TA
vencido/próximo a vencer. El endpoint y SOAPAction están fijados a homologación.
No ejecuta la consulta ni puede emitir comprobantes. Su contrato se verificó contra
la [operación oficial](https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetPtosVenta).
Falta probar WSFE real y diseñar custodia/caché servidor, autorización por comercio,
numeración y recuperación antes de activar facturación en el sistema.

Validación local: suite completa 2106 PASS / 1 skipped / 220 archivos (224,91 s),
build PASS (632 módulos), manifiesto histórico 43 SQL PASS, diff PASS y escaneo
sin candidatos nuevos. Esa suite precede a la preparación posterior del diagnóstico
WSFE; las pruebas dirigidas se vuelven a ejecutar para ese agregado.
Pruebas dirigidas finales: 4 PASS / 2 archivos, incluidas 17 comprobaciones
criptográficas/protocolo con datos sintéticos y el contrato de no emisión.

### Informe del bloque local
- Inspeccionados: package.json, .gitignore, preparación criptográfica PowerShell,
  documentación ARCA, Edge legacy afip-wsfe, tipos/store AFIP, pruebas existentes,
  índice e historial de extensiones criptográficas (sin archivos privados encontrados).
- Modificados: .gitignore, este documento y DECISIONS.md. Agregados:
  scripts/arca/WsaaHomologacion.cs, scripts/probar-wsaa-homologacion.ps1 y
  src/test/wsaaHomologacion.test.ts. El plan general del piloto se agregó aparte.
- Dependencias nuevas: ninguna. Variables de entorno nuevas: ninguna.
- Riesgos pendientes: WSFE aún no validado en red; no existe todavía una pasarela
  fiscal nueva con caché privada, permisos por comercio e idempotencia de emisión.
- Próximo paso: ensayo de consulta WSFE no transaccional con un TA vigente dentro
  del mismo proceso autorizado; no generar comprobantes como prueba de conectividad.

| Gate | Resultado |
|---|---|
| CERT_KEY_MATCH | PASS |
| SECRET_SAFETY | PASS para archivos/ejecución revisados; no sustituye auditoría integral del historial |
| TRA_GENERATION | PASS |
| CMS_SIGNATURE | PASS |
| WSAA_LOGIN_CMS | PASS real, homologación |
| TOKEN_RECEIVED | PASS |
| SIGN_RECEIVED | PASS |
| WSFE_READY | PENDIENTE: solicitud preparada, ejecución no realizada |
| TESTS | PASS con el alcance y orden indicados arriba |


### Adenda: consulta real y aclaración del punto de venta (20/10/2026)

Con autorización específica del titular se ejecutó una autenticación WSAA y una
única consulta FEParamGetPtosVenta, exclusivamente en homologación. Par de claves,
TRA y CMS PASS; WSAA PASS real. WSFE respondió `WSFE_BUSINESS:602` (sin datos).
No se emitió ningún comprobante, no se obtuvo CAE y no se persistieron Token/Sign.
No se reintentó la consulta después de ese resultado.

El titular confirmó que el punto 2 sólo se ingresó en KioskoPOS. Esa configuración
no acredita su registro en ARCA. El código 602 no demuestra por sí solo un fallo
del certificado ni permite afirmar que haga falta crear un punto en Producción.
PR01 sigue PARCIAL: comprobar las reglas específicas de homologación y preparar
el siguiente diagnóstico no transaccional antes de solicitar su autorización.

Validación del diagnóstico ampliado: 4 pruebas PASS en 2 archivos, con 24
comprobaciones sintéticas de protocolo/criptografía. La suite completa de 2177
PASS / 1 skipped y el build de 634 módulos preceden a esta ampliación WSFE.
Referencia oficial del método y alcance de su consulta:
https://www.afip.gov.ar/fe/documentos/manualDesarrolladorCOMPGv21.pdf


### Preparación del siguiente diagnóstico PR01 (20/10/2026)

Se agregó la opción explícita `-ConsultaWsfe FEParamGetTiposCbte` al diagnóstico
local. El valor predeterminado sigue siendo FEParamGetPtosVenta; una ejecución
consulta sólo el método seleccionado, sin reintentos automáticos. Ambos métodos
están en una lista cerrada; no admite operaciones de emisión ni URL configurable.
La consulta de tipos no depende de informar un punto de venta. Su resultado no
acredita que el punto 2 esté disponible ni habilita una emisión con CAE.

Validación local posterior: 4 pruebas PASS en 2 archivos, incluidas 32
comprobaciones sintéticas (solicitud y acción SOAP, lista válida, lista vacía,
duplicados, identificador inválido, método incorrecto, error de negocio y
operación no permitida). PR01 sigue PARCIAL. La ejecución real adicional está
pendiente de autorización específica; no se reutiliza el permiso de la consulta
anterior ni se crean puntos de venta en Producción.

Contrato oficial consultado el 20/10/2026:
https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetTiposCbte


### Cierre de diagnóstico PR01 y siguiente dependencia (20/10/2026)

Tras autorización específica del titular se ejecutó con el diagnóstico
`cc199d5` una única autenticación WSAA y una única consulta FEParamGetTiposCbte,
ambas en homologación, con certificado original y CUIT representado autorizado.
Resultados sanitizados: CERT_KEY_MATCH, TRA_GENERATION, CMS_SIGNATURE y
WSAA_HOMOLOGACION PASS; WSFE_HOMOLOGACION PASS; TIPOS_COMPROBANTE=36;
COMPROBANTES_EMITIDOS=0. Token/Sign sólo en memoria; proceso finalizado sin
persistencia de credenciales. No se modificaron configuración ni datos fiscales
del comercio, master o Production.

PR01 queda PASS para autenticación y consulta de parámetros; se conservan arriba
el 602 de la consulta de puntos y los estados históricos previos. Este cierre
no acredita disponibilidad del punto 2, habilitación productiva, CAE ni robustez
fiscal. PR02 sigue pendiente y exige primero su dependencia PR03.

El bloque de implementación PR03 y sus casos de fallo están en el
[ExecPlan existente](../.agent/execplans/arca-homologation.md#bloque-siguiente-pr03-previo-al-cae),
sin abrir un plan equivalente ni duplicar la matriz canónica.

Validación del código usado: 4 pruebas dirigidas PASS / 2 archivos, con 32
comprobaciones sintéticas; diff PASS. La suite global/build anteriores no se
reclasifican como ejecución posterior a este agregado. No hay nueva dependencia.


### Avance PR03 local — 20/10/2026

Primer diario preparatorio de homologación implementado en SQL aditivo, sin
instalación remota ni integración de emisión. Conserva contexto propuesto y
snapshot de venta; identidad estable, rechazo de cambio de contenido y permisos
mínimos. No reserva números, contacta ARCA ni conserva credenciales. Detalles y
límites en el [ExecPlan](../.agent/execplans/arca-homologation.md#pr03-primer-registro-durable-implementado-localmente--20102026).

31 pruebas SQL locales nuevas; suite completa posterior 2208 PASS / 1 skipped /
225 archivos, build PASS 634 módulos, manifiesto 43 SQL PASS y diff PASS. PR03
sigue PARCIAL: faltan contrato final, numeración, worker/custodia, reconciliación
y aceptación hospedada. No se emiten comprobantes con esta preparación.


### Reserva y concurrencia fiscal local — 20/10/2026

Preparado segundo SQL aditivo con serie global, reserva única e intento previo;
ACK repetido no habilita otro envío y reserva/venta se coordinan con la anulación.
57 casos SQL locales PASS y seis carreras reales PostgreSQL 17.11 PASS, usando
sólo fixtures sintéticas y conexiones locales. El runner conserva datos de ensayo
y detiene sólo su contenedor. Los intentos iniciales fallaron durante arranque y
actualización de Docker; sus límites y el resultado posterior se preservan en el
[ExecPlan existente](../.agent/execplans/arca-homologation.md#resultado-postgresql-real-local--20102026).

No se instaló SQL en Staging ni se conectó worker a ARCA. Faltan reconciliación,
resolución de reservas, cuerpo fiscal final, custodia y aceptación hospedada.
La suite/build posteriores a este agregado se registrarán al terminar. El módulo
continúa respondiendo emision_habilitada=false. PR03 sigue PARCIAL.


Cierre local del bloque de reservas: suite 2234 PASS / 1 skipped / 225 archivos;
seis carreras PostgreSQL PASS. Se corrigieron anotaciones UUID detectadas por el
build; después 57 casos SQL PASS y build PASS (634 módulos). Manifiesto 43 SQL y
diff PASS. No hay instalación ni emisión. El detalle del orden de validación y
las limitaciones permanecen en el ExecPlan.


### Reconciliación: adaptador local preparado — 21/10/2026

Contrato congelado con SHA-256 y comparación de identidad/receptor/importes/IVA/
tributos/fechas; lectura SOAP estricta con parser mantenido, consulta homologada
sin redirecciones y timeout que incluye el cuerpo. Respuestas inciertas o distintas
no autorizan reenvíos; no hay CAE generado ni cambios comerciales.
90 casos dirigidos y suite 2324 PASS / 1 skipped / 227 archivos; build 634 módulos
PASS. Ejecución en Edge Runtime local: dos casos sintéticos PASS. Auditoría npm:
0 alertas tras parches de Vite y source-map-js. Alcances y fuentes en el
[ExecPlan](../.agent/execplans/arca-homologation.md#reconciliacion-f02f05f06--avance-local-21102026).

Todavía falta persistir cuerpo/hash ligado a venta/reserva, resolver la autorización
en DB de forma atómica, y conectar custodia/worker/UI. No se instaló ni desplegó
una función fiscal ni se consultaron comprobantes reales en este bloque. La emisión
y PR03/PR02 siguen pendientes; esta preparación no habilita facturación.

### Endpoint de consulta y recuperación preparado — 21/10/2026

La función nueva `arca-homologacion` está preparada para revisión, sin instalación
remota. Arranca cerrada salvo flag privado y proyecto Staging exacto. Conserva
verificación JWT de gateway y vuelve a verificar usuario/tenant en Auth/SQL.
No admite emitir ni enviar un cuerpo fiscal desde la aplicación.

Contrato POST JSON, con sesión Bearer y Origin del frontend de Staging:

- `CONCILIAR`: `operacion_id` y `observacion_id` UUID de la operación existente.
  Repetir la misma observación recupera su resultado sin otra consulta fiscal.
- `ESTADO_TA`: `operacion_id`. Devuelve estado/intento/revisión sin credenciales.
- `CANCELAR_PREPARACION_TA`: `operacion_id`, `intento_id`, `revision` originales.
  Sólo libera PREPARADA; una intención ya enviada o incierta no se libera.

Límite de cuerpo 2048 bytes; campos extra/duplicados y acciones desconocidas se
rechazan. Las respuestas contienen `emision_habilitada=false`. Un estado incierto
requiere conservar los identificadores; no autoriza volver a cobrar ni emitir.

146 pruebas locales enfocadas y dos recorridos Edge locales PASS. Auth/ARCA son
simulados en esos recorridos; JWT/RLS y E2E hospedados siguen pendientes. Instalar
SQL 001–007, desplegar la nueva función deshabilitada, provisionar secretos y
habilitar consultas son gates diferentes. Habilitar el flag privado requiere el
alcance autorizado de consulta real. No se usó material criptográfico real aquí.
La recuperación sólo permite actuar sobre la operación de origen. Si la sesión
consulta otra operación que comparte certificado, recibe `COMPARTIDA`, sin los
identificadores ajenos. SQL 008 refuerza este aislamiento; los registros antiguos
sin origen verificable no se reasignan ni se liberan automáticamente. El ensayo
actualizado tiene 150 pruebas dirigidas y dieciséis carreras PostgreSQL PASS.

### Trabajador privado de envío preparado — 21/10/2026

Se contrastó el WSDL público y el manual oficial v4.7 (revisión 01/09/2026).
El worker consulta el último número, consume una autorización exacta del cuerpo
guardado y solicita un solo comprobante. Una respuesta de aprobación requiere
consulta completa y persistencia antes de confirmarse. Los errores o respuestas
perdidas se concilian; no se repite automáticamente el envío ni el cobro.

SQL 009 no se instaló y no crea autorizaciones activas. El permiso liga operación,
hash y credencial, expira como máximo en una hora y no se reutiliza. El endpoint
público conserva sólo consultas/recuperación; no admite emitir. Preparación de
datos fiscales, revisión UI y resolución de rechazos/devoluciones siguen pendientes.
Las pruebas fueron sintéticas; falta punto acreditado y autorización de emisión.

Cierre integrado posterior al guard de vigencia: 2656 PASS / 1 skipped /
238 archivos, salida 0 (pilot-fiscal-emission-permission-suite-results.json).
La única omitida sigue siendo la fixture F6 de candidatos no configurada;
ninguna prueba fiscal nueva omitida. Build posterior PASS, 634 módulos;
153 enfocadas y 18 carreras PostgreSQL v4 PASS, Edge sintético 3+7 PASS.
Manifiesto 43 SQL PASS; diff sin errores; escaneo 1210 archivos, 47 candidatos,
delta 0. Este cierre reemplaza el estado de suite en ejecución anterior para
este incremento. SQL 001–009 y Edge fiscal continúan sin instalar/activar.

SQL 010 prepara la exclusión transaccional de devolución/reserva con lock de venta, sin modificar stock/caja. Exige READ COMMITTED; otras snapshots fallan cerradas. 195 pruebas enfocadas y 20 carreras PostgreSQL locales PASS. No instalado; faltan preparación/UI, rechazos y notas de crédito antes de aceptar el piloto fiscal.

Cierre SQL 010: 2666 PASS / 1 skipped / 238 archivos; build, 195 enfocadas, 20 carreras PostgreSQL y oxlint dirigido PASS. Pruebas locales, sin instalación ni emisión real.

### Revisión previa del Dueño (preparada, sin instalar)

SQL 011 vincula aprobación temporal de diez minutos al cuerpo exacto, usuario/Auth y emisor. REVISAR_COMPROBANTE consulta el cuerpo validado; APROBAR_REVISION conserva el recibo por identidad y no renueva vigencia. No acceden a custodia ni a ARCA, ni sustituyen el permiso privado de envío. El worker comprueba antes de TA y DB después del lock. EMITIR sigue fuera del endpoint. 131 enfocadas, 24 carreras PostgreSQL y Edge sintético 3+9 PASS; faltan preparación/UI e instalación/aceptación hospedadas.

Refuerzo posterior: la identidad verificada por Auth se conserva hasta la aprobación/intención de envío, con gate transaccional. La entrada anterior sin actor se revoca a service_role. 155 enfocadas, 24 carreras PostgreSQL y Edge v3 (3+9) PASS. La suite previa de 2697 pruebas precede este refuerzo; cierre integrado final todavía en curso.

Cierre final de revisión + Auth: 2703 PASS / 1 skipped / 238 archivos, 155 enfocadas, 24 carreras PostgreSQL, Edge v3 (3+9), build y oxlint PASS. Backend preparado, sin instalación/provisión ni emisión real; pantalla y preparación fiscal pendientes.

### 22/10/2026 — F08: preparación explícita y revisión visual, integración aún abierta

Decisión confirmada por el titular: el tratamiento fiscal de envases vacíos descontados del ticket está pendiente de definir con su contador. Esas ventas se bloquean en la preparación; no se inventa un descuento gravado/exento ni se altera su total. Este bloqueo no se extiende a las ventas sin recepción de envases.

Primer incremento local: contrato público de preparación sin CUIT/punto/total/número editables; validación cerrada de datos explícitos, compatibilidad de clase/condición y catálogo versionado suministrado por servidor. El hash de preparación no es el hash final ni una autorización; el número provisional usado para validación estructural se elimina y nunca se reserva/emite. No se cargó catálogo real ni se acreditaron alícuotas desde fixtures.

Componentes FiscalPreparationForm y FiscalOwnerReviewPanel preparados, con controles del tema existente. Fechas dd/mm/aaaa, selección explícita de receptor/emisor/concepto/moneda, importes obligatorios y detalle IVA/tributos. Revisión muestra cuerpo completo; aprobación exige acción humana y ACK del cuerpo/revisión exactos. Respuesta tardía no aprueba otro cuerpo, la aprobación vence en pantalla y no se muestra como CAE. Sin errores privados en mensajes del formulario.

Validación local dirigida: 203 PASS en 6 archivos, incluidas 43 pruebas nuevas de este incremento; oxlint dirigido PASS. Hubo un inicio de Vitest impedido por spawn EPERM y tres fallas iniciales de matchers no instalados; se corrigieron usando comprobaciones DOM existentes y se volvió a ejecutar. Build inicial PASS anterior al formulario; compilación posterior debe acreditarse por separado.

Estado deliberadamente PARCIAL: componentes aún no conectados a HistorialTicketsModal; faltan contexto fiscal autenticado/catálogo acreditado, persistencia de preparación vinculada a snapshot/actor/emisor, resolución de operación desde venta, identificadores durables antes del POST, consulta privada de último número y enlace al cuerpo SQL 003/011. Clasificación del emisor es declarada por Dueño, no verificación de padrón. El catálogo sintético no acredita compatibilidad fiscal real ni cálculo de alícuotas. No cerrar preparación/UI ni aceptación E2E con estas pruebas aisladas. La suite global 2703 PASS corresponde al HEAD f50c974, no a este trabajo local.

Sin SQL fiscal nuevo instalado, Edge desplegado/habilitado, provisión de claves, llamadas autenticadas a ARCA, emisión, merge ni cambios en master/Production. Mantener primer CAE y aceptación hospedada pendientes. Impresora/cajón y Point continúan diferidos. Próximo paso: completar persistencia y adaptación autenticada antes de conectar/activar la pantalla.
Cierre local de este incremento F08: build posterior al formulario PASS (634 módulos), oxlint dirigido PASS, manifiesto histórico 43 SQL PASS y escaneo 1220 archivos/47 candidatos, delta 0 respecto a F07. Evidencias: pilot-fiscal-explicit-preparation-ui-targeted.log, pilot-fiscal-explicit-preparation-ui-final-build.log y pilot-fiscal-explicit-preparation-ui-scan-verified.log fuera de Git. No se ejecutó nuevamente la suite global; 203 PASS es la selección dirigida actual. No se desplegaron los componentes ni se integraron al flujo operativo.

### 22/10/2026 — F08: guardado durable explícito preparado (sin instalación)

SQL 012 agrega catálogo privado versionado/vigente y preparación inmutable. No siembra filas ni habilita catálogos. Fuente/fechas/revisión son metadatos de aprovisionamiento pendiente, no prueba automática de parámetros ARCA reales. El servicio verifica Auth una sola vez y conserva ese actor hasta contexto y escritura. DB revalida actor/pertenencia, comercio, venta con artículos, emisor y parámetros bajo locks; toma total y snapshot desde servidor. No simula auth.uid() de usuario con service_role.

La escritura conserva el UUID/canónico/hash original y se repite con el mismo ACK. Rechaza otra identidad, cuerpo, Auth, emisor o snapshot. El wrapper de cuerpo final exige datos exactos preparados (excepto el número observado), parámetros vigentes y actor/emisor originales antes de llamar a SQL 003. La preparación sola no reserva número ni toca TA, stock/caja o red fiscal. Se mantiene tratamiento de envases bloqueado por decisión contable pendiente. La validación estructural reutiliza SQL 003 con un número que no se guarda ni reserva; no se muestra como numeración autorizada.

SDK privado amplía la lista cerrada de 13 a 16 RPC: contexto, guardado y enlace final; no expone tablas ni la entrada SQL 003 sin preparación. Los nuevos métodos aún no están conectados a acciones HTTP/UI. No habilita ninguna emisión ni consulta ARCA por agregar RPC. Clasificación del emisor sigue declarada por Dueño y el cálculo/compatibilidad de alícuotas reales depende de catálogo acreditado/provisión pendiente.

Evidencia dirigida actual: 130 PASS / 4 archivos, incluidas 33 nuevas de SQL/servicio. PostgreSQL 17.11 local: 28 escenarios PASS, incluidos doble guardado, reasignación Auth, cambio de venta y vencimiento de catálogo después de esperar lock (fiscal-durable-preparation-concurrency-20261022.json). Contenedor propio detenido, datos conservados, externos/emisiones 0. Se conservan el fallo inicial de fixture con columna incorrecta y una regresión SQL roja por condiciónEmisor null; corregida comprobando tipo string antes de guardar. No quedaron pruebas omitidas en el pase dirigido. Oxlint dirigido salida 0, con advertencia no-unsafe-finally preexistente en cleanup del runner; manifiesto histórico 43 SQL y diff PASS. Build previo al último ajuste del SDK PASS; cierre de build/suite final todavía pendiente.

PR03/F08 continúa PARCIAL. Faltan acciones HTTP anidadas con control de duplicados/límites, recuperación por venta, UUID durable en cliente, consulta privada de último número con gate propio y unión de los componentes a HistorialTicketsModal. SQL 001–012/Edge sin instalar; no provisión, llamadas fiscales autenticadas, CAE ni deploy nuevo. No modificar master/Production, ni integrar PR #3. Rechazos/NC y aceptación hospedada siguen abiertos; impresora/cajón y Point diferidos.
Cierre integrado de este incremento de persistencia F08: 2779 PASS / 1 skipped / 243 archivos, salida 0 (pilot-fiscal-durable-preparation-suite-results.json). La única omitida sigue siendo la fixture F6 no configurada; ninguna fiscal nueva omitida. 130 dirigidas, 28 escenarios PostgreSQL y build final de 634 módulos PASS. Oxlint de archivos finales sin hallazgos; se conserva advertencia preexistente de finally en el runner. Manifiesto histórico 43 SQL PASS, diff sin errores, escaneo 1224 archivos/47 candidatos/delta 0. Backend privado ausente del bundle público. Este cierre reemplaza los estados de build/suite pendientes anteriores para este incremento, sin cerrar F08 ni las limitaciones de integración/heredados identificadas. SQL 001–012 y Edge siguen sin instalar/activar; cero emisiones, nuevas consultas ARCA autenticadas o deploy frontend.
### 22/10/2026 — F08: HTTP, recuperación por venta e integración visual detrás de flag

Se extrae gate privado Auth→perfil→comercio→venta para reutilizarlo en contexto y resolución. SQL 012 detecta registro afip_cae heredado no vacío vía to_jsonb, incluso cuando el bootstrap estricto no tiene esa columna; bloquea nueva preparación sin afirmar validez de ese registro. Resolver devuelve estado/id originales sin exigir catálogo/emisor activos. Auth reasignado o snapshot cambiado requiere revisión sin exponer id previo. No se vuelve a inferir identidad desde perfil para atribuir el intento a otra cuenta.

Acciones HTTP nuevas RESOLVER_VENTA, DATOS_FISCALES_VENTA y GUARDAR_DATOS_FISCALES. JSON con claves duplicadas (también escapadas/anidadas) y profundidad >12 se rechaza antes de Auth. Guardado tiene máximo 64KiB; consultas/revisión conservan 2KiB; timeout de cuerpo 3s y CORS/origen/host/flag privados conservados. SDK privado amplía allowlist a 17 RPC, sólo agregando resolución. Sin acción EMITIR, TA ni consulta ARCA desde estas acciones.

Cliente conserva UUID y datos exactos antes del POST; almacenamiento fallido impide envío, ACK perdido permite mismo intento, otro cuerpo no reemplaza pendiente. Scope por Auth/comercio/venta; los datos del receptor se retiran tras ACK o GET que recupera ese mismo UUID, conservando sólo identidad local. Aprobación conserva UUID/hash/revisión y vigencia para replay. Verificación de sesión en navegador evita usar la cuenta anterior; no sustituye Auth.getUser/SQL en servidor. Respuestas tardías no cambian otra venta seleccionada.

HistorialTicketsModal integra FiscalDocumentModal para Dueño activo ordinario con flag VITE_KIOSKO_ARCA_REVISION_HOMO=true y piloto estricto. Flag nuevo NO configurado/habilitado. Emisión heredada no es fallback del flujo nuevo. Modal reutiliza estilos/componentes existentes: carga explícita, guardado pendiente, preparación guardada, revisión exacta y aprobación separada de emisión/CAE. Registro heredado o contexto dudoso no ofrece datos nuevos. Si se recupera AUTORIZADA y falla el detalle, se conserva ese estado sin proponer otro comprobante. Se asigna useId al título de Modal para distinguir diálogos anidados; sin cambio de colores/tema.

Pruebas dirigidas actuales: 162 PASS / 8 archivos, con guard de sesión/proyecto, replay tras reinicio, almacenamiento fallido, privacidad tras ACK, historial por roles, carga/guardado/revisión y selección cambiada. PostgreSQL 17.11 local: 30 escenarios PASS, incluidos resolver que espera guardado y CAE heredado confirmado mientras contexto espera venta; contenedor propio detenido y datos conservados. Evidencia fiscal-sale-resolution-concurrency-20261022.json. Build inicial identificó unión discriminada HTTP y literal boolean de fixture; corregidos sin casts de producción. Compilación posterior PASS; último cierre del mensaje de recuperación aún requiere build/suite final. No interpretar suite global 2779 anterior como cierre de estos cambios.

F08 sigue PARCIAL: falta gate privado de consulta de último número y orquestador preparación→cuerpo/reserva→revisión para la primera solicitud, recuperación de constancia fiscal completa, rechazo/cancelación/NC y aceptación hospedada/visual real. Estado DATOS_PREPARADOS se muestra como tal, no como revisión ni factura. Catálogo real/punto de venta/custodia aún sin acreditar/provisionar. Envases descontados del ticket continúan pendientes de contador. SQL 001–012 y Edge siguen sin instalar/activar; frontend nuevo no desplegado. No tráfico ARCA autenticado, CAE, merge ni modificación de master/Production. No activar flag antes de completar esos gates; impresora/cajón y Point siguen diferidos.
Refuerzo F08 posterior a la auditoría de permisos: getter/aprobación SQL 011 y wrapper/trigger de consumo exigen Auth original cuando existe preparación 012. No basta el filtro del historial. Helper privado revocado a todos los roles externos; compatibilidad 011 antes de tabla 012 comprobada tanto en PGlite como PostgreSQL. Petición directa con UUID conocido y Auth reasignado rechazada. Una revisión histórica sintética del Auth ajeno tampoco habilita consumo. Vigencia se evalúa después de los locks y del nuevo guard.

Cliente fija Authorization al token de la sesión que comprobó, en vez de permitir que el SDK seleccione otra cuenta entre getSession e invoke. Token sólo en memoria: no entra a almacenamiento, UI ni logs. Se verificó en el código instalado de FunctionsClient la precedencia de headers explícitos. Sin token de esa sesión no se envía la petición.

Evidencia posterior: 203 PASS dirigidas / 9 archivos; PostgreSQL 32 escenarios PASS (fiscal-sale-resolution-original-actor-concurrency-20261022.json), contenedor propio detenido con datos conservados. Suite global anterior a este guard: 2847 PASS / 1 skipped / 247 archivos (pilot-fiscal-sale-resolution-suite-results.json), no es el cierre del refuerzo. Se conservan la regresión roja de acceso directo y un pase intermedio fallido por referencia de trigger situada en otra función; corregida su ubicación y repetidas las pruebas. Build final del token y suite posterior aún pendientes de cierre.

Escaneo final: 1233 archivos, 48 candidatos; único delta frente a 47 es src/test/fiscalBrowserClient.test.ts:9, asignación explícita de token SINTÉTICO de fixture, revisada como no real. No se ocultó ni ofuscó el candidato. Ninguna credencial real nueva incorporada; claves/certificados originales no usados. Gates remotos/primera emisión permanecen cerrados y F08 continúa parcial por numeración/cuerpo/constancia/rechazos y aceptación.
Cierre integrado posterior a todos los refuerzos de este incremento: 2850 PASS / 1 skipped / 247 archivos, salida 0 (pilot-fiscal-sale-resolution-original-actor-suite-results.json). La única omitida sigue siendo fixture F6 no configurada; ninguna fiscal nueva omitida. 203 dirigidas / 9 archivos, 32 escenarios PostgreSQL y build final 642 módulos PASS. Manifiesto histórico 43 SQL y diff PASS; oxlint de archivos nuevos/fiscales dirigido sin hallazgos, advertencias preexistentes en efectos de Modal/Historial y finally del runner conservadas. Escaneo 1233 archivos/48 candidatos: único delta es token explícitamente sintético de fixture, no credencial real. Entradas privadas SQL/worker ausentes del bundle. Este cierre reemplaza resultados previos/en curso para el incremento, sin cerrar F08: corrección de datos rechazados, numeración privada/orquestación, constancia, rechazos/NC y aceptación siguen pendientes antes de activar. No deploy frontend ni instalación SQL/Edge; no llamadas ARCA autenticadas, CAE, merge ni cambios en master/Production.
### 22/10/2026 — F08: validación previa y primera preparación de cuerpo, sólo local

Se separa fiscalEmissionContract (reglas puras de cuerpo) del transporte fiscalWsfeEmission. Formulario y cliente reutilizan prepareFiscalData antes de crear primer UUID/cuerpo local. Suma/documento/período/desglose inválidos pueden corregirse sin pendiente ni POST; otro envío simultáneo reusa identidad después de la validación asíncrona y una mutación del llamador no altera la copia validada. Pendiente incierto ya existente mantiene cuerpo/UUID y no se sustituye ni borra. Rechazo definitivo posterior al envío aún requiere contrato auditable de resolución/cancelación.

SQL 013 carga fuente privada vinculada a Auth original, snapshot, emisor y catálogo; cuerpo existente se recupera antes de TA/red, incluso con gate de preparación cerrado. Sin body sólo lee datos explícitos guardados. Worker prepareFiscalVoucher valida canónico/hash/contexto, exige ARCA_HOMO_PREPARATION_ENABLED=true (no configurado/habilitado), carga TA mediante custodia/caché existentes y sólo consulta FECompUltimoAutorizado. Revalida origen justo antes de red, agrega número observado+1 y persiste mediante wrapper 012. Éxito exige leer cuerpo durable; ACK falso/sin commit no confirma. ACK perdido/concurrencia recupera mismo cuerpo; no FECAESolicitar, aprobación, permiso privado ni movimiento venta/stock/caja. Overflow y cambios de actor/emisor se rechazan.

Contexto 012 rechaza devolución previa antes de cargar TA/consultar numeración (guard 010 en reserva sigue vigente). Se observa también devolución que gana el lock mientras fuente espera. HTTP/UI PREPARAR_COMPROBANTE conduce de datos guardados a revisión del cuerpo reservado; fuente privada/custodia nunca se retornan al cliente. Frontend tiene timeout acotado de 40s para ese paso, conserva sesión fijada y recupera por operación ante respuesta incierta. Flag frontend y gate privado siguen apagados; no se usaron claves originales ni se consultó ARCA realmente.

Pase dirigido actual: 264 PASS / 9 archivos. PostgreSQL 17.11 local: 34 escenarios PASS en fiscal-body-preparation-concurrency-final-20261022.json; contenedor propio detenido, datos conservados. Primer intento no arrancó por Docker detenido, preservado como FAIL/cero casos; motor per-user reabierto Hidden y ensayos posteriores separados. Se conservan fallo inicial TypeScript por import de tipo removido y fixture de devolución sin Auth; corregidos sin debilitar permisos. Build final PASS 644 módulos, manifiesto histórico 43 SQL y diff PASS, oxlint dirigido sin hallazgos. Escaneo 1236 archivos/48 candidatos, delta cero frente al cierre anterior (token sintético ya documentado). Consulta/transporte/entradas privadas ausentes del bundle; sólo validación pura se comparte.

Estado: la unión local datos→fuente→consulta simulada→cuerpo durable→revisión está preparada y probada; no acredita gateway Edge nuevo ni JWT/RLS/ARCA hospedados. SQL 001–013 y Edge sin instalar/activar; cero nuevas consultas autenticadas/emisiones reales o deploy frontend. F08/PR03 aún parcial: cancelación/rechazos posteriores a envío, constancia completa/NC, catálogo/punto/custodia reales y aceptación hospedada/visual permanecen gates. Envases descontados siguen pendientes del contador. Production/master intactos, sin merge; impresora/cajón y Point diferidos. La suite global 2850 anterior no es cierre de este incremento: falta el pase global actual.
Cierre integrado de este incremento F08: 2876 PASS / 1 skipped / 247 archivos, salida 0 (pilot-fiscal-body-preparation-suite-results.json). La única omitida sigue siendo fixture F6 no configurada; ninguna fiscal nueva omitida. 264 dirigidas / 9 archivos, 34 escenarios PostgreSQL y build final 644 módulos PASS. Oxlint dirigido sin hallazgos, manifiesto histórico 43 SQL y diff PASS. Escaneo 1236 archivos/48 candidatos, delta cero; candidato sintético previo conservado. Consulta, gate y transporte privados ausentes del bundle. Sustituye los estados de suite en curso/2850 previo para este incremento. No se desplegó frontend ni se instaló SQL/Edge; no TA real, consulta ARCA autenticada, emisión ni merge. F08/PR03 no se da por completado: quedan resolución auditable de rechazos/incertidumbre, constancia/NC, provisión y aceptación hospedadas con sus autorizaciones, además de los gates comerciales/Production.
22/10/2026 — Constancia recuperable preparada localmente: SQL 014 y CONSTANCIA_COMPROBANTE leen el ledger autorizado sólo con Auth original de preparación 012 y venta/operación coherentes. No renueva TA ni consulta ARCA; catálogo/custodia pueden estar deshabilitados para lectura histórica. Modal presenta CAE/vencimiento y cuerpo confirmado como homologación sin validez fiscal, sin controles de aprobación/emisión. Error conserva AUTORIZADA para reconsulta. Es vista de ledger; representación fiscal final, primera emisión/CAE real y aceptación hospedada permanecen pendientes. SQL 001–014/Edge no instalados/activados; ningún deploy ni autorización externa nueva consumida.

22/10/2026 — Recepción fiscal candidata ahora tiene auditoría privada preparada (SQL 015), separada de conciliación y autorización durable. Se conservan códigos/clasificación con hash/intento/Auth original, sin mensajes/SOAP/TA/CAE candidato. Confirmación exige lectura durable; ACK perdido no repite envío, contradicción no sobrescribe. Sin recepción válida no se inventa rechazo. Registrar R no constituye resolución definitiva ni libera número: diagnóstico activo, corrección/cancelación/NC y aceptación siguen pendientes. SQL 001–015/Edge no instalados/activados; flags apagados, ninguna llamada fiscal real o despliegue nuevo.

22/10/2026 — Diagnóstico del Dueño preparado localmente en SQL 016 y modal detrás del flag apagado. Getter activo separado del histórico de auditoría: exige Dueño ordinario activo, comercio/venta y Auth original; muestra recepción/códigos y última decisión, no mensajes libres/TA/permiso de reenvío. Ausencia de respuesta no afirma rechazo y aprobación recibida no significa CAE conciliado. Estado autorizado preservado ante respuesta atrasada o fallo parcial. Sin instalación remota, deploy o consulta ARCA real. Resolución definitiva/corrección/cancelación/NC y aceptación hospedada siguen pendientes.
