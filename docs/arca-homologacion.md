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
16 caracteres, repetida (alineado con la custodia privada desde el 27/10/2026;
el preparador histórico aceptaba 12). No se necesitan contraseña fiscal ni acceso a internet
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

22/10/2026 — Base SQL 017 de cancelación sin cuerpo/número preparada localmente: conserva historial, impide reactivar UUID cancelado y permite una preparación nueva activa para corregir. Requiere versiones actualizadas 001/002/012; no instalar 017 aislado sobre funciones anteriores. No modifica venta/stock/caja ni cancela reserva/envío/CAE. Servicio/HTTP/cliente/modal aún pendientes, con confirmación humana y recuperación durable antes de retirar un pendiente local. SQL 001–017/Edge sin instalar/activar remotamente; ninguna consulta ARCA real ni despliegue nuevo.

22/10/2026 — Cancelación/corrección anterior a cuerpo/número integrada localmente con confirmación del Dueño, identidad original y recuperación durable antes de retirar pendiente. Cliente usa Web Locks por Auth/comercio/venta y requiere navegador compatible; la aceptación real de dos pestañas/perfil y actualización de versiones sigue pendiente junto con JWT/RLS/visual. Backend SQL017 mantiene historial e impide guardado tardío. No cancela reserva/envío/CAE ni resuelve rechazo fiscal definitivo. SQL001–017/Edge sin instalación/activación remota, cero nuevas consultas/emisiones reales o deploy.

### 22/10/2026 — Corrección antes de intención con número conservado

SQL 018 agrega sustitución privada auditada: UUID nuevo, preparación explícita y cuerpo final nuevos, original SUSTITUIDA, reserva transferida atómicamente con número/serie/fecha iguales. No modifica el último número observado, no fabrica consulta ARCA y no hereda permiso/revisión. Si ya existe intención, respuesta, conciliación o CAE, se rechaza sin liberar numeración. Replay recupera la transición histórica. 51 escenarios PostgreSQL local PASS con ambos órdenes frente a intención revisada, duplicación y rollback; no acredita JWT/RLS ni ARCA hospedados. Todavía falta integrar servicio/HTTP/cliente/modal y cerrar suite/build. Sin instalación de SQL 001–018/Edge, activación o despliegue remoto. Mantener envases bloqueados hasta criterio contable y gates de homologación real, rechazo/NC y representación fiscal final.

Cierre de validación local de SQL 018: 3103 PASS / 1 skipped / 251 archivos, salida 0 observada (pilot-reserved-replacement-suite-results.json). Única omitida fixture F6_C3A_CANDIDATES_PATH sin configurar; ninguna fiscal nueva omitida. Después de esa suite sólo se corrigieron anotaciones TypeScript de filas de fixtures: 160 dirigidas / 4 archivos PASS posteriores y build final PASS 651 módulos (pilot-reserved-replacement-build-typed-final.log). Los primeros errores de ambigüedad SQL y de fixtures/tipado quedaron corregidos; el build anterior fallido no cuenta como PASS. 51 escenarios PostgreSQL 17.11 PASS finales con intención revisada y contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL y diff PASS; oxlint sin nuevos hallazgos, conserva warning preexistente no-unsafe-finally del runner. Escaneo 1255 archivos/49 candidatos, sin nuevos candidatos frente al cierre anterior. El incremento cierra sólo la transacción SQL local; siguen pendientes servicio/HTTP/cliente/UI con recuperación durable y revisión de la sucesora, resolución posterior a intención/rechazo/NC, representación fiscal final y gates hospedados. No instalación remota SQL 001–018/Edge, activación, deploy, nuevas consultas ARCA autenticadas, CAE real, merge o cambio master/Production. Restauración integral bloqueada; contador/envases y diferidos físicos conservados.

### 22/10/2026 — Sustitución reservada desde el modal y recuperación

HTTP incorpora SUSTITUIR_PREPARACION_FISCAL (propuesta canónica/hash e identidad sucesora fija) y SUSTITUCION_PREPARACION_FISCAL (lectura), sin TA/ARCA. Auth único por acción y getter durable después de escribir. Cliente conserva propuesta antes del POST bajo Web Lock y sólo retira datos al recuperar el mismo cierre; pendiente incierto oculta aprobación anterior. Descarte confirmado usa SQL 017 para UUID sucesor aún no creado: impide POST tardío sin tocar el número original. Si ganó la sustitución, se recupera la preparación reservada, que exige nueva revisión/permiso. Modal mantiene estilos y datos explícitos, sin defaults fiscales heredados.

La revisión real detectó que JSONB::text en 76ff310 no producía el hash canónico TypeScript. SQL 018 ahora usa canónico compacto/ordenado compatible y bloquea instalación si ya existe historia incompatible; no reescribe cuerpos anteriores. El flujo cliente→HTTP→SQL→revisión se prueba con respuesta perdida, Unicode y escapes. 338 dirigidas PASS / 8 archivos, primer pase 53 PostgreSQL PASS; cierre de suite/build/SQL final en curso. Esto no prueba JWT/RLS/ARCA ni navegador hospedados. SQL 001–018 y Edge continúan sin instalar/habilitar remotamente; flag frontend apagado, sin deploy ni emisión/CAE real. Persisten gates de rechazo/NC posteriores a intención, representación final, provisión/PV/parámetros y aceptación aislada; envases descontados bloqueados hasta contador, impresora/cajón/Point diferidos y restauración integral bloqueada.

Cierre integrado de sustitución reservada y recuperación entre equipos: 3166 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-replacement-two-terminals-suite-results.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 341 dirigidas / 8 archivos PASS y 54 escenarios PostgreSQL 17.11 PASS finales (fiscal-replacement-two-terminals-concurrency-20261022.json), incluidos propuestas distintas, ambos órdenes sustitución/intención y descarte/sustitución, rollback y ACK recuperable. Dos almacenes independientes cliente→HTTP→SQL recuperan la ganadora sin cancelar su cuerpo/número. Build final PASS 653 módulos, manifiesto histórico 43 SQL, diff y bundle privado (cero coincidencias) PASS; oxlint sin nuevos hallazgos, warning preexistente del finally del runner conservado. Escaneo 1258 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos, datos conservados, cero solicitudes ARCA autenticadas o emisiones reales. Sustituye las notas de suite en curso para esta integración; el pase previo 3163 se conserva con su alcance anterior.

El flujo reservado anterior a intención queda integrado localmente, incluida la corrección de canónico y el rechazo de instalación sobre historia incompatible. No acredita navegador/visual/Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados. SQL fiscal 001–018 y Edge sin instalar/habilitar remotamente; flag nuevo sin activar, ningún deploy, CAE real, merge o modificación de master/Production. Siguiente bloque local: resolución/corrección posterior a intención/rechazo definitivo y notas de crédito, junto con representación fiscal final. Provisión privada, punto de venta y parámetros reales, aceptación aislada/hospedada y primera emisión homologada expresamente autorizada conservan sus gates. Envases descontados bloqueados hasta criterio del contador; restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales, sin declarar Production Readiness.

### 22/10/2026 — Corrección privada tras R recibido, sin reemisión automática

Referencia: [manual WSFEv1 v4.7](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf), sección FECAESolicitar y comunicaciones. El nuevo diseño distingue R con detalle de timeout/errores sin detalle/SIN_CONFIRMACION/aprobación. Sólo R auditado puede pasar al gate de corrección; requiere además ausencia FECompConsultar/602 estricta y último autorizado N−1, verificaciones frescas antes y después de locks. El intento, cuerpo, recepción y consultas se conservan en SQL 019; archivo irreversible y sucesora sin revisión/permiso heredados, sin liberar la serie ni avanzar último observado.

Trabajador privado sin acción HTTP: autentica una vez, carga fuente de venta original antes de TA, revalida binding/estado antes de las consultas y del commit, confirma por getter y recupera ACK perdido sin otra consulta cuando ya está cerrado. ARCA_HOMO_REJECTION_RECOVERY_ENABLED queda cerrado por defecto, sin activación. 280 dirigidas / 5 archivos y 61 escenarios PostgreSQL PASS, cero solicitudes externas/emisiones; suite/build finales en curso. No se instalaron SQL 001–019/Edge, no hubo tráfico ARCA autenticado, deploy ni CAE real. Falta integración HTTP/cliente/UI y aceptación hospedada, incertidumbre no acreditada como R, NC, representación final y gates reales de PV/custodia/parámetros. Envases y restauración siguen bloqueados por sus decisiones; impresora/cajón/Point diferidos.

### 23/10/2026 — Cierre recuperado del incremento privado de rechazo

Suite completa 3227 PASS / 1 skipped / 252 archivos, salida 0 observada al recuperar el mismo handle (pilot-fiscal-rejected-correction-suite-results.json). No se reinició por el cambio de turno/fecha. Única omitida fixture histórica F6_C3A_CANDIDATES_PATH sin configurar, ninguna fiscal nueva omitida. 280 dirigidas / 5 archivos PASS y 61 escenarios PostgreSQL 17.11 PASS finales (fiscal-rejected-correction-final-v2-concurrency-20261022.json). Build final PASS 653 módulos; manifiesto histórico 43 SQL, diff y bundle privado PASS (cero coincidencias de trabajador/gate/RPC privados). SDK limitado a 29 RPC. Oxlint sin nuevos hallazgos; warning preexistente del finally del runner conservado. Scan 1260 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos/datos conservados; cero solicitudes externas/emisiones reales. El fallo de sintaxis inicial del runner quedó corregido y su log conservado; no produjo un contenedor ni se contó como PASS.

El contrato SQL 019 y trabajador privado de R con detalle quedan preparados localmente; no se cierra el flujo de usuario de esa clase todavía. Siguiente: integrar elegibilidad/confirmación/recuperación HTTP–cliente–modal, sin permitir R automático desde timeout/Errors sin detalle, y exigir nueva revisión/permiso para la sucesora. Incertidumbre sin R, notas de crédito, representación fiscal final, provisión/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual continúan pendientes. SQL 001–019 y Edge sin instalación/activación remota por nosotros; no activación de flags, deploy, consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. Se conservan contador/envases, restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales; este cierre no acredita Production Readiness.

### 23/10/2026 — Recuperación de corrección rechazada, lectura local preparada

Se agregó una consulta durable HTTP/cliente que valida venta, operación, sucesora y hashes con Auth real. No modifica la propuesta local ni consulta ARCA/custodia; ausencia confirmada se diferencia de error. 338 pruebas dirigidas PASS / 5 archivos. El formulario de corrección R y su propuesta persistente siguen pendientes; no hay acción HTTP de escritura de esta clase. SQL 001–019 y Edge permanecen sin instalación/activación remota por nosotros. Contador/envases sigue pendiente, por confirmación del titular; conservar el bloqueo de preparación fiscal de esos tickets. Los demás gates PR03/F08 y PR02 continúan parciales.

Verificación final de la lectura: build 654 módulos PASS, oxlint/diff/manifiesto histórico 43 SQL PASS; escáner 1262 archivos/49 candidatos, sin nuevos pares ruta/tipo; backend privado ausente del bundle. No se presenta la suite global anterior como validación de este incremento. No instalación, habilitación, despliegue o emisión remotos.

### 23/10/2026 — Propuesta y formulario para rechazo R integrados localmente

HTTP/cliente/modal conectan la corrección SQL 019 con propuesta v2 explícita, confirmación, recuperación y descarte del UUID local no creado. Reserva v1 permanece compatible y separada. Sólo R del mismo cuerpo, sin contradicción, ofrece el formulario; SQL/worker validan autoridad y consultas negativas/último antes del cierre. Sin heredar revisión/permiso ni emitir. 361 pruebas dirigidas PASS/5 archivos, build 654 módulos PASS y controles estáticos PASS; suite global en curso. Evidencia y fallos corregidos en el ExecPlan arca-homologation, sin cambiar SQL ni presentar los 61 escenarios nativos anteriores como pase nuevo.

Continúan pendientes la aceptación visual/JWT/RLS/Edge/ventanas reales, incertidumbre sin R, NC, representación final, custodia/PV/parámetros y primera emisión/CAE autorizada. Contador/envases pendiente; esas ventas siguen bloqueadas. Sin instalación/activación fiscal remota, flags o deploy. PR03/F08 y PR02 parciales, restauración bloqueada y físicos/Point diferidos.

### 23/10/2026 — Cierre local de propuesta y formulario R

Suite completa 3271 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-rejection-ui-suite-results-20261023.json); única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 361 dirigidas PASS / 5 archivos, build final PASS 654 módulos (pilot-fiscal-rejection-ui-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS; scan 1262 archivos/49 candidatos sin nuevos pares ruta/tipo y backend privado ausente del bundle. El aviso de sourcemap html5-qrcode y el tamaño de chunks no son errores de prueba/build. SQL 001–019 y transacciones no cambiaron: no se repitió PostgreSQL nativo; los 61 escenarios anteriores son historia, no una aceptación nueva. La propuesta R, confirmación, recuperación/descarte y vuelta a revisión quedan integradas localmente. Falta aceptación real visual/JWT/RLS/Edge/Web Locks y comportamiento externo con custodia/PV/parámetros acreditados; no hay CAE real ni Production Readiness. Continúan incertidumbre sin R, NC y representación fiscal final. Sin consultas ARCA autenticadas, instalación/habilitación fiscal remota, flags, deploy, merge o cambio master/Production. Contador/envases bloqueado, restauración integral bloqueada y físicos/Point diferidos.

### 23/10/2026 — Conciliación privada: autoridad y ACK

Preparado SQL 020, servicio/HTTP con Auth único, binding revalidado tras esperas y dentro del registro; ACK confirmado por getter durable, replay antes de TA/red y gate independiente de consultas nuevas cerrado. SDK 31 RPC. 479 dirigidas PASS/6 archivos, build 654 módulos PASS, 64 escenarios PostgreSQL 17.11 PASS, contenedor propio detenido y cero solicitudes externas/emisiones. Primer ensayo no inició por Docker apagado; fallo preservado, motor verificado antes del nuevo pase. Suite completa en curso; detalle y límites en ExecPlan existente.

Falta conectar observación persistente/confirmación/modal y extender el encadenamiento ligado a la conciliación interna del worker de emisión; no se declara resuelta toda incertidumbre. SQL 001–020/Edge sin instalar/activar, sin consultas ARCA reales/CAE/deploy. NC, representación final, aceptación hospedada/JWT/RLS/visual y gates del titular siguen abiertos; contador/envases/restauración y diferidos físicos se conservan.

### 23/10/2026 — Cierre local del endurecimiento de conciliación

Suite completa 3281 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-reconciliation-bound-suite-results-20261023.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal nueva omitida. 479 dirigidas PASS / 6 archivos y 64 escenarios PostgreSQL 17.11 PASS finales; contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Build 654 módulos PASS, oxlint sin nuevos hallazgos y warning preexistente del runner, manifiesto 43 SQL/diff PASS. Escáner final 1263 archivos/49 candidatos, sin nuevos pares ruta/tipo; símbolos privados SQL 020/gate/custodia ausentes del bundle. SDK cerrado a 31 RPC.

Quedan preparados SQL 020 y la conciliación privada con Auth/binding transaccionales, revalidación tras espera y ACK durable. La autorización original de hechos existentes no se infiere desde una cuenta nueva. No cierra la UI/observación persistente ni el encadenamiento ligado en la conciliación interna del worker de emisión; son el siguiente trabajo local antes de aceptación hospedada. NC/representación final y gates custodia/PV/parámetros/JWT/RLS/Edge/visual/E2E/primera emisión/CAE siguen pendientes. SQL 001–020/Edge sin instalar/habilitar, flags sin activar, ningún deploy, consulta ARCA autenticada nueva, emisión/CAE real, merge o cambio master/Production. Restauración integral bloqueada, contador/envases pendiente y físicos/Point diferidos; PR03/F08 y PR02 permanecen parciales. El primer intento nativo step 0 por Docker apagado y el fixture inicial sin gate sintético quedan documentados como fallos corregidos, no PASS.

### 23/10/2026 — Conciliación ligada compartida por HTTP y trabajador (local)

Se completa el encadenamiento de autoridad pendiente de 7386fcc: worker de emisión usa la misma composición ligada a Auth/binding/SQL 020 para ENVIO_INCIERTO/AUTORIZADA y cierre después del envío. Auth se verifica una sola vez por invocación; no se adopta otra cuenta tras reasignación. Nueva emisión exige gate de conciliación activo antes de TA; replay confirmado no necesita emisión/consulta habilitadas ni red. Cambio de identidad después de POST conserva auditoría de recepción original y deja incierto, sin consultar con otra cuenta ni registrar un CAE candidato.

533 pruebas fiscales dirigidas PASS / 7 archivos, salida 0 observada (pilot-fiscal-worker-bound-targeted-typed-final-20261023.log), build final PASS 654 módulos (pilot-fiscal-worker-bound-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS. Escáner 1263 archivos/49 candidatos sin nuevos pares ruta/tipo; símbolos privados ausentes del bundle. Primer build falló por argumento AbortSignal omitido sólo en una prueba nueva; corregido y verificado, log conservado. No se repitió suite global ni PostgreSQL nativo: 3281 PASS/1 skipped y 64 escenarios son evidencia histórica de 7386fcc, no cierre global de este incremento. SQL 001–020 no cambió.

Siguiente pendiente concreto: observación guardada/lectura durable/confirmación/modal, detallado en ExecPlan. NC/representación final, custodia/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual/E2E/CAE siguen pendientes; PR03/F08 y PR02 parciales. No consultas ARCA autenticadas nuevas, instalación/habilitación SQL/Edge, flags, deploy, emisión/CAE real, merge o cambios master/Production. Restauración integral bloqueada, contador/envases pendiente y físicos/Point diferidos.

### 23/10/2026 — F08: observación persistente y modal integrados localmente

Implementados SQL 021 sólo lectura histórica y servicio/HTTP CONSULTAR_CONCILIACION con Auth original/venta/cuerpo/intento, contrato público puro de ACK con fechas válidas y SDK limitado a 32 RPC. Cliente conserva ID/hash/número sin PII antes de POST y exige getter durable; reapertura no consulta ARCA. Estado incierto comparte lock y bloquea acciones fiscales incompatibles; no se descarta por ausencia sola. Constancia autorizada exacta o transición durable del cuerpo viejo puede cerrar un pendiente obsoleto sin atribuirle ejecución. Modal exige confirmación, conserva acceso al pendiente si falla resolver, oculta revisión anterior mientras hay consulta y no degrada autorización por ACK histórico. Respuesta de otra venta se ignora.

601 dirigidas PASS / 9 archivos (pilot-fiscal-observation-ui-targeted-v2-20261023.log), build final PASS 655 módulos (pilot-fiscal-observation-ui-build-final-20261023.log), 66 escenarios PostgreSQL 17.11 PASS (fiscal-observation-ui-concurrency-20261023.json), contenedor propio detenido/datos conservados y cero solicitudes externas/emisiones. Incluye consulta con gate cerrado→registro SQL ligado sintético→reinicio y lectura sin emisor, R corregido por otra terminal sin inventar que se ejecutó la observación, lectura histórica después de archivo y Auth reasignado esperando lock. Oxlint sin nuevos hallazgos (warning preexistente finally del runner), manifiesto histórico 43 SQL/diff PASS; escáner 1267 archivos/49 candidatos sin nuevos pares ruta/tipo, símbolos privados de lector/gate/custodia ausentes del bundle. Primeros tests antiguos suponían ausencia de cualquier checkbox en estado incierto: ahora distinguen la aprobación prohibida de la confirmación de sólo consulta. Un test nuevo inspeccionaba ID privado con rol sin permiso; corregido sólo el fixture sin ampliar permisos, fallo conservado. Suite global en curso; no es todavía cierre global.

Alcance: recuperación/consulta de incertidumbre en UI preparada localmente. Si una consulta no confirma autorización se conserva la operación original: no reenvío, cancelación de número ni rechazo inferido. Aceptación hospedada visual/JWT/RLS/gateway/Edge/Web Locks reales, custodia/PV/parámetros y primera emisión/CAE siguen pendientes; también NC y representación fiscal final. SQL 001–021/Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy, consulta ARCA autenticada nueva, emisión/CAE real, merge o cambio master/Production. PR03/F08 y PR02 parciales. Contador/envases y restauración integral bloqueados, impresora/cajón/Point diferidos.

### 23/10/2026 — Cierre local de observación recuperable y modal

Suite completa 3331 PASS / 1 skipped / 253 archivos, salida 0 observada (pilot-fiscal-observation-ui-suite-results-20261023.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal nueva omitida. 601 dirigidas PASS / 9 archivos, build final PASS 655 módulos, 66 escenarios PostgreSQL 17.11 PASS; contenedor propio detenido/datos conservados y cero solicitudes externas/emisiones. Oxlint sin nuevos hallazgos, warning preexistente finally del runner; manifiesto histórico 43 SQL y diff PASS, SDK 32 RPC, escáner 1267 archivos/49 candidatos sin nuevos pares ruta/tipo y símbolos privados ausentes del bundle. Avisos de sourcemap/chunks conservados, no errores.

El flujo local de observar/recuperar/confirmar consulta queda integrado con SQL 021 y mismo ID, sin PII local, sin consulta ARCA al abrir y sin atribuir el cierre de otra terminal a una observación no ejecutada. Datos/estado de la constancia actual prevalecen sobre ACK histórico. No se libera número ni se reenvía factura ante falta de autorización. Este cierre no acredita consultas ARCA/JWT/RLS/Web Locks/Edge/visual/E2E hospedados ni CAE real. Siguientes bloques locales: notas de crédito y representación fiscal final, manteniendo preparación de aceptación hospedada y gates de custodia/PV/parámetros. SQL 001–021 y Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy, consultas ARCA autenticadas nuevas, emisión/CAE real, merge o cambio master/Production. PR03/F08 y PR02 siguen parciales; contador/envases y restauración integral bloqueados, impresora/cajón/Point diferidos.

### 23/10/2026 — Representación: contrato histórico privado, integración pendiente
SQL 022 y servicio privado guardan una sola vez hechos explícitos de emisor/receptor y descripciones por IDs exactos del snapshot, ligados al cuerpo/hash y Auth original. Fecha canónica e importe decimal obligatorio, sin defaults de configuración mutable. Guardado inicial anterior a cualquier revisión o intención; replay exacto permite recuperación histórica tras revocación/sustitución. Tabla inmutable sin acceso directo para anon/authenticated/service_role. Sólo lectura durable confirma éxito ante ACK perdido/falso; no se agrega ruta HTTP ni emisión.

Evidencia local: 221 pruebas dirigidas PASS / 4 archivos (pilot-fiscal-presentation-targeted-20261023.log); 70 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-concurrency-v2-20261023.json), con duplicados, rollback, Auth reasignado y emisor revocado esperando lock. Contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Primer ensayo no inició por Docker apagado; evidencia fallida conservada. Aserción histórica sobre campos privados corregida porque la secuencia cae de un UUID aleatorio causaba falso positivo; control ahora identifica claves JSON. Oxlint sin nuevos hallazgos; warning finally preexistente del runner conservado. Manifiesto histórico 43 SQL PASS; escáner 1272 archivos/49 candidatos sin nuevos pares ruta/tipo frente al cierre anterior. Suite global 3331/1/253 corresponde al HEAD anterior, no se repitió en este incremento.

Pendiente imprescindible: captura/confirmación en UI y vínculo del hash de presentación a revisión/permiso/envío, fuente final/QR/PDF, notas de crédito y aceptación hospedada. Este contrato aislado NO cierra representación fiscal, PR03/F08 ni PR02. SQL 001–022 y Edge sin instalar/habilitar por nosotros, flags sin activar; sin deploy, claves, ARCA autenticada, emisión real/CAE, merge o cambios master/Production. Envases descontados pendientes del contador, restauración integral bloqueada; impresora/cajón/Point diferidos.

### 23/10/2026 — Revisión ligada a los hechos históricos (parcial)
SQL 023 conserva vínculo inmutable entre revisión y hash de presentación. La aprobación exige hash esperado explícito de cuerpo y presentación, venta/Auth original y misma revisión; la ruta anterior rechaza operaciones con hechos 022. Helper histórico queda privado sin execute externo. El consumo verifica el mismo revision_aprobada_id elegido por 011 y su vínculo/Auth/hash, revirtiendo intención y uso del permiso si falta. Guardado de hechos después de cualquier revisión sigue bloqueado; no se reconstruye aprobación histórica ni se extiende vigencia por replay.

Servicio privado captura Auth una vez y confirma exclusivamente mediante lectura durable del mismo UUID/cuerpo/hash; replay temprano no escribe, ACK perdido/falso no confirma a ciegas. DTO cerrado sin permiso/custodia; SDK 36 RPC. No se agrega ruta HTTP ni acción de emisión. Compatibilidad de historia sin hechos preservada: aún falta exigir presentación para toda preparación nueva 012, captura/confirmación UI y revisión pública ligada antes de activar. Este incremento NO acredita esa obligatoriedad global ni cierra representación final/QR/PDF/NC.

Evidencia: 521 pruebas dirigidas PASS / 8 archivos, salida 0 (pilot-fiscal-presentation-review-targeted-20261023.log), 73 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-review-concurrency-20261023.json), build final PASS 655 módulos. Se probaron hash distinto, ruta antigua/helper bloqueados, inserción del vínculo omitida sin aprobación parcial, selección de revisión más reciente sin vínculo que revierte intención/permiso, replay y dos workers/mismo UUID. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL PASS, oxlint sin nuevos hallazgos (finally preexistente del runner), escáner 1276 archivos/49 candidatos. Suite global 3331/1/253 sigue siendo evidencia histórica de 14fccb0, no nuevo pase.

SQL 001–023 y Edge sin instalar/habilitar por nosotros; flags sin activar, sin deploy/claves/ARCA autenticada/emisión real/CAE ni merge/cambios master/Production. PR03/F08 y PR02 parciales. Envases descontados pendientes del contador y bloqueados; restauración integral bloqueada; impresora/cajón/Point diferidos. Siguiente gate local: integrar captura y DTO/confirmación ligada, luego imponer presentación en toda intención nueva de preparación 012 sin fallback histórico; aceptación hospedada y autorización de instalación siguen separadas.

### 23/10/2026 — Captura histórica y aprobación ligada integradas (local)
SQL 024/fuente histórica, cinco acciones HTTP cerradas y captura de datos explícitos en el modal existente. Cliente verifica cuerpo/IDs/fecha/importes y confirma sólo por getters durables, compartiendo Web Lock; no conserva PII/descripciones localmente. Revisión muestra hechos guardados y confirma su hash, sin usar aprobación antigua; sucesoras requieren captura nueva. SDK 37 RPC, sin TA/red fiscal en este flujo.

3421 PASS /1 skipped /259 archivos, salida 0; omitida sólo fixture histórica F6 no configurada. 75 escenarios PostgreSQL 17.11 PASS, build final 659 módulos PASS, manifiesto 43 SQL/diff/oxlint sin nuevos hallazgos. Escáner 1283 archivos/49 candidatos sin nuevos pares ruta/tipo; backend privado ausente del bundle. Evidencia y fallos iniciales corregidos en el ExecPlan ARCA; no aceptación visual/JWT/RLS/Edge/Web Locks hospedada.

Falta imponer presentación/revisión ligada a TODA intención nueva desde servidor y antes de TA/envío; luego QR/PDF/NC y aceptación hospedada/custodia/PV/parámetros/primer CAE. PR03/F08 y PR02 parciales. SQL 001–024/Edge sin instalar/habilitar por nosotros, flags apagados, sin deploy/claves/ARCA autenticada/emisión real ni merge/cambios master/Production. Envases descontados pendientes del contador; restauración integral bloqueada; físicos/Point diferidos.

### 23/10/2026 — Gate local obligatorio y retiro de ruta antigua preparados
SQL 025 y trabajador privado exigen preparación 012/hechos 022/revisión ligada 023 para toda intención nueva, con Auth/cuerpo/emisor/parámetros exactos, antes de TA y dentro de la transacción. Helper directo revocado; sin fallback heredado para envío nuevo. Replay histórico conserva datos sin crear hechos/aprobaciones. Revalidación de revisión y parámetros después del último lock. Getter 023 no reutiliza aprobación tras cambiar emisor. SDK 38 RPC.

Endpoint afip-wsfe retirado LOCALMENTE con 410 sin claves/cuerpo/base/red; Git conserva implementación anterior. Demostración CAE bloqueada desde el store en piloto estricto. No se cambió ni verificó su estado remoto; retirada/denegación remota requiere gate de aceptación y autorización. False conserva el modo legado del store.

3436 PASS /1 skipped /260 archivos, salida 0; omitida sólo fixture histórica F6 sin configurar. Build final 659 módulos PASS. 85 escenarios PostgreSQL de actualización/concurrencia PASS: 73 antes de instalar 025 y 12 después, incluyendo 10 específicos nuevos; no atribuir los 85 al guard instalado desde el inicio. Contenedor propio detenido/datos conservados, cero tráfico externo/emisiones. Fallos iniciales de fixtures corregidos sin ampliar permisos; informes y detalles en ExecPlan ARCA. Manifiesto 43 SQL/diff PASS, lint sin hallazgos nuevos; escáner 1286 archivos/49 candidatos sin nuevos pares ruta/tipo y backend privado fuera del bundle.

PR03/F08 y PR02 parciales: falta fuente final/QR/PDF/NC, aceptación hospedada/visual/JWT/RLS/Edge/Web Locks, retiro remoto de legado, custodia/PV/parámetros y primer CAE expresamente autorizado. SQL 001–025/fiscal Edge sin instalar/habilitar por nosotros; flags apagados, sin deploy/claves/ARCA autenticada/emisión real/merge/cambios master o Production. Contador/envases descontados y restauración integral bloqueados; impresora/cajón/Point diferidos.

### 23/10/2026 — Representación fiscal: avance local y decisión del Dueño
El tratamiento fiscal de los envases recibidos que descuentan el ticket sigue pendiente de definir con el contador, confirmado por el Dueño. Mantener bloqueada la preparación fiscal de esas ventas; no inferir su tratamiento ni aplicar defaults.
Fuente histórica SQL 026, servicio/acción de lectura y generador QR puro preparados localmente. Cruzan autorización, revisión consumida, Auth original, cuerpo/hash, líneas e importes sin reconstruir desde catálogo/emisor actuales. No hay PDF ni QR visual exportable todavía. SQL 001–026 y Edge sin instalación/activación remota autorizada.
Validación dirigida: 481 PASS /7 archivos; después de corregir exclusivamente el tipo de una prueba negativa, QR 6 PASS. PostgreSQL 17.11: 87 escenarios PASS, con 73 anteriores a 025 y 14 posteriores a 025+026; cero solicitudes externas/emisiones. La suite global 3436 PASS/1 skipped pertenece al HEAD anterior y no constituye una ejecución global de estos cambios. Compilación final PASS con salida 0 (pilot-fiscal-representation-source-build-v2-20261023.log); manifiesto de 43 SQL y diff sin errores. Revisión local: lint sin hallazgos nuevos (warning finally previo del runner), escáner 1293 archivos/49 candidatos sin nuevos pares ruta/tipo, controles privados ausentes del bundle. Publicación aún pendiente. Continúan pendientes PDF/validación visual, notas de crédito, aceptación hospedada, custodia, PV acreditado y primer CAE autorizado. Impresora y Point diferidos; Production/master intactos.

### 23/10/2026 — PDF local de homologación preparado; aceptación fiscal pendiente
Fuente/QR publicados en 4f83002 (PR #3 Draft, base remota 03a798f, sin merge). PDF A4 paginado desde fuente 026 revalidada y capturada antes de esperas; muestra datos históricos, detalle comercial con subtotales finales, importes fiscales explícitos, CAE/QR e identificadores/hash. No calcula IVA por renglón ni vuelve a calcular descuentos desde cantidad×precio. No usar este avance como acreditación de un layout fiscal/comercial completo.
Descarga explícita integrada al modal detrás del gate de homologación existente (sin activar): consulta representación autorizada, comprueba venta/operación/cuerpo/CAE y conserva constancia ante fallo. Doble clic excluido; cierre/cambio de comprobante descarta resultados tardíos; no emite, no toca stock/caja ni almacena PII. Generador puro no descarga/imprime ni consulta stores/red. Importación diferida de PDF.
151 PASS dirigidas /6 archivos (PDF, exportador, modal, modelo, QR y cliente), build final v4 PASS/salida 0; lint sin hallazgos en el bloque. Escáner1297 archivos/49 candidatos sin nuevos pares ruta/tipo; controles/custodia privados ausentes del bundle. Evidencia: pilot-fiscal-representation-pdf-ui-targeted-v4-20261023.log y pdf-build-v4. No se repitió suite global ni PostgreSQL por este cambio de representación; 3436/1skip/260 y 87 escenarios corresponden a ejecuciones anteriores documentadas, no sumar a estas151 como pruebas únicas. Fallos iniciales de fixture de201caracteres/matchers no disponibles conservados en logs, corregidos sin cambiar contratos o añadir dependencias. Render/inspección visual de muestras sintéticas de1 y21 páginas; extracción pdfplumber confirma200renglones, total/CAE y marcas en todas las páginas, sin texto fuera de límites. Poppler avisó de fuentes auxiliares Symbol/ArialUnicode no disponibles; Helvetica usada inspeccionada legible. PyMuPDF no instalado; comprobación final realizada con pdfplumber disponible.
Límite explícito: Helvetica admite Latin-1 (tildes/ñ), se bloquean glifos fuera de ese conjunto antes de generar PDF y se informa en UI; falta fuente Unicode adecuada y aceptación del layout/semántica fiscal/comercial. Sólo A/B/C y PES/cotización1 del contrato vigente. No hay validación física del QR/impresora ni emisión real. Muestras fuera de Git, datos/CAE enteramente ficticios; no son comprobantes de ARCA. Sigue pendiente aceptación hospedada JWT/RLS/Edge/visual, instalación autorizada de SQL001–026/Edge, notas de crédito, PV/custodia y primer CAE expresamente autorizado. Envases descontados bloqueados hasta definición del contador; restauración integral bloqueada. Production/master intactos; impresora/cajón/Point diferidos.

### 23/10/2026 — NC: propuesta parcial/total preparada localmente
Se agregó fiscalCreditDraft como contrato puro, separado del cuerpo versión1 de facturas. Revalida original026, captura fuente/propuesta antes de esperas, fija asociación exacta y tipo3/8/13 desde facturaA/B/C, exige fecha/motivo/IVA receptor y cantidades/importes/reposición explícitos. Desglose de impuestos y límites por caso con enteros exactos; no infiere IVA proporcional ni modifica impuestos/identidad de la factura. Descripción de tributos80caracteres y alícuota3+2 del manual oficial WSFEv1 v4.7 (https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf), conservando escala canónica4 sólo con decimales adicionales cero, sin truncar/redondear. Referencia general del emisor/origen: https://www.arca.gob.ar/facturacion/comprobantes/tipos.asp. La fecha no anterior a factura es política del piloto, no una prohibición general atribuida a ARCA.
102 PASS /3 archivos (NC, representación y conciliación), buildv2 PASS/salida0; lint sin hallazgos; manifiesto43 y diff PASS; escáner1299archivos/49candidatos sin nuevos pares ruta/tipo, contrato privado ausente del bundle. Evidencia pilot-fiscal-credit-draft-targeted-v2-20261023.log /credit-draft-build-v2 /credit-draft-scan-v2. No suite global/PostgreSQL nuevos por este contrato puro, ni nueva instalación SQL/Edge, HTTP/worker/flag, red autenticada, numeración, emisión, CAE real o efectos venta/stock/caja. No sumarlas con pruebas históricas como ejecución única.
Estado PROPUESTA_NO_PERSISTIDA/emision_habilitada=false: el hash sólo fija contenido, no acredita permisos, catálogo, fecha/saldo de servidor o devolución válida. El contrato todavía no valida saldo acumulado ni reparto comercial proporcional contra historial y receta; SQL010 conserva bloqueo de devolución fiscal. Próximo: persistencia de caso/identidad y saldos con locks, originalAuth/currentissuer/CUIT/catálogo/revisión, cancelación/replay/ACK/crashes/concurrencia, contrato/XML/conciliación específico NC y aplicación comercial exactamente una vez. Se consultó al titular cuándo entregar efectivo/reponer stock respecto de la confirmación ARCA; decisión pendiente, sin asumir respuesta. NC/PR03/F08/PR02 parciales. Tipografía/aceptación del PDF, pruebas hospedadas JWT/RLS/Edge, PV/custodia y primer CAE con autorización siguen pendientes; contador/envases bloqueado, restauración integral bloqueada, impresora/cajón/Point diferidos. PR #3 Draft, sin merge ni cambios master/Production.

### 23/10/2026 — NC: saldo durable SQL027 preparado y decisión confirmada
El titular confirmó entregar efectivo y reponer stock DESPUÉS de confirmación ARCA de la NC. Incertidumbre => conciliación; preparación o reserva no permiten efectos comerciales. Se conserva SQL010 hasta cerrar el circuito de autorización NC y aplicación exactamente una vez.
SQL027 agrega borradores/cancelaciones privados, canónico/hash, Auth original/factura026, emisor actual del mismo CUIT y parámetros vigentes capturados. Revalida asociación/fecha/textos/decimales/importes/IVA/tributos en SQL; READ COMMITTED y locks por venta/factura serializan cantidades/componentes acumulados y prorrateo histórico de centavos. UUID/cuerpo inmutables, ACK consultable, replay no reactiva cancelados; cancelación append-only sólo del caso activo más reciente para conservar reparto. Todas las respuestas mantienen emision/reintegro/reposicion_habilitada=false. No escribe efectivo/stock/devoluciones ni reserva numeración NC.
245 PASS /3 archivos (SQL202, contratoNC31, representación12), build PASS/salida0; manifiesto43/diff PASS. Oxlint sin hallazgos nuevos (finally previo del runner); escáner1300archivos/49candidatos sin nuevos pares ruta/tipo; funciones privadas ausentes del bundle. Evidencia pilot-fiscal-credit-reservation-targeted-v3-20261023.log /credit-reservation-build-v1 /credit-reservation-scan-v1. La suite global3436/1skip/260 es histórica, no una nueva ejecución de este cambio. Primer ensayo SQL falló por CASE sin paréntesis (186 omitidas por fallo de suite, no PASS); corregido y luego186 PASS. Fixture tributaria ocultaba helperinput, corregida sin debilitar contratos; registros fallidos conservados.
PostgreSQL17.11:95 escenarios PASS/salida0 en fiscal-credit-reservation-concurrency-v2-20261023.json. Fases:73 anteriores a025,14 posteriores a025+026,8 nuevos después de instalar027 dos veces. Casos027: mismoUUID/unACK, UUIDdistintos/saldo único, cancelación/saldo/historia, rollback durante espera, centavos/cancelación inversa, Auth reasignado, emisor revocado y parámetros vencidos esperando lock. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-301893a0 detenido y datos conservados. v1 falló en paso0 por Docker apagado; se inició Desktop en segundo plano, se confirmó motor29.9.2 y se ejecutó v2, sin borrar la evidencia anterior.
Pendiente: servicio/HTTP/cliente/UI del caso, receta/pagos/unidades elegibles y preparación fiscal NC completa con catálogo específico, revisión/credenciales actuales, serie/cuerpo/worker/FECompConsultar propios y exclusión con cancelación DESPUÉS de intención (debe instalarse ese guard en la misma migración que agregue intención NC antes de habilitar worker). SQL027 sólo tiene borradores, no una ruta de envío. Antes de habilitar devolución comercial: CAE NC durable coincidente y aplicación única, caja abierta y políticas de reintegro, E2E/concurrencia. Nueva reserva aún no acredita elegibilidad comercial o fiscal de emisión. SDK/HTTP no ampliados por este incremento. Backup JSON de la app no acredita copia de estas tablas privadas: incluir borradores/cancelaciones NC en dump y aceptación de restore integral autorizado junto al resto del diario fiscal. Restore integral sigue bloqueado.
SQL001–027/Edge no instalados/habilitados remotamente por nosotros; flags apagados, ningún deploy, TA/consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. NC/PR03/F08/PR02 parciales. Contador/envases, PDFtipografía/aceptación, PV/custodia y aceptación hospedada conservan gates. Impresora/cajón/Point diferidos.

### 23/10/2026 — NC: servicio y HTTP privados preparados localmente
Servicio verifica Auth.getUser una vez/captura ese Auth para fuente026 y RPC027, propuesta y scope capturados antes de esperas y fecha operativa Argentina del reloj servidor (SQL la revalida). Guardado/cancelación recuperan ACK mediante getter durable después de respuesta perdida; no reenvían automáticamente escritura. Ausencia confirmada devuelve null, error no equivale a ausencia. ACK cerrado de10campos ligado a venta/factura/UUID/hash, emision/reintegro/reposicion false; sin devolver fuente/canónico/metadatos de custodia. DTO exige strings literales, sin coerción de arrays; se corrigió también esa validación de condición emisor en la fuente compartida y se agregó regresión.
HTTP incorpora GUARDAR_BORRADOR_NC (64KiB), BORRADOR_NC y CANCELAR_BORRADOR_NC (2KiB), JSON estricto/duplicados/raíces cerradas y las protecciones de host/origen/backend/sesión existentes. Guardado exige ARCA_HOMO_CREDIT_DRAFTS_ENABLED exactamente true antes de crear Admin; apagado por defecto/no activado por nosotros. Consulta/cancelación siguen disponibles con gate de guardado apagado bajo backend/Auth/SQL, para recuperar casos; no habilitan emisión ni efectos comerciales. SDK privado39→42RPC explícitas. No acción EMITIR_NC, TA, custodia, WSAA/WSFE ni flags públicos nuevos.
512 PASS /10 archivos, salida0 observada (pilot-fiscal-credit-service-targeted-v5-20261023.log), buildv3 PASS/salida0. Incluye HTTP–servicio–SQL027 con Auth simulado/identidad capturada y PostgreSQL embebido: ACK perdido de guardado/cancelación, gate propio, recuperación sin flag de escritura, Auth reasignado entre fuente y guardado (sin caso creado), DTO/hash y reloj Argentina, más regresiones contrato/fuente/PDF/QR/modal. No acredita JWT/RLS/Edge hospedados. Se conservan fallos previos de paréntesis/alias/factory de fixture y unión de tipos; corregidos sin casts de escape, supresiones ni cambios de permisos. Lint dirigido limpio; manifiesto43/diff PASS; escáner1303archivos/49candidatos sin nuevos pares ruta/tipo; servicio/RPC/flag privado ausentes del bundle. SQL no cambió en este incremento:95 escenarios PostgreSQL17.11 del cierre027 son evidencia anterior, no una nueva ejecución de este servicio; suiteglobal3436/1skip/260 histórica.
Estado: puente backend preparado, no se cierra NC/PR03/F08/PR02. Pendientes cliente durable/UI de caso, elegibilidad comercial/pagos/receta/unidades y catálogo NC, revisión/permiso/cuerpo/serie/worker/conciliación NC, exclusión cancelación–intención y cierre comercial único con CAE NC confirmado, conforme decisión del titular. SQL001–027/Edge sin instalación/activación remota por nosotros, ningún deploy fiscal, consulta autenticada ARCA nueva, emisión/CAE real, merge ni cambio master/Production. Contador/envases, PDFtipografía/aceptación, PV/custodia y aceptación hospedada siguen gates; restauración integral bloqueada e impresora/cajón/Point diferidos.

### 23/10/2026 — NC: recuperación durable y desistimiento de intentos no confirmados
SQL028 conserva un desistimiento append-only por UUID/factura/Auth/hash para intentos aún sin caso. Guardado y desistimiento son mutuamente excluyentes bajo READ COMMITTED, locks de factura y advisory común; un envío tardío no crea un caso cancelado. Casos existentes conservan cancelación inversa027. SQL029 recupera historial propio paginado (10 casos/cursor secuencia), propuesta canónica/hash y ACK; revalidación estricta de fuente original y de cada propuesta en servicio/cliente. SDK privado42→43 RPC. Lectura no requiere habilitar nuevos guardados; sí backend/Auth y SQL autorizado. Historial no acredita elegibilidad, saldo actual ni CAE.
Cliente integrado en FiscalClient.credits: sólo IDs/hash/intención en almacenamiento aislado por Auth/comercio/venta; sin motivo, canónico, receptor o credenciales locales. Exclusión compartida con cliente fiscal existente, registro previo verificado, UUID explícito estable por intento, lectura antes/después de escritura y recuperación del mismo identificador; ausencia/error no borra pendientes ni genera otro UUID. Cancelación sólo retira pendiente tras ACK CANCELADA durable. Pérdida total del almacenamiento recupera casos confirmados desde historial del servidor. Aún sin pantalla NC ni nuevo flag público activado.
Validación:398 PASS /6 archivos, salida0 (pilot-fiscal-credit-client-targeted-v3-20261023.log); incluye215 comprobaciones SQL embebidas e integración HTTP–servicio–SQL con Auth simulado. Buildv2 PASS, lint dirigido limpio, manifiesto bootstrap43/diff PASS. Escáner1310archivos/49candidatos, sin nuevos pares ruta/tipo frente a cierre anterior; RPC/flag/tablas privados ausentes del bundle. La primera integración tuvo error de separación de líneas en prueba; corregido, registros fallidos conservados. Suite global3436/1skip/260 histórica, no ejecutada nuevamente.
PostgreSQL17.11 local:100 escenarios PASS/salida0, fiscal-credit-recovery-concurrency-v1-20261023.json. Fases:73 antes025,14 después025/026,8 después027 y5 nuevos después instalar028/029 dos veces. Nuevos: desistimiento gana guardado tardío, guardado gana cancelación sin historia contradictoria, desistimiento concurrente idempotente, rollback libera guardado y lectura de historial espera cancelación confirmada. Cero solicitudes externas/emisiones. Contenedor propio kiosko-pr03-local-810e3581 detenido con datos conservados. No acredita Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados.
Decisión del titular preservada: efectivo y reposición sólo DESPUÉS de CAE NC confirmado y aplicación comercial única; incertidumbre exige conciliación. SQL001–029/Edge no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, TA/consulta autenticada ARCA nueva, emisión real, merge ni cambios master/Production. Backup JSON no cubre diario fiscal privado: aceptación de dump/restore debe incluir también desistimientos NC; restore integral sigue bloqueado. NC/PR03/F08/PR02 continúan parciales. Siguiente: pantalla de casos/recuperación y preparación explícita con elegibilidad comercial/pagos/receta/unidades y catálogo NC; después revisión/cuerpo/serie/worker/conciliación y cierre comercial único, siempre bajo gates. Impresora/cajón/Point diferidos; contador/envases pendiente.

### 23/10/2026 — NC: panel de casos, recuperación y cancelación preparado
Constancia autorizada integra FiscalCreditCasesPanel bajo VITE_KIOSKO_ARCA_CASOS_NC_HOMO exactamente true, subordinado a revisión fiscal/piloto estricto y apagado por defecto; no activado por nosotros. Consulta explícita de representación de la misma factura/hash/CAE y páginas validadas de historial. Muestra fecha/motivo/importe/renglones y estado guardado/cancelado, sin convertir reserva en autorización. Cancelación sólo tras confirmación y del caso activo más reciente al terminar paginación (SQL sigue autoridad); pendiente incierto ofrece recuperación/cancelación conservando UUID. Errores no borran datos, respuestas tardías se descartan al cerrar/cambiar factura, doble clic se excluye. Si cancelación confirma pero historial falla se retiran filas anteriores para no mostrar un caso activo obsoleto. Controles compartidos Button/estética existente, sin nuevo modal divergente; aceptación visual hospedada pendiente.
125 PASS /7 archivos, salida0 (pilot-fiscal-credit-cases-ui-targeted-v3-20261023.log); buildv2 PASS/salida0, lint final limpio, manifiesto bootstrap43 y diff PASS. Escáner1312archivos/49candidatos, sin nuevos pares ruta/tipo respecto17e0578; RPC/flag/tablas privados ausentes del bundle. Pruebas incluyen confirmación, almacenamiento corrupto/ajeno, ausencia sin borrar pendiente, ACK incierto, cancelación sin caso, fallo de historial posterior, dos páginas/reintento, doble clic, respuestas tardías y gate modal cerrado/abierto. Primer pase falló por esperar un botón aún deshabilitado en una prueba; corregida la espera sin cambiar contratos. No se repitió SQL/concurrencia:100 PostgreSQL17.11 del cierre17e0578 son evidencia anterior, no del panel. Suiteglobal3436/1skip/260 histórica. No acredita Web Locks entre ventanas/JWT/RLS/Edge hospedados.
Pantalla de consulta/recuperación preparada; creación explícita NC aún pendiente de elegibilidad comercial/pagos/receta/unidades y catálogo específico, seguida de revisión/cuerpo/serie/worker/conciliación y aplicación comercial única. No presentar el módulo NC completo. Efectivo/stock sólo después de CAE NC confirmado, según titular; incertidumbre exige conciliación. SQL001–029/Edge no instalados/habilitados remotamente por nosotros, sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado; contador/envases y PV/custodia/aceptación pendientes, impresora/cajón/Point diferidos.

### 23/10/2026 — NC: fuente comercial histórica SQL030 preparada
Getter privado cargar_fuente_comercial_nc_homologacion cruza Auth original/factura026, snapshot fiscal012, cierre confirmado checkout_manuales y snapshot de checkout_manual_entradas, identidad/caja/fecha/total/detalles/pagos actuales y receta contra salidas originales. Conserva componentes del cierre (no combo_items/catalogo actual), conceptos libres sin salida física, fracciones históricas exactas y depósitos por renglón; excluye recepción de envases no fiscalizable. Pagos no efectivos se informan sin habilitar reintegro. Caja original puede estar cerrada: lectura histórica no habilita caja de devolución. DTO mínimo sin referencias de pago, PII, costos, credenciales ni snapshots completos; checksum checkout_sha256 es SHA256 del snapshot::text PostgreSQL, NO canónico fiscal ni dato a recomputar desde browser.
Sólo service_role con fuente026/RC/Dueño activo/Auth original. Toma cierre/entrada/caja con FOR SHARE NOWAIT después del lock de venta, evitando invertir la espera checkout→venta; conflicto exige reconsulta. No modifica guard010/guardar027, no crea reservas/casos ni efectos comerciales. SDK permanece43RPC: getter aún no añadido al SDK/servicio/HTTP/cliente; ése es el siguiente enlace. La fuente no acredita elegibilidad final ni autorización de emitir: al diseñar intención/cierre NC revalidar/bindear hechos comerciales bajo locks; no usar una consulta previa como permiso.
Inventario confirmado: cierres antiguos no conservan es_pesable/unidad_medida. Fuente devuelve unidades_historicas=NO_REGISTRADAS; no atribuye metadatos actuales al pasado ni redondea historia. Falta captura durable de unidades para ventas nuevas y conciliación explícita de antiguas, además de catálogo NC/pagos/receta elegibles y formulario. NC/PR03/F08/PR02 siguen parciales. Efectivo/reposición sólo después de CAE NC confirmado según titular, con aplicación comercial única; incertidumbre exige conciliación.
256 PASS /3 archivos (SQL233 +historial/cliente23), salida0: pilot-fiscal-credit-commercial-targeted-v6-20261023.log. Buildv2 PASS/salida0, lint sin nuevos hallazgos (finally previo del runner), manifiesto bootstrap43/diff PASS; escáner1313archivos/49candidatos sin nuevos pares ruta/tipo, entrada privada ausente del bundle. Pases fallidos conservados: fixture leía con rol sin SELECT, checksum intentaba usar helper fiscal que sólo admite números enteros y mutación sintética no conservaba delta_stock; se corrigieron fixtures/checksum comercial sin relajar canónico fiscal/ACL. UUID históricos válidos se normalizan en DTO sin reescribir snapshots. Suiteglobal3436/1skip/260 histórica, no repetida.
PostgreSQL17.11:104 escenarios PASS/salida0, fiscal-credit-commercial-concurrency-v2-20261023.json. Fases73antes025,14después025/026,8después027,5después028/029,4después instalar030 dos veces. Nuevos: cierre bloqueado falla NOWAIT sin deadlock; pago modificado durante espera no acredita fuente; lectores duplicados recuperan mismo DTO sin efectos; Auth reasignado no revela pagos/receta a cuenta original ni nueva. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. v1 también104PASS antes del ajuste de UUID; v2 prueba SQL final. No JWT/RLS/Edge/Web Locks/visual hospedados.
SQL001–030/Edge no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado; contador/envases, PV/custodia y aceptación hospedada pendientes, impresora/cajón/Point diferidos. No nuevas tablas para backup en030; sigue pendiente acreditar dump/restore de todo el diario privado.

### 23/10/2026 — NC: contrato/transporte de fuente comercial preparado
Validador DTO cerrado de13campos ligado a representación026 validada, venta/operación/hash/total, líneas históricas exactas y receta normalizada sin IDs duplicados/desordenados. Sumas de renglones/pagos con BigInt y decimales canónicos; PRODUCTO exige componente propio1.000, COMBO receta no vacía/unidades completas, LIBRE sin componentes/fracciones. Medios admitidos explícitos y pago_integro_efectivo recomputado, tres habilitacionesfalse y NO_REGISTRADAS literal. Captura antes de esperas y resultado profundamente congelado. Checksum comercial opaco del servidor: no se reconstruye desde navegador ni se usa como permiso.
Servicio Auth.getUser una vez, actor capturado en fuente026 y getter030; no se vuelve a inferir identidad desde perfil reasignado. Acción FUENTE_COMERCIAL_NC sólo lectura, JSON/campos cerrados y2KiB, bajo gates backend/origen/host/sesión existentes sin requerir flag de guardar. SDK43→44RPC explícitas; cliente credits.commercialSource revalida contra la factura capturada y no lee/escribe storage. Sin TA/custodia/ARCA, nueva propuesta, aprobación, emisión, reintegro o reposición. UI/formulario aún no conectado a este nuevo método; no habilitar creación hasta resolver elegibilidad/unidades/catálogo NC.
399 PASS /7 archivos, salida0: pilot-fiscal-credit-commercial-transport-targeted-v3-20261023.log. Incluye HTTP–servicio–SQL030 embebido con Auth simulado, reasignación entre RPC (no expone datos), SDK allowlist, DTO/receta/medios/importes/flags alterados, errores saneados, captura antes de esperas, storage intacto y regresiones de panel/cliente/historial. Buildv2 PASS/salida0, lint dirigido limpio; manifiesto bootstrap43/diff PASS; escáner1316archivos/49candidatos sin nuevos pares ruta/tipo respecto69b2cd7; entradas privadas ausentes del bundle. No cambió SQL:104 escenarios PostgreSQL17.11 de69b2cd7 son evidencia anterior, no una ejecución nueva del transporte. Suiteglobal3436/1skip/260 histórica. Sin JWT/RLS/Edge/E2E/Web Locks/visual hospedados.
Fuente comercial no acredita saldo, unidades históricas, catálogo NC ni autorización final; futuras intención y aplicación comercial deben revalidar/bindear hechos bajo locks. Siguiente: captura durable/conciliación de unidades, catálogo NC y formulario explícito con pagos/receta elegibles, luego revisión/cuerpo/serie/worker/conciliación/aplicación única. Efectivo/reposición sólo después de CAE NC confirmado por decisión del titular, incertidumbre exige conciliación. NC/PR03/F08/PR02 parciales. SQL001–030/Edge no instalados/habilitados remotamente por nosotros, sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado, contador/envases y PV/custodia/aceptación pendientes; impresora/cajón/Point diferidos.

### 23/10/2026 — NC: evidencia durable de unidades SQL031 preparada
Configuración privada por comercio apagada por defecto (checkout_unidades_config_homologacion) y evidencia inmutable (checkout_unidades_homologacion). AFTER INSERT de entrada comercial nueva captura tipo/es_pesable/unidad de producto/componentes bajo locks ordenados, ligada a actor verificado y checksum del snapshot; no cambia payload/ACK v1 ni captura retroactivamente ventas/cierres existentes. Fuente deriva catálogo al preparar, nunca al devolver. Metadatos se conservan ante replay o cambios posteriores; snapshot/identidad de entrada protegidos, campos de política de supervisor siguen funcionando. Config apagada después de preparar no evade evidencia ya existente.
Primer cierre real compara checksum/metadata bajo locks del checkout; cambio de unidades revierte venta/pagos/stock y conserva intento. Replay confirmado no recotiza ni duplica stock. Se preserva una venta de combo pesable admitida por checkout: capturar hechos no impone la política de devolución de combos completos. La intención inicial del plan de restringir combos al registrar queda sustituida por esta separación, probada con componente físico entero. Guard de devolución/elegibilidad NC sigue aparte; no se declara elegible automáticamente un combo fraccionado.
Getter privado cargar_unidades_nc_homologacion usa fuente030/Auth fiscal original y devuelve CAPTURADAS con canónico/hash o NO_REGISTRADAS/null sin inferir catálogo actual. No agregado aún al SDK/servicio/HTTP/cliente: SDK44RPC permanece. Integración debe consultar031 como evidencia de unidades; DTO comercial v1 no incorpora este registro y no debe usarse solo para decidir si existe. Falta contrato/transporte/UI de unidades, conciliación histórica explícita, catálogo NC y formulario, luego revisión/cuerpo/serie/worker/conciliación/aplicación comercial única. No hay emisión, reintegro o reposición habilitados. Efectivo/stock sólo después de CAE NC confirmado según titular.
300 PASS /3 archivos (SQL252 +contrato comercial29 +envases19), salida0: pilot-checkout-units-targeted-v6-20261023.log. Incluye cierre real producto/pesable/combo/libre, rollback por metadata cambiada, ACK/replay/preparación duplicada, defaultfalse, activación posterior sin backfill, instalación repetida con evidencia, ACL/immutabilidad y Auth reasignado. Buildv2 PASS/salida0, lint sin nuevos hallazgos (finally previo del runner), manifiesto bootstrap43/diff PASS. Escáner1317archivos/49candidatos sin nuevos pares ruta/tipo y unidades privadas ausentes del bundle. Primeras fixtures usaban importe con centavos y ACK sin campos de política: corregidas al checkout real de enteros, sin relajar guards. Prueba de reinstalación corregida para no hacer COMMIT de transacción de fixture; selección reejecutada. Suiteglobal3436/1skip/260 histórica, no repetida.
PostgreSQL17.11:108 escenarios PASS/salida0, checkout-unit-evidence-concurrency-v3-20261023.json. Fases73antes025,14después025/026,8después027,5después028/029,4después030 y4después031 instalado dos veces. Nuevos: dos preparadores/unUUID/una evidencia; unidad cambia durante espera/cierre revierte negocio; rollback de preparación no deja evidencia/libera editor; cierre gana edición posterior y replay conserva unidades sin doble stock. Contenedor propio kiosko-pr03-local-eb24070d detenido/datos conservados, cero solicitudes externas/emisiones. v1 falló paso104 por caja sintética creada después de fecha del ticket; se corrigió cronología fixture sin cambiar controles. v2 pasó108 antes del ajuste de combo pesable; v3 acredita SQL final.
SQL001–031/Edge y configuración de captura no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. NC/PR03/F08/PR02 siguen parciales; aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual pendiente. Backup JSON no acredita nuevas tablas privadas de configuración/evidencia: incluirlas en dump y prueba futura de restore integral autorizado junto al diario fiscal; restauración integral sigue bloqueada. Contador/envases, PV/custodia pendientes; impresora/cajón/Point diferidos.

### 24/10/2026 — PR03: catálogo/contexto NC preparado (SQL033)
Catálogo separado sin filas/activación, tipos/condiciones/IVA y vigencias explícitos. Contexto sólo lectura exige caso activo/vínculo, fuente/unidades actuales coincidentes, emisor capturado y parámetros NC vigentes después de locks. DTO ligado/cerrado/congelado sin permiso.358 PASS/4archivos, buildv2/manifiesto43/diff PASS; PostgreSQL17.11:116 PASS (4después033), cero solicitudes/emisiones externas; escáner1329/49 sin nuevos pares ruta/tipo. Detalles/fases/límites en ExecPlan ARCA. SDK45 sin ampliación: pendientes transporte/UI, preparación/cuerpo/revisión/worker NC, provisión real y aceptación hospedada. SQL001–033/Edge sin instalación/activación remota; sin CAE, merge ni master/Production. Incluir catálogo privado en futuro dump/restore autorizado; restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: contexto NC conectado al panel
Consulta manual ligada a caso/factura/hash, Auth único, petición cerrada2KiB con ID/hash y fuente privada034 del canónico durable. SDK46RPC; cliente sin storage y panel descarta respuestas ajenas/tardías, no ofrece emisión ni dinero/stock.448 PASS/7archivos, buildv4/manifiesto43/diff PASS, lint sin hallazgos nuevos; PostgreSQL17.11:118 PASS (2después034), cero solicitudes/emisiones externas; escáner1334/49 sin nuevos pares ruta/tipo. Evidencia/fases/límites en ExecPlan ARCA. Pendiente preparación durable/cuerpo/revisión/worker NC y aceptación hospedada; PR03/PR02 parciales. SQL001–034/Edge/flags sin instalación/activación remota, sin CAE/merge/master/Production. Restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: preparación NC durable sin numeración (SQL035)
Datos canónicos/hash separados de factura v1, ligados a caso/contexto/fuente/unidades y asociación original exacta. Períodos de servicios/mixtos explícitos, sin copiar defaults. Una preparación inmutable por caso, replay/lectura histórica/rollback/cancelación sin número ni permiso.387 PASS/6archivos, buildv2/manifiesto43/diff PASS, lint sin nuevos hallazgos; PostgreSQL17.11:123 PASS (5después035), cero solicitudes/emisiones; escáner1337/49 sin nuevos pares ruta/tipo. Fases/evidencia/límites en ExecPlan ARCA. SDK46/HTTP/UI aún sin035: pendientes transporte/lectura validada/captura/revisión, cuerpo numerado y worker/conciliación NC, aplicación única con CAE y aceptación hospedada. Sin instalación/activación remota SQL001–035/Edge/flags, CAE, merge o cambios master/Production. Tabla nueva debe incluirse en dump/restore privado futuro; restore integral bloqueado y físicos/Point diferidos.

### Preparación NC: transporte preparado, deshabilitado (24/10/2026)
Lectura PREPARACION_NC por identidad mínima y guardado GUARDAR_PREPARACION_NC con SHA de contexto y períodos explícitos, máximo2KiB. Guardado requiere ARCA_HOMO_CREDIT_PREPARATION_ENABLED=true, bandera privada adicional al backend global; valor ausente mantiene escritura cerrada. La recuperación histórica no requiere esa bandera. SDK48 sólo servidor; SQL035 debe instalarse mediante gate autorizado, no desde cliente. Preparación sin número no significa emisión, CAE ni habilitación de reintegro/reposición. Cliente durable/UI y aceptación real siguen pendientes; no habilitar por el resultado de pruebas sintéticas. Esta documentación no autoriza instalación ni activación remota.

Actualización SQL036 (24/10/2026): agrega series/reservas/cuerpo NC privados e inmutables, sin instalar remoto ni integrar SDK/HTTP. Serie permanece cerrada hasta resolución fiscal futura; cancelación simple no puede liberar una NC numerada. Nueva reserva debe recibir consulta WSFE auténtica reciente desde adaptador privado todavía pendiente. Cuerpo SQL coincide con contrato separado A/B/C y períodos de servicios/mixtos;359 pruebas locales PASS. Dump/restore autorizado debe incluir fiscal_nc_series_homologacion y fiscal_nc_reservas_homologacion, además de preparaciones/casos/vínculos/unidades/diario previos. JSON de aplicación no acredita esa cobertura. Falta resolución/worker/revisión/conciliación y aceptación JWT/RLS/E2E real; no habilitar numeración ni emisión remota por este avance. Restauración integral continúa bloqueada.

Lectura privada de cuerpo NC reservado (24/10/2026): SQL037 + servicio + SDK49 recuperan/reconstruyen cuerpo canónico y SHA exactos ligados a factura/caso/preparación/reserva. Sólo evidencia histórica; no permiso ni catálogo vigente. Fuera de HTTP/UI.419 pruebas seleccionadas y130 escenarios nativos PASS; detalle y límites en ExecPlan. SQL001–037 sigue sin instalación remota por nosotros. Numeración verificada/revisión/worker/conciliación y resolución de serie siguen pendientes antes de habilitar remoto o solicitar primer CAE.

Numeración NC — adaptador preparado (24/10/2026): consulta privada de último autorizado para tipos3/8/13, SOAP/endpoint fijos y XML estricto, sin reintento ni emisión. Sólo pruebas sintéticas;627 pruebas seleccionadas PASS. No está conectado al worker ni expuesto por HTTP/UI. Necesita binding/autoridad SQL específica de NC y gate privado antes de solicitar TA o una consulta WSFE real. La respuesta de numeración no incluye CUIT; el TA y el emisor se deben vincular antes en servidor. No reutilizar el permiso de la factura ya autorizada como autorización de la NC. Ninguna autorización externa previa se amplía por este código.

Fuente privada de numeración NC (24/10/2026): SQL038/SDK50 verifican Dueño/Auth/caso/preparación/emisor actuales y devuelven metadata NUMERACION_NC sin secretos/TA/permiso. No compatible con binding de factura; no reutilizar la operación original para el lease TA de NC. Falta coordinación TA específica, trabajador y gates de consulta antes de conectar al adaptador SOAP.445 pruebas y133 escenarios nativos PASS, sin red ARCA real. SQL001–038 sigue sin instalación/activación remota por nosotros; no amplía autorizaciones de consulta/emisión.

Coordinación TA NC (24/10/2026): SQL039 comparte exclusión/sobre cifrado por certificado con facturas y conserva propiedad NC en fiscal_nc_ta_vinculos_homologacion. Una preparación o envío incierto no se renueva en paralelo; cancelar sólo antes de iniciar, sin liberar generaciones nuevas al repetir ACK antiguos. Sin TA/claves planos ni apropiación de intentos ajenos.483 pruebas seleccionadas en3 archivos y137 escenarios nativos PASS; cifrados nuevos sintéticos. Falta loader cifrado/callback NC e integración con worker/gates; fuera de SDK/HTTP. SQL001–039 no instalado remoto por nosotros, sin consultas/emisiones externas. Incluir nuevo vínculo en dump/restore autorizado; restore integral permanece bloqueado.


### 24/10/2026 — PR03: intención NC durable y consumo atómico (SQL042)
Registro privado inmutable por caso, UUID global único y permiso consumible una sola vez. Registrar verifica041 bajo lock de serie y guarda cuerpo/hash/revisión/Auth originales antes de cualquier transporte. Reintento del mismo UUID recupera ENVIO_INCIERTO/nuevo_envio=false incluso después de revocar emisor o vencer permiso; otra identidad exige conciliación, sin nuevo envío. Rollback no consume ni deja registro parcial. Después de INSERT se revalida autoridad y frescura porque la unicidad global también puede esperar; no autorizar con permisos vencidos durante esa espera. Getter histórico conserva incertidumbre sin renovar autoridad. ACL/RLS cerradas, sin SDK/HTTP/worker ni transmisión automática.
Evidencia enfocada:10 PASS/415 omitidos por filtro (credit-intent-sql-v1.log), SQL042 instalado/reaplicado por fixture dentro de ROLLBACK. PostgreSQL17.11 nativo148 PASS/salida0:143 anteriores y5 después042 instalado dos veces (credit-intent-native-v1.json/.log): mismo intento concurrente una autorización, rollback, revocación, vencimiento esperando serie y colisión UUID global seguida de rollback/vencimiento durante INSERT. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-79e78b46 detenido/datos conservados. Build PASS, manifiesto bootstrap43 PASS (no acredita opcional042), lint sólo warning no-unsafe-finally previo del runner, símbolos privados ausentes del bundle. Suite SQL completa425 PASS/1archivo/salida0 (credit-intent-full-sql.log); incluye los10 enfocados, no sumarlos. Baseline histórico se conserva por fases, no afirmar todas las pruebas previas bajo042.
Pendiente: fuente/binding y TA propios de emisión/consulta NC; worker FECAESolicitar/FECompConsultar con recuperación de intención antes de nuevos permisos; resultados/resolución durables y aplicación comercial única sólo después de CAE confirmado. SQL valida forma/frescura de consulta, no su procedencia WSFE: el futuro adaptador privado debe acreditarla. No reutilizar permiso de factura ni finalidad NUMERACION_NC. SQL001–042/Edge/flags sin instalación/activación remota por nosotros; sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales y aceptación hospedada pendiente. Dump/restore privado autorizado debe incluir intenciones además de permisos/revocaciones/revisiones/TA/unidades/reservas; JSON app no lo cubre, restore integral bloqueado. Impresora/cajón/Point diferidos.


### 24/10/2026 — PR03: fuente privada de envío NC (SQL043)
Fuente exige041 vigente/cuerpo/revisión/permiso exactos y ausencia de intención042, bajo el mismo lock de serie. Devuelve cuerpo durable/permiso y binding explícito finalidad ENVIO_NC, con número/reserva/hashes/Auth/emisor/credencial/certificado/revisiones; no inventa operacion_id de factura ni reutiliza NUMERACION_NC. Consultar fuente no consume permiso y emision_habilitada=false:042 y futuro worker siguen obligatorios. Intención existente exige recuperación/conciliación, sin preparar otro envío. No SDK/HTTP/TA/worker nuevo, ni exposición al navegador.
Evidencia:11 PASS enfocados/425 omitidos (credit-send-source-v2.log), instalación/reaplicación043 por fixture/ROLLBACK. Primer ensayo falló porque intentaba mutar revisión de catálogo inmutable; corregido para deshabilitar mediante operación permitida, sin relajar trigger. PostgreSQL17.11 nativo151 PASS:148 anteriores y3 tras043 instalado dos veces (credit-send-source-native-v1.json/.log): intención gana y bloquea fuente tardía, revocación durante espera y Auth reasignado no transfieren autoridad. Contenedor propio kiosko-pr03-local-a6705460 detenido/datos conservados; cero solicitudes externas/emisiones. Build/manifiesto bootstrap43/diff PASS, lint sólo warning finally previo; símbolo privado ausente del bundle. Suite SQL completa436 PASS/1archivo/salida0 (credit-send-source-full-sql.log); incluye11 enfocados, no sumarlos. Baseline histórico conserva instalaciones por fases, no afirmar todos los casos anteriores bajo043.
Siguiente: validador cerrado del nuevo binding/cuerpo y proveedor TA/custodia específico ENVIO_NC, consulta/reconciliación con finalidad propia posterior a intención (no usar043 ni038), worker con042 confirmado antes de transporte y resultados/resolución durables. Aplicación comercial única sólo tras CAE. SQL001–043/Edge/flags sin instalación/activación remota por nosotros, sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales; aceptación hospedada y punto de venta acreditado pendientes. Restore integral bloqueado; dump privado debe incluir todos los diarios/TA/permisos/intenciones NC, JSON app insuficiente. Impresora/cajón/Point diferidos.


### 25/10/2026 — PR03: contrato privado ENVIO_NC validado contra cuerpo durable
Nuevo validador cerrado de fuente043/binding ENVIO_NC/permiso041. Reconstruye cuerpo canónico/hash contra representación original/propuesta/preparación; compara número/PV/tipo/reserva/hashes/revisiones y permiso/revisión/Auth. Campos extra, identidades cruzadas y finalidades de factura/numeración/consulta se rechazan. Captura antes de await, salida congelada; no usa defaults ni casts a binding de factura. Vencimiento se conserva como evidencia de forma, no se acredita vigencia actual: SQL041/042 deben volver a verificar/consumir bajo locks antes de red. Metadata de credencial/certificado sigue privada y requiere guard SQL actual, no autoridad derivada del validador.
Evidencia:107 PASS/3archivos de contrato/cuerpo/numeración (credit-send-contract-v2.log);11 PASS043/425 omitidos por filtro con respuesta SQL real de ensayo validada (credit-send-contract-sql-v1.log). No nueva concurrencia nativa:151 previas corresponden SQL043 publicado. SQL no modificado. Compilación inicial detectó import no usado; pruebas adicionales de separación de finalidades lo usan ; buildv2 detectó unión numérica en prueba de mutación (no PASS). Se corrige fixture sin casts ni debilitar contrato, buildv3 interrumpido sin resultado terminal (handle ausente al retomar); buildv4 final PASS y107 PASS/3archivos repetidos (credit-send-contract-final-v4.log), lintv4 sin hallazgos. No sumar repeticiones como casos únicos. Lintv2 sin hallazgos, manifiesto bootstrap43/diff PASS y símbolos privados ausentes del bundle. Sin llamadas externas/secretos reales ni aceptación hospedada.
Pendiente proveedor TA/custodia para ENVIO_NC y autoridad propia de consulta posterior a intención, integración worker/042 antes de FECAESolicitar, FECompConsultar/ACK perdido/resultados/resolución y aplicación comercial exactamente una vez tras CAE. No SDK/HTTP nuevo, endpoint fiscal sigue cerrado. SQL001–043/Edge/flags sin instalación/activación remota por nosotros; no Supabase/Vercel, CAE, merge/master/Production. Baseline y gate aportados por titular registrados por separado, sin afirmar verificaciones remotas nuevas. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: custodia privada específica ENVIO_NC preparada
Adaptador separado de numeración/factura valida binding cerrado ENVIO_NC y exige guard asíncrono obligatorio del futuro worker antes de lectura privada y después de descifrado. Error, abort o revocación impide entregar signer; no hay guard implícito. Comparte sólo el helper de descifrado PBES2/PBKDF2/AES existente con revisión_emisor explícita, sin alias de operación/revisión de factura. Clave RSA no exportable y buffers privados temporales borrados por helper; captura binding congelado antes de esperar. Deadline respeta AbortSignal del trabajador. No concede transporte/TA/permiso ni reemplaza041/042.
Evidencia:83 PASS/4archivos (credit-send-custody-tests-v2.log), incluidos14 nuevos: CMS sintético, orden de guards/lecturas, RSA no exportable, guard denegado/ausente, revocación después de descifrado, finalidad ajena sin lectura, huella/revisión/password/proyecto incorrectos, abort inicial/durante guard y mutación tardía. Certificado/clave/password generados efímeros en memoria; sin secretos reales ni solicitudes externas. Buildv1/lintv1 PASS antes de dos pruebas finales; buildv2/lintv2 finales PASS, manifiesto bootstrap43/diff PASS; símbolos privados ausentes del bundle. Warning Vite de tamaño de chunks previo permanece. Sin SQL nuevo ni concurrencia nativa nueva (151 anteriores corresponden043).
Siguiente: coordinación TA específica ENVIO_NC con autoridad043 y guard obligatorio, recuperación/consulta posterior a intención con finalidad propia, worker042→FECAESolicitar/FECompConsultar/resultados/resolución y aplicación única después de CAE. No SDK/HTTP ni activación; SQL001–043/Edge/flags sin instalar/activar remotamente por nosotros. Baseline aportado y gate CODE REVIEW/GO-NO-GO siguen vigentes: no Supabase/Vercel, claves reales, ARCA autenticado, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos. Guard en tests es sintético; el adaptador todavía no prueba autorización SQL hospedada.


### 25/10/2026 — PR03: coordinación TA ENVIO_NC preparada localmente (SQL044)
Coordinador específico ENVIO_NC comparte diario/exclusión por certificado con factura y numeración, conserva vínculo inmutable de finalidad/caso/Auth/binding. SOLICITAR/INICIAR exigen043 actual y lo revalidan tras esperar por TA: revisión/permiso/cuerpo vigentes, sin intención comercial042 existente. Helper histórico reconstruye binding desde permiso/cuerpo inmutables y Auth original para confirmar respuesta ya recibida, consultar estado o cancelar lease nunca enviado, sin exigir permiso aún vigente. Nunca habilita nueva renovación desde historia. Sólo sobre cifrado cerrado; TA incierto no se libera automáticamente. Lease existente/TA válido compartidos sin apropiarse de intento ajeno. Código de transición separado del039 para no ampliar su finalidad/ACL; mismo diario global evita doble renovación entre finalidades. No SDK/HTTP/loader WSAA nuevo ni transporte.
Evidencia enfocada:15 PASS/436 omitidos (credit-send-ticket-sql-v2.log), instalación/reaplicación039/044 por fixture/ROLLBACK. Ciclo único/replay/confirmación recuperable, revocación con conservación histórica, cancelación/replay de generación anterior, binding cruzado, intención042 bloquea nuevoTA, sobre inválido preserva incertidumbre y roles navegador denegados. Primer ensayo falló por ruta incorrecta del fixture de preparación; corregido sin modificar contrato. Build PASS, lint sólo warning finally previo del runner, manifiesto bootstrap43/diff PASS (no acredita044 opcional), símbolos privados ausentes del bundle. Suite SQL completa451 PASS/1archivo/salida0 (credit-send-ticket-full-sql.log); incluye15 enfocados, no sumar como casos únicos. Baseline previo conserva instalación por fases, no afirmar todos los casos antiguos bajo044. Primer intento nativo terminó FAIL antes de escenarios porque Docker estaba apagado; Docker iniciado localmente; segundo ensayo PostgreSQL17.11 nativo154 PASS/salida0 (credit-send-ticket-native-v2.json/.log),151 antes044 y3 después instalado dos veces: lease único, envíoWSAA único y revocación esperando. Contenedor propio kiosko-pr03-local-4895848c detenido/datos conservados. Evidencia inicial fallida se conserva. Sin conexión remota ni emisión.
Siguiente: loader cifrado/WSAA ENVIO_NC con guard043 y custodia específica, fuente/TA propios para consulta posterior a intención, worker042 antes de FECAESolicitar/FECompConsultar, resultados/resolución y efecto comercial exactamente una vez tras CAE. SQL001–044/Edge/flags sin instalación/activación remota por nosotros; no Supabase/Vercel, secretos reales, ARCA autenticado, CAE, merge/master/Production. CODE REVIEW/GO-NO-GO y reporte final de inventarios siguen obligatorios antes de instalar. PR03/PR02 parciales, restore integral bloqueado, diarios/vínculosTA NC requieren dump privado autorizado; impresora/cajón/Point diferidos.


### 25/10/2026 — PR03: loader cifrado y WSAA ENVIO_NC preparados
Factories separadas ENVIO_NC validan binding propio y usan SQL044; numeración mantiene038/039 y tipos propios. Comparten sólo mecánica interna genérica de cifrado/ACK/CMS, no convierten autoridad ni agregan operación de factura. Guard obligatorio antes de claves/uso/solicitud WSAA; custodia de envío verifica043 antes/después de descifrar. INICIAR se marca intentado antes del RPC: ACK perdido no cancela ni reenvía. Sólo ACK nuevo exacto habilita transporte WSAA fijo, firmado con clave sintética en pruebas. Confirmar respuesta recibida cifra antes de guard final: revocación/abort impide entrega pero conserva TA recuperable. TA existente descifra por keyId original, sin otra renovación; Token/Sign no enumerables. Sin emisión de comprobantes.
Evidencia:105 PASS/7archivos (credit-send-loader-tests-v2.log) cubre loader/WSAA ENVIO_NC, regresión numeración, custodia y contrato; CMS sintético por transporte simulado.23 PASS SQL enfocados039loader/044,432 omitidos por filtro (credit-send-loader-sql-v2.log): cuatro nuevas integraciones044 con guard043 real local, renovación/reuso, ACKINICIAR/CONFIRMAR perdido y clave fallida; no afectan venta/caja/stock ni crean intención042. SQL sin cambios,154 nativas previas no son nueva concurrencia. Primer build falló por import de tipo ausente en fixture; corregido, buildv2 final PASS, lintv2 sin hallazgos, manifiesto bootstrap43/diff PASS y símbolos privados ausentes del bundle. Warning Vite previo de chunks permanece. No secretos reales/solicitudes externas ni aceptación hospedada.
Siguiente: fuente y TA de CONSULTA_NC posterior a intención con propiedad histórica/credencial adecuada sin habilitar envío; worker completo042→FECAESolicitar/FECompConsultar, ACK perdido/conciliación/resultados/resolución y efecto comercial exactamente una vez tras CAE. Loader/WSAA todavía no conectado a endpoint/SDK privado ni worker fiscal de envío, no asumir circuito completo. SQL001–044/Edge/flags sin instalar/activar remotamente por nosotros. CODE REVIEW/GO-NO-GO e inventarios finales antes de instalar; no Supabase/Vercel, ARCA autenticado, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: fuente privada CONSULTA_NC posterior a intención (SQL045)
Fuente sólo de consulta/reconciliación exige intención042 durable/cuerpo reservado e identidad Auth original, Dueño activo único/comercio propio. Binding CONSULTA_NC incluye intento/reserva/cuerpo/hash, revisión/permiso históricos y credencial/certificado/revisión explícitos, con emisión=false. No llama041 para renovar envío: vencimiento o revocación del permiso de envío y deshabilitación del catálogo no borran consulta histórica. Custodia global debe seguir habilitada y coincidir exactamente con el emisor original (CUIT/PV/credencial/certificado/revisión); no adopta otra clave tras rotación ni sortea deshabilitación. Si custodia cambia, conserva intención y exige recuperación administrativa autorizada, todavía pendiente de su política. No SDK/HTTP/TA/transporte ni otro envío.
Evidencia enfocada:11 PASS/455 omitidos (credit-consult-source-sql-v2.log),045 instalado/reaplicado por fixture/ROLLBACK; ausencia de intención, finalidad propia, revocación de envío/catálogo, custodia cambiada, Auth reasignado y roles navegador. Primer ensayo tenía CUIT negativo igual al original sintético; corregido para cambiarlo realmente, sin relajar guard. PostgreSQL17.11 nativo157 PASS/salida0 (credit-consult-source-native-v1.json/.log),154 anteriores y3 tras045 instalado dos veces: permiso de envío vencido permite consulta, custodia deshabilitada y Auth reasignado durante espera bloquean. Contenedor propio kiosko-pr03-local-21cb3c71 detenido/datos conservados. Build PASS; lint sólo warning finally previo del runner, manifiesto bootstrap43/diff PASS (no acredita opcional045). Suite SQL completa466 PASS/1archivo/salida0 (credit-consult-source-full-sql.log); incluye11 enfocados, no sumar como casos únicos. Baseline conserva instalaciones por fases, no afirmar todos los casos anteriores bajo045. Símbolo privado ausente del bundle. Sin conexiones remotas/secretos reales/emisiones.
Siguiente: validador cerrado/custodia/TA CONSULTA_NC, worker FECompConsultar y clasificación durable de respuesta contra cuerpo, envío042→FECAESolicitar e integración/resolución/efecto comercial exactamente una vez sólo tras CAE. No interpretar falta de consulta como autorización de reenvío ni número reservado como CAE. SQL001–045/Edge/flags sin instalación/activación remota por nosotros; no Supabase/Vercel, ARCA autenticado, merge/master/Production. CODE REVIEW/GO-NO-GO/reporte final de inventarios mantienen su gate. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: contrato/custodia CONSULTA_NC preparados
Validador cerrado reconstruye cuerpo/hash desde fuente/propuesta/preparación originales y cruza intención042 exacta con binding045 (intento,operación,caso,reserva,revisión/permiso históricos,hashes/Auth/número/emisor). ENVIO_INCIERTO/nuevo_envio=false/emisión=false son obligatorios; no interpreta historia como permiso de envío. Captura antes de await/salida congelada, rechaza campos extra/finalidades ajenas y cambios coincidentes de metadata que no reconstruyen cuerpo. Custodia específica CONSULTA_NC requiere guard045 actual antes de secretos y después de descifrar; clave no exportable y buffers borrados por helper común. Sólo mecánica de descifrado/guards compartida con ENVIO_NC mediante tipos/validadores distintos, sin transformar autoridad. No TA/consulta remota ni permiso de reenvío.
Evidencia:142 PASS/4archivos de contratos/cuerpo/numeración (credit-consult-contract-tests-v1.log),139 PASS/7archivos de custodia/contratos/WSAA (credit-consult-contract-tests-v2.log), reportados por separado por solapamiento.11 PASS045/455 omitidos por filtro con DTO SQL real validado (credit-consult-contract-sql-v1.log). Build/lint del cambio/manifiesto bootstrap43/diff PASS; warning Vite previo de chunks permanece. SQL sin cambios,157 carreras anteriores no son nueva concurrencia. Pruebas criptográficas efímeras sintéticas, sin secretos reales/llamadas externas/aceptación hospedada.
Siguiente: coordinación/cargadorTA CONSULTA_NC y trabajador FECompConsultar, clasificar/persistir respuesta contra cuerpo; completar envío042→FECAESolicitar, ACK perdido/conciliación/resolución y efecto comercial exactamente una vez tras CAE. SDK/HTTP/gates fiscales sin activar. SQL001–045/Edge/flags no instalados/activados remotamente por nosotros. CODE REVIEW/GO-NO-GO/inventarios finales antes de instalar; no Supabase/Vercel, ARCA autenticado, CAE, merge/master/Production. Recuperación tras rotación de custodia sigue bloqueada hasta política/autorización; restore integral bloqueado y físicos/Point diferidos. PR03/PR02 parciales.


### 25/10/2026 — PR03: TA y loader CONSULTA_NC preparados (SQL046)
Coordinador propio CONSULTA_NC usa045 actual para solicitar/iniciar renovación y revalida después de esperar, compartiendo diario global por certificado sin apropiarse de intentos de factura/numeración/envío. Vínculo incluye intención comercial original. Helper histórico valida cuerpo/permiso/intención/Auth y sólo permite confirmar respuesta recibida/consultar estado/cancelar lease no enviado después de revocar custodia; no reautoriza WSAA. Permiso de envío revocado no impide consulta autorizada. Loader cifrado y fuente CMS/WSAA específicos con tipos/validadores de consulta, guard045 obligatorio y custodia propia; no convierten binding de envío. Recuperan TA/ACK perdido, no cancelan incertidumbre enviada, respuesta tardía se conserva cifrada sin entregarla tras abort/revocación. No endpoint/SDK ni FECompConsultar aún.
Evidencia enfocada:44 PASS/6archivos de loaders/WSAA de consulta/envío/numeración (credit-consult-ticket-tests-v1.log), CMS y credenciales sintéticas efímeras/transporte simulado.13 PASS046/466 omitidos (credit-consult-ticket-sql-v1.log),046 instalado/reaplicado por fixture junto039; ciclo TA, envío revocado permite consulta, custodia deshabilitada preserva confirmación sin nueva renovación, bindings ajenos, roles, cancelación y cuatro integraciones loader→045/046 (normal/ACKINICIAR/CONFIRMAR perdido/clave fallida). Intención comercial original intacta. Build PASS; lint sólo warning finally previo del runner; manifiesto bootstrap43/diff PASS (no acredita046 opcional). PostgreSQL17.11 nativo160 PASS/salida0 (credit-consult-ticket-native-v1.json/.log),157 anteriores y3 tras046 instalado dos veces: lease único/WSAA único/custodia deshabilitada esperando. Contenedor propio kiosko-pr03-local-981c5f1b detenido/datos conservados. Suite SQL completa479 PASS/1archivo/salida0 (credit-consult-ticket-full-sql.log); incluye13 enfocados, no sumar como casos únicos. Baseline conserva instalación por fases, no afirmar todos los tests anteriores bajo046. Símbolos privados ausentes del bundle. Cero solicitudes externas/secretos reales/emisiones.
Siguiente: FECompConsultar NC con comparación de cuerpo/respuesta y resultados durables; integrar FECAESolicitar con042 confirmado antes de transporte, reconciliar ACK perdido, resolver serie/rechazos y aplicar efecto comercial exactamente una vez tras CAE. No confundir permiso WSAA con permiso de emisión ni afirmar circuito fiscal terminado. SQL001–046/Edge/flags sin instalar/activar remotamente por nosotros; no Supabase/Vercel, ARCA autenticado, CAE, merge/master/Production. CODE REVIEW/GO-NO-GO/reporte final inventarios antes de instalar. Recuperación tras rotación sigue pendiente de política/autorización; PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: lector XML y comparación de consulta NC preparados
Nuevo lector exclusivo tipos3/8/13 reutiliza primitivas XML seguras existentes (sin ampliar el contrato de facturas). Reconstruye solicitud NC desde paquete037/fuente/propuesta antes de comparar: identidad, concepto/receptor/IVA/fechas/moneda/importes/detallesIVA/tributos y asociación original. Esquema/namespaces/campos cerrados, duplicados/DTD/XML ambiguo rechazados; CAE no cero, vencimiento y proceso válidos/coherentes. Comparación decimal exacta sin floats; filas fiscales por ID sin duplicados. Resultado es sólo comparación pura, no prueba origen ARCA ni persiste/emite/aplica efectos.
Contrato contrastado mediante lectura pública del manual oficial ARCA WSFEv1 v4.0, sección FECompConsultar pp181–186 (https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf) y ficha pública https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECompConsultar. El ejemplo no garantiza Cuit/fecha de CbteAsoc: si faltan, se preservan null y ASOCIACION_INCOMPLETA, nunca se rellenan con la solicitud. Aceptación real/cobertura de esos campos o evidencia adicional autorizada sigue pendiente; no afirmar coincidencia completa por sólo Tipo/PV/Nro. FchProceso admite fecha8 o fecha/hora14 válidas y conserva precisión recibida, sin inventar hora. WSDL público no pudo recuperarse por herramienta web; no usarlo como evidencia verificada.
Evidencia:147 PASS/3archivos (credit-voucher-xml-tests-v3.log), NC A/B/C, servicios, asociación distinta/incompleta/duplicada, importes/IVA/tributos alterados, XML/CAE/fechas/errores/602/canónico incorrectos y regresión lector factura/cuerpoNC. Prueba usa sólo XML sintético, no consultas WSFE autenticadas. Primer build falló por constante no usada; corregida sin suprimir chequeos. Buildv2/lintv2/manifiesto bootstrap43/diff PASS; warning Vite previo de chunks permanece. SQL sin cambios,160 carreras previas no son nueva concurrencia ni aceptación hospedada.
Siguiente: transporte FECompConsultar NC fijo/acotado con guard045 y TA046, persistir clasificación/resultados con exclusión, envío042→FECAESolicitar/ACK perdido/conciliación/resolución y efecto comercial exactamente una vez sólo tras CAE. Toda falta/error conserva CONCILIAR/puedeReenviar=false;602 no concede reenvío. SQL001–046/Edge/flags sin instalar/activar remotamente por nosotros; no SDK/HTTP nuevos ni Supabase/Vercel, secretos reales, CAE, merge/master/Production. CODE REVIEW/GO-NO-GO/inventarios finales mantienen su gate. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: transporte FECompConsultar NC preparado
Consulta privada reconstruye fuente045/cuerpo/intención y liga TA a entorno/wsfe/CUIT/credencial/certificado exactos antes de crear request. Endpoint/SOAPAction/identidad fijos de homologación, Auth escapado, guard045 obligatorio antes de transmitir y después de respuesta. Captura inputs/TA antes de await. Deadline abarca validación/guard/red/stream/comparación, cancelación desde worker, límite1MiB/UTF8 fatal/status200/content-type/redirect estricto y cero retry. Adaptadores de envío y consulta conservan allowlists separadas; helper común no añade FECompConsultar al export de envío. Resultado congelado ligado a intento/hash/fecha de consulta, sin XML/Token/Sign crudos ni persistencia/efecto comercial. Falta de respuesta sigue siendo incertidumbre, nunca reenvío autorizado.
Evidencia:186 PASS/4archivos de transporte/XML/emisión/numeración (credit-voucher-query-tests-v2.log),13 PASS045/468 omitidos por filtro (credit-voucher-query-sql-v2.log). Dos nuevas integraciones con fuente/guard SQL045 reales locales: consulta simulada produce comparación ligada al intento y custodia deshabilitada impide fetch; saldos/intención intactos. Fixture XML compartido conserva casos unitarios fijos y genera fechas desde NC para ensayoSQL. Primer build corrigió tipo del mock pendiente; primer ensayo SQL aisló rechazo en SAVEPOINT para verificar invariantes después del error, sin cambiar guard de producción. Buildv2/lintv2/manifiesto bootstrap43/diff PASS; warning Vite previo de chunks permanece. SQL sin cambios,160 carreras previas no son nueva concurrencia. Sin ARCA autenticado/secretos reales/emisiones ni aceptación hospedada.
Siguiente: diario durable de consultas/resultados/resolución NC, worker con Auth/gates y TA046→consulta045/transporte, envío042→FECAESolicitar/ACK perdido/conciliación/resolución de serie y efecto comercial EXACTLY ONCE sólo tras CAE. Asociación incompleta permanece CONCILIAR sin rellenar campos ni adoptar CAE. No endpoint/SDK/activación nuevos. SQL001–046/Edge/flags sin instalar/activar remotamente por nosotros; no Supabase/Vercel, merge/master/Production. CODE REVIEW/GO-NO-GO/inventarios finales antes de instalar. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: diario durable de consulta/CAE NC preparado (SQL047)
Consultas y autorizaciones NC privadas/inmutables, ACL/RLS de tabla/columnas cerradas incluso service_role. Registrar sólo desde trabajador privado READ COMMITTED tras comparación/transporte, liga UUID consulta/intención/caso/Auth/cuerpo y guarda sobre cerrado de resultado sin XML/credenciales. Fecha de observación finita reciente y posterior al intento; validación de CAE/fechas/proceso/hash y puedeReenviar=false. SQL no autentica ARCA: esa procedencia y comparación siguen responsabilidad del worker privado. Lock de serie serializa consultas/autorización por caso; un CAE contradictorio o UUID con otro contenido revierte sin reemplazar historia. CONCILIAR posterior agrega observación sin degradar autorización registrada. Replay exacto y recuperación por caso sin UUID del consumidor funcionan desde historia, aun con custodia deshabilitada. Estado CAE_NC_REGISTRADO_NO_APLICADO; no libera serie, emite, reintegra ni repone stock. Getter null no prueba rollback ni permite reenviar.
Evidencia:17 PASS047/481 omitidos por filtro (credit-consult-journal-sql-v3.log), instalación/reaplicación047 por fixture/ROLLBACK. ACK perdido/replay, recuperación por caso, múltiples consultas/unCAE, no downgrade, contradicción, rollback, custodia deshabilitada, sobre inválido/fechas/identidad/roles/inmutabilidad y efectos comerciales intactos. PostgreSQL17.11 nativo163 PASS/salida0 (credit-consult-journal-native-v1.json/.log),160 anteriores y3 después047 instalado dos veces: dos workers/mismoUUID, CAE contradictorio esperando y rollback sin autorización fantasma. Contenedor propio kiosko-pr03-local-dbd6448b detenido/datos conservados, cero solicitudes externas/emisiones. Build/manifiesto bootstrap43/diff PASS (no acredita047 opcional); lint sólo warning finally previo del runner y Vite conserva warning de chunks. Suite SQL completa498 PASS/1archivo/salida0 (credit-consult-journal-full-sql.log); incluye17 enfocados, no sumar como casos únicos. Baseline conserva instalación por fases, no afirmar todos los tests anteriores bajo047. Símbolos privados ausentes del bundle.
Siguiente: worker Auth/gates/TA046→consulta045/transporte→diario047 con recuperación previa, resultados rechazados/serie resuelta y envío042→FECAESolicitar. Efecto comercial EXACTLY ONCE después de CAE sigue pendiente, no usar tabla de autorización como permiso para alterar caja/stock. Dump/restore privado autorizado debe incluir consultas/autorizaciones047 además de diario/TA/unidades/intenciones; JSON de aplicación insuficiente. SQL001–047/Edge/flags sin instalar/activar remotamente por nosotros, sin SDK/HTTP/activación nuevos; no Supabase/Vercel, secretos reales, ARCA autenticado, CAE real, merge/master/Production. CODE REVIEW/GO-NO-GO/reporte final inventarios antes de instalar. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: trabajador privado de conciliación NC preparado
Orquestador verifica JWT una vez mediante Auth, conserva actor original y reconstruye representación/propuesta/cuerpo/intención. Recupera primero autorización por caso o consulta por UUID desde047, validando receipt cerrado y sin acceder TA/credenciales; recuperación admite flag de consulta cerrado/custodia deshabilitada, pero requiere backend/proyecto privados vigentes. Trabajo nuevo exige ARCA_HOMO_CREDIT_CONSULT_ENABLED=true (default cerrado, no activado), source045 exacta revalidada en guards, factory WSAA con guard/loader046, transporte fijo y registro047. ACK de escritura no se toma como éxito: sólo GET durable; lectura fallida conserva incertidumbre, otra llamada recupera antes de red. Prioriza autorización previa sin degradarla; si la respuesta nueva contradice CAE/vencimiento/cuerpo del ganador concurrente, devuelve no confirmado, no presenta el ganador como confirmación de la respuesta contradictoria. Deadline45s acota Auth/RPC/TA y consulta; ninguna emisión/efecto comercial.
SDK privado amplía allowlist54→60 sólo con seis RPC de lectura/consulta/diario042/045/046/047. No admite permiso/fuente/intención de envío NC y no agrega acción HTTP. Factory de custodia/WSAA real todavía debe ensamblarse al conectar endpoint controlado; pruebas usan Auth/TA sintéticos/transporte simulado y SQL local real, no JWT/RLS hospedado. Nuevo validador de intención/receipt cruza UUID/caso/actor/hash/reserva y flags, conserva fechas históricas y congela respuesta sin XML/credenciales.
Evidencia:175 PASS/4archivos (credit-consult-worker-tests-v2.log), validadores, SDK fijo/separación de emisión, fuente/transporte y timeout Auth45s sin leer claves/red.11 PASS047worker/498 omitidos por filtro (credit-consult-worker-sql-v3.log): normal, histórico con flag/custodia cerrados, permiso de envío revocado, ACK/GET perdidos y recuperación, flag cerrado/cambia tras red, SIN_CONFIRMACION, Auth inválido, diario alterado y CAE concurrente contradictorio; identidad original una vez por ejecución y saldos intactos. SQL sin cambios;163 nativas anteriores no son nueva concurrencia, intercalación de conflicto nueva es sintética PGlite. Buildv4/lintv4 del cambio/manifiesto bootstrap43/diff PASS; warning Vite previo permanece. Sin secretos reales/llamadas externas/emisiones.
Siguiente: ensamblar endpoint privado de consulta/default cerrado con custodia real bajo guard, diario/resolución durable de conflictos/rechazos y serie; completar envío042→FECAESolicitar/ACK perdido/conciliación y efecto comercial EXACTLY ONCE después de CAE. Rechazo de contradicción en047/worker no sustituye todavía gestión durable de incidencias que debe bloquear aplicación hasta resolución. SQL001–047/Edge/flags sin instalar/activar remotamente por nosotros, sin Supabase/Vercel, ARCA autenticado, CAE real, merge/master/Production. CODE REVIEW/GO-NO-GO/inventarios finales antes de instalar. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: incidencias NC durables y bloqueo preparado (SQL048)
048 conserva observación contradictoria e incidencia privada/inmutable en la misma transacción sin reemplazar CAE original. DATOS_DISTINTOS también crea incidencia aun sin CAE previo. GET por caso prioriza CONFLICTO_NC_NO_APLICAR; histórico conserva receipt original y una observación posterior coincidente no borra el conflicto. Trabajador/validador/HTTP admiten el estado explícito, siempre con emisión/reintegro/reposición false. Ninguna resolución automática ni liberación de serie.
Gate exigir_nc_sin_conflictos_homologacion requiere trabajador privado/READ COMMITTED/original Auth/intención, toma lock de serie y revalida identidad tras espera. Futura aplicación comercial debe mantenerlo dentro de su transacción junto a sus restantes precondiciones: ausencia de incidencia NO es autorización CAE/negocio. Registro revalida Auth después de lock. SDK sigue60 RPC, sin exponer gate nuevo ni ampliar acciones HTTP. Tablas/columnas privadas con RLS/ACL cerradas y trigger inmutable; futuras copias privadas deben incluir fiscal_nc_conflictos_homologacion.
Evidencia:148 PASS/2archivos HTTP/receipt (credit-conflicts-tests-v1.log),21 PASS SQL enfocados/500 omitidos por filtro (credit-conflicts-sql-v1.log), instalación048 dos veces por fixture y rollback. Conflicto sin reemplazo, replay/UUID alterado, rollback, DATOS_DISTINTOS, no borrado por observación posterior, Auth ajena/ACL/inmutabilidad, HTTP histórico con flag/custodia cerrados sin claves/red, worker con CAE concurrente sintético y efectos comerciales intactos. PostgreSQL17.11 nativo166 PASS/salida0 (credit-conflicts-native-v1.json/.log),163 anteriores y3 tras048 instalado dos veces: CAE contradictorio esperando queda durable, gate esperando conflicto confirmado rechaza55000, rollback no deja bloqueo fantasma. Contenedor propio kiosko-pr03-local-82eec6b9 detenido/datos conservados;0solicitudes externas/emisiones. Build/diff/manifiesto bootstrap43 PASS; lint sin errores con warning finally previo del runner, Vite conserva aviso de chunks. Símbolos privados ausentes del bundle. Suite SQL completa521 PASS/1archivo/salida0,603s (credit-conflicts-full-sql-v1.log); incluye los21 enfocados, no sumarlos como casos únicos. Baseline conserva instalación por fases, no afirmar todos los tests anteriores bajo048.
Siguiente: contrato/evidencia explícitos de resolución de incidencias y serie; completar envío042→FECAESolicitar/ACK perdido/conciliación y efecto comercial EXACTLY ONCE después de CAE. No confundir incidencia registrada con incidencia resuelta, ni ausencia de conflicto con autorización de aplicación. SQL001–048/Edge/flags no instalados/activados remotamente por nosotros. Sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production; CODE REVIEW/GO-NO-GO/inventarios finales antes de instalación. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: XML/transporte NC preparado bajo ACK042 original
Adaptador privado FECAESolicitar NC3/8/13 reconstruye fuente043/cuerpo037 contra factura original/propuesta, verifica TA por entorno/wsfe/CUIT/credencial/certificado y serializa asociación completa (tipo/PV/número/CUIT/fecha), períodos, IVA/tributos y decimales explícitos. Captura entrada/TA antes de awaits, endpoint/SOAPAction fijos y transporte exclusivo de envío separado de consulta/numeración. Deadline padre acota validación/ACK/red/stream; sólo un fetch, sin retry. Callback privado consumeIntent debe ejecutar POST042 real; exige ACK cerrado ligado al cuerpo/actor/reserva/revisión/permiso con nuevo_envio=true. GET/replay false, ACK perdido/error y revocación no conceden red. El validador no acredita por sí solo procedencia SQL del callback: ensamblaje del worker seguro sigue pendiente.
Decodificación SOAP compartida conserva validación específica de factura y admite expectativa NC reconstruida, sin ampliar identidad de factura a NC. Resultado A/R/incierto devuelve sólo candidato/códigos/puedeReenviar=false, nunca CAE/XML/Token/Sign ni permiso comercial. Una respuesta A exige FECompConsultar completo/diario antes de confirmar; rechazo o timeout tampoco autorizan reenvío ni liberan serie. No aplicación caja/stock.
Corrección relacionada: factura y NC en PES omiten CanMisMonExt, conforme manual ARCA v4.0 p68/código10241. No modifica cuerpos/hash persistidos; corrige serialización de protocolo. Fuentes públicas consultadas: https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf y https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECAESolicitar . WSDL no recuperable por navegador (500/502), no se declara validación de esquema hospedado ni consulta autenticada.
Evidencia local:328 PASS/6archivos (credit-emission-tests-v2.log),123 PASS/2archivos trabajador previo de factura/XML (credit-emission-regression-v1.log),4 PASS transporte042SQL/521 omitidos por filtro (credit-emission-sql-v1.log). Fixture SQL usa042 real con permiso/revocación/ACK perdido/replay y transporte sintético; en envío normal existe intención antes de fetch y segunda invocación no repite, saldos comerciales intactos. Pruebas cubren NC3/8/13/períodos, TA/cuerpo alterado, identidad/permiso/revisión de ACK, abort/expiry/deadline, rechazo/incierto/HTTP/SOAP/DTD/duplicados/CAE inválido, acciones separadas y mutación posterior sin cambio de XML. No sumar ejecuciones históricas solapadas. Build/lint/diff/manifiesto bootstrap43 PASS; aviso Vite previo de chunks permanece. Símbolos privados ausentes del bundle. Sin cambios SQL ni nueva concurrencia;166 anteriores y suiteSQL521 del commit anterior no acreditan ejecución global525 actual.
Siguiente: trabajador NC completo Auth/flag privado/recuperación previa→fuente043/TA044→último autorizado→POST042→este transporte→consulta045/046/diario047/048. Falta durable de respuesta/rechazo, resolución de incidencias/serie y efecto comercial EXACTLY ONCE tras CAE. No hay nueva acción HTTP de emisión ni ampliaciónSDK60, flags/secretos nuevos activados, instalación remota, ARCA autenticado/CAE real, Supabase/Vercel, merge/master/Production. SQL001–048/Edge/flags siguen sin instalar/activar remotamente por nosotros; gate final CODE REVIEW/GO-NO-GO/inventarios antes de instalar. PR03/PR02 parciales; restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: trabajador NC privado preparado, recuperación antes de envío
Nuevo emitFiscalCreditOperation verifica Auth, fija actor original y reconstruye representación/propuesta/cuerpo037. Lee intención042 antes de flag de envío/TA/secretos: existente nunca autoriza otro POST. Envío nuevo requiere ARCA_HOMO_CREDIT_SEND_ENABLED=true exacto (default cerrado/no activado), fuente043 bajo guard actual, TA044 con factory/custodia guardada, último autorizado autenticado con TA ligado y consulta vigente, nuevo POST042 bajo locks y ACK original→transporte. Captura dependencias/identidades; fallo/ACK perdido/SOAP incierto pasa sólo a recuperación y consulta, nunca retry de emisión. Flag cerrado tras consumo deja intención sin fetch. Deadline60s encadena abort hacia numeración/transporte/consulta.
Después de intención, consulta045/046/047/048 mediante trabajador existente. Ese trabajador verifica Auth nuevamente y exige mismo actor capturado antes de esperar; ninguna fase infiere Auth desde perfil. No se evita Auth con cliente sintético de producción: pruebas usan Auth remoto simulado. Consultas durables/autorización/conflicto se recuperan antes de claves/flags de trabajo. Si consulta/GET no queda confirmado, sólo devuelve intención histórica ENVIO_INCIERTO con emisión/reintegro/reposición false; no descarta la fila. SDK privado63 RPC (60 anteriores+fuente043/TA044/POST042), sin RPC genérico de emisión/verificación de permiso ni acción HTTP nueva. Factory real de custodia sigue dependencia privada; ensamblaje HTTP de envío/activación no realizado.
Evidencia:327 PASS/7archivos (credit-emission-worker-tests-v3.log),13 PASS integración SQL/525 omitidos por filtro (credit-emission-worker-sql-v2.log). SQL041–048 local/TA y transporte sintéticos: envío normal y segunda invocación con un solo FECAESolicitar; respuesta de envío perdida recupera consulta; ACK042 perdido no envía; intención previa consulta aun con envío cerrado; histórico con custodia/ambos flags cerrados sin claves/red; revocación tras numeración impide intención; segundo Auth distinto no consulta; consulta fallida devuelve pendiente; ACK/GET durable perdidos se recuperan sin repetir emisión; cuerpo alterado y flag cerrado tras consumo no envían. RPC siempre con actor original y saldos comerciales intactos. Unitarios cubren Auth60s, mutación del actor esperado durante espera y aborto padre sin RPC/red. Ejecuciones v1/v2 previas solapadas no sumar. Buildv2/lintv2/diff/manifiesto bootstrap43 PASS; aviso Vite previo de chunks permanece. Símbolos privados ausentes del bundle. Sin cambios SQL ni nueva concurrencia;166 carreras previas y suiteSQL521 anterior no acreditan global538 actual.
Pendiente: diario durable de candidatos/rechazos (worker aún no guarda el candidato FECAESolicitar), resolución de incidencias/serie, aplicación comercial EXACTLY ONCE tras CAE, interfaz/ensamblaje controlado de envío, aceptación hospedada JWT/RLS/TA/ARCA real. Reutilizar UUID de consulta recupera esa observación; una consulta nueva requiere identidad explícita nueva, nunca otro intento de envío. No se declaran cerrados NC send/robustez fiscal ni gate final. SQL001–048/Edge/flags no instalados/activados remotamente por nosotros; sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production. CODE REVIEW/GO-NO-GO/inventarios finales antes de instalación; PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — PR03: respuestas candidatas NC durables preparadas (SQL049)
049 agrega fiscal_nc_respuestas_envio_homologacion privada/RLS/ACL de tabla y columnas cerradas incluso service_role, con trigger inmutable. Una respuesta por caso/intención, ligada a Auth original/cuerpo/hash. Sobre cerrado conserva recibido_en y candidato/códigos numéricos, sin SOAP/CAE/credenciales. Registra sólo tras intención042, READ COMMITTED y lock de serie, revalidando Auth después de esperar. Replay exige observación original exacta y ocurre antes de vigencia; otro contenido no reemplaza historia. Getter recupera sin permiso/custodia aún vigentes, pero exige Auth original activo. Null no prueba que no hubo emisión ni permite reenviar.
Trabajador guarda candidato FECAESolicitar antes de conciliación, ignora ACK como prueba y valida GET049. Recuperación de intención valida también el diario si existe antes de consultar. ACK perdido recuperable sin repetir POST; GET perdido mantiene incertidumbre y siguiente llamada recupera sin emitir. Diario alterado bloquea recuperación. Ausencia de candidato después de pérdida de respuesta no se rellena ni simula: intención y consulta completa siguen siendo vías de recuperación. Aprobación candidata no crea autorización047, rechazo/SIN_CONFIRMACION no concede reenvío/libera serie; flags comerciales false. SDK65 RPC (63+GET/registro049), sin nuevas acciones HTTP/flags/secretos.
Evidencia local:332 PASS/7archivos (credit-send-responses-tests-v2.log),38 PASS SQL enfocados/525 omitidos por filtro (credit-send-responses-sql-v2.log). Incluye16 escenarios del worker y22 de049: A/R/incierto, replay/otro contenido, rollback, custodia/permiso cerrados, identidad/fechas/códigos/sobres inválidos, ACL/inmutabilidad/otro actor/ausencia de intención; ACK/GET candidato perdidos y diario alterado, saldos intactos/sin CAE por candidato. Ejecuciones v1 solapadas no sumar. PostgreSQL17.11 nativo169 PASS/salida0 (credit-send-responses-native-v1.json/.log),166 anteriores y3 tras049 instalado dos veces: dos workers/misma respuesta unregistro/sinCAE, otra respuesta esperando rechaza22023 sin reemplazo, rollback sin respuesta fantasma. Contenedor propio kiosko-pr03-local-d5c29c2f detenido/datos conservados;0solicitudes externas/emisiones. Build/lint/diff/manifiesto bootstrap43 PASS; lint mantiene warning finally previo del runner, Vite aviso previo de chunks. Símbolos privados ausentes del bundle. No se acredita suite SQL global563 actual;521 anterior corresponde a otro HEAD/instalación por fases.
Siguiente: resolución explícita de incidencias/rechazos/serie y efecto comercial EXACTLY ONCE tras CAE, interfaz/ensamblaje controlado de envío y aceptación hospedada. Dump/restore privado autorizado debe incluir respuestas049 junto a intención/consultas/autorizaciones/conflictos; JSON de aplicación insuficiente y restore integral bloqueado. SQL001–049/Edge/flags no instalados/activados remotamente por nosotros; sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production. No se declara cerrado gate NC/fiscal ni PR03/PR02; CODE REVIEW/GO-NO-GO/inventarios finales antes de instalar, físicos/Point diferidos.


### 25/10/2026 — PR03: resolución de numeración NC autorizada preparada (SQL050)
050 agrega marcador histórico privado/RLS/ACL/inmutable por caso/intención/reserva, derivado exclusivamente de autorización047 ligada al cuerpo037. No admite CAE/importe/identidad fiscal suministrados por cliente ni candidatos049 como autorización. Registro READ COMMITTED bajo lock de serie, Auth original revalidada tras espera y rechazo si cualquier caso de la misma serie tiene incidencia048. Getter/replay conserva marcador histórico con custodia/permiso cerrados, sin concesión comercial; conflicto posterior no borra historia.
Reserva036 actualizada por050: mantiene reserva/cuerpo histórico y sólo admite otro caso cuando no hay reservas sin resolución, no hay conflictos conocidos de serie y consulta de numeración es vigente/no anterior al máximo confirmado. No reutiliza números ni borra filas. Guard041 de permiso y gate048 previo a futura aplicación ahora comprueban conflictos de toda la serie; un conflicto histórico bloquea una reserva/permiso posterior aun si el caso original ya tiene marcador. Cancelación de NC numerada sigue prohibida. Rechazo/timeout/602 no libera serie y su corrección/resolución explícita sigue pendiente; no eliminar UNIQUE/reservas para sortearlo sin contrato de ocupación/auditoría alternativo.
Evidencia local:10 PASS SQL050/563 omitidos por filtro (credit-resolution-sql-v2.log), instalación050 dos veces por fixture. Exige CAE/no candidato, R/incierto/602 denegados, conflictos previos/posteriores, replay/rollback, custodia/permiso cerrados, Auth/ACL/helper interno/inmutabilidad y efectos comerciales intactos. Ensayo de dos casos parciales reales del mismo origen/serie: segundo bloqueado antes de resolver primero, Last anterior rechazado, CAE+resolución habilitan número24 después23, replay conserva24 y conflicto posterior bloquea permiso del segundo caso. PostgreSQL17.11 nativo172 PASS/salida0 (credit-resolution-native-v1.json/.log),169 anteriores y3 tras050 instalado dos veces: dos resolutores un marcador, conflicto confirmado mientras espera impide resolver y rollback sin marcador fantasma. Contenedor propio kiosko-pr03-local-e59bcfc8 detenido/datos conservados;0solicitudes externas/emisiones. Build/diff/manifiesto bootstrap43 PASS, lint sin errores con warning finally previo del runner; avisos Vite de chunks/timings previos. No suite SQL global573 acreditada; ejecución por fases no equivale a todo bajo050.
Siguiente: aplicación comercial EXACTLY ONCE tras CAE/resolución y sin conflicto, resolución explícita de incidencias/rechazos/corrección de numeración, servicio/interfaz controlados y aceptación hospedada. Marker RESOLUCION_NC_REGISTRADA_NO_APLICADA no es permiso actual de serie/caja/stock: los guards deben revalidarse dentro de cada transacción. SDK65/HTTP sin ampliar, nuevos RPC050 sólo preparados en SQL/service_role. Backup privado autorizado debe incluir resoluciones050 además de diarios previos; JSON de aplicación insuficiente/restore integral bloqueado. SQL001–050/Edge/flags no instalados/activados remotamente por nosotros; sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production. PR03/PR02 y gate final siguen abiertos; CODE REVIEW/GO-NO-GO/inventarios antes de instalar; físicos/Point diferidos.


### 25/10/2026 — PR03: preparación comercial NC bajo locks (SQL051)
051 prepara, sin aplicar, el contrato que usará la mutación comercial: resolución050/CAE/cuerpo exacto, conflicto actual de toda la serie, Dueño ordinario activo/Auth original, comercio activo/capacidad DEVOLUCIONES_EFECTIVO y caja abierta del mismo comercio. Contrasta fuentes030/031 con vínculo032/canónicos/hashes y deriva importes, cantidades y receta originales. No obtiene receta ni precio de venta del catálogo actual; comprueba compatibilidad actual de unidades/stock de cada físico y rechaza un componente convertido en combo. Devuelve PLAN_NC_SIN_APLICAR y flags false, sin permiso reutilizable fuera de la transacción. No suplantación de Auth ni efectos de caja/stock/lotes/costos.
Evidencia:13 PASS SQL051/573 omitidos por filtro (credit-commercial-plan-sql-v2.log): derivación/replay sin mutaciones, suspensión/capacidad/caja cerrada/ajena/Auth/conflicto/unidad/virtual/stock unitario fraccionado, roles y caja original cerrada con reintegro en otra caja; precio actual999 no altera importe histórico124. Regresión92 PASS/2archivos (credit-commercial-plan-regression-v1.log), facturas y devolución común con todos los SQL hasta051; fixture de factura instala dependencias comerciales reales/suscripción, no excluye051 para aprobar. PostgreSQL17.11 nativo175 PASS/salida0 (credit-commercial-plan-native-v3.json/.log),172 anteriores y3 tras gates/051 instalados dos veces: cierre de caja, suspensión comercial y producto convertido en combo durante espera impiden plan, sin devolución. Contenedor propio kiosko-pr03-local-5b176512 detenido/datos conservados;0solicitudes externas/emisiones. v1/v2 nativos fallaron en fixture (caja original030 NOWAIT y unicidad de caja abierta por comercio); se corrigió a turno original cerrado+caja de reintegro nueva, sin debilitar controles SQL. Contenedores fallidos también detenidos/datos conservados. No sumar ejecuciones solapadas.
Buildv2/lintv2/sintaxis runner/manifiesto bootstrap43/diff PASS; lint conserva warning finally previo, Vite avisos previos. No suite SQL global586 acreditada ni aceptación JWT/RLS hospedada. SDK65/HTTP sin ampliar;051 requiere módulos comerciales/capacidades, instala con capacidades cerradas por defecto (sólo fixtures sintéticos habilitados).
Siguiente necesario: mutación comercial exactamente una vez en la misma transacción que vuelva a ejecutar051, con diario privado, reintegro, reposición contra EGRESOS originales y costos/lotes, confirmación/rollback/ACK perdido. Adaptar exclusión010 y fuentes027/030 para distinguir sólo devoluciones fiscales enlazadas a ese diario de devoluciones comunes; no bypass por flags/GUC ni por rol. El flujo común sigue bloqueando ventas fiscalizadas hasta ese circuito. Resolución de incidencias/rechazos, servicio/interfaz controlados y aceptación real pendientes. SQL001–051/Edge/flags sin instalar/activar remotamente por nosotros, sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production; gate final abierto, CODE REVIEW/GO-NO-GO/inventarios antes de instalar. Restore integral bloqueado y físicos/Point diferidos.

#### 26/10/2026 — PR03: aplicación comercial NC SQL052 (local)
Diario/efectos atómicos y replay sin duplicados después de CAE/resolución, con costos/lotes originales, Auth original y exclusión fiscal preservada. Evidencia canónica en .agent/execplans/arca-homologation.md:16 pruebas enfocadas,92 regresiones y178 escenarios PostgreSQL locales (3 nuevos052), sin solicitudes ARCA ni instalación remota. Pendiente servicio/contrato de respuesta, aceptación hospedada, inventario/revisión GO-NO-GO y primer CAE autorizado; no declarar PR03/PR02 completos. Restore integral y físicos/Point conservan sus gates/diferidos.

#### 26/10/2026 — Servicio privado de aplicación NC preparado localmente
Auth original, recuperación del diario antes de flag de trabajo, validación de CAE/resolución/cuerpo y aplicación052 con confirmación GET. SDK69/HTTP aún sin acción pública nueva; sin transporte ARCA en este servicio. Flag privado ARCA_HOMO_CREDIT_APPLY_ENABLED debe permanecer ausente/false hasta su gate específico; no habilitado remotamente. Evidencia: ExecPlan ARCA,28 pruebas enfocadas SQL/servicio y95 contrato/SDK/cancelación. PR03/PR02 siguen abiertos; faltan integración controlada, revisión/inventarios y aceptación hospedada. Sin nueva instalación, emisión ni cambio Production.

#### 26/10/2026 — Consulta/aplicación NC HTTP y cliente durable (local)
APLICACION_NC sólo lee por caso sin caja actual; APLICAR_NC exige caja explícita y servicio privado con CAE/cuerpo/roles/gates. Cliente pendiente por identidad/hash/caja, GET como confirmación, reintento explícito y bloqueo de otras mutaciones NC hasta recuperar. Evidencia en ExecPlan ARCA:243 regresiones,17 enfocadas HTTP/cliente/SQL (solapadas),10 finales del cliente. UI de aplicación todavía pendiente; sin nuevo SQL/SDK/activación remota, emisión ni Production. Gate hospedado/GO-NO-GO permanece abierto.

#### 26/10/2026 — Interfaz aplicación NC local, deshabilitada por defecto
Panel con consulta explícita, caja/confirmación para nueva aplicación y recuperación de pendiente original sin caja actual. Borrador histórico ya no afirma sin emisión; sólo receipt durable muestra devolución registrada y oculta mutaciones del caso. POS refresca productos/caja/historial por lectura después de confirmar, sin incrementos optimistas ni repetición por error de refresco. Flag VITE_KIOSKO_ARCA_APLICACION_NC_HOMO subordinado a strict/revisión/casos, default cerrado/no activado remotamente.135 pruebas UI/cliente/gates PASS; build/lint sin errores (avisos previos). Evidencia detallada en ExecPlan ARCA. Validación visual/hospedada y circuito controlado de envío/conciliación NC siguen pendientes; sin instalación, emisión ni Production.

### 26/10/2026 — Inventario final del cierre local (pendiente de CODE REVIEW / GO)
Esta adenda conserva los estados y la evidencia históricos. No constituye GO de instalación ni acredita aceptación hospedada. El inventario se deriva de los archivos locales; antes de instalar debe corresponder al commit final revisado. Se incorpora053 porque el ensamblaje HTTP necesita descubrir un permiso privado existente por cuerpo/revisión; no lo crea ni activa.

#### SQL fiscal candidato001–053
Aplicar secuencialmente, una migración por transacción, sobre los prerrequisitos verificados. Detener ante el primer error; no saltar números ni continuar con esquema parcial. Los hashes permiten detectar mezcla de versiones; no reemplazan revisión de permisos, RLS y contratos. SHA-256 calculado sobre el contenido Git canónico (LF), sin alterar otros bytes. Para verificar en Windows, usar el blob del commit aprobado o normalizar únicamente CRLF a LF antes del hash; no comparar contra el hash bruto de un checkout con autocrlf. No se cambiaron los SQL históricos para ajustar sus finales de línea.

| Orden | SQL | SHA-256 |
| --- | --- | --- |
| 001 | `001_fiscal_journal.sql` | `18ebe5f6108d87cb06bf767e943c16375124f420bf7b0785a26f6d9ee35a8269` |
| 002 | `002_fiscal_reservations.sql` | `f0d72fd59e37cd06ac287143aa0b12de07c1a1f1aca2df6a8b0c93ff3c3bb6f8` |
| 003 | `003_fiscal_requests.sql` | `f4cadb58f71af6cfc3b18387a31e3a4a1f461955b22a528930f13d235ab4c7d4` |
| 004 | `004_fiscal_reconciliation.sql` | `634b1cac09b29a7ec407aab141a7ea026118a9a670288e37dce852c69a574539` |
| 005 | `005_fiscal_worker_authorization.sql` | `f4013d6c3c3644a0ace6283413ce08df9d2a8d65c9fcd80868971bb51f96aaad` |
| 006 | `006_fiscal_shared_tickets.sql` | `de141fb5c052a58c074d6a6c8f8beb8cb2483d7ccbf1928a42de56c9d47a288c` |
| 007 | `007_fiscal_ticket_recovery.sql` | `0542a554b97fc73689b7cbe5b15b4a05cf4081548910b2c1a0e704a08e8dd049` |
| 008 | `008_fiscal_ticket_ownership.sql` | `48ffdff74b4dab45bf2a55bbc8eb75af779b777a74b421d9d05ac0090ed8c86e` |
| 009 | `009_fiscal_emission_permission.sql` | `c8850691bfc16846620c8fae3f4af839fd2197290e1866a5195c0999a3b9fd37` |
| 010 | `010_fiscal_return_exclusion.sql` | `29eefe18d181170be54f2c01c9d52d3043d7046a93850d09eb8ceaff10cda1be` |
| 011 | `011_fiscal_owner_review.sql` | `78bb79cc5d7af51f5df5c1d2beb2ab15dd6cf503ff4ce9730da1c44883d6c4bf` |
| 012 | `012_fiscal_preparation.sql` | `c7bc167f40baea80735935e4e39e4228ae48a30a5bd8bd0537787ba2b4643e07` |
| 013 | `013_fiscal_preparation_source.sql` | `67d6bd91f43fdbf60a0f200312c1182b1475150586a8e3018aa6acc1beb25d43` |
| 014 | `014_fiscal_receipt.sql` | `32acc5a1a028153718e95557607db30dfc845104dd78fdd9c05bf2903a7cad86` |
| 015 | `015_fiscal_emission_receipts.sql` | `47655feeee347b617f90d46801002dcffa13cc31a6e9b05eb3bd97f1b73d0774` |
| 016 | `016_fiscal_diagnosis.sql` | `0b0d8141b9cb2c7f4e53ab966e0f6a3b8f11b5234e63acee843c5e33c5ec6fa2` |
| 017 | `017_fiscal_preparation_cancellation.sql` | `58df539e1b0c0ebc89f3f1dbdc772a6935365009176573108a937bece819f4d2` |
| 018 | `018_fiscal_reserved_replacement.sql` | `3d3c3999068e3dff09881b1712696e626c91b20bbba1ee8acfe1a3fb780e7221` |
| 019 | `019_fiscal_rejected_correction.sql` | `c883d990d7ec3ff8a26292755243b831caba42c2a032db7b8cffd566b40e0e74` |
| 020 | `020_fiscal_reconciliation_actor.sql` | `6a5dc6d79d70ac4b13c41a295b186a7208d378ed9c365a473c93d569bd6843ee` |
| 021 | `021_fiscal_observation_receipt.sql` | `7c100aef25a359d06c6631b3c836cd310bd509a9f7c8a448458cb23d91b2ee8a` |
| 022 | `022_fiscal_presentation_facts.sql` | `7d9767116ec7cfbb62155b937bb026b048e99d1dca91d23be54ee8770a4fb8a2` |
| 023 | `023_fiscal_presentation_review.sql` | `314e2015d91d288932392af9c186f2647c14fefe9ede77d0a1d589f86b83f134` |
| 024 | `024_fiscal_presentation_source.sql` | `6d1827fa94d0b8e959ef184cffb393748f5fda427d36b7def0d4406f0990cfad` |
| 025 | `025_fiscal_required_presentation.sql` | `f4659791887716045654f6817208bb054d8ea084096f222d37048286d5b6dd89` |
| 026 | `026_fiscal_representation_source.sql` | `a826015cbbebcc3bb9444084e3810c04608745be3a880a8d658a173c2161e40d` |
| 027 | `027_fiscal_credit_drafts.sql` | `fdf0c3fcedea926f3a0a300916104f356dc764aa7a722598a8ad82c3c04347ab` |
| 028 | `028_fiscal_credit_abandonment.sql` | `726ee1db89c49d8a4f2b70dbd1102317f70d48c82fc2e7c9cb020fa58a396f89` |
| 029 | `029_fiscal_credit_history.sql` | `d1a95eb4da912a8040a35a16b721cf6b04aa0581a14070dd473870aa2c68ccd0` |
| 030 | `030_fiscal_credit_commercial_source.sql` | `fa8250552308d7bf2e4e726c1f17b4efb0e2aedb4c24ac6032337cfddf652c09` |
| 031 | `031_checkout_unit_evidence.sql` | `5c8ab2d0862c79b23e18980e247caa1f157eec8e8edfd79376c3c93cae3ddf31` |
| 032 | `032_fiscal_credit_commercial_binding.sql` | `8d398b0b614a4ec279b2870cf4046f0d565afc4a1736594e981947724a63339e` |
| 033 | `033_fiscal_credit_context.sql` | `6c5a0ca9097f1b2cfdfc0159b0a7550fd94aaa3cf2f1427ace697986b059ba9b` |
| 034 | `034_fiscal_credit_context_source.sql` | `525ca856f4d0510b84e7160fb81c81c4c8eaedef9f4db69c1c19def8971b91fd` |
| 035 | `035_fiscal_credit_preparation.sql` | `5613144ee8776724529a8368ce23635b648dd7fa8f7a3345a37a31b1279b8af3` |
| 036 | `036_fiscal_credit_reservation.sql` | `349da7c2210960609de3304c97dfa1b1235ce1a917481395b7b9b19057c74dd1` |
| 037 | `037_fiscal_credit_request_source.sql` | `4aa8f16f5cf91a13d4fba82412aeaf7b0b566ac86ba98e668634901772a2f665` |
| 038 | `038_fiscal_credit_number_source.sql` | `e116a7a608b8d1f6880e02f91ebeaf38a1fe8d47e852e03d741dc0d9e20f804f` |
| 039 | `039_fiscal_credit_ticket_coordination.sql` | `661cb1899e2d8b9d756bdcbfc8894aa0c365bf48d3958caad320784173716d51` |
| 040 | `040_fiscal_credit_owner_review.sql` | `7d04e3e761a801f25b40ea37f91cb0725d2bca7b8fee46a980cdcacbe625f88e` |
| 041 | `041_fiscal_credit_emission_permission.sql` | `7115e97c5e575eea3acb1e4b0ff51604dde6bd5050389c47575e3417ef2685ee` |
| 042 | `042_fiscal_credit_send_intent.sql` | `fa181c2a6d7edf0877b30c8590e40895e2135912d4e3fd04d6bf29860809958a` |
| 043 | `043_fiscal_credit_send_source.sql` | `1f4f4ac7b13a6c9a83997e56b60eed09add14c1fcc1a12bc37d6ae5608f52bf7` |
| 044 | `044_fiscal_credit_send_ticket_coordination.sql` | `dc53f61799d4de43b41b89ef7bb7dc982c5cb80cd762294ddefd78950aa9e452` |
| 045 | `045_fiscal_credit_consult_source.sql` | `17e62646022c26f63159f84579e6a73867ce30eda978aceea47b5a85f1788ac9` |
| 046 | `046_fiscal_credit_consult_ticket_coordination.sql` | `027d7961108dd0526176277a722f8ee41eccecd8349d32c653088dd931f1f21f` |
| 047 | `047_fiscal_credit_consultation_journal.sql` | `e81b7bdec7680479f2fdfafe10a0b09f1350d981bef0249897710ed037396b25` |
| 048 | `048_fiscal_credit_conflicts.sql` | `5caeaaf0e8e59438c863d8da52fe5b7d059b6bf5b4e109f919b0cb737d30f2c1` |
| 049 | `049_fiscal_credit_send_responses.sql` | `f20bef56ae83fe6f5532dd486d97b0dcf18c37f7574ab863396b3f6fd05b6528` |
| 050 | `050_fiscal_credit_authorized_resolution.sql` | `7ba2a71462206171cc66e9d2636433a08c268432fc338d6bce7ecdc5c3c72873` |
| 051 | `051_fiscal_credit_commercial_plan.sql` | `62e5f3931b901c8b67f9453336f6854ec4f27d039e17ff988a37e574c544f37a` |
| 052 | `052_fiscal_credit_commercial_application.sql` | `19a17229d2debfb2f7d61b355819ea31fa48bf982dbb8c9457feb0703080c066` |
| 053 | `053_fiscal_credit_permission_lookup.sql` | `f2e1d7f678b32936a60f104e1aad1ff167d832721114884966dd1aa6551adccd` |

#### Edge del bloque fiscal
Única función fiscal nueva: `arca-homologacion` (`supabase/functions/arca-homologacion/index.ts`), con sus módulos privados `_shared`. No desplegar la implementación heredada `afip-wsfe`. Las funciones comerciales/POS ya instaladas forman parte del baseline y no se redepliegan automáticamente por este bloque. Se debe verificar ese baseline antes del GO.

#### Secrets requeridos (nombres, nunca valores)
- `SUPABASE_URL` (entorno gestionado, debe identificar exclusivamente Staging).
- `SUPABASE_SECRET_KEYS` (mapa gestionado con entrada `default`; sólo backend, no key pública ni service key en Vite).
- `ARCA_HOMO_TA_ACTIVE_KEY_ID`.
- `ARCA_HOMO_TA_KEY_<UUID_SIN_GUIONES_MAYUSCULAS>` para la clave activa y las claves históricas necesarias para sobres aún vigentes.
- `ARCA_HOMO_CREDENTIAL_<UUID_SIN_GUIONES_MAYUSCULAS>_REVISION`.
- `ARCA_HOMO_CREDENTIAL_<UUID_SIN_GUIONES_MAYUSCULAS>_CERT_PEM`.
- `ARCA_HOMO_CREDENTIAL_<UUID_SIN_GUIONES_MAYUSCULAS>_KEY_PEM`.
- `ARCA_HOMO_CREDENTIAL_<UUID_SIN_GUIONES_MAYUSCULAS>_PASSWORD`.
Los UUID concretos se asignan y vinculan mediante provisionamiento privado autorizado; no deben adivinarse ni generarse desde el navegador. No se leyeron ni provisionaron valores reales para este inventario.

#### Flags privados independientes
Todos ausentes/false por defecto; requieren valor literal `true`, además de sus restantes guards. Ningún flag público sustituye estas autoridades.

- `ARCA_HOMO_BACKEND_ENABLED`.
- `ARCA_HOMO_DATA_PREPARATION_ENABLED` (nuevo control local desde 27/10: sólo guardado de datos, no reserva/consulta ARCA; requiere actualizar Edge bajo GO antes de atribuírselo al runtime hospedado anterior).
- `ARCA_HOMO_CREDIT_APPLY_ENABLED`.
- `ARCA_HOMO_CREDIT_CONSULT_ENABLED`.
- `ARCA_HOMO_CREDIT_DRAFTS_ENABLED`.
- `ARCA_HOMO_CREDIT_NUMBERING_ENABLED`.
- `ARCA_HOMO_CREDIT_PREPARATION_ENABLED`.
- `ARCA_HOMO_CREDIT_REVIEW_ENABLED`.
- `ARCA_HOMO_CREDIT_SEND_ENABLED`.
- `ARCA_HOMO_EMISSION_ENABLED`.
- `ARCA_HOMO_PREPARATION_ENABLED`.
- `ARCA_HOMO_RECONCILIATION_ENABLED`.
- `ARCA_HOMO_REJECTION_RECOVERY_ENABLED`.

#### Flags públicos del circuito
- `VITE_KIOSKO_PILOT_STRICT_SCOPE` (debe mantenerse true en el piloto).
- `VITE_KIOSKO_ARCA_REVISION_HOMO`.
- `VITE_KIOSKO_ARCA_CASOS_NC_HOMO` (requiere strict/revisión).
- `VITE_KIOSKO_ARCA_ENVIO_NC_HOMO` (requiere los anteriores; no concede permiso041).
- `VITE_KIOSKO_ARCA_CONCILIACION_NC_HOMO` (requiere casos, independiente del envío).
- `VITE_KIOSKO_ARCA_APLICACION_NC_HOMO` (requiere casos, independiente de envío/consulta).
Flags fiscales opcionales ausentes/false por defecto; no activados en remoto por este bloque.

#### Orden de instalación, sujeto a GO explícito
1. CODE REVIEW final sobre un único commit/inventario; respaldo privado verificable y plan de vuelta atrás. Confirmar Staging, baseline y prerrequisitos reales bootstrap/comercial/capacidades/devoluciones.
2. Instalar SQL001–053 en orden, después de los módulos base que referencian; verificar definición/ACL/RLS/SECURITY DEFINER/search_path, roles gestionados, restricciones y contratos. No inferir aceptación hospedada de PGlite/PostgreSQL local.
3. Desplegar sólo `arca-homologacion` del bloque fiscal, con flags de trabajo cerrados. Verificar gateway, CORS, JWT real, actor original, rol activo y aislamiento por comercio, incluidos rechazos.
4. Provisionar por canal privado los registros de emisor, catálogo fiscal y custodia/keyring estrictamente aprobados. No habilitar permisos de envío ni usar secretos reales sin autorización específica.
5. Activar por etapas y con autorización: backend base/lecturas; preparación/revisión/casos; numeración; consulta; envío de una operación exacta; aplicación comercial tras prueba de CAE. Envío, consulta y aplicación no se habilitan por arrastre.
6. Publicar frontend sólo en Staging con sus flags subordinados; aceptación E2E hospedada sin ARCA real primero. Comprobar reload, ACK perdido, doble clic y operaciones incompatibles con JWT/RLS reales.
7. Sólo después: autorización específica para comunicaciones ARCA y primera emisión homologada. Un candidato FECAESolicitar no acredita CAE: confirmar mediante FECompConsultar y luego resolver/aplicar exactamente una vez.
8. Production, credenciales productivas, merge y piloto comercial conservan sus gates independientes.

#### Vuelta atrás y recuperación
Cerrar flags de envío y aplicación y detener nuevas mutaciones; mantener recuperación histórica controlada cuando esté autorizada. Preservar diarios/cuerpos/reservas/consultas/candidatos/conflictos/resoluciones/aplicaciones y claves necesarias para su recuperación. No borrar intenciones ni liberar numeración por timeout/rechazo. No hacer DROP, reset ni restauración destructiva como rollback. JSON público de respaldo no sustituye el dump/restore privado fiscal; restauración integral continúa bloqueada hasta su aceptación autorizada.

Prerrequisitos concretos del candidato053 (verificar instalados y compatibles, no reinstalar a ciegas): manifiesto bootstrap43 (`001_domain.sql`, `002_identity_helpers.sql`, `steps/*` y `900_final_security.sql`); `supabase/bootstrap/commercial/001_commercial_subscription.sql` y `002_commercial_write_gate.sql`; `supabase/bootstrap/pilot-operations/001_capabilities.sql`; `supabase_fase_devolucion_registro_privado.sql`, `supabase_fase_devolucion_calculo_historico.sql`, `supabase_fase_devolucion_preparacion_privada.sql`; `supabase/bootstrap/returns/001_atomic_cash_return.sql` y `003_whole_unit_quantities.sql`. El baseline POS/checkout/stock/caja debe verificarse por su instalación real y no sólo por estos prerrequisitos mínimos del ensayo fiscal. El runner local intercala fases históricas para probar transiciones; su orden de fixtures no es un instalador remoto.

Detalle de baseline Edge según configuración versionada (no acredita instalación remota): `checkout-manual`, `supervisor-pin`, `provision-user` y `provision-commerce`; todas con `verify_jwt=true`. `arca-homologacion` también conserva `verify_jwt=true`; no desactivar gateway para resolver una prueba. Único despliegue fiscal nuevo previsto por este bloque: `arca-homologacion`. Adaptador backend:70RPC explícitas; ninguna llamada RPC arbitraria desde navegador.
Configuración pública de conexión que debe verificarse en el baseline, sin provisionar valores en este bloque: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (`VITE_SUPABASE_ANON_KEY` sólo como compatibilidad heredada). Flags POS existentes que deben conservar su propio gate: `VITE_CHECKOUT_MANUAL_TRANSACCIONAL`, `VITE_KIOSKO_ENVASES_TRANSACCIONAL`, `VITE_KIOSKO_DEVOLUCIONES_EFECTIVO`; no se activan por habilitar la revisión fiscal ni habilitan por sí mismos aplicación NC. Configuración pública nunca contiene `SUPABASE_SECRET_KEYS` ni material ARCA.

## SQL fiscal instalado y verificado en Staging — 26/10/2026

Con el GO específico del titular y respaldo privado verificado, se instalaron
SQL001–053 de `9054cce410ae26b123f151bee2f1ad56c10767bd` únicamente en
Staging `acoyfwwmhaeruciyedri`. Cada archivo se pegó completo, se comparó con el
source normalizando sólo CRLF/LF y devolvió su marcador posterior al COMMIT.
El diario local `../staging-fiscal-install-9054cce.json` conserva 53 confirmaciones.
No se modificó el source fiscal durante la instalación.

Verificación hospedada READ ONLY/ROLLBACK contra inventario derivado del source:
126 funciones, hash SHA256 de cada cuerpo, SECURITY DEFINER y permisos efectivos
anon/authenticated/service_role; una sobrecarga por nombre; 41 tablas con RLS y
sin permisos directos de tabla/columna para esos tres roles; 41 triggers habilitados.
Resultado: **0 diferencias**. Las70RPC del adaptador privado existen, ejecutables
por service_role y no por anon/authenticated. Cero SECURITY DEFINER públicos
accesibles a anon; cero filas en las41tablas fiscales. No se creó emisor, custodia,
solicitud, revisión, permiso, intención, CAE ni aplicación comercial.

La primera versión del verificador reportó seis diferencias de permisos esperados:
no modelaba que CREATE OR REPLACE conserva ACL. La consulta detallada confirmó
cuerpos idénticos y grants previamente declarados (cinco privados de service_role
y confirmar_devolucion_efectivo_piloto de authenticated según returns003).
Se corrigió sólo el verificador y se repitió: 0 diferencias. No se ajustaron grants
remotos para hacer pasar el control. El aviso RLS de SQL027 era del análisis estático
del editor: el SQL original habilita RLS mediante EXECUTE y se comprobó instalado.

Evidencia local: `../staging-fiscal-verification-final-9054cce-ax.txt`,
`../staging-fiscal-readiness-9054cce-ax.txt`, sus PNG y consultas de verificación.
Esta prueba de esquema/permisos no sustituye JWT/RLS/E2E con actores reales,
aceptación de Edge, restore aislado ni primer CAE. PR02/PR03 y PR07 siguen abiertos.

**Siguiente gate:** autorización independiente para desplegar únicamente
`arca-homologacion` con verify_jwt=true y gates privados cerrados, sin provisionar
credenciales ARCA ni activar flags ni Vercel. Preparar aceptación negativa de
Auth/CORS/gates antes de cualquier provisioning o envío. No desplegado aún.
Production/master/merge/ARCA real/CAE: sin acciones en este bloque.

### Edge de Staging desplegada con gates cerrados — 26/10/2026

Con autorización específica se desplegó únicamente arca-homologacion desde el
código fiscal de bac8ac1. Paquete privado reproducible:74módulos,341976bytes,
imports npm fijados y coincidencia completa del código remoto. Verify JWT ON.
Pruebas hospedadas:401sinJWT/401JWTinválido,204preflightStaging,403origenajeno y
503HOMOLOGACION_NO_HABILITADA mediante probador oficial. DB posterior:41tablas
fiscales vacías y70RPC privadas restringidas. No flags, secretos ARCA, Vercel ni
emisiones. Fuentes/evidencia/límites en el ExecPlan fiscal. Siguiente pendiente:
JWT Auth reales (incluida compatibilidad ES256 con gateway), roles/comercios y
RLS/E2E; el probador oficial no sustituye esa aceptación. No cambiar gateway,
claves, flags ni provisión privada sin su gate. PR02/PR03 siguen abiertos.

### Comprobar JWT Auth real con la función todavía cerrada

Ejecutar en Windows:

```powershell
powershell -NoProfile -File "C:\Users\jonat\Documents\Codex\2026-10-16\referenced-chatgpt-conversation-this-is-an\work\commercial-subscription-backend\scripts\comprobar-jwt-fiscal-staging.ps1"
```

El titular copia la clave **Publishable** de Project Settings → API Keys del
proyecto kioskopos-staging (también se admite anon legacy del mismo proyecto).
No usar una clave secret/service_role. Introducirla sólo en el prompt local;
después introducir correo y contraseña de una cuenta KioskoPOS de ensayo, por
ejemplo prueba1@gmail.com. No es la contraseña PostgreSQL ni la de la cuenta web
Supabase. No enviar claves o contraseñas al chat. -Preparar no conecta ni pide datos.

Comunicar sólo las líneas JWT_GATEWAY_* y TEST_SESSION_*: salida0 significa
JWT aceptado por gateway y backend cerrado, salida2 significa rechazo401, salida1
no confirma el ensayo o su cleanup. No repetir automáticamente si el cierre de
sesión falla. Nunca desactivar JWT ni rotar claves para sortear un rechazo.
La prueba cierra sólo su sesión Auth de ensayo (scope=local); no guarda tokens.
Aun con PASS, Dueño/Cajero/otro comercio, RLS y E2E siguen pendientes de aceptación
propia; no activar flags ni aprovisionar credenciales ARCA por este resultado.

El diagnóstico de login ahora añade una categoría segura y statusHTTP, por
 ejemplo `[CREDENCIALES_RECHAZADAS] status=400`, `[CLAVE_PUBLICA_RECHAZADA] status=401`,
`[CORREO_NO_CONFIRMADO]`, `[LIMITE_DE_INTENTOS]` o `[TIEMPO_AGOTADO]`.
Comunicar sólo esa línea, nunca el cuerpo externo. Una categoría desconocida no
prueba contraseña incorrecta. No repetir automáticamente ni restablecer claves
por un fallo genérico. El cuerpo Auth usa bytesUTF8 explícitos (probado con Unicode).

### JWT real de Staging confirmado — 26/10/2026

El titular acreditó con prueba1@gmail.com:JWT_GATEWAY_PASS_BACKEND_CLOSED,
algES256/status503, y logout local de la sesión de prueba confirmado. Gateway y
compatibilidad real de ese JWT:PASS; sin cambiar claves/verify_jwt/flags.
Actor/roles/SQL-RLS/E2E siguen pendientes: el gate cerrado se ejecuta antes de
esas comprobaciones. Próximo gate: autorización independiente para habilitar
sólo el backend base temporalmente y ejecutar aceptación de cuentas de ensayo,
con resto de flags cerrados y sin emisores/custodia/ARCA/Vercel/Production.
Detalles y límites en el ExecPlan fiscal. No inferir primer CAE ni readiness total.

### Acceso temporal preparado — 26/10/2026

El titular autorizó únicamente el backend base temporal y pruebas de acceso,
volviendo `ARCA_HOMO_BACKEND_ENABLED` a `false` al terminar. No autoriza otros
flags, mutaciones fiscales/comerciales, credenciales ARCA, emisiones ni Vercel.
La inspección del panel de Staging confirmó que no hay custom secrets `ARCA_*`;
el gate base sigue ausente/cerrado. No se habilitó durante la preparación.

Para coordinar el ensayo sin dejar el backend abierto esperando un login:

```powershell
powershell -NoProfile -File .\scripts\comprobar-jwt-fiscal-staging.ps1 -ComprobarAccesos
```

Ingresar clave pública, correo y contraseña sólo en las solicitudes locales.
Usar la cuenta de ensayo Dueño/Cajero activa, no SuperAdmin. El asistente verifica
la identidad mediante Auth `/user`, consulta sólo su perfil y comprueba rechazo403
al acceso directo a `fiscal_operaciones_homologacion` con `limit=0` (sin filas).
Al ver `ACCESS_PROBE_READY`, avisar a Codex inmediatamente, conservando la consola
abierta. Durante un máximo de10min/120lecturas espera la activación previamente
autorizada. No cambia ningún flag por sí mismo. Sólo envía la consulta fija
`DATOS_FISCALES_VENTA` con UUID centinela nulo; no invoca guardados, permisos,
reservas, WSAA ni WSFE. Un fallo de red termina el ensayo, sin reintento de login.
Finalmente solicita logout scope=local de su sesión en todos los casos.

`AUTH_PROFILE_CONFIRMED` acredita identidad/perfil observados;403 acredita el
rechazo directo de esa tabla, no todas las policies RLS. Un409 genérico
`BASE_READ_NEGATIVE_OBSERVED` sólo acredita la respuesta negativa con gate abierto:
no distingue fallo de actor/RPC/servicio privado, por lo que requiere evidencia
adicional antes de cerrar aceptación hospedada. No es acceso positivo ni E2E.
Codex debe cerrar el gate en el mismo turno de activación y verificarlo, aunque
el asistente falle o el usuario todavía no haya comunicado el resultado.

### Dueño real: acceso negativo y cierre confirmados — 26/10/2026

Ensayo realizado con8595c44: Auth/perfil OWNER y rechazo directo403 de la tabla
privada confirmados. Gate base true18:14:59→false18:15:31 (hora Argentina), resto
de controles cerrados. Consola: BASE_READ_NEGATIVE_OBSERVED409 y logout local
confirmado. Registros del servidor corroboran Auth200 desde runtime Deno, RPC
privada cargar_datos_preparacion_homologacion403 y PostgreSQL42501. Por tanto,
la ruta privada se ejecutó y rechazó el caso; no fue sólo un409 sin contexto.
Después del cierre, probador oficial503HOMOLOGACION_NO_HABILITADA, JWT ON y digest
del flag coincide con SHA256(false). Sin modificaciones de datos fiscales o
comerciales solicitadas, ARCA, provisión, otros flags, Vercel ni Production.

Aceptación parcial: falta Cajero, otro comercio y flujo positivo/E2E. El caso con
UUID nulo no acredita separación entre dos ventas reales ni disponibilidad de
emisor/catálogo. No volver a ejecutar login Dueño para repetir la misma evidencia.
Titular no dispone de cuenta Cajero para el siguiente caso; preparar su alcance
y solicitar autorización específica antes de crear o reasignar una identidad.
Detalles, horarios y artefactos en el ExecPlan fiscal.

### Cuenta Cajero preparada — 26/10/2026

prueba2@gmail.com ya existe en Auth y tiene un único perfil CAJERO activo,
noSuperAdmin, vinculado al mismo comercio aislado del Dueño. Alta de contraseña
realizada por el titular; perfil nuevo insertado con guards y verificado después
en transacción independiente READ ONLY. No se reasignó una cuenta existente.
La falta de cuenta Cajero documentada antes queda superada; no acredita login.

Ejecutar el mismo asistente `-ComprobarAccesos` con prueba2@gmail.com y su
contraseña ingresada sólo localmente. Debe informar role=CASHIER y rechazo403
de tabla privada, luego ACCESS_PROBE_READY. Avisar inmediatamente y mantener
la consola abierta. Codex aplicará la ventana base temporal ya autorizada y
volverá a false antes de terminar; no otros flags, provisión ARCA ni mutaciones
fiscales/comerciales. Correlacionar el409 con registros privados, igual que para
Dueño, sin convertir un rechazo en aceptación positiva/E2E completa.

### Cajero real comprobado — 26/10/2026

Ensayo PowerShell role=CASHIER confirmado: tabla privada limit0 rechaza403;
ventana base21s; backend verifica Auth200 y RPC privada rechaza403/42501;
consola409 y logout local204 corroborados. Gate nuevamente false, JWT ON,
probador oficial503HOMOLOGACION_NO_HABILITADA. Otros controles cerrados, sin
provisión ni llamadas ARCA. No confundir con la ventana anterior sin asistente.

Dueño y Cajero tienen evidencia real de sus casos negativos. Sigue pendiente
aislamiento entre comercios con controles positivos y, después, aceptación
fiscal positiva/E2E con fixtures/provisión autorizados. No repetir consultas
centinela para sustituir esos criterios. Historial completo en el ExecPlan fiscal.

### Lectura de ventas entre comercios: asistente preparado — 26/10/2026

Modo `-ComprobarAislamiento` del asistente existente, independiente del modo
`-ComprobarAccesos` (no combinarlos). No abre una ventana ni llama Edge/ARCA:
únicamente login/logout de su sesión, Auth/user, perfil propio y tres GET de
ventas con columnas id/kiosco_id. No solicita ni muestra importes o clientes.

El inventario READ ONLY confirmó dos fixtures activos existentes: «Ensayo envases
devoluciones 7faa9ea4» con10ventas completadas y «F4A_TEST_20261011_R1» con7ventas.
La venta ajena00418e7b-eca6-487c-bffe-b85b405cd9cb existe en el segundo. No se
crearon datos ni se reactivaron comercios suspendidos. El asistente exige que el
perfil sea Dueño/Cajero activo/noSuperAdmin del primer comercio; rechaza otro
comercio incluso si tiene acceso legítimo a sus propios datos.

Control positivo: una venta COMPLETADA propia visible. Control negativo: GET de
la venta ajena por id, deliberadamente SIN filtro de comercio, debe devolver200
y lista vacía. Segundo positivo: la venta propia sigue visible con la misma
sesión. Un403, lista propia vacía, fila ajena visible, JSON inválido, fallo de red
o pérdida del segundo positivo hace fallar el ensayo y solicita logout local.
No imprime ids, tokens, clave pública, contraseña ni cuerpos externos.

Ejecutar una vez como Cajero y otra como Dueño, ingresando credenciales sólo
localmente. Comunicar RLS_SALES_READ_ISOLATION_OBSERVED y TEST_SESSION_LOGOUT_*.
Luego Codex debe revalidar en lectura independiente que la venta ajena sigue
existiendo en el comercio esperado: una fila borrada no demostraría aislamiento.
El marcador OBSERVED no es por sí solo PASS hospedado. Alcance final, si pasa:
lectura de ventas de estos actores/fixtures; no todas las policies/tablas ni E2E
fiscal positivo. Mantener backend base false y demás gates cerrados.

### Aislamiento SELECT de ventas acreditado — 26/10/2026

Dueño y Cajero ejecutaron108e797 y observaron own1/foreign0/positive_recheck1,
con logout local confirmado. Revalidación independiente posterior confirmó la
existencia de la venta ajena exacta en F4A activo,10ventas propias completadas,
roles/scope correctos y RLS de ventas habilitado. Este caso de lectura entre
comercios queda PASS real con el alcance definido; no todas las policies ni E2E
fiscal. Backend base y demás gates siguieron cerrados. No hay que repetirlo como
requisito pendiente salvo cambios de código/datos/policies que lo invaliden.

Siguiente gate: contexto/preparación fiscal positiva y revisión, con emisor y
catálogo explícitos autorizados. La autorización de lecturas/rechazos no permite
aprovisionar esas filas o secretos ni habilitar mutaciones. Preparar el alcance
concreto antes de pedir ese GO; no adoptar el PV2 ni IVA antiguos por defecto.

### Fuentes reales del catálogo fiscal: consulta local preparada — 26/10/2026

La preparación positiva exige emisor habilitado y fiscal_parametros_homologacion
vigente (SQL012); ninguna aceptación negativa/RLS crea esas dependencias.
Se amplió únicamente el diagnóstico local existente, sin cambiar SQL/Edge:

- `FEParamGetTiposIva`: ids/descripciones y fechas originales.
- `FEParamGetCondicionIvaReceptor`: ids/descripciones y Cmp_Clase original,
  sin filtrar ClaseCmp para obtener las combinaciones informadas por ARCA.

Contrato consultado en páginas oficiales de homologación:
https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetTiposIva y
https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetCondicionIvaReceptor.
Se usa el nombre publicado del método, no la variante errónea FrenteIva del
ejemplo de algunos manuales. No transformar automáticamente clases a tipos1/6/11
ni elegir condición/IVA/PV para una venta: primero revisar evidencia real.

`scripts/probar-wsaa-homologacion.ps1 -CatalogosPreparacion -Conectar` requiere
certificado/clave cifrada/protección DPAPI originales, CUIT representado y
`-DirectorioCatalogos` existente. Obtiene un único TA de wsfe en memoria y realiza
una lectura de cada método, sin reintentos. No ejecutarlo sin el GO específico
de uso de claves y consultas externas. No llama FECAESolicitar/FECompConsultar,
no emite comprobantes ni usa claves productivas. Backend Staging sigue cerrado.

Exportación de dos JSON nuevos con nombre único: sólo campos públicos parseados,
entorno/origen/método/fecha UTC/hash SHA256 de respuesta. Sin XML crudo, CUIT,
Token/Sign, PEM o contraseñas. Fuente con filas acotadas, forma/campos estrictos,
ids válidos, descripción acotada, fechas válidas y duplicados rechazados.
Exportador rechaza campos que contengan el Token/Sign en memoria y nunca
sobrescribe archivos. Cmp_Clase se conserva como dato, no como permiso fiscal.
Los JSON incluyen importado_en_staging=false/emision_habilitada=false.

Si falla la segunda consulta/exportación puede quedar el primer JSON público:
es evidencia parcial, no un catálogo completo. Sólo
CATALOGOS_PREPARACION_EXPORTADOS=true y salida0 confirman ambas exportaciones.
No importar ni activar emisores/flags por ese marcador. El modo individual
admite `-SalidaParametros` para estos dos métodos; los modos previos de puntos
y tipos de comprobante conservan su comportamiento. Requiere PowerShell7.4+.

Siguiente GO propuesto: una autenticación WSAA y exactamente dos consultas WSFE
en homologación con certificado original/CUIT representado ya autorizado,
guardando sólo la evidencia pública local. No cargar nada en Supabase/Vercel,
no abrir flags ni provisionar custodia/emisor/catálogo, sin emisiones o Production.

### Consulta real de ambos catálogos completada — 26/10/2026

Con GO específico,174441c obtuvo un único TA WSAA y consultó los dos métodos:
FEParamGetTiposIva6registros y FEParamGetCondicionIvaReceptor11registros, PASS.
Exportación conjunta/salida0 confirmadas,0comprobantes emitidos. Par original
certificado/clave verificado; sin rotación ni credenciales impresas/persistidas.

Evidencia pública local fuera de Git:
../arca-parametros-homologacion-20261026-edce7a368bf6424e8cd161300f9327d8/,
dos JSON y manifest-publico.json con SHA256 verificados. Clases originales
A/ALEY/C, B/C y C/49 conservadas para revisión; no normalizadas automáticamente.
Los datos permanecen importado_en_staging=false/emision_habilitada=false.

No Supabase/flags/Vercel, consultas de puntos/numeración, CAE ni Production.
Token/Sign sólo en memoria del proceso ya terminado. El GO de estas consultas
está consumido; no repetirlo ni reutilizar un TA inexistente en memoria local.
Falta preparar importación revisable, acreditar el punto y autorizar provisión/
aceptación positiva. No convertir obtención de parámetros en preparación o
emisión completadas. Evidencia y límites en ExecPlan fiscal.

### Propuesta inactiva de parámetros — 27/10/2026

`scripts/plan-fiscal-parameters.mjs CONFIG_JSON NUEVO_DIRECTORIO` transforma sólo
las dos evidencias públicas revisadas. CONFIG_JSON exige projectRef, ivaPath,
conditionPath, ivaSha256, conditionSha256, expiresAt UTC y revision explícitos.
No contiene credenciales. Es offline; nunca conecta ni instala. Rechaza destino
ajeno, hashes/forma inválidos, clases desconocidas, fuentes de 24h o más y
vencimientos que crucen el día argentino de evaluación. Produce SQL inactivo y
manifiesto con procedencia/exclusiones; no sobrescribe un directorio existente.
Si falla la escritura puede quedar un borrador parcial: no constituye carga
confirmada y no debe ejecutarse. Revisar ambos archivos antes de cualquier GO.

Sólo A/B/C se convierten a tipos 1/6/11; ALEY/49 se conservan como exclusiones.
No selecciona el IVA de productos ni acredita el punto de venta. El SQL exige
GO/hash/destino explícitos y baseline vacío, además de revisar vigencia en DB;
los ajustes de sesión no reemplazan comprobar el proyecto real. La autorización
de consulta consumida no habilita ejecutar este SQL, importar o activar filas.
Propuesta real local, hashes, vencimiento y pruebas en ExecPlan fiscal.

### Carga inactiva verificada — 27/10/2026
Con GO separado, la propuesta e98225f se cargó una vez en Staging: revisión1, 6 alícuotas/11 condiciones, habilitado=false. Relectura independiente: exact_match=true, RLS=true, acceso directo cerrado, emisores=0. Vence 27/10 18:59 Argentina. No editar ni activar por inferencia; el historial de propuesta conserva sql_executed=false y la ejecución real consta en ExecPlan. No se usaron claves/ARCA ni se cambiaron flags o Vercel. Punto de venta, emisor/custodia y aceptación positiva siguen pendientes.

### Consulta de numeración explícita, sin emisión — 27/10/2026

Modo local `-ConsultarUltimo -PuntoVenta N -TipoComprobante T` del asistente
WSAA. Requiere `-Conectar`, servicio wsfe y CUIT representado explícito; no se
combina con consultas de parámetros ni exportaciones. Puntos1..99998, tipos
1/6/11, sin valores por defecto ni redondeo de fracciones. Antes de DPAPI valida
la forma/modo. Después de un único WSAA ejecuta una sola FECompUltimoAutorizado,
sin retries. Respuestas fuera de alcance, inciertas,602 o SOAP inválidas fallan;
no interpretar ausencia/error como número0. No reserva número ni carga emisor.

Fuente del contrato: [operación oficial de homologación](https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECompUltimoAutorizado).
Incluso con número válido, informa PUNTO_HABILITADO=NOT_PROVEN: una lectura no
prueba que FECAESolicitar aceptará la emisión. El602 de listado sólo significa
sin datos, según [manual WSFE v4.0](https://arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf).
No extrapolar instrucciones de WSCT o alta productiva a este ensayo. Consulta
funcional de homologación: wsfev1@arca.gov.ar (manual p19); no enviada por agente.
Consultar o usar las claves originales exige un GO nuevo. No persistir ni
recuperar el TA previo; su expiración documentada no garantiza por sí sola
nueva autenticación disponible. Ninguna consulta real ejecutada por este cambio.

### Compatibilidad Windows/custodia — 27/10/2026
El preparador exige ahora mínimo16 caracteres, igual que el lector privado. Prueba cruzada con salida real del preparador .NET y certificado sintético verificó importación de RSA3072 no exportable y CMS válido en el backend; no usó material original ni red. Una clave histórica con contraseña de12–15 caracteres permanece bloqueada hasta revisión/reprotección privada expresamente autorizada. No pedir contraseña por chat ni rotar por inferencia. La preparación local no provisiona valores en Supabase; aceptación hospedada real sigue pendiente.

### Renovación del catálogo sin borrar historia — 27/10/2026

Para la primera carga, el modo inicial exige tabla vacía y revisión1. Para una
renovación, agregar a CONFIG_JSON baselinePath y baselineSha256 (ambos): archivo
público con snapshot completo revisado del catálogo y hash de sus bytes. Cada
fila contiene exactamente revision, condiciones, alicuotas, fuente_sha256,
consultado_en, vence_en, habilitado. Conservar fechas UTC exactas. No incluir
emisor ni secretos. Obtenerlo por lectura independiente del Staging correcto;
la herramienta no conecta ni lo descarga. No reutilizar un snapshot obsoleto.

La revisión nueva debe seguir al máximo del snapshot; fuentes más recientes y
no registradas. La propuesta queda vinculada también al hash del baseline.
Bajo lock, el SQL contrasta conteo y todas las filas/campos tipados antes de un
INSERT inactivo. Cualquier alta, activación u otro cambio desde la revisión
requiere un plan/GO nuevo; no corregir el guard manualmente ni borrar historia.
Fuentes vencidas no se renuevan editando fechas: requieren evidencia actual y
su consulta autorizada. Generar una renovación no autoriza importarla/activarla.
La fila1 de Staging no fue renovada ni modificada por este incremento local.

Lectura de snapshot propuesta (no ejecutada por el generador):
```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY revision),'[]'::jsonb) AS baseline
FROM public.fiscal_parametros_homologacion c;
ROLLBACK;
```
Verificar antes el proyecto autorizado; conservar el valor JSON sin alterar
campos/fechas y calcular SHA256 de los bytes del archivo. No usar un manifiesto
viejo como sustituto de esta lectura independiente. En SQL se comparan los
valores tipados, conservando precisión de fecha; no sólo sus conteos.

### Lectura real de serie en homologación — 27/10/2026

Con GO específico, una autenticación WSAA y FECompUltimoAutorizado para PV2/
tipo11 terminaron PASS; último observado0, sin reserva ni emisiones. Proceso
terminó y descartó TA de memoria. Expiración informada28/10 02:49:53.999Z;
no repetir LoginCms durante esa vigencia por falta de caché local. GO consumido.
Detalle, huellas y límites en ExecPlan. La lectura no prueba habilitación de
FECAESolicitar ni reemplaza la aceptación hospedada/custodia/autorización CAE.

### Gate separado de guardado y nuevo candidato cerrado — 27/10/2026

ARCA_HOMO_DATA_PREPARATION_ENABLED debe ser literaltrue para guardar datos de
preparación. HTTP lo comprueba antes de construir admin y el servicio vuelve a
comprobar destino/backend/gate inmediatamente antes de RPC, conservando Auth
original. Sin él permanecen legibles contexto y resolución histórica; no se
reserva ni consulta ARCA. El flag público de revisión no sustituye este permiso.
No implica que todas las acciones de la API base sean sólo lectura.

Este control todavía es LOCAL: el runtime remoto bac8ac1 anterior no lo conoce.
No habilitar emisor/catálogo para ensayo positivo antes de instalar/verificar
el nuevo candidato bajo GO específico y revisar los demás caminos de escritura.
No activar ningún flag nuevo por agregarlo al inventario.

Para empaquetar otro candidato ya commiteado, usar:
```text
node scripts/preparar-edge-fiscal-staging.mjs --source-commit COMMIT_COMPLETO --output DIRECTORIO_NUEVO
node scripts/verificar-paquete-fiscal-cerrado.mjs DIRECTORIO_NUEVO
```
Requiere commithex40, fuentes de funciones idénticas, sin fuentes fiscales no
versionadas y salida inexistente. No sobrescribe paquetes anteriores. Manifiesto
registra sourceCommit/hash/bytes/imports/módulos y JWT=true. Verificador coteja
hash/imports/destino antes de cargar un paquete sólo en simulación local con
fetch bloqueado y Deno.env sintético; no escribe dentro del paquete. Modo con
candidato agrega5casos de escritura cerrada con backend base habilitado y flag
de datos ausente/false/malformado; no debe leer claves privadas ni hacer red.
El modo histórico sin argumento del verificador conserva sus4casos anteriores.
Empaquetar/verificar no despliega y no autoriza provisión/flags/emisiones.

Adenda documental de la lectura de serie: el manual oficial WSFEv4.7
(01/09/2026), sección FECompUltimoAutorizado p127, documenta la validación11002
para el punto de venta habilitado en ese método. El ensayo real PV2/tipo11
respondió0 sin error y se registra como PV_SERIES_READ=PASS. No implica alta
productiva ni garantiza aceptación futura de FECAESolicitar. El diagnóstico
conserva NOT_PROVEN para esa garantía amplia. No reutilizar el0 como una
observación fresca para reservar numeración: el worker debe reconsultar bajo
su autorización. Fuente: https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf .

### Incremento local SQL054 — cierre de preparación heredada (27/10/2026)

El inventario instalado sigue siendo SQL001–053. El candidato agrega únicamente
`054_close_legacy_preparation_entry.sql`; no reinstalar ni editar las migraciones
anteriores. SHA256 del archivo:
`96a12b2f4738993af429c11deb539ff144b6dc04c2f381fee5fae3966e35b066`.

La función heredada de001 conservaba EXECUTE para authenticated. Aunque exige
Dueño propio y no emite, permite crear contexto fuera de los gates HTTP. SQL054
revoca ejecución de PUBLIC/anon/authenticated/service_role, verifica identidad y
hash del cuerpo original, exige la preparación privada012 y falla si quedan
otros ejecutores. No modifica cuerpo, datos, caja, stock ni flags. El propietario
PostgreSQL conserva su autoridad administrativa; no se pretende bloquearlo.

Orden candidato, sujeto a nuevo GO: respaldo verificable y revisión → comprobar
destino/baseline/ACL por lectura → aplicar sólo054 → verificar ACL, cuerpo e
historia → desplegar candidato Edge cerrado → verificar JWT/CORS/gates cerrados.
La autorización previa001–053 no incluye054. Si cambia el cuerpo o los permisos
privados esperados, detenerse; no adaptar el hash ni forzar instalación. Ante un
fallo dentro de la transacción se revierte la revocación. Después de COMMIT no
restaurar automáticamente el permiso vulnerable: cualquier rollback requiere
revisión y autorización específicas.

Verificación de permisos por lectura (transacción READ ONLY y ROLLBACK):
```sql
SELECT rolname,
 has_function_privilege(rolname,
 'public.preparar_operacion_fiscal_homologacion(uuid,uuid,uuid,jsonb)',
 'EXECUTE') AS legacy_execute,
 has_function_privilege(rolname,
 'public.guardar_datos_preparacion_homologacion(uuid,uuid,uuid,text,text)',
 'EXECUTE') AS private_prepare_execute
FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
```
Después de054: legacy_execute=false para los tres; private_prepare_execute sólo
true para service_role. Cotejar además owner, SECURITY DEFINER, search_path,
hash del cuerpo, ACL completa y ausencia de cambios de datos. Esto no sustituye
las negativas con JWT real bajo su GO ni acredita RLS/E2E fiscal completo.

Los12 casos locales pasan con bootstrap canónico y SQL001–012: negativas de los
tres roles, drift de cuerpo/owner/seguridad/search_path, rollback ante permisos
inesperados, idempotencia y preparación privada real. No se presentan como
instalación hospedada ni como nueva corrida de concurrencia de SQL001–054.
SQL054 permanece sin instalar; Edge nuevo permanece sin desplegar. Ningún nuevo
flag, secreto, emisor, Vercel, emisión o cambio de Production autorizado.
