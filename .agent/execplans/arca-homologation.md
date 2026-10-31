# ARCA — preparación de homologación autorizada

## Secuencia vigente — instrucción del titular del 28/10/2026

### 29/10/2026 — PR06: cierre local de dependencias

Cierre global final69628 exit0:5294 PASS/0 FAIL/1 skipped/332 archivos.
Se contrastaron todos los332 testfiles registrados: missing=[]. Informe
../pr06-dependency-closure-global-v2-20261029.json SHA256
6b6d82cd2209d127695e823333e18067f097f951d24bfd21c43cf2441236170b.
Supera los estados EN CURSO inferiores sin borrar la primera caída CLR ni el
recheck aislado. Misma fuente y maxWorkers2, sin supresiones ni cambio de timeout.
Auditoría0, build689, lint exit0/138 advertencias y bundle36/0 hits examinados.
Única omisión histórica F6 reviewed942 sigue omitida, no PASS. Parche listo para
publicación en Draft; no acredita aceptación hospedada ni cierra PR06/PR03.

Auditoría npm actual:2 paquetes con avisos, dompurify crítico y undici alto.
Árbol instalado: jspdf4.2.1→dompurify3.4.16 y jsdom30.1.2→undici8.11.2.
La auditoría histórica sin avisos se conserva, pero no acredita el estado actual.
Advisories de los mantenedores GHSA-cg2g-xh64-v4q7 y GHSA-2m5v-pch6-74hx
identifican versiones corregidas3.4.17 y8.12.2; npm marca fixAvailable=true.
Actualizar únicamente esos transitivos dentro de sus rangos existentes, sin
force, scripts de instalación ni nuevos paquetes directos. Revisar diff del lock,
auditoría posterior, PDF/sanitización, pruebas jsdom y build; ampliar la suite por
impacto transversal del entorno DOM. No afirmar explotación en KioskoPOS por
la sola presencia del paquete. No deploy remoto implícito ni cambios TLS/ARCA.
Informe previo ../pr06-dependency-audit-20261029.json; cierre aún pendiente.

Actualización instalada LOCAL: dompurify3.4.17 y undici8.12.3; sólo12 líneas del
lock cambiaron (versión/URL/integridad de2 transitivos), package.json intacto.
npm update con --ignore-scripts, sin force ni nuevas dependencias. Auditoría
posterior exit0:0 vulnerabilidades (antes2, una crítica/una alta), informe
../pr06-dependency-audit-after-20261029.json SHA256
375e585123bbc370a06ce116fb942291fca53939191d02e0193ed79ecae84d43.
Build689 PASS. Lint global exit0 con138 advertencias en archivos no modificados;
no se ocultan ni se presentan como ausencia de deuda. Bundle36JS sin los5 símbolos
privados examinados, ../pr06-dependency-bundle-check-20261029.json; no certifica
ausencia absoluta de secretos. Estado inicial de suite97671 EN CURSO conservado
como histórico; no se reinició por silencio.

Primer cierre global97671 exit1:5293 PASS/1 FAIL/1 skipped/332 archivos, todos
los332 testfiles registrados presentes, missing=[]. Falló únicamente Windows
preflight does not decrypt invalid DPAPI: proceso PowerShell termina3221225477
con «Fatal error. Internal CLR error. (0x80131506)». No hubo fallo de aserción
funcional posterior ni lectura del original; inputs DPAPI/certificados sintéticos.
Informe ../pr06-dependency-closure-global-20261029.json SHA256
bb77e950e5a50c4aaeebe065e74ab2da585a82dd9359ae8e6c4435304308f31a.
Se preserva, no contar como global PASS ni afirmar causa de infraestructura exacta.
Recheck aislado sin cambios:22 PASS/0 FAIL/0 omitidas, exit0;
../pr06-custody-crash-recheck-20261029.json SHA256
500b89784a9492747a3c9d924325883b66c140df77a59a5b2d3a1c508891aa88.
Nueva ejecución global69628 EN CURSO, mismo código/maxWorkers2, sin build paralelo;
repetición justificada por fallo terminal observado, sin relajar tests ni retries
internos ni repetir material real. Única omitida histórica F6 reviewed942 conserva
su estado, no PASS. Publicación del parche de dependencias espera este cierre.
Referencias primarias revisadas:
https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7
https://github.com/nodejs/undici/security/advisories/GHSA-2m5v-pch6-74hx

Propuesta histórica de consulta, descartada por disponibilidad (NO autorizada/NO ejecutada/NO programada):
../catalogo3-query-proposal-20261030.json SHA256
edfd0ce29710231da441115ee9b64323b9b0241267c5ede6c5445a31c8994f7a.
Al retomar30/10 entre08:00 y09:00 Argentina, una WSAA y una consulta de cada
FEParamGetTiposIva/FEParamGetCondicionIvaReceptor, sin retry, con originales sólo
para autenticar y Token/Sign sólo en memoria. Pin actual de fuentes, revisión3
propuesta y TA previo29/10 22:00:42.630Z; preflight READ ONLY fresco obligatorio.
El GO anterior consumido no autoriza esto. Fuera de esa hora requiere revisar
propuesta; no despertar ni ejecutar automáticamente. Guardar sólo parámetros
públicos, sin importar/activar catálogo, emisor, flags, emisión ni Production.
Decidir la siguiente ventana con expiraciones reales, nunca con duración fija.

Respuesta del titular29/10: no estará en la hora propuesta y prefiere «Otro día
por la mañana», sin fecha concreta. edfd0ce2 NO recibió GO y no se ejecutará;
conservarlo como propuesta histórica, no trasladar su autoridad a otra fecha.
No hay consulta/ventana/tarea programada. Al definir el día, generar propuesta
revisada y pedir sólo el GO específico aplicable. No insistir con horarios del30/10.

### 29/10/2026 — PR06: diagnóstico de costos sin privilegio global

Revisión de P02: verificar-costos-cajero comprobaba CAJERO pero omitía
es_superadmin, un privilegio independiente del rol. Ahora exige el booleano
false explícito; rechaza true, ausente, null y coerciones antes de consultar
costos/productos. No se modifican perfiles, grants, RLS ni aplicación comercial.
71 pruebas PASS/0 FAIL/0 omitidas en costPermissionProbe y fiscalStagingJwtScript,
incluidos los53 casos del asistente; build689, lint enfocado y node --check PASS.
Informe ../pr06-profile-privilege-tests-20261029.json SHA256
a510dbe97e4fc1ab3312b3f288a46b530a864797bf855353141af4919c04f2d4.

Consulta independiente REPEATABLE READ READ ONLY, con ROLLBACK, 11:11:55Z:
7 productos,7 filas privadas producto_costos y17 movimiento_stock_costos en el
comercio aislado; no se consultaron precios ni identificadores de clientes.
../pr06-cost-existence-readonly-20261029.json SHA256
f1540f3a5f9ae0257cdaf75aa3e36aa11ef31f10694c84f4e110fdf526cab4c3.
Esto acredita existencia de fixtures, no denegación con JWT Cajero ni RLS completa.
No login nuevo, DML, flags, ARCA, secretos, deploy o Production en este bloque.

La desactivación del Visor coincide con la decisión documentada del18/10 en
pilot-envases-returns: conservar tres perfiles activos dentro del límite del
plan. No es un defecto ni justifica reactivarlo automáticamente. Conservar las
aceptaciones históricas Visor de envases/comercial; no extrapolarlas al circuito
fiscal actual. Una nueva prueba requiere fixture/operador/cupo aprobados.
Se contrastó también el UUID exacto del perfil actual con
../pilot-staging-interactive-activation.json: mismo identificador presente;
no se publicaron correos ni credenciales del registro privado.

### 29/10/2026 — Preparación independiente de lectura Visor (PR06/PR09)

Resultado local: 53 pruebas PASS/0 FAIL del asistente, incluyendo Visor válido,
rol incorrecto, inactivo, SuperAdmin, identidad/scope incorrectos, fila ajena
visible, fallo de red y relectura vacía. Build689 y lint enfocado PASS. Evidencia
../viewer-readonly-helper-tests-20261029.json SHA256
77f254a390197bcf3add4f84d3eff83f3f80b0825911102e166f3fbfc8dce429.
La suite global5273 del bloque42559cb es anterior a este cambio; no se presenta
como nueva ejecución global. El modo -ComprobarAislamientoVisor es exclusivo y
no amplía el acceso del asistente fiscal de Dueño/Cajero.

Inventario hospedado READ ONLY29/10: un perfil VISOR del comercio aislado,
inactivo, no SuperAdmin, vinculado a Auth existente. No se modificó ni reactivó.
Evidencia ../viewer-profile-binding-preflight-20261029.json, observado11:05:22Z;
../viewer-readonly-inventory-20261029.json confirma fixtures propio/ajeno existentes.
No se realizó login Visor ni aceptación RLS real. No crear cuenta duplicada.
Reactivación requiere GO específico y confirmar acceso del operador a esa cuenta;
no solicitar contraseña en el chat. PR06 permanece parcial.

Revisión tras publicar42559cb: schema/types admiten VISOR pero el asistente de
aislamiento existente sólo acepta Dueño/Cajero. Preparar un modo EXCLUSIVO Visor
para Auth/perfil activo, lectura propia, rechazo de fila ajena y relectura propia
con los fixtures ya revisados. No cambiar RLS, roles, datos ni el modo fiscal de
Dueño/Cajero; no crear cuenta ni ejecutar login real en este bloque. Todas las
peticiones de datos deben ser GET, sin funciones/RPC/flags/ARCA. Mantener salida
OBSERVED y necesidad de corroborar la existencia ajena de forma independiente.
Probar con servidor simulado y fallos de rol/actividad/scope/relectura; build/lint
y documentación antes de pedir acceso de un Visor real. No cerrar PR06 por este
ensayo de SELECT ni confundirlo con autorización DML o fiscal completa.

### 29/10/2026 — Renovación del catálogo requiere pin de revisión, no otro literal

**Cierre global final del bloque ampliado:** sesión50231 terminó exit0:
5273 PASS,0 FAIL,1 skipped,332 archivos. Se contrastaron TODOS los332 archivos
de prueba registrados con el informe: missing=[]; única omisión histórica
f6-2d-c3c2-enrichment.test.ts (reviewed candidate set/cutover blockers), no PASS.
../fiscal-renewal-closure-global-20261029.json SHA256
0a05e7211dd6d9e2dccff3d555ab783a733fb0534a92343e8ea3383543e88686.
Supera el estado EN CURSO inferior; no reutiliza el pase anterior de8a480fc.
170 pruebas de revisión/operador y30 diagnóstico,14 escenarios PostgreSQL17.11,
build689, lint enfocado, node --check, parser/diff y bundle36assets PASS.
Warning no-unsafe-finally previo del harness permanece. Scan15archivos cambiados
sin patrones privados examinados; no certifica ausencia absoluta de secretos.
Un solo bloque listo para commit/publicación del PR, sin GO remoto nuevo.
PR03 no cambia a PASS: catálogo3 real, importación y ventana positiva pendientes.

Resultado nativo final (supera EN CURSO inferior): PostgreSQL17.11,14 escenarios
PASS, incluidos ciclo privado/HTTP/SQL de revisión3 y exclusión concurrente.
externalRequests=0/realArcaCalls=0/emissions=0/cae=0. Contenedor propio detenido,
DB/journals sintéticos conservados. ../catalog-revision3-native-20261029.json
SHA256 e8d570162da923684b721333b875221a117123a3e2e23f02a6041ad78566290f.
Suite170 enfocada SHA25655e06470f15a98fb47a9e3ac50cb2cd7f432d41a5abfbc7a1d281e08a470c25b.
Validación global del bloque ampliado en curso, sesión50231; no publicar antes
de su resultado terminal ni atribuirle el pase global anterior de8a480fc.

Consulta de documentación pública oficial (sin credenciales) confirmó que el
endpoint gov.ar del código figura en el manual enlazado de homologación:
https://www.afip.gob.ar/ws/documentacion/homologacion-externa.asp y
https://www.afip.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf (sección URL,p21).
El PDF se identifica v4.8 y fecha1/12/2026, posterior al día actual: no asumir
vigencia de sus cambios fiscales por este lookup. La URL coincide también con
manuales anteriores. El acceso web anónimo a una página del servicio gob.ar y
al manual general4.7 tuvo timeout; no acredita causa ni autoriza cambiar el pin
gov.ar por alias. No nuevas consultas autenticadas ni lectura de material original.

Auditoría del siguiente gate detectó hardcodes2 en plan, SQL/observador y prueba
de operación. Bloque local actual exige catalogRevision explícito y validado en
configuración/snapshot/manifiesto/hash; SQL generado usa sólo esa revisión, y la
consulta independiente fija un sexto parámetro entero. No consulta latest ni
adapta el pin a la base. Historial completo1..revision-1 y cantidad exacta siguen
obligatorios; su hash cubre todas las filas ajenas al catálogo elegido. Cambios,+huecos o revisiones inesperadas => STOP, no recaptura de baseline. Los paquetes
anteriores carecen de la nueva entrada y de los hashes actuales: no reutilizar.

170 pruebas enfocadas PASS/0 FAIL/7 archivos, incluyendo SQL PGlite real que abre/
cierra3 preservando1+2 y rechaza replay, y observador que detecta drift de2,
huecos y una4 inesperada. PGlite no acredita el esquema fiscal completo. Build689
PASS; lint/diff PASS. ../catalog-revision3-local-integration-20261029.json.
Ensayo PostgreSQL17 aislado con esquema001–054/HTTP real/Auth y ARCA sintéticos,
incluyendo revisión3 y concurrencia, EN CURSO; no acreditarlo todavía.

Este bloque incorpora la clasificación segura de transporte descrita debajo;
no cambió endpoints, TLS, timeout40s ni retries. No nuevas lecturas de originales,
consultas reales, importación3 ni cambios remotos. La excepción del TA descartado
obliga a coordinar nuevo catálogo y próxima ventana: no repetir autenticación al
vencer19:00 sin comprobar que el siguiente TA permita una ventana ANTES de que
venza el catálogo del día. Ver decisión29/10; no asumir duración exacta de12h.

### 29/10/2026 — Clasificación local de transporte, posterior a8a480fc

El diagnóstico WSAA/WSFE conserva ahora categorías de lista cerrada obtenidas de
tipos .NET/HttpRequestError/SocketError, incluyendo excepciones anidadas. Distingue
timeout, DNS, conexión, TLS, protocolo, proxy, respuesta cortada e IO de transporte.
Sólo aplica categorías de transporte en LOGIN_CMS/WSFE_CONSULTA: IO en DPAPI o
exportación local no se presenta como fallo de red. Los códigos de negocio/SOAP/
HTTP previamente saneados se conservan. No imprime mensajes externos, XML, rutas,
JWT, Token/Sign ni claves. Límite de inspección de cadena16, fallback cerrado.

No cambió C# del transporte, timeout40s, TLS, endpoint fijo, redirecciones, retries,
custodia o permisos. No se leyó material original ni se hicieron llamadas reales
en este bloque. No reclasificar retroactivamente el error del intento consumido:
la categoría histórica sigue LOCAL_OR_TRANSPORT_ERROR; GET anónimo SOCKET es una
observación independiente. No autoriza reintentar antes de22:00:42.630Z.

30 pruebas enfocadas PASS/0 FAIL/3 archivos, con wrappers PowerShell reales y
excepciones sintéticas; incluyen15 comprobaciones nativas de categorías/anidación,
rechazo de mensajes privados, fallo en primer catálogo y LoginCms incierto sin
reintentos ni segunda consulta/exportación. Build689 PASS; lint enfocado exit0
con warning no-unsafe-finally histórico de limpieza del harness, sin suprimirlo.
../wsfe-transport-categories-final-20261029.json. La suite global5251/1skip de
8a480fc precede esta corrección privada: no presentarla como global nueva.

El hash del asistente cambia: la propuesta e1e802f2 ya consumida permanece como
historia y no es ejecutable con este source. Un nuevo intento requiere propuesta/
hash revisados y GO propio, además de esperar vencimiento del TA descartado.
PR03 continúa parcial, catálogo2 vencido/inactivo, primer CAE pendiente. Mantener
el objetivo común completo y los gates remotos cerrados.

### 29/10/2026 — Identidad exacta confirmada; cierre de diagnóstico local

**Cierre local final:** ejecución global maxWorkers=2 terminó exit0,5251 PASS,
0 FAIL,1 skipped,332 archivos; incluye58 casos FiscalDocumentModal antes omitidos.
../fiscal-diagnostic-global-final-20261029.json SHA256
2f242bc306550ba74a8569871d1cb826f8371942950943db51808a950155f110.
Supera el intento global incompleto sin borrarlo. El skip histórico F6 permanece
explícito, no contado como PASS. 91 enfocados y104 recheck con solapamiento,
build689 PASS, lint enfocado/node/parser/diff PASS,36assets JS sin los símbolos
privados examinados;16archivos cambiados sin patrones de material privado en scan.
Sin cambios SQL/Edge/flags/provisión/Vercel/master/Production por este bloque;
no nuevo ensayo nativo SQL porque no se modificaron SQL ni transacciones. No usar
los198 escenarios históricos como reejecución de estos cambios de diagnóstico.
Preparado para un único commit del cierre; aceptación hospedada sigue pendiente,
con WSFE fallido y TA descartado documentados abajo. Ningún CAE ni aplicación.

**Resultado posterior del GO de consulta e1e802f2:** titular respondió Autorizo.
Una sola invocación real del asistente original: WSAA PASS, TA vence
2026-10-29T22:00:42.6300000Z (29/10 a19:00:42.630 Argentina), descartado al cerrar.
Primera consulta FEParamGetTiposIva falló con LOCAL_OR_TRANSPORT_ERROR; script
terminó antes de la segunda. No JSON de parámetros exportado, no importar3,
no nueva autenticación ni retry. ../wsfe-catalogo3-20261029/attempt.json y
result.json sólo contienen metadatos/markers saneados; no Token/Sign/XML.
GO consumido por ese intento, no se reutiliza. Próximo LoginCms sólo después de
la expiración nueva y autorización específica si vuelve a requerirse.

Dos errores del comando de preflight anteriores quedaron antes del asistente:
CreateFromPemFile intentaba buscar clave dentro del certificado público y luego
un literal false de PowerShell falló al formar el marcador. No lecturas de clave/
DPAPI ni red en esos dos preflights. Se verificó carpeta vacía antes de escribir
el marcador durable y ejecutar una vez; no se eliminó ni sobreescribió evidencia.

Un GET anónimo independiente al WSDL de homologación (sin credenciales/negocio,
timeout12s) también falló: categoría SOCKET, status null, observado10:03:13Z.
../wsfe-anonymous-transport-20261029.json. No prueba causa histórica exacta, ni
disponibilidad futura. No debilitar TLS, cambiar endpoint o aumentar retries.
Catálogo2 sigue inactivo/vencido; aceptación positiva y CAE continúan pendientes.

Siguiente propuesta preparada, NO autorizada/ejecutada:
../catalogo3-query-proposal-20261029.json SHA256
e1e802f2b875f6d5f5b452ce69ae6fd2a90a92064a002c2839065805b68967d9.
Baseline público revisiones1+2: ../catalogo3-baseline-20261029.json SHA256
ab823a41c84734847c5a9787d55fb79cdd7354ccd76a3a79f3944a786bbb7596,
derivado de revisión1 previamente contrastada e inspección hospedada actual de2.
No es una importación ni permite extender2. Alcance propuesto: usar certificado/
clave/DPAPI originales sólo para una autenticación WSAA de homologación, seguida
de FEParamGetTiposIva y FEParamGetCondicionIvaReceptor una vez cada una; dos JSON
públicos nuevos, sin retries ni persistir Token/Sign, sin SQL/flags/Edge/Vercel/
CAE. No repetir el ensayo CMS cerrado; la firma para LoginCms es necesaria bajo
ese GO nuevo. Respetar expiración del TA resultante antes de otro login Edge.
Sólo después preparar revisión3 INACTIVA/hash/SQL para su propia revisión y GO.
Si la lectura/historial cambia, repetir preflight por drift, no sobrescribir.

Conciliación hospedada finalmente obtenida a09:44:26.914595Z (06:44 Argentina):
../positive-window-reconciled-20261029.json, read_only=on, emisor1 inactivo con
marca01:58:55.408682Z intacta, catálogo2 inactivo, ningún emisor/catálogo habilitado,
37 contadores cero, operación/TA null, private_acl=true. history_sha256
1a41b59b6892a59127638d0db995cc7aa31f487688ef860fd7da9d673202e5ee y
commercial_sha256 f85b52227fa1ad82f3b61c9b01cffe30571d609dbfce5af975c241a27712f583
coinciden con baseline. Resuelve el pendiente de lectura de los párrafos siguientes
y del registro anterior; no hubo UPDATE, apertura, LoginCms ni ARCA por esta consulta.
No atribuir causa histórica exacta. No restaurar baseline ni eliminar journals.

El titular aportó OWNER_CLOSED_PASS identity=true profile=true backend503=true
logout_local=CONFIRMED window=false arca=false del adaptador privado original.
Management y Auth/perfil actuales pasan de forma independiente; no acreditan la
causa histórica del fallo v5 ni reemplazan conciliación SQL hospedada. No repetir
los diagnósticos ya aprobados sin drift. El navegador de esta sesión no permite
acceder a la consulta existente (browser.user unavailable); se solicitó abrir SQL
Editor de kioskopos-staging para recuperar la lectura independiente.

Defecto de observabilidad confirmado localmente: el packet descartaba failures y
siempre publicaba stage=WINDOW. Ahora conserva sólo una etapa de una allowlist
cerrada y separa MANAGEMENT de PREFLIGHT; nunca imprime mensajes de excepción o
respuestas externas. Sin cambios en apertura/cierre, permisos o acciones fiscales.
91 pruebas enfocadas PASS/0 FAIL (5 archivos), lint enfocado PASS. Build inicial
detectó un tipo de mock del test nuevo; se corrigió sin cambiar comportamiento
ni aserciones. Build y suite global final en curso, no acreditados todavía.

Catálogo2 venció el 29/10 a02:59Z (28/10 a23:59 Argentina), al igual que todas las
ventanas autorizadas del 28/10. Los paquetes v3/v4/v5 quedan históricos y no se
pueden ejecutar con el código modificado. No prorrogar fechas ni reemplazar UUID.
Luego de conciliar: preparar renovación del catálogo/propuesta según su gate,
revisar datos/fecha fiscal y nuevo paquete exacto con GO específico. No nueva
WSAA/WSFE, instalación remota, flags, CAE, cambios comerciales, master o Production
por este cierre. PR01–PR11 sigue activo e incompleto; aceptación positiva pendiente.

### Incidente hospedado posterior a 1db02ad — 28/10, sin reapertura

El titular ejecutó el paquete v3 aprobado durante23:30–23:45Z y comunicó
`WINDOW_OPERATOR_NOT_CONFIRMED stage=WINDOW cleanup_confirmed=false reconcile=true`.
El journal privado conserva únicamente HEADER y BASELINE (23:36:13.319734Z),
sin OPEN_ATTEMPT ni recibo; hashes de historial/comercio coinciden con v3.
No hay proceso del operador vivo. Conciliación independiente READ ONLY en
Staging a23:37:15Z: emisor1/catálogo2 inactivos, sello anterior intacto,
37 contadores fiscales en cero. Metadata Custom secrets:12 entradas, backend
false; DATA_PREPARATION/PREPARATION ausentes y ninguna edición observada.
Consulta acotada de auth.users a23:44:34Z: último login exitoso del Dueño
26/10 21:44:55Z, sin nuevo login acreditado para este intento. No se seleccionó
password, JWT, Token/Sign ni material de custodia. No afirmar el motivo exacto:
el error externo WINDOW es demasiado genérico para distinguir Management de
autenticación fallida. No atribuirlo al PAT sin evidencia.

STOP de la ventana: no repetir apertura, no nuevo LoginCms, no consumir otro
UUID, no limpieza destructiva ni restauración de baseline. La aprobación
fallida no habilita un segundo intento ni un hotfix remoto. Los marcadores
PASS locales de1db02ad se conservan; aceptación positiva hospedada sigue FAIL/
PENDIENTE y ready para primer CAE continúa sin acreditar.

Diagnóstico nuevo local, separado del runtime aprobado:
`scripts/diagnosticar-acceso-fiscal-staging.ps1` y
`scripts/diagnose-fiscal-management-readonly.mjs`. Sólo un GET al endpoint de
metadata del Staging fijo, PAT por stdin privado, sin Owner login/SQL/flags/
originales/ARCA. Distingue TOKEN_FORMAT, NETWORK_OR_TLS, HTTP401/403/etc,
METADATA_REJECTED y CUSTODY_REJECTED sin imprimir respuestas ni valores.
23 pruebas PASS/0 FAIL (incluidos14 adapters existentes), build/lint salida0,
`../positive-window-diagnostic-tests-20261028.json` y
`../positive-window-diagnostic-build-lint-20261028.json`. No modifica paquetes
aprobados ni permite reabrir la ventana. Cambios aún sin commit: agrupar con
el cierre del diagnóstico/corrección del blocker, sin commits por cada paso.

Resultado aportado por el titular del GET-only:
`MGMT_READONLY_NOT_CONFIRMED reason=HTTP_401 original_read=false write_attempted=false`.
El API Management rechazó la autenticación del PAT usado en ese diagnóstico;
no inferir expiración frente a revocación/copia incorrecta, ni culpar al Owner,
PostgreSQL o custodia. El intento original no conservó su código HTTP interno,
por lo que este resultado localiza el bloqueo actual sin inventar aquel log.
No hubo POST en el diagnóstico. La ventana autorizada23:30–23:45Z no se reabre
ni se prolonga. Pendiente: titular verifica/reemplaza en privado el PAT con
alcance sólo Staging y Secrets Read/Write, repite sólo el diagnóstico GET y
aporta su marcador seguro. Después, preflight fresco y nueva propuesta/GO de
ventana. No reprovisionar los seis secretos ni releer originales. Para un
segundo intento hospedado `readyForGo=false` hasta resolver esta dependencia;
los pases locales históricos conservan su alcance.

Confirmación adicional READ ONLY en la cuenta Supabase: el PAT llamado
`KioskoPOS custodia Staging` figura **Expired** (también el otro PAT scoped
visible). Se conserva sólo nombre/estado/fecha de observación, sin valor,
en `../positive-window-expired-pat-observation-20261028.json` y captura segura.
No se generaron/revocaron tokens ni se usó un token LEGACY como alternativa.
El titular debe generar/copiar un PAT scoped vigente y probar sólo el GET.
La revisión automática rechazó commit+push del diagnóstico por considerarlo
prematuro respecto al único cierre final exigido; el comando no se ejecutó.
Se difiere publicación y se preservan los cambios locales y la evidencia.

### PAT vigente y nueva propuesta v4 — todavía sin GO

El titular aportó `MGMT_READONLY_PASS status=200 names=6 flags_closed=true
original_read=false write_attempted=false`. Se preserva en evidencia externa,
sin token. La UI de la cuenta confirma el PAT `pat 28/10`: vence04/11/2026,
una capacidad Edge Function Secrets READ-WRITE, un proyecto kioskopos-staging;
sin editar permisos ni leer valor. No se usó un token LEGACY.

Preflight RRO independiente a28/10 23:58:00.158634Z, terminado con ROLLBACK:
emisor/catálogo deshabilitados,37 contadores cero, private_acl=true, historial
y comercio iguales a los hashes originales de v3. Payload contrastado con el
verificador local; esa observación no reemplaza el preflight fresco del operador.
Runtime139 archivos idéntico al paquete de1db02ad: el diagnóstico añadido y
estas notas no modifican el operador aprobado. No se repiten gates locales
cerrados ni se cambia SQL instalado/Edge/custodia.

Propuesta v4: `../positive-window-reviewed-package-v4-20261028/package.json`,
hash `499c461e1697060650b5543f91e618be35a3b7d25c3d135ab352390cb7f37660`.
Franja propuesta28/10 **21:15–21:30 Argentina**, equivalente29/10
**00:15–00:30Z**; fecha fiscal explícita20261028 intacta. Mismo UUID/venta,
catálogo2 sin prórroga (vence02:59Z), referencias exactas de historial/comercio.
SQL apertura/cierre/verificador materializados con hashes y `-Preparar` PASS,
sin red/credenciales. Para esta propuesta `assistantReady=true`,
`readyForGo=true` significan lista para revisión, NO autorizada ni ejecutada.
Se exige GO humano nuevo: el anterior falló y venció. Conservar su journal;
ningún segundo intento automático, APROBAR, FECAESolicitar, NC ni aplicación.

Esta sección ordena el trabajo pendiente; no sustituye ni borra la evidencia
histórica inferior. Referencia local verificada: HEAD `0a5da48`, árbol limpio
antes de esta actualización. El bloque local integrado quedó PASS según el
cierre vigente inferior: `readyForGo=true`, `assistantReady=true` para revisión
del paquete público v2. No hay GO de ventana ni aceptación positiva hospedada.

1. **Terminar primero el bloque local completo**, sin commits intermedios:
   operador privado, JWT sólo en memoria validado mediante `/user`, binding
   exacto de actor/comercio/venta/emisor/catálogo, apertura única, recibo textual
   PostgreSQL sin perder microsegundos, flags mínimos, preparación sin envío,
   recovery/reload y cierre. Validar el ciclo integrado y fallos de identidad,
   drift, expiración, ACK perdido, recibo incorrecto, concurrencia entre
   asistentes/sesiones, cleanup y replay. No inferir propiedad de una apertura
   por encontrar simplemente un binding activo coincidente tras perder el ACK:
   la integración debe acreditar exclusión/propiedad antes de actuar o cerrar.
   Conservar SQL v2 salvo defecto concreto demostrado por pruebas.
2. **Cierre local único:** PostgreSQL, tests enfocados e integración, build,
   lint, diff, límites privado/público, secret scan y archivos sensibles pasan
   sobre el estado final. Sólo entonces un único commit final publicado puede
   acreditar `PRIVATE_WINDOW_ASSISTANT`, `JWT_PRIVATE_FLOW`,
   `FULL_WINDOW_INTEGRATION`, `OPEN_RECEIPT_RECOVERY`, `FAILURE_CLEANUP` PASS y
   `POST_CLOSE_REPLAY=REJECTED`, junto con `readyForGo=true`,
   `assistantReady=true`. Durante ese bloque `REMOTE_EXECUTED=false`,
   `FECAESolicitar=false`, `CAE=0`; sin SQL remoto, flags, claves ni ARCA.
3. **Bloque hospedado posterior, todavía no iniciado:** revisar el commit y
   paquete anterior antes incluso de su preflight remoto. Comprobar READ ONLY
   destino exacto `acoyfwwmhaeruciyedri`, emisor1/catálogo2 inactivos y vigentes,
   catálogo1 intacto, metadata de custodia, flags reales cerrados y ausencia de
   operación/reserva/review/intent/TA incompatibles. Preparar hashes, comandos y
   checklist. No prolongar catálogo ni sustituir venta o UUID silenciosamente.
4. **GO humano independiente requerido:** literalmente para la primera ventana
   positiva de preparación en Staging SIN emisión. La nueva instrucción no es
   ese GO. Sin él detenerse antes de habilitar emisor/catálogo/flags, preparar o
   autenticar WSAA. No reutilizar permisos consumidos de SQL, custodia o emisor.
5. Bajo ese GO, usar exclusivamente el paquete aprobado: Owner real, apertura
   exacta y recibo, flags BACKEND/DATA_PREPARATION/PREPARATION únicamente,
   datos fiscales explícitos, custodia funcional hospedada, WSAA desde Edge,
   TA cifrado durable, FECompUltimoAutorizado, reserva/body/hash durables,
   revisión Owner exacta y reload sin duplicar. Revisar el alcance aprobado de
   revisión frente a aprobación: no añadir automáticamente APROBAR al paquete
   que sólo permite REVISAR. Nunca ENVIAR, FECAESolicitar, NC ni SQL052.
6. Cerrar PREPARATION, DATA_PREPARATION y BACKEND y confirmar flags antes del
   SQL de cierre con el recibo exacto; conservar marca e historia. Logout local
   y comprobación autorizada de `503 HOMOLOGACION_NO_HABILITADA`, sin debilitar
   JWT/CORS. ACK incierto exige conciliación READ ONLY, nunca retry ciego;
   limpieza no confirmada no es PASS. Bug remoto: cerrar primero, corregir y
   probar localmente; no reabrir sin revisar vigencia del GO.
7. Evidencia posterior independiente de emisor/catálogos cerrados, operación y
   TA previstos, cero envíos/CAE/intents/candidatos/efectos caja-stock-refund y
   secretos intactos. Sólo después, un único commit documental de cierre
   hospedado. `READY_FOR_FIRST_EMISSION_GO=true` requiere todos sus criterios
   reales PASS; no hereda los pases locales. Detenerse antes de la emisión,
   que requiere otro GO fiscal específico.

No se repiten provisión, CMS original ni gates cerrados sin drift. No nuevas
migraciones/endpoints por conveniencia; sin master, merge, Production ni Vercel
manual. La ejecución hospedada sigue pendiente y no se acredita por este plan.

### Cierre integrado — evidencia vigente del 28/10/2026

El asistente de terminal, paquete público, adapters privados y journal están
integrados. Se conserva abajo el progreso previo como historial, no como lista
actual de piezas faltantes. No hay commits intermedios. La suite global final
v4 pasó: `assistantReady=true`, `readyForGo=true` para revisión local, sin GO
remoto. El paquete v2 sustituye la franja vencida del primer borrador.

- PostgreSQL17.11 completo: **198 PASS**, SQL001–054 y concurrencia,
  `../positive-window-concurrency-closure-20261028.json`, SHA256
  `d89bb665f4d3b95d63403eec5000c4a700a4e85c2a66e37706f1d5b97fb8a3d3`.
- Ciclo real local packet→operador→HTTP→SQL→custodia sintética: **13 PASS**,
  `../positive-window-native-current-20261028.json`, SHA256
  `620eb7ed8a3bb1b61dfb07da8f7c8af355cdc7012586c6b7efc873e879a14797`.
  Incluye cierre/replay, captura de baseline, ACK apertura/body/cierre,
  concurrencia, WSAA incierto, respuestas tardías WSAA/numeración, JWT
  vencido, revocación inmediata del Owner, suspensión y vencimiento temporal.
  Auth/ARCA simulados; cero solicitudes externas, emisiones o CAE. Ambos
  contenedores propios detenidos con datos sintéticos/evidencia conservados.
- Enfocados finales: **171 PASS / 0 FAIL**, diez archivos,
  `../positive-window-focused-closure-20261028.json`, SHA256
  `2f1dbdbc59bb3a2035b86586ab53ed7cacdc9f22814d12312c5cfad689c3b5b0`.
- Windows ACL real: privado aceptado, Everyone rechazado; directorios vacíos
  propios eliminados, sin originales/credenciales/red,
  `../positive-window-windows-acl-v2-20261028.json`, SHA256
  `509ad5247aae60846f6ce05412876eb91378087c452ab1a3439980a59e587073`.
- Build final v2 PASS, lint salida0 con advertencias existentes. Primer build
  de cierre falló por mock sin `baselineMetadata`; se completó el contrato del
  doble de prueba, sin cambiar código runtime. Bundle final:36 JS/8 símbolos
  privados, cero coincidencias, `../positive-window-final-built-bundle-20261028.json`.
- Escaneo de42 archivos cambiados/nuevos sin patrones de material privado ni
  archivos sensibles nuevos; `.env.local` sin cambios Git. Repetir sobre el
  índice definitivo tras actualizar esta documentación.

Fallos conservados: la prueba de revocación posterior al COMMIT falló antes
de separar lectura de recibo para cleanup de autorización positiva; después
pasó en PGlite y PostgreSQL nativo. Un intento ACL de fixture mutó el mismo
objeto SecurityDescriptor y falló por SeSecurityPrivilege; no se acreditó
rechazo en ese intento. Se repitió con dos directorios/descriptores nuevos y
se confirmó aceptación/rechazo, sin cambiar el helper. La primera suite
global terminó5219 PASS/1 FAIL/1skip: paquete inválido al cambiar runtime
durante su ejecución. Repetición enfocada estable29 PASS, sin alterar las
aserciones; la suite global estable sigue en curso.

Propuesta pública de preparación (NO ejecutada):
`../positive-window-final-package-20261028/package.json`, SHA de paquete
`a221df89860c777ffdb6494d459498cd96b69bdfcd82284a7b0ff93fd491c5ed`.
Franja propuesta **28/10/2026 17:00–17:15 Argentina (20:00–20:15Z)**,
sin programación ni autorización inferida. El paquete exige baseline cerrado
fresco capturado antes de abrir y no reemplazable ante drift. Mantiene venta
`08a0c5c1-974a-4219-98fe-c66b9f3cfe4d`, UUID
`c7416ffb-65aa-47df-94a5-de8d9592989f`, Factura C11/Monotributo/CF5,
$200/una unidad/sin envases. Si vence la franja, nueva propuesta/revisión;
nunca prolongar catálogo2 (vence29/10 02:59Z) ni repetir LoginCms local.
`-Preparar` validó paquete sin credenciales ni red. No ejecutar sin GO exacto.

Artefactos públicos exactos en la misma carpeta: `open.sql`, `close.sql`,
`verify.sql` y `preflight-read-only.sql` (éste sólo BEGIN RRO/SELECT/ROLLBACK,
UTC y timeout15s; NO ejecutado remotamente). Hashes SQL revisables:
apertura `47c36084080509972e8160632483feb13bbf5d3c954e3df859db3019459f029f`,
cierre `da9f5e9f966e5a30b4673de82ee4a043a608580fb3567296aee8f77371388015`,
verificador `81264720c703b7a6391750aaa29ed408fce0ce6cd1b8be7d29ff87a9fc8a8d66`.
La aprobación debe revisar paquete/SQL, no copiar un SQL anterior vencido.

Actualización posterior: la franja20:00–20:15Z venció SIN ejecución. Se
conserva como historial y queda supersedida para revisión por
`../positive-window-final-package-v2-20261028/package.json`, hash
`ab5de74a21014dea3b783787ac44b2bf15b02d0dbe032f551098ea3b1fc4cc27`,
franja propuesta28/10 **20:30–20:45 Argentina (23:30–23:45Z)**. No es GO ni
programación. Mismos venta/UUID/datos/CUIT/PV/catálogo y frontera TA; no se
prolongó catálogo ni se hizo autenticación ARCA. SQL exactos v2 materializados
en esa carpeta, sin ejecutarlos: apertura
`ccf92acca29543afe170a10662738e205d44b468677a3bb3c84be6ca3dbdd659`,
cierre `e1272fa068f441355b67abf3276bd04ddb4ca9b2c24ffb90dcb7fced15881622`,
verificador `f9bfd0f0b4aae622c800cda48949c984537efc9ff92642468426ec63406893fb`.
`-Preparar` v2 PASS sin red/credenciales. El catálogo todavía debe comprobarse
vigente y cerrado en preflight, con margen para toda la ventana.

La suite global estable siguiente terminó5220 PASS/1 FAIL/1skip: timeout
de5s durante inicialización de PGlite en el test existente de inserción de
catálogo. Se ajustó sólo su presupuesto a30s, conservando todos los asserts.
Se movió a un helper la limpieza con validación de ruta en los nuevos tests,
sin quitar guardas; lint final138 advertencias/0errores, sin las dos nuevas
advertencias de finally. Build RTK final v3 PASS. La repetición global v3
quedó INTERRUMPIDA, sin proceso ni informe, durante el bloqueo de revisión
automática por cuota; nunca se cuenta como PASS. Verificados handle ausente
y ausencia de procesos Vitest antes de iniciar v4. V4 usa presupuesto general
30s para fixtures locales, conservando límites explícitos de cada prueba;
ninguna aserción ni control fiscal fue relajado. Resultado final pendiente.

**Cierre local final:** suite v4 **5221 PASS / 0 FAIL / 1 skipped /330 archivos**,
salida0, `../positive-window-global-closure-v4-20261028.json`, SHA256
`9484b3fb4f98a97a9ca0f1bedb480584e7a338983d7b9801cac66dee41a86b5f`.
La omisión se conserva como tal, no como PASS. Correcciones de tests finales:
56 PASS/0 FAIL en dos archivos,
`../positive-window-last-test-corrections-20261028.json`. Build/lint finales
salida0 en `../positive-window-final-build-lint-v3-20261028.json`; lint mantiene
138 advertencias, sin errores. No se modificó runtime tras los13 escenarios
nativos; cambios posteriores sólo documentales y de helpers/presupuestos de
tests. Boundary final:124 funciones fiscales privadas y13 flags ausentes de38
assets, con RPC comercial authenticated preexistente clasificado aparte
(`confirmar_devolucion_efectivo_piloto`, grant canónico returns003:156).
El barrido inicial que incluyó erróneamente ese RPC público se conserva como
hallazgo de clasificación, no como fuga fiscal ni PASS del barrido inicial.

Marcadores del bloque LOCAL (no hospedado):

```text
PRIVATE_WINDOW_ASSISTANT=PASS
JWT_PRIVATE_FLOW=PASS
FULL_WINDOW_INTEGRATION=PASS
OPEN_RECEIPT_RECOVERY=PASS
POST_CLOSE_REPLAY=REJECTED
FAILURE_CLEANUP=PASS
POSTGRESQL=PASS
TESTS_FOCUSED=PASS
TESTS_GLOBAL=PASS_WITH_1_SKIPPED
BUILD=PASS
LINT=PASS_WITH_138_WARNINGS
BUNDLE_PRIVATE_BOUNDARY=PASS
SECRET_SCAN=PASS
assistantReady=true
readyForGo=true
REMOTE_EXECUTED=false
FECAESolicitar=false
CAE=0
```

FAILURE_CLEANUP incluye el reporte explícito NOT_CONFIRMED cuando se pierde
exclusión/conectividad y no se puede probar cierre; no promete cierre automático
tras un crash. JWT_PRIVATE_FLOW acredita el operador local con Auth simulada;
no sustituye Owner real/custodia/TA/WSAA/Edge positivos hospedados pendientes.
Escaneo final de los43 archivos exactos del índice: evidencia externa
`../positive-window-final-staged-scan-v2-20261028.json`; sin credenciales,
archivos sensibles ni exports privados nuevos. Diff check PASS. No originales,
credenciales reales, SQL/flags/secretos remotos, Vercel, Production ni merge.

Siguiente gate, sólo después de publicar el único commit: preflight remoto
READ ONLY del paquete v2, evidencia de metadata/estado y revisión/GO humano
exacto de ventana. No abrir automáticamente. Si vence23:45Z, conservar este
paquete como historial y preparar otra propuesta revisada, sin extender
catálogo2. PR02–PR11/P01–P24 y objetivo común continúan pendientes/activos;
impresora/Point diferidos y restauración integral sin habilitar. El pase local
no habilita `READY_FOR_FIRST_EMISSION_GO` ni autorización de envío.

La rama master local preexistente es `41bebe9` (inventario F6); origin/master
y base del PR son `03a798f`. Ninguna se modificó. PR #3 comprobado abierto,
Draft, mergeable, sin merge y HEAD remoto `0a5da48` antes de la publicación
única pendiente. No confundir base remota con el checkout master local.

`REMOTE_EXECUTED=false`, `FECAESolicitar=false`, `CAE=0`, sin cambios remotos,
flags, secretos, originales ARCA, Vercel, Production ni merge. La custodia
funcional hospedada y preparación positiva real siguen PENDIENTES. Consulta
el protocolo/inventario actualizado en `docs/arca-homologacion.md`.

### Historial del bloque local — componentes inicialmente sin commit

Implementados `scripts/fiscal-preparation-session.mjs`,
`scripts/fiscal-private-owner-session.mjs` y `scripts/fiscal-preparation-flags.mjs`,
sus declaraciones y pruebas sintéticas. Todavía no son un asistente ejecutable:
falta integrar los adapters privados reales, captura de credenciales en terminal,
preflight exacto bajo exclusión, journal/recibo durable, llamadas limitadas a las
acciones del paquete, recovery de datos/body y protocolo de cierre/final503.
No usar estos módulos sueltos como autorización o como operador remoto.

PostgreSQL17.11: 198 escenarios PASS, incluidos los dos nuevos de sesión; cero
solicitudes fiscales externas/emisiones, contenedor propio detenido/datos
conservados. Evidencia `../positive-window-session-native-final-20261028.json`,
SHA256 `c3c87a159a5d9d1fb8ab49ac7af263b25cf335c09b66ac31ead3be876d961044`.
El intento anterior quedó FAIL con cleanup confirmado: el escenario de replay
nuevo omitía los GUC de aprobación en su segunda conexión. Se corrigió el
fixture, sin alterar SQL aprobado, y se repitió el ensayo completo ya terminado.

Fallos locales conservados: primer build rechazó el tipo inferido del mock,
corregido con retorno explícito. Dos ejecuciones del CLI de propuesta agotaron
el límite de arranque de diez segundos bajo carga; se conserva ejecución
acotada de treinta segundos, se comprueba el error del proceso hijo y no cambia
ninguna aserción de UUID/no-sobrescritura. No es un gate de latencia comercial.
El cierre final del paquete aún requiere suite/integración completas sobre su
estado definitivo; los pases de componentes no sustituyen ese gate.

Validación actual de componentes: 105 PASS / 0 FAIL en cinco archivos,
`../positive-window-operator-components-final-tests-20261028.json`; build PASS
`../positive-window-operator-components-final-build-20261028.log`; lint sin
errores y con warnings existentes, `../positive-window-operator-components-lint-final-20261028.log`.
Diff check PASS. Escaneo acotado de patrones sensibles sobre los nueve archivos
nuevos PASS; no equivale al escaneo final completo del paquete/commit. Los tres
componentes son privados y no están integrados ni exportados al frontend.
No se ejecutaron credenciales/JWT reales, Management, SQL remoto ni ARCA.

Integración local posterior, todavía sin commit: `fiscal-positive-preparation-flow.mjs`
regenera el paquete contra su hash aprobado, compara el contexto completo,
conserva UUID, exige journal previo a cada intento y recupera por resolución/
revisión, sin repetir POST ni PREPARAR/WSAA después de incertidumbre. Verifica
body/hash/número y journal en reload. `fiscal-positive-window-journal.mjs`
implementa creación exclusiva, append+fsync, cadena de hashes, esquemas mínimos,
recibo textual y secuencia flags-cierre SQL-logout-probe. No guarda respuestas
Auth/HTTP ni secretos. Rechaza truncado/corrupción sin reparar o sobrescribir;
STOP impide nuevos intentos y permite cleanup. El padre privado/ACL y propiedad
remota todavía deben acreditarse en el operador: un journal no es autoridad.

El puerto privado Owner ahora admite sólo los cinco comandos exactos revisados.
Los copia ANTES de revalidar Auth para evitar mutación durante el await. Nunca
APROBAR/ENVIAR/CONCILIAR/APLICAR. Incluye probe cerrado con `{}` y logout seguido
de probe con JWT retenido sólo dentro de la función y descartado al terminar:
si gateway responde401 en vez de503, se declara fallo, sin refresh/fallback ni
debilitar JWT. El 503 posterior a logout sigue por acreditar hospedado. Tiempo
acotado PREPARAR60s frente a Auth15s para permitir WSAA+WSFE+escrituras; no es
garantía de quiescencia de una solicitud remota incierta. El ciclo integral debe
demostrar también la seguridad ante actividad Edge en vuelo durante el cierre.

131 PASS / 0 FAIL en siete archivos: `../positive-flow-journal-final-v2-tests-20261028.json`.
Build PASS `../positive-flow-journal-final-v2-build-20261028.log`.
Se conserva un fallo previo de fixture integrado: el servidor sintético miraba
su journal viejo en memoria después de sustituir el puerto por el journal real.
Ahora sus aserciones leen el puerto durable, sin relajar ninguna comprobación.
Estos pases cubren componentes y flujo+journal, NO el ciclo total de ventana:
faltan adapters DB/Management/terminal, preflight fresco exacto, orquestador de
apertura/flags/preparación/cierre, pruebas integrales de todos los fallos y
validación final completa. No publicar commit parcial ni declarar GO-ready.

Avance posterior del mismo bloque SIN COMMIT: el núcleo
`fiscal-positive-window-operator.mjs` integra sesión exclusiva, journal, Owner,
baseline fresco antes del SQL, recibo, flags mínimos, preparación, nueva instancia
de recovery, cierre flags antes de SQL, logout y probe503. Devuelve fallo y
necesidad de conciliación si algo queda incierto; no reabre ni repite escrituras.
14 escenarios de ciclo local con DB/HTTP sintéticos PASS, incluidos ACK perdido
en apertura/datos/body/cierre/flags y cleanup fallido, corte de sesión y cierre
tras expiry o revocación del Owner. Esto NO acredita todavía el ciclo nativo.

Adapters implementados: Management fijo a Staging admite GET metadata y POST de
sólo tres booleanos; verifica seis nombres originales/revisión1/selector TA por
digests, sin valores ni reprovisión. Conector PostgreSQL fijo al session pooler
5432 del Staging, dos conexiones dedicadas, TLS/CA/hostname obligatorios, sin
URL/argv/env para credenciales ni retry. Sus pruebas usan transportes falsos,
no conexiones hospedadas ni credenciales reales.

`fiscal-positive-window-database.mjs` implementa las lecturas independientes RRO
con ROLLBACK confirmado, snapshot máximo30s, binding completo y sello dentro de
la ventana aprobada. Un ROLLBACK no confirmado invalida permanentemente ese
observador: nunca reutilizar su posible snapshot viejo. Cuenta todos los estados
fiscales relevantes y rechaza envíos/CAE/NC/reviews inesperados. Comprueba TA sólo
por estado/huella/vencimiento/cipher-presente, sin seleccionar el cipher. Hashes
de historial y datos comerciales deben prepararse/pinnearse en UTC, igual que
el lector; no mezclar hashes calculados con timezone local. SQL de escritura
debe ser idéntico al generado, sin comandos arbitrarios. Cierre conserva marca
y prueba que el baseline anterior ya no sirve para reabrir.

Pruebas DB: definiciones de tablas y CHECKs canónicos ejecutados en PGlite,
sin funciones fiscales completas ni afirmar instalación SQL001–054 por este
ensayo. Se corrigió el extractor de tablas del fixture para no absorber funciones
posteriores cuando `);` queda en la última línea. Se cargaron validadores CHECK
reales y se calculó la evidencia de referencia con timezone UTC; no se quitaron
restricciones. Nueve pruebas SQL PASS antes del último caso añadido para fallo
de ROLLBACK; la repetición enfocada final y build/lint están en ejecución.
Se conservan los fallos anteriores de fixture y los errores TS de tipos de mock/
resultado corregidos, sin presentar esos intentos como PASS.

Repetición final de esta etapa: 169 PASS / 0 FAIL en diez archivos (incluye el
observador invalidado tras ROLLBACK incierto),
`../positive-window-integrated-adapters-v3-final-tests-20261028.json`.
Build PASS `../positive-window-integrated-adapters-v3-final-build-20261028.log`;
lint sin errores/con warnings existentes,
`../positive-window-integrated-adapters-v3-final-lint-20261028.log`.
Estos resultados sustituyen el estado "en ejecución" anterior para los
componentes actuales, no el gate de cierre integral todavía pendiente.

Pendiente para cerrar el bloque: paquete/entrada de terminal privada y su
captura STDIN, integración del núcleo con los adapters reales, ensayo nativo
completo y de fallos/concurrencia/in-flight, suite final, inventarios/hashes y
revisión del diff/secretos/bundle. `assistantReady=false`, `readyForGo=false`.
No se ejecutó ninguna ventana remota, cambio de flags real, credencial, ARCA,
CAE, merge ni cambio Production. Mantener todos los cambios sin commit hasta
cerrar el bloque completo y producir su único commit final.

La franja propuesta anteriormente (28/10 15:10–15:25Z) ya no debe ejecutarse si
venció. Una nueva propuesta revisada debe conservar UUID/identidad y revalidar
baseline, vigencia de catálogo y todos los hashes antes de solicitar GO. No se
extiende una fecha ni se hace LoginCms para facilitar la planificación.
`assistantReady=false`, `readyForGo=false`, `REMOTE_EXECUTED=false`,
`FECAESolicitar=false`, `CAE=0`; sin commits intermedios ni cambios remotos.

## Objetivo y autorización
El usuario amplió expresamente el alcance a AFIP/ARCA y eligió primero
homologación. Informó que necesita preparar certificado y autorización WSASS.
No incluye emisión fiscal real, Point ni integración del PR #1.

## Diagnóstico
La implementación legacy no es apta para activar: simula CAE ante fallos de
homologación; guarda clave privada en configuración/localStorage; la Edge usa
service_role sin autenticar al actor, y no reserva durablemente numeración ni
reconcilia FECompConsultar. El baseline estricto no tiene las columnas/tablas
fiscales y mantiene bloqueada la emisión. No retirar ese guard como atajo.

## Bloque actual
Preparar herramienta local para clave RSA cifrada y CSR PKCS#10 compatible con
WSASS, sin OpenSSL instalado ni dependencia nueva. PowerShell 7.4+/.NET, RSA
3072, SHA256 y PKCS#8 cifrado AES256/PBKDF2. CUIT del titular WSASS, organización
y alias se ingresan en terminal local; contraseña con Read-Host AsSecureString.
No escribir clave sin cifrar ni enviar credenciales, CSR o claves a un servidor.
Directorio privado fuera del repo, archivos CreateNew y sin sobrescritura.
Probar firma CSR, correspondencia de clave y cifrado con datos sintéticos.

## Gates siguientes
1. Titular ingresa por sí mismo a WSASS, obtiene certificado y autoriza wsfe.
2. Diseñar módulo incremental de homologación separado, credenciales sólo
   server-side, RLS/ACL y JWT Dueño/tenant; no usar la Edge legacy actual.
3. Operación durable por venta/entorno, lock por CUIT/punto/tipo, cuerpo estable,
   FECompConsultar ante incertidumbre y rechazo de reenvíos con otro contenido.
4. Adaptador WSAA/WSFE con XML robusto, expiración, fecha Argentina, importes
   y condición IVA del receptor según contrato vigente. Probar en Staging.
5. Publicar UI de homologación con estados reales y sin CAE simulado; mantener
   separadas vista previa, venta confirmada y autorización fiscal.

## Fuentes y precaución de versión
Consultar documentación oficial en docs/arca-homologacion.md. El enlace actual
de homologación ofreció manual v4.8 con revisión 01/12/2026, posterior a esta
sesión (17/10/2026): no asumir que toda esa revisión ya está vigente. Confirmar
WSDL y contrato del entorno antes de implementar emisión.

## Progreso
- [x] Alcance de homologación y ausencia de certificados confirmados.
- [x] Inspección de legacy y documentación oficial WSASS/WSAA/WSFE.
- [x] Generador local cifrado y pruebas: firma CSR, clave coincidente, cifrado,
      ACL privada, rechazo de contraseña/CUIT/alias/destino y no sobrescritura.
      Dos tests nativos PASS; suite conjunta final 1870 PASS / 1 skipped /
      198 archivos y build 611 módulos PASS. Sin dependencias nuevas ni secretos
      en el repo. El error real de alias se incorporó a la validación local.
- [x] El usuario ingresó a ARCA y autorizó adherir WSASS el 18/10. Se abrió
      TESTING/HOMOLOGACIÓN y se verificó inicialmente que no había certificados.
- [x] CSR real y clave cifrada preparados fuera de Git; contraseña aleatoria
      protegida con DPAPI para el usuario Windows, sin imprimir ni enviar claves.
- [ ] Certificado: bloqueado por WSASS. El usuario autorizó su creación. Tras
      corregir el alias a sólo letras/números, dos solicitudes del mismo CSR y
      alias devolvieron EJBTransactionRolledbackException / Could not send Message.
      Se consultaron certificados y aliases antes de reintentar; la consulta
      final confirmó que no hay certificado ni alias de la solicitud. Sin retries
      adicionales, sin autorización WSFE creada y sin emitir comprobantes.
- [ ] Autorización WSFE posterior al certificado, con confirmación del titular.
- [ ] Backend seguro e idempotencia fiscal.
- [ ] Ensayo de homologación con CAE realmente autorizado.

## Resultado
La preparación local funciona y WSASS está adherido, pero ARCA no está activada
ni acreditada todavía. La creación del certificado quedó bloqueada por el error
interno de mensajería de WSASS, no por un fallo de firma CSR demostrado.
Los archivos privados y metadatos de conciliación se conservan fuera del repo;
no registrar aquí CUIT, DN completo, CSR, PEM ni rutas privadas del titular.

## Pausa solicitada — 18/10/2026
El usuario hará personalmente la certificación y pidió continuar con el resto
del piloto dejando ARCA de lado. Se suspenden las acciones de certificado,
autorización y activación fiscal hasta que solicite retomarlas. El CSR y la clave
cifrada existentes se conservan; no se generan reemplazos ni se reintenta WSASS.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR01, PR02, PR03, PR04, PR06, PR09 y PR10**.

Reanudado por el titular el 20/10. Certificado original/par, autorización WSASS y WSAA homologación reales PASS. Token/Sign sólo en memoria; la consulta WSFE sigue pendiente. La pausa y el error WSASS del 18/10 se conservan como historia, no como bloqueo actual. Siguiente: FEParamGetPtosVenta real sin emitir. CAE y transición productiva permanecen pendientes y sujetos a sus autorizaciones.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.


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

#### Bloque siguiente: PR03 previo al CAE

- Usar módulo incremental separado del legacy. Autenticar al actor, comprobar
  rol/comercio activo y venta confirmada propia antes de acceder a material fiscal.
  Ninguna clave o TA en configuración pública, browser o respuesta al cliente.
- Registrar operación fiscal durable por venta/entorno y hash de la solicitud
  canónica. Un reintento idéntico devuelve el resultado; un cuerpo distinto para
  la misma operación se rechaza. No generar otra identidad ante timeout.
- Serializar por emisor/entorno/punto/tipo. Reservar numeración en DB y persistir
  intención antes de contactar a WSFE. Nunca mantener una transacción abierta
  durante una llamada externa ni usar sólo un lock del proceso Edge.
- Ante incertidumbre o crash, conservar estado pendiente y consultar el número
  reservado mediante FECompConsultar; comparar identidad/importes y confirmar
  CAE únicamente con respuesta real coherente. Un resultado inconcluso no libera
  la secuencia ni habilita un nuevo envío automático.
- Separar estado comercial y fiscal: ninguna recuperación vuelve a cobrar,
  descuenta stock otra vez o fabrica CAE. Probar rechazo definitivo, timeout,
  ACK perdido, dos trabajadores y colisión de numeración.
- Preparar esquema/RPC y pruebas locales usando los patrones transaccionales del
  repositorio; instalación y ensayos hospedados requieren su gate correspondiente.
  No emitir hasta disponer de backend seguro, disponibilidad del punto de ensayo
  comprobada y autorización específica de emisión.

Validación del código usado: 4 pruebas dirigidas PASS / 2 archivos, con 32
comprobaciones sintéticas; diff PASS. La suite global/build anteriores no se
reclasifican como ejecución posterior a este agregado. No hay nueva dependencia.


## Objetivo de continuidad detallado — 20/10/2026

Por pedido del titular se registró un objetivo activo para completar el piloto.
Este ExecPlan desarrolla el bloque fiscal; la matriz PR01–PR11 del plan operativo
sigue siendo la fuente de estados y el plan-completar-piloto conserva el resto
del alcance. No crear otro plan fiscal equivalente. PR01 está PASS; el siguiente
resultado buscado es PR02, cumpliendo primero PR03 y sus controles de seguridad.

### Resultado verificable del bloque

Una venta completada y propia puede solicitar fiscalización de homologación a
través de un backend autorizado. La misma solicitud conserva identidad, cuerpo
y número reservado; un reintento no produce otro comprobante. Una respuesta
incierta queda pendiente de conciliación. Sólo una autorización real y coherente
permite mostrar CAE. Cobro, stock y caja no se ejecutan de nuevo por fiscalizar.
La emisión continuará bloqueada hasta completar los requisitos y autorizaciones.

### Pasos, entregables y salida de cada etapa

| Etapa | Trabajo y entregable concreto | Comprobación para avanzar |
|---|---|---|
| F01 — Inventario | Trazar ventas, checkout confirmado, roles, guard estricto, configuración, importes y Edge legacy. Precisar contrato inicial de factura admitida y restricciones. | Rutas y tablas identificadas; ninguna ruta usa CAE simulado ni claves del browser como solución nueva. |
| F02 — Contrato durable | Especificar estados fiscales, solicitud canónica/versionada, vínculo venta/tenant/emisor/entorno, hash e identidad estable; errores y respuesta pública sin secretos. | Matriz de transiciones válida e inválida y pruebas de cambio de cuerpo, venta ajena/anulada y repetición. |
| F03 — Persistencia y numeración | Preparar SQL aditivo fuera del manifiesto histórico: unicidad por venta/entorno, serie por emisor/entorno/punto/tipo, reserva durable y coordinación de trabajadores. | Dos solicitudes idénticas producen una operación; dos distintas no reciben el mismo número; crash no libera una emisión incierta. Pruebas locales no sustituyen concurrencia PostgreSQL real. |
| F04 — Custodia y permisos | Backend incremental: validar JWT, actor y comercio; separar función del operador y trabajador privado; custodia de certificado/clave y caché TA exclusivamente privada. | Anónimo, tenant ajeno, roles no autorizados y DML directo rechazados; secretos ausentes de respuestas/logs/config pública. Probar renovación y exclusión de renovación de TA. |
| F05 — Adaptador fiscal | XML por parser seguro; tiempo Argentina, importes precisos y sumas coherentes; endpoints fijos por entorno; timeout acotado y errores sanitizados. Contrato y parámetros oficiales vigentes antes de emisión. | Fixtures de autorización, rechazo, SOAP Fault, XML malformado/duplicado, vencimiento y respuesta con identidad/importes distintos; nunca CAE inventado. |
| F06 — Recuperación | Registrar intención antes de red; reconciliar número reservado con FECompConsultar tras timeout/crash; confirmar sólo identidad e importes coincidentes; bloquear reenvío si inconcluso. | Fallos antes/después del envío y de persistir ACK; dos trabajadores; ninguna segunda cobranza, movimiento de stock ni numeración nueva por reintento. |
| F07 — Ensayo hospedado | Preparar respaldo/preflight, instalación acotada y rollback de configuración; pedir autorización nueva para SQL/Edge y pruebas en comercio aislado de Staging. | JWT/RLS/ACL reales, worker concurrente, conciliación DB y auditoría; conservar registros y suspender sólo fixtures creados para ensayo. |
| F08 — CAE de homologación | Acreditar punto de ensayo y contrato fiscal; preparar caso mínimo reproducible con titular/importes/tipo y pedir autorización específica antes de emitir. | CAE real, número/vencimiento/QR coherentes y recuperación por consulta; cero cambios productivos. Cerrar PR02 sólo con evidencia completa. |
| F09 — Contingencias y UI | Mostrar estados comerciales/fiscales separados, pendientes y recuperación; ensayar caída ARCA/Internet y reintentos; eliminar dependencia del legacy para el nuevo flujo. | Operador puede distinguir autorizado/rechazado/pendiente sin recobrar; E2E y dos terminales, regresiones checkout/envases/devoluciones. |

### Inventario inicial ejecutado

- `supabase/bootstrap/001_domain.sql`: ventas con `COMPLETADA`/`ANULADA`,
  total numeric(12,2), detalles, pagos y caja relacionados. El estado comercial
  no debe reutilizarse como estado de autorización fiscal.
- `supabase/bootstrap/steps/008_checkout_core.sql`: contrato transaccional de
  checkout existente; revisar su ACK y reservas antes de enlazar fiscalización.
- `src/stores/afipStore.ts` y `src/lib/kioskPilotScope.ts`: guard estricto de
  emisión existente; mantenerlo hasta disponer del backend y aceptación nuevos.
- `src/lib/afipImportes.ts`: cálculo legacy con defaults/coerciones; no asumir
  que sustituye validación fiscal estricta en servidor ni soporte multi alícuota.
- `supabase/functions/afip-wsfe/index.ts`: legacy ya diagnosticado; no desplegarlo
  como backend nuevo ni utilizar sus rutas de simulación/credenciales públicas.
- `supabase/pilot-backup/001_contacts_restore.sql`: ejemplo actual de validación
  de perfil/comercio y solicitud inmutable; reutilizar convenciones pertinentes,
  sin mezclar el resultado comercial de operaciones_escritura con el diario fiscal.

### Seguimiento y criterio de cierre

- [x] Objetivo activo creado por pedido del titular y vinculado a planes existentes.
- [x] Inventario inicial de superficies; pendientes el trazado completo y contrato fiscal admitido de F01.
- [ ] Completar F01 y F02 con revisión de permisos, estados y solicitud canónica.
- [ ] Implementar y probar F03–F06 localmente; revisar seguridad y datos.
- [ ] Completar F07 tras autorización específica de instalación y ensayo hospedado.
- [ ] Completar F08 tras autorización específica de emisión homologada.
- [ ] Completar F09 y actualizar evidencias de PR04/PR06/PR08/PR09.

Registrar cada avance con versión, entorno, casos ejecutados, resultado y límites.
Ejecutar pruebas dirigidas y build cuando cambie la aplicación; usar suite global
al cerrar un bloque integrado o ante regresiones. Revisar diff y secretos antes
de publicar commits en la rama autorizada del PR #3. No presentar PASS local
como aceptación de RLS, concurrencia, operación fiscal ni piloto comercial.

Después de este bloque, continuar los pendientes canónicos de integridad,
seguridad, backup/restore, recuperación y concurrencia. La restauración integral
seguirá bloqueada hasta instalación y aceptación de los SQL nuevos. Preparar la
transición productiva y el piloto comercial con responsables, conciliación,
soporte y rollback; su ejecución requiere aprobación específica. Impresora/cajón
físicos y Point permanecen diferidos hasta contar con cliente. Master y
Production no se modifican por este objetivo. Conservar datos e historia.


### PR03: primer registro durable implementado localmente — 20/10/2026

Se preparó `supabase/pilot-fiscal/001_fiscal_journal.sql`, aditivo al bootstrap.
Tabla privada `fiscal_operaciones_homologacion` y RPC
`preparar_operacion_fiscal_homologacion`: sólo Dueño ordinario activo del mismo
comercio activo, venta propia COMPLETADA con total positivo. Sin conexión de red,
numeración, CAE, certificados, worker ni activación de frontend. NO instalado.

Contrato inicial versionado: UUID de operación/comercio/venta y contexto cerrado
(version, CUIT emisor propuesto, punto propuesto, tipo 1/6/11 y documento receptor).
No admite importe, entorno, fecha o credenciales suministrados por el cliente.
Deriva total/fecha/detalles desde DB y conserva snapshot estable en UTC. El
contexto es una propuesta, NO configuración fiscal verificada ni cuerpo WSFE
listo para emitir; falta condición IVA, desglose y validación fiscal completa.

Unicidad por comercio/venta/homologación; reintento idéntico con otro UUID devuelve
la operación original, sin fabricar otra identidad. Reutilización de UUID para
otra venta o cambio de contexto/snapshot falla. Bloquea perfil/comercio/venta en
orden consistente con los patrones existentes, sin llamada externa dentro de la
transacción. No acredita concurrencia multiproceso real: ésta sigue en F03/F07.

La tabla no concede SELECT/DML a anon/authenticated/service_role; revoca también
permisos por columna al reaplicar y rechaza privilegios heredados. Sólo la RPC
concede EXECUTE a authenticated y responde identidad/estado y
`emision_habilitada=false`. No expone snapshot ni documentos al llamador. La
anulación fiscal y su coordinación futura requieren contrato separado: preparar
una operación no bloquea actualmente una anulación comercial, y el worker futuro
debe revalidar y coordinar ambas antes de emitir. No habilitar el worker sin ello.

Pruebas locales nuevas: 31 casos con bootstrap completo y reaplicación del SQL;
incluyen DML/lectura, rol/tenant/estado, identidad/cuerpo, cambio de detalles,
fecha estable entre zonas horarias y trigger que omite inserción sin falso ACK.
Con diagnóstico WSAA: 33 PASS / 2 archivos. Suite global posterior: 2208 PASS / 1 skipped / 225 archivos (210,60 s).
Build PASS, 634 módulos; manifiesto histórico 43 SQL PASS; diff PASS. Escaneo
del árbol: 46 candidatos conocidos, sin candidatos nuevos. No hay dependencias
nuevas. Estas comprobaciones locales no acreditan instalación ni JWT hospedados.

Pendientes del bloque: completar F01/F02 (contrato fiscal final), hash/estados y
reserva de numeración F03; custodia/caché privada F04; adaptador/reconciliación
F05/F06; ensayos PostgreSQL/JWT/RLS hospedados y autorización de instalación.
PR03 sigue PARCIAL, sin afirmar que este registro ya sea una pasarela fiscal.


### PR03/F03 — reservas y registro previo de intención (20/10/2026)

Módulo aditivo `supabase/pilot-fiscal/002_fiscal_reservations.sql`, NO instalado:
serie global por CUIT/punto/tipo (entorno fijo homologación), reserva única
pendiente y registro privado de intento. RPC sólo service_role con comprobación
adicional de auth.role(); helpers, tablas, columnas y triggers sin EXECUTE/DML
para roles de API. No se incorporó worker ni se habilitó emisión/red.

El trabajador futuro debe aportar una observación real validada de
FECompUltimoAutorizado para el mismo emisor/punto/tipo. La RPC sólo admite un
valor en rango y ventana local de frescura (2 minutos, tolerancia futura de 30 s);
esto es una política interna, no una regla tributaria. Inicializa el próximo
número observado + 1; observación divergente o reserva de otra operación bloquea
la serie para conciliación. No confundir una reserva sintética local con un
número autorizado por ARCA. Rango 1–99999999 contrastado con manual oficial:
https://www.afip.gov.ar/fe/documentos/manualDesarrolladorCOMPGv21.pdf

Antes de reservar/registrar intento se revalidan actor original, comercio,
venta y snapshot; se toman locks de DB sin mantener llamada de red dentro de la
transacción. El primer intento cambia a ENVIO_INCIERTO antes de cualquier envío
futuro; repetir su UUID devuelve nuevo_intento=false y exige conciliación.
Otro UUID no sustituye al intento anterior. No hay vencimiento automático,
liberación de serie ni toma de control que habilite duplicar una emisión incierta.
Toda respuesta sigue incluyendo emision_habilitada=false: falta contrato fiscal
final y autorización/custodia/adaptador. El diario inicial es un ancla inmutable
PREPARADA; el estado de reserva vive en su tabla privada. Faltan consulta de
estado pública e integración UI antes de habilitar el flujo.

Los triggers serializan modificaciones de detalle con la venta y bloquean
importe/fecha/estado e inserción/modificación/eliminación de detalles después de
reservar. La anulación atómica se rechaza y revierte sus efectos si hay reserva;
si anulación ganó primero, la reserva debe fallar. Los actores existentes fuera
de una venta reservada mantienen su comportamiento.

Pruebas SQL locales ampliadas a 57 casos PASS. Incluyen series entre comercios,
ACK perdido, intento único, permisos, rollback de anulación, triggers que omiten
escrituras sin falsa confirmación y decimales JSON equivalentes. El test WSAA
agotó tiempo en paralelo durante inicio de Docker y pasó aislado (2 PASS).
La suite global posterior a este módulo está pendiente de ejecución/cierre.

Se preparó runner reproducible `scripts/fiscal/test-concurrency.mjs --run-local`:
usa sólo imagen postgres:17-alpine ya instalada, puerto 127.0.0.1, fixtures
sintéticas y transacciones distintas observadas por pg_stat_activity. No lee .env
ni usa credenciales Supabase/ARCA. Conserva contenedor de ensayo detenido y
registra evidencia JSON fuera de Git; no modifica contenedores existentes.
El primer preflight no esperó suficiente inicialización; se corrigió la espera.
La siguiente ejecución perdió el motor Docker/ECONNRESET antes de completar
las carreras: NO PASS. Se reforzó manejo de eventos de conexión y evidencia de
limpieza no confirmada si Docker desaparece. Comprobar estado antes de repetir;
no reiniciar un proceso de ensayo que siga vivo ni dar por detenido su contenedor.

Pendientes: resolución/conciliación y desbloqueo seguro de series, cuerpo WSFE
completo y hash, binding de emisor/credenciales, worker, caché TA y permisos,
PostgreSQL concurrente real y aceptación JWT/RLS hospedada. PR03 sigue PARCIAL.


#### Resultado PostgreSQL real local — 20/10/2026

Tras comprobar que Docker completó su actualización (motor 29.9.1) y que los
intentos anteriores estaban detenidos, se ejecutó el runner corregido: PASS en
PostgreSQL 17.11, imagen local postgres:17-alpine, seis casos con dos conexiones
y espera de Lock comprobada mediante pg_stat_activity (no sólo temporizadores):

1. Dos UUID de preparación simultáneos para la misma venta: una operación.
2. Dos comercios, mismo emisor/punto/tipo: una reserva; la otra bloqueada.
3. Dos trabajadores: un intento; ACK perdido exige conciliación, no segundo envío.
4. Reserva gana a anulación: venta COMPLETADA y auditoría de anulación revertida.
5. Anulación gana a reserva: venta ANULADA y ninguna numeración reservada.
6. Rollback antes de ACK: siguiente reserva conserva número y no deja hueco.

Evidencia sanitizada conservada fuera de Git en
`../fiscal-concurrency-local-result.json` (UTC 21/10, noche local del 20/10).
Contenedor propio detenido al finalizar; datos sintéticos conservados; ningún
contenedor previo modificado. No hubo conexión a Supabase/ARCA ni emisión.
Runner valida ownership/puerto localhost, no descarga imágenes, no lee .env,
registra fallos de conexión y no permite sobrescribir una evidencia previa.
El guard de sobrescritura se comprobó por separado (PASS, sin crear contenedor).

Esto acredita carreras concretas PostgreSQL locales; no acredita JWT hospedado,
RLS multi comercio de Staging, custodia del emisor ni respuestas reales de emisión.
Resolución de incertidumbre y liberación de la serie siguen pendientes; no activar
ni instalar todavía una pasarela de emisión con estos módulos preparatorios.


#### Verificación final del bloque de reservas — 20/10/2026

- Suite integrada: 2234 PASS / 1 skipped / 225 archivos, 269,67 s.
- Seis carreras PostgreSQL 17.11 reales locales PASS; ningún acceso hospedado.
- El build inicial detectó inferencia UUID demasiado estricta en dos helpers de
  pruebas. Se corrigieron sólo anotaciones; luego 57 casos SQL PASS y build PASS
  (634 módulos). La suite integrada antecede a esa corrección de tipos sin cambio
  de lógica; no se presenta como reejecutada después de ella.
- Manifiesto histórico: 43 SQL PASS; diff PASS; escaneo del árbol conserva 46
  candidatos conocidos, sin nuevos candidatos; historial no reescaneado.
- Runner: sintaxis y rechazo de sobrescritura de evidencia PASS. Datos y evidencia
  locales conservados; contenedor creado por el ensayo detenido correctamente.
- Ninguna dependencia nueva, cambio de .env.local, instalación SQL/Edge, emisión,
  modificación de master o Production. No hace falta redeploy de frontend: sólo
  se agregó preparación backend local, pruebas, runner y documentación.

Continuar con F02/F05/F06: contrato fiscal completo, hash/estados finales,
conciliación de la reserva con FECompConsultar y liberación controlada; después
custodia/worker y gate de instalación/ensayo hospedado. Mantener emisión bloqueada
mientras falte cualquiera de esos requisitos. PR03 continúa PARCIAL.


## Reconciliación F02/F05/F06 — avance local 21/10/2026

Se implementaron helpers de servidor, sin conectarlos todavía a UI, SQL ni worker:
`fiscalReconciliation.ts` congela el contrato v1 y calcula SHA-256; compara todos
sus datos con un DTO validado de FECompConsultar. `fiscalVoucherXml.ts` construye
la consulta homologada, valida SOAP/XML y ejecuta una sola consulta mediante
transporte obligatorio inyectado. No genera CAE, emite, reenvía ni altera venta,
stock o caja. Toda salida conserva puedeReenviar=false.

Contrato v1: emisor/entorno/punto/tipo/número, concepto, documento, condición IVA,
fecha/servicio/vencimiento, moneda PES/cotización 1, seis importes, alícuotas y
tributos. Tipos 1/6/11. Importes como cadenas decimales exactas, sin double ni
redondeo implícito; sumas en enteros BigInt. Arrays normalizados con orden estable
independiente del idioma del sistema; copia profunda congelada y verificación del
hash antes de consultar/comparar. No acepta campos desconocidos ni omite datos
fiscales fuera del contrato. No es validación tributaria integral: falta catálogo
vigente de parámetros/regímenes y derivación/binding con venta/configuración
privada. No habilitar un tipo/moneda/campo adicional descartándolo silenciosamente.

La coincidencia se llama AUTORIZACION_COINCIDENTE y es sólo candidata a persistir,
no estado final de DB. Exige CAE/resultado A, identidad, cuerpo completo, sumas,
fecha y vencimiento coherentes; una autorización histórica no se rechaza sólo
porque hoy pasó su vencimiento. Ausencia de resultado, errores incluso junto a
un resultado aparente, rechazo, CAEA o diferencia mantienen CONCILIAR. Mensajes,
XML y excepciones remotos nunca se devuelven ni se imprimen.

Adaptador: namespace SOAP 1.1/WSFE y jerarquía directa; rechaza elementos
ambiguos/duplicados, DTD/entidades, nil contradictorio, campos no soportados,
UTF8 inválido y tamaño/profundidad excesivos. Parser @xmldom/xmldom 0.9.12 fijado,
con onError que interrumpe cualquier warning/error sin logs. Dependencia de
pruebas Node e import map propio del futuro runtime arca-homologacion; no se
importa en frontend ni se creó un endpoint fiscal desplegable. Consulta fija al
endpoint de homologación, XML escapado, TA vigente con margen, sin redirecciones.
El límite incluye fetch y lectura del cuerpo; flujo sin fin o exceso de tamaño
queda pendiente y se cancela. No reintentar automáticamente tras error/timeout.

Contrato contrastado con WSDL público real guardado fuera de Git y documentación
oficial: FEDetRequest -> FECAEDetRequest -> FECompConsResponse; esto evita comparar
sólo los campos adicionales mostrados en el ejemplo superficial del método.
Fuentes: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL y
https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECompConsultar . No se ejecutaron
consultas autenticadas nuevas ni se utilizaron Token/Sign reales en este bloque.

Validación posterior del árbol:
- 90 casos dirigidos PASS en dos archivos: tipo A/B/C, receptor, IVA/tributos,
  identidad, hash, fechas, error/ausencia/CAEA, copia inmutable, XML adversario,
  cuerpo detenido, fetch detenido, límites, no logs y una única consulta mock.
- Suite integrada: 2324 PASS / 1 skipped / 227 archivos, 245,56 s.
- Build PASS (634 módulos), Vite parcheado; manifiesto histórico 43 SQL PASS.
- Empaquetado y ejecución real en Edge Runtime local v1.77.4: dos casos sintéticos
  PASS (coincidencia y rechazo de XML duplicado), sin red fiscal ni SQL. Sólo se
  montaron copias de helpers/fixtures, no .env; contenedor propio detenido.
  Evidencia fuera de Git en fiscal-edge-runtime-result.json y carpeta de probe.
- Primera invocación de bundle con import-map flag devolvió advertencia y ningún
  artefacto; no se dio por PASS. Se usó deno.json, se comprobó eszip y después HTTP
  local confirmó ejecución. Un error de fixture de prefijos y el ajuste de tipos
  nullable del DOM se corrigieron antes de la suite integrada final.

### Siguiente paso concreto de persistencia (todavía pendiente)

1. SQL privado aditivo para ligar la solicitud final/hash a operación, snapshot,
   contexto y número. Persistir cuerpo+reserva de forma atómica antes de registrar
   intención/enviar; si el número candidato cambió, abortar, no modificar cuerpo.
2. CAS de reconciliación ligado a intento/solicitud/serie: persistir sólo un CAE
   coincidente, conservar evidencia mínima y no repetir efectos comerciales.
   Una respuesta ausente/inconclusa no libera automáticamente la numeración.
3. Conservar reservas/historia al cerrar una autorización; permitir la siguiente
   reserva sólo después de resolver de manera duradera la pendiente anterior.
   Probar dos conciliadores, ACK perdido y numeración contra resolución.
4. Integrar worker con custodia/caché y validación real de actor/tenant/emisor;
   prueba hospedada e instalación con sus autorizaciones; luego punto de ensayo
   y emisión homologada expresamente autorizada. UI de estados después de contar
   con esos contratos. PR03/PR02 continúan abiertos.


Escaneo final del 21/10: 1174 archivos / 1160 de texto / 14 binarios omitidos;
46 candidatos iguales al escaneo anterior (cero agregados o retirados), sin
valores sensibles impresos; historial no reescaneado. Auditoría npm final:
0 info/low/moderate/high/critical. Contenedor Edge confirmado exited después del
ensayo. Ningún .env modificado, ningún SQL/Edge instalado, ningún comprobante
emitido. Cambios listos para commits temáticos en la rama autorizada.

### Persistencia del cuerpo fiscal — 21/10/2026 (avance local)

- Nuevo módulo aditivo 003_fiscal_requests.sql: cuerpo/hash, reserva y vínculo
  atómicos; SHA-256 nativo verificado contra el contrato TypeScript. El número
  candidato discrepante revierte la transacción completa. Misma operación no
  admite otro cuerpo. No se tocan cobro, venta, stock ni caja.
- Intención exige cuerpo durable ligado a la reserva; repetir la identidad
  retorna necesidad de conciliación, sin segundo envío. Se corrigió un CHECK
  para rechazar NULL explícitamente y se validan tipos textuales del contrato.
- Funciones privadas sin lectura/DML directo para roles API; dos barreras para
  ejecución: privilegio SQL de servicio y claim de servicio. No implica que
  la futura entrada Edge tenga autenticación/tenant/custodia ya resueltos.
- Pruebas fiscales enfocadas: 168 PASS / 4 archivos; build PASS, 634 módulos.
  Cubren rollback ante escritura omitida, sustitución del cuerpo/hash, errores
  de número/fecha/importes/contexto, falta de cuerpo, replay con ACK perdido y
  continuidad tras commit. PGlite es monoconexión: no acredita reconexión real.
- Runner PostgreSQL actualizado para ejecutar carreras con cuerpo durable.
  Primer intento no arrancó: Docker engine detenido, cero casos ejecutados.
  Se solicitó iniciar Docker; resultado posterior debe registrarse antes de
  afirmar PASS. Suite integrada en ejecución, aún sin resultado nuevo.
- Sigue pendiente el paso 2 (CAS y persistencia final de reconciliación), estados
  finales/historia, custodia y worker, instalación/aceptación hospedada y emisión
  homologada con sus gates. SQL 003 no instalado en Staging ni Production.

Cierre de verificación de este incremento (21/10): suite integrada 2345 PASS /
1 skipped / 228 archivos, 220,10 s; build PASS. Ensayo PostgreSQL 17.11 real
PASS en las seis carreras con SQL 001–003 y cuerpos durables, incluyendo ACK
perdido y conflicto con anulación. Evidencia fuera de Git:
fiscal-persistence-concurrency-20261021-retry.json. Contenedor propio detenido,
datos conservados; cero operaciones externas y cero emisiones. El primer
intento fallido por Docker detenido se conserva como evidencia separada.
Escaneo 1176 archivos, 1162 texto, 14 binarios omitidos, 46 candidatos: cero
cambios de candidatos respecto del escaneo previo, historial no reescaneado.
No se modificó .env ni se instaló SQL/Edge remoto. El siguiente incremento sigue
siendo CAS de reconciliación y estados finales, antes de conectar el worker.

### Cierre atómico y recuperación de conciliación — 21/10/2026

- SQL 004 preparado: autorización coincidente, estado AUTORIZADA, revisión 2 y
  avance único de serie se confirman en la misma transacción. Se conserva cada
  reserva histórica y se permite otra pendiente después del cierre durable.
  Resultado inconcluso persiste PENDIENTE_CONCILIACION sin liberar numeración.
- ID de observación inmutable: replay devuelve su ACK histórico; ID reutilizado
  con contenido distinto se rechaza. Un nuevo ID puede consultar de nuevo una
  pendiente, pero no habilita reenvío de FECAESolicitar. CAE contradictorio se
  rechaza y observación tardía negativa no degrada una autorización confirmada.
- Getters y RPC sólo de servicio, sin lectura/DML directo de tablas. Orquestador
  privado integra recuperación, FECompConsultar limitado, comparación completa
  y CAS. No es un endpoint; no autentica actor/tenant ni administra certificados.
  Una coincidencia en SQL proviene del trabajador confiable: SQL no demuestra
  por sí solo autenticidad de una respuesta de ARCA.
- Prueba integrada SOAP mock→comparación→SQL cubre ACK perdido después de guardar:
  replay y operación ya autorizada no hacen otra consulta. Falla de transporte
  queda pendiente; no existen efectos comerciales ni envío de comprobantes.
- 196 pruebas fiscales enfocadas PASS (49 en persistencia/recuperación). Build
  PASS, 634 módulos. Nueve carreras PostgreSQL 17.11 PASS con SQL 001–004 finales:
  dos conciliadores, CAE contradictorio, cierre contra próxima reserva, además
  de las seis carreras anteriores. Evidencia local fuera de Git:
  fiscal-reconciliation-cas-final-20261021.json; contenedor propio detenido.
- Pruebas incluyen escrituras omitidas o alteradas por triggers: no se acepta
  una confirmación que no corresponde al dato efectivamente persistido.
- Manifiesto histórico 43 SQL PASS; escaneo 1178 archivos/1164 texto/14 binarios,
  mismos 46 candidatos (delta 0). Suite integrada nueva en ejecución.
- Sigue abierto PR03: falta custodia privada/caché de TA y worker con autorización
  real de actor/comercio/emisor; emisión de homologación no implementada ni
  autorizada por este bloque. No se instalaron SQL 001–004 ni Edge remotos.
  PR02 requiere además acreditar punto de ensayo y autorizar emisión.

Verificación final de cierre (21/10): suite integrada 2373 PASS / 1 skipped /
228 archivos, 195,50 s. Build PASS; manifiesto histórico 43 SQL PASS. Edge Runtime
local v1.77.4 empaquetó y ejecutó dos aserciones sintéticas PASS: autorización y
replay con una sola consulta mock, cero SQL y cero llamadas fiscales. Evidencia
fuera de Git en fiscal-cas-edge-result.json; contenedor propio confirmado exited.
No se usaron certificados ni Token/Sign reales. Este bloque no cierra F04/F07:
continúa custodia/caché de TA y autorización del trabajador antes de Staging.

### F04 — autorización privada y caché TA local — 21/10/2026

- Inventario: checkout actual verifica Auth con getUser; la propuesta de CUIT/PV
  del navegador no acredita autoridad sobre certificado/emisor. Nuevo SQL 005
  prepara metadatos privados de emisor por comercio, sin claves/certificados/TA,
  sin filas ni habilitación automática y sin API de configuración pública.
- RPC privada verifica un único Dueño ordinario activo, actor original de la
  operación, mismo comercio activo, snapshot y coincidencia con emisor privado.
  El gate no acredita disponibilidad del punto ante ARCA ni autoriza emisión.
- Fachada usa getUser de Auth antes de resolver actor en DB; no decodifica claims
  del token ni acepta actor/CUIT/PV del request como autoridad. Su cliente real
  debe configurarse en servidor; las pruebas usan Auth simulado, no JWT hospedado.
- Composición conecta gate → recuperación → caché privada perezosa → consulta
  limitada/comparación → cierre SQL. Recuperar ACK no solicita TA ni consulta WSFE.
- Caché sólo en memoria por comercio/credencial/huella/revisión/emisor/servicio,
  con renovación anticipada y exclusión por proceso. Caducado no se usa como
  fallback; fallos/metadata ajena se rechazan. Timeout aborta fuente y no permite
  otra renovación solapada si la fuente no terminó. Capacidad acotada.
- Token/Sign no enumerables y objeto inmutable: stringify/spread habituales no
  los muestran. Esto no sustituye custodia ni habilita devolverlos al browser;
  nunca se registran errores originales de Auth/custodia ni esos valores.
- 192 pruebas enfocadas PASS; diez casos PostgreSQL 17.11 con SQL 001–005 PASS,
  contenedor propio detenido, cero operaciones externas. Evidencia local fuera
  de Git: fiscal-worker-gate-20261021.json. Suite integrada aún en ejecución.
- Compilación detectó readonly en fixture que muta credenciales; corrección de
  tipos pendiente al terminar suite activa. No presentar build previo como PASS.
- F04 sigue PARCIAL: faltan fuente real de custodia/CMS/WSAA, coordinación de TA
  entre procesos y endpoint con límites/cors/configuración privada. No se copiaron
  claves ni certificados a frontend ni se usaron los reales en este incremento.
  SQL 001–005 y nuevo worker NO instalados remotamente. F07/F08 siguen gated.

Cierre local F04 de este incremento: suite integrada 2426 PASS / 1 skipped /
230 archivos, 198,24 s. Después se corrigió únicamente el fixture mutable del
caso de TA inválido (copia de un envelope readonly); las 102 pruebas afectadas
se repitieron PASS y la compilación final PASS (634 módulos). No se repitió la
suite completa después de ese cambio de fixture; la lógica de servidor ya era
la de la suite integrada. Edge Runtime local v1.77.4 PASS en composición/replay:
una carga simulada de TA y una consulta simulada; cero SQL ni red fiscal.
Evidencia fuera de Git: fiscal-worker-edge-result.json; contenedor confirmado
exited. Diez casos PostgreSQL reales PASS, manifiesto 43 SQL PASS. Escaneo:
1184 archivos/1170 texto/14 binarios, mismos 46 candidatos (sin nuevos); no se
reescaneó historial. La revisión de permisos/caché es local: no acredita Auth
JWT/RLS hospedados ni proveedor real de certificado/TA. Próximo paso F04:
custodia/CMS/WSAA y renovación coordinada entre procesos, antes del endpoint.

### F04 — coordinación TA compartida y sobre cifrado — 21/10/2026

La especificación oficial WSAA exige usar el TA mientras siga vigente (12 horas
según esa versión). Se corrigió la renovación anticipada local: en el margen
final de 60 segundos no se envía a WSFE ni se pide otro TA; se espera vencimiento.
No se aplicó este cambio contra ARCA, sólo fixtures. Fuente primaria:
https://www.afip.gov.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf (p. 9–10).

- SQL 006 aditivo preparado: coordinación global por huella de certificado,
  entorno homologación y servicio wsfe, incluso entre comercios/aliases distintos.
  El gate privado de emisor se revalida en cada RPC. No concede SELECT/DML API.
- La intención durable precede red; un único trabajador obtiene nuevo_intento.
  Repetir/solicitar con otro ID ante estado incierto no concede nueva renovación.
  No hay liberación por timeout ni vencimiento automático del trabajador. Queda
  pendiente un procedimiento autorizado de recuperación del estado incierto,
  incluso si el fallo ocurrió antes de red o se perdió el ACK de adquisición.
- Para compartir TA se preparó un sobre AES-256-GCM mediante WebCrypto: nonce
  aleatorio de 96 bits, tag 128 bits y AAD de proyecto Staging/entorno/servicio/
  certificado/ID de clave/vencimiento. Clave CryptoKey no exportable suministrada
  sólo por un proveedor privado; no se crea ni almacena una clave real aquí.
  Referencia del algoritmo: https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#aes-gcm .
- Sólo el sobre cifrado puede llegar al SQL nuevo. Token/Sign planos continúan
  únicamente en memoria del proceso. Esto amplía la propuesta de caché compartida:
  antes de activarla se requiere autorización de instalación y provisión/custodia
  de la clave privada de cifrado; no se habilita por este commit.
- Composición de loader recupera/descifra el sobre o renueva una sola vez; clave
  de cifrado se valida antes de llamar al proveedor WSAA. Un TA válido que llega
  después del abort se conserva cifrado para no perderlo. ACK perdido al confirmar
  se recupera sin otra renovación. No hay ruta para hacer CMS ni WSAA reales aún.
- Claves antiguas de cifrado deben conservarse durante la vigencia de sobres que
  las usan. No colocar claves de descifrado en la misma DB/backup. Tras restore,
  mantener worker detenido hasta revalidar coordinación/TA y numeración; no
  restaurar una caché como prueba de autorización fiscal. Gate DR sigue abierto.
- Pruebas enfocadas 105 PASS; build PASS previo al último guard de abort (misma
  API). Doce carreras/casos PostgreSQL 17.11 PASS; dos comercios comparten una
  sola intención y el sobre confirmado. Fixture de carrera es opaco sintético;
  cifrado real y recuperación se prueban aparte con WebCrypto+PGlite. Evidencia:
  fiscal-shared-tickets-concurrency-20261021.json, fuera de Git. Contenedor propio
  detenido; cero consultas/emisiones externas.
- Suite integrada y ejecución Edge finales todavía pendientes/en curso. Fuente
  de certificado/CMS/WSAA, endpoint, instalación y aceptación hospedada siguen
  abiertos. SQL 001–006 no instalados remotamente; no credenciales reales usadas.

Verificación final compartida (21/10): suite integrada 2447 PASS / 1 skipped /
231 archivos, 211,77 s; build final PASS (634 módulos). Edge Runtime v1.77.4
local ejecutó tres aserciones con cifrado/descifrado reales y claves efímeras:
una carga WSAA simulada, una consulta fiscal simulada y recuperación en otra
caché sin renovación adicional. RPC/Auth fueron mocks, cero SQL/red fiscal.
Evidencia: fiscal-shared-edge-result.json; contenedor propio confirmado exited.
Doce casos PostgreSQL reales PASS, incluyendo exclusión entre comercios para un
mismo certificado y lectura del sobre tras commit. Escaneo 1188 archivos/1174
texto/14 binarios omitidos, mismos 46 candidatos, delta 0; historial no escaneado.
Manifiesto histórico de 43 SQL intacto. No se usaron certificados, claves o TA
reales, no se instalaron SQL/Edge ni se modificó .env. Siguiente trabajo F04:
proveedor real de custodia/CMS/WSAA y recuperación operativa de intención incierta;
activación de persistencia cifrada requiere autorización específica junto al
provisionamiento privado de claves. PR03, F04 y gates hospedados siguen abiertos.

### F04/F05 — proveedor WSAA y CMS preparados — 21/10/2026

- Nuevo proveedor privado prepara TRA de wsfe, firma CMS SignedData RSA/SHA-256
  con CryptoKey no exportable y verifica la firma contra el certificado incluido.
  Exige huella y referencia privadas, vigencia y emisor Test antes de red. No
  exporta la clave ni utiliza el certificado/clave originales en las pruebas.
- PKI.js 3.4.3 y asn1js 3.1.0 fijados; instalación sin scripts, audit npm 0 alertas.
  Deno importa esas versiones. Son dependencias de backend/pruebas, no importadas
  por el frontend; build conserva los mismos 634 módulos/artefactos de aplicación.
  Se usó motor WebCrypto explícito, sin sustituir el motor global de la librería.
- Comprobación independiente: .NET System.Security.Cryptography.Pkcs verificó
  el CMS sintético generado por el nuevo código y rechazó firma alterada. Clave
  privada nunca exportada. Evidencia fuera de Git: fiscal-wsaa-cms-dotnet-result.json.
- Transporte sólo a LoginCms de homologación, POST, redirect:error, SOAPAction
  vacío, máximo 40 s configurable hasta ese límite, 1 MiB y UTF-8 estricto. Timeout
  cubre fetch y lectura del cuerpo; sin reintento. fetcher obligatorio e inyectado.
- Parser SOAP/TA reutiliza límites XML seguros del lector fiscal; verifica raíz,
  namespace, campos directos únicos, uniqueId, DN destinatario ligado al certificado,
  DN WSAA de homologación documentado, generación/vencimiento y credenciales.
  Fault/error remoto no se refleja ni registra. Token/Sign sólo en memoria y
  no enumerables. DN soporta subconjunto ASCII simple; escapes/RDN multivaluados
  u otros atributos se rechazan. No relajar esto sin caso real y pruebas.
- Pin y emisor Test son gates locales, no una validación de cadena de confianza
  ARCA. TLS y aceptación remota siguen pendientes para esta implementación. No
  interpretar certificados sintéticos como autorización ni como CA de confianza.
- Prueba integrada con DB: Auth mock → gate privado SQL → custodia sintética →
  CMS real → WSAA mock ligado al uniqueId del CMS → TA cifrado → WSFE mock →
  conciliación durable. Replay y otra caché recuperan resultados/TA sin nueva
  custodia ni autenticación. 148 pruebas enfocadas PASS / cuatro archivos.
- Build PASS después de corregir el tipo ArrayBuffer del resultado CMS (no cambió
  lógica). Suite completa y build de release en ejecución. Escaneo 1194 archivos /
  1180 texto / 14 binarios omitidos, mismos 46 candidatos (delta 0); manifiesto
  histórico 43 SQL PASS. No historial reescaneado, ni .env modificado.
- Edge Runtime local v1.77.4: tres aserciones PASS con certificado efímero, CMS
  y cifrado reales, Auth/SQL/WSAA/WSFE mock; una carga, una autenticación simulada,
  una consulta simulada y recuperación sin repetir. Contenedor confirmado exited.
  Evidencia fuera de Git: fiscal-wsaa-edge-result.json. Ninguna red fiscal real.
- Próximo trabajo: implementar lector concreto de custodia privada (material
  cifrado y claves), recuperación operativa de intención TA incierta y endpoint
  autorizado. Luego gate de instalación/ensayo hospedado. No hay index.ts nuevo
  activado ni instalación SQL/Edge; nueva autenticación real requiere autorización.

Fuentes primarias consultadas para el contrato: documentación oficial WSAA y
su WSDL, y API SignedData/Certificate de PKI.js:
https://www.afip.gov.ar/ws/documentacion/wsaa.asp
https://www.afip.gov.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf
https://pkijs.org/docs/api/classes/SignedData/
https://pkijs.org/docs/api/classes/Certificate/
La descarga WSDL por web tool no admitió text/xml; se usó el contrato oficial
publicado y los namespaces del diagnóstico existente, sin llamada autenticada.

Verificación final del proveedor (21/10): suite integrada 2492 PASS / 1 skipped /
233 archivos, 208,75 s; compilación release PASS (634 módulos). Sin cambios de
lógica después de la suite. CMS firmado en WebCrypto/PKI.js verificado por .NET
PASS y firma alterada rechazada; Edge Runtime v1.77.4 PASS en tres aserciones
con CMS/cifrado reales y servicios mock. Contenedor confirmado exited. Audit
npm 0 alertas, seis paquetes nuevos CMS y cero versiones existentes cambiadas.
Escaneo: mismos 46 candidatos, sin nuevos. Manifiesto histórico 43 SQL PASS.
No se usaron certificados/secretos reales, no hubo red fiscal ni instalación.
Próximo paso concreto: lector de material privado cifrado y keyring (ambos sólo
servidor), distinguir fallo previo a red de intención WSAA incierta y preparar
su recuperación auditable; endpoint después. F04/PR03 continúan parciales.

### F04 — lector de custodia cifrada y keyring preparados — 21/10/2026

- Nuevo adaptador recibe un lector de secretos del servidor, sin filesystem,
  .env, VITE ni fallback. Verifica primero SUPABASE_URL de Staging exacto; un
  proyecto distinto (incluido Production) falla antes de leer material privado.
- Nombres privados derivados del UUID autorizado: revisión, certificado PEM,
  PKCS8 ENCRYPTED PRIVATE KEY y passphrase. No acepta nombres/rutas del request.
  Exige revisión y huella coincidentes antes de descifrar. PBES2/PBKDF2-HMAC-SHA256/
  AES256-CBC compatibles con el preparador .NET existente; 200000–1000000
  iteraciones, límites ASN.1/tamaños y parámetros explícitos antes de derivación.
- Importa RSA/SHA256 como CryptoKey no exportable; buffers propios de passphrase
  y PKCS8 plano se sobrescriben al finalizar. No afirmar borrado de strings
  inmutables ni de buffers internos del runtime/biblioteca. Material de retorno
  no enumera clave/certificado y source CMS vuelve a verificar pin/issuer/fechas.
- Keyring AES privado importa 256 bits no exportables por UUID; mantiene lectura
  de IDs anteriores tras rotación. Clave faltante no se reemplaza por la activa.
  No se provisionaron valores reales ni se modificó ningún secreto remoto.
- 93 pruebas enfocadas PASS (20 nuevas de custodia/keyring), incluido recorrido
  Auth mock/SQL/PKCS8 cifrado/keyring/CMS/WSAA mock/conciliación. Sólo la clave
  generadora sintética se exporta en RAM para fabricar el fixture cifrado; el
  proveedor reimporta no exportable. Ningún archivo de clave de ensayo generado.
- Interoperabilidad independiente .NET PASS: clave sintética cifrada con el
  mismo PBE/200000 del preparador, contraseña UTF-8 y certificado emitido por CA
  sintética Test; importación no exportable y firma CMS válidas. Fixture pasó
  por stdout capturado únicamente en memoria, sin imprimir ni escribir material.
  Evidencia fuera de Git: fiscal-custody-dotnet-result.json; script de prueba sin
  valores de material generado en fiscal-custody-dotnet-probe.mjs.
- Build PASS (634 módulos) después de ajustar IV explícito del tipo del fixture y
  retirar import reemplazado. Verificación de artefactos: prefijos de secretos
  del lector/keyring ausentes del frontend. Manifiesto histórico 43 SQL PASS.
  Escaneo 1197 archivos/1183 texto/14 binarios, mismos 46 candidatos (delta 0).
- Edge Runtime v1.77.4 local PASS, tres aserciones: custodia PKCS8 cifrada y
  keyring reales del código, firma/cifrado reales con secretos sintéticos,
  Auth/SQL/ARCA mock. Una carga/renovación y consulta simuladas; replay/otra caché
  no duplican. Evidencia: fiscal-custody-edge-result.json; contenedor exited.
- Fuente técnica: API CryptoEngine/PKCS8 de PKI.js fijada y formato del preparador
  existente (scripts/preparar-arca-homologacion.ps1). No se leyeron el certificado,
  clave ni DPAPI reales. Suite integrada en ejecución, no afirmar PASS todavía.
- Pendientes antes de habilitar: provisión/custodia real autorizada y gate de
  instalación, recuperación auditable que distinga fallos previos a red de
  renovación incierta, endpoint y JWT/RLS/E2E hospedados. Sigue sin index.ts
  activado ni instalación SQL/Edge nueva. No se ejecutó WSAA autenticado real.

La primera suite completa de custodia terminó con 2511 PASS / 1 FAIL / 1 skipped:
falló el conteo de Envases (nuevoStock 5 en lugar de 4). No se descartó como
intermitencia: una regresión adicional confirmó la inicialización tardía del
formulario. Corrección y dos regresiones documentadas en pilot-envases-returns.md.
Pase enfocado conjunto: 123 PASS. Se repite la suite final con salida JSON durable
porque el proceso anterior perdió el registro de terminación; no se considera PASS.

La repetición con salida JSON durable concluyó con 2432 PASS, dos tests fallidos
y cinco archivos con hook de arranque agotado (81 pendientes en total). Los dos
fallos fueron timeout del preparador PowerShell y preflight PGlite; las regresiones
nuevas de Envases pasaron. No es PASS integrado. Se repite sin build concurrente,
con dos trabajadores, sin relajar timeouts ni modificar las pruebas.

Siguiente incremento F04: separar la reserva de renovación TA de su intención de
red durable. Antes de enviar, una reserva preparada puede cancelarse únicamente
con comparación de intento/revisión y registro auditable; después de registrar
intención, un timeout conserva incertidumbre y no habilita otro WSAA. Probar ACK
perdido en cada frontera, carrera cancelar/enviar, revisión obsoleta y llegada
tardía de TA válido. Mantener el bloqueo entre procesos y la recuperación del
sobre confirmado. Este criterio está preparado; aún no implementado ni habilitado.

Cierre verificado del incremento (21/10): repetición con dos trabajadores y sin
build concurrente PASS, 2514 pruebas / 1 skipped / 234 archivos, exit 0. No se
modificaron timeouts ni se excluyeron tests para obtener el resultado. Informe
JSON durable fuera de Git: pilot-custody-envases-limited-results.json; se conserva
el informe previo fallido. Build final PASS, 634 módulos; lint enfocado sin
errores, cinco avisos react(refs) previos. Manifiesto histórico 43 SQL PASS;
escaneo 1197 archivos, 46 candidatos, delta 0. Este PASS local no cierra PR03
hospedado ni habilita la emisión. Código de recuperación TA aún pendiente.

### F04 — recuperación de preparación TA e intención de red — 21/10/2026

Se implementó SQL 007 incremental (preparado, sin instalación remota). La reserva
comienza PREPARADA; sólo iniciar_envio_ta_homologacion, por CAS de intento y
revisión, pasa a ENVIO_INCIERTO y concede nuevo_envio una vez. Repetir su ACK no
concede transporte. El proveedor firma primero y exige ese permiso antes de red.
Si falla keyring/custodia/firma sin solicitar intención, se intenta cancelar la
preparación; si hubo intención o ACK de intención perdido, no se cancela/reintenta.
Consulta privada sin secretos permite recuperar metadata tras ACK de reserva
perdido y cancelar explícitamente por CAS. Intentos cancelados quedan auditados
con fecha, nunca se reutilizan; su replay no altera generaciones posteriores.
Migrar conserva los intentos inciertos del contrato anterior como enviados.

Validación parcial: 118 pruebas enfocadas PASS (persistencia y WSAA). Quince
carreras PostgreSQL 17.11 locales PASS, incluidas enviar/cancelar en ambos órdenes
y dos trabajadores solicitando permiso de envío. Contenedor propio detenido;
datos conservados y contenedores existentes intactos. Evidencia fuera de Git:
fiscal-ta-recovery-concurrency-20261021.json. Build final PASS, 634 módulos;
el primer intento había fallado por tipos de fixtures y se corrigió usando el
validador real de binding, sin casts. Lint enfocado sin errores, un aviso previo
de control-regex del parser. Suite completa en ejecución: no afirmar PASS aún.

Límite: ENVIO_INCIERTO posterior a intención permanece bloqueado sin liberación
por timeout. La nueva recuperación sólo acredita la frontera previa al envío;
no inventa consulta de TA a ARCA ni prueba la no emisión de una respuesta perdida.
Endpoint operativo, instalación/provisión y aceptación hospedada siguen pendientes.

Edge Runtime local v1.77.4 PASS, cuatro aserciones: recorrido con custodia PKCS8,
firma y AES-GCM reales sobre fixture sintético, un permiso durable simulado y una
llamada WSAA mock, replay sin nueva renovación; permiso rechazado impide red.
SQL/Auth/ARCA se simulan en ese recorrido; carreras SQL se acreditan separadas.
Evidencia: fiscal-ta-recovery-edge-result.json. Primer acceso al contenedor recién
arrancado terminó prematuramente; se verificó detenido, se reinició sólo ese
contenedor y el recorrido terminó PASS. Contenedor propio confirmado exited.
Docker había cerrado el motor y se reabrió para este ensayo; ningún SQL remoto.
Escaneo 1198 archivos, 46 candidatos, delta 0; manifiesto histórico 43 SQL PASS.

Cierre del incremento de recuperación TA (21/10): suite completa 2532 PASS /
1 skipped / 234 archivos, exit 0, dos trabajadores y sin relajar timeouts.
Informe durable fuera de Git: pilot-ta-recovery-suite-results.json. Build final
PASS (634 módulos), 118 casos enfocados, quince carreras PostgreSQL y cuatro
aserciones Edge local PASS. Escaneo sin candidatos nuevos y manifiesto 43 SQL
intacto. No hay cambios de código posteriores a esas comprobaciones. SQL 001–007
siguen preparados, no instalados; sin credenciales reales ni llamada fiscal nueva.
Próximo gate de implementación: endpoint privado de consulta/recuperación con
Auth real, CORS y cuerpo acotados, configuración Staging cerrada y salida sin
secretos. Instalar/provisionar y ejecutar aceptación hospedada requieren su gate.

### F04 — endpoint HTTP de consulta/recuperación preparado — 21/10/2026

Nuevo arca-homologacion/index.ts y composición privada HTTP. El servidor sólo
acepta Origin del frontend Staging y POST JSON de hasta 2048 bytes (incluye
stream y límite de lectura de tres segundos). Contrato cerrado, UUID normalizados,
propiedades duplicadas/extra y solicitudes de emisión rechazadas. Flag privado
ARCA_HOMO_BACKEND_ENABLED distinto de true o proyecto distinto de Staging devuelve
503 antes de crear cliente/custodia. Gateway verify_jwt=true conservado; además
Auth.getUser verifica el JWT y SQL verifica actor original Dueño, tenant y emisor
antes de leer claves/TA. No se confía en claims decodificados por el browser.

SDK @supabase/supabase-js fijado a 2.116.0 en import map Edge. Adaptador permite
sólo GET /auth/v1/user y nueve RPC fiscales explícitas del host Staging; rechaza
tablas/funciones/destinos alternativos y redirecciones. Desactiva reintentos en
configuración y RPC; quince segundos incluyen fetch/cuerpo, máximo dos MiB de
respuesta. Auth usa JWT del caller, RPC mantiene credencial del servidor: pruebas
con dos JWT distintos acreditan que no se reutiliza una sesión local para RPC.

Acciones preparadas: CONCILIAR (operación/observación existentes), ESTADO_TA y
CANCELAR_PREPARACION_TA con intento/revisión originales. Resultados cerrados,
sin Token/Sign/certificado/clave; emision_habilitada=false. Un rechazo SQL o ACK
incierto no se presenta como éxito ni dispara reenvío automático.

Evidencia local: 146 pruebas enfocadas PASS (HTTP, SDK real con red simulada y
SQL/PGlite). Incluye custodia PKCS8, CMS, cifrado y cierre reales sobre fixture
sintético; replay HTTP no duplica WSAA ni consulta ni CAE. Recuperación/cancelación
por HTTP conserva generación posterior y rechaza intento ya enviado. Build PASS,
634 módulos; lint enfocado sin errores. Suite completa en ejecución, no PASS aún.

Edge Runtime v1.77.4 local: entrypoint real compilado/ejecutado deshabilitado por
defecto PASS (tres aserciones); integración HTTP/SDK PASS (cinco), dos llamadas
Auth mock, un permiso, un WSAA y un WSFE mock, replay/cifrado privados. Contenedores
propios confirmados exited. Evidencia fuera de Git: fiscal-http-edge-entry-result.json
y fiscal-http-edge-integration-result.json. No se acredita JWT/RLS hospedado.
Escaneo 1203 archivos/47 candidatos: único delta es literal explícito de secreto
sintético en fiscalSupabaseAdmin.test.ts:5, sin material real. Manifiesto 43 SQL
históricos intacto; módulos privados ausentes del frontend compilado.

Pendientes: instalación de SQL 001–007 y nueva Edge (primero deshabilitada),
provisión privada, pruebas hospedadas JWT/RLS/E2E y autorización distinta para
consultas fiscales reales. El flag no debe activarse sólo por autorizar deploy.
No se desplegó función fiscal, cambió configuración remota ni consultó ARCA real.
PR03 sigue PARCIAL; PR02 y emisión continúan bloqueados por sus gates.

El alcance de este endpoint es consulta/recuperación, no completa por sí solo el
backend PR03. Antes de CAE real faltan también el adaptador de último autorizado,
serialización/envío FECAESolicitar con intención durable y reconciliación, y su
integración UI. Son implementación local pendiente; luego se revisan instalación,
provisión y aceptación hospedadas. No convertir el éxito de consulta en emisión
aceptada ni omitir esos componentes para cerrar PR02/PR03.

Revisión previa a publicar: la coordinación global por certificado permite a un
worker de otro comercio autorizado compartir TA, pero el nuevo HTTP de cancelación
no debe trasladar esa capacidad al Dueño de otro tenant. Falta ligar el intento a
su operación de origen y ocultar metadata ajena antes de publicar el endpoint.
Se conserva la suite en curso como evidencia del estado previo; no editar código
mientras corre ni presentar ese pase como aceptación de la corrección pendiente.

Corrección de aislamiento antes de publicar: SQL 008 liga nuevos intentos TA a
operacion_origen_id (FK privada). Sólo esa operación puede registrar intención,
confirmar el sobre o cancelar preparación; la consulta de otra operación devuelve
COMPARTIDA sin intento ni revisión ajenos. El TA confirmado se sigue compartiendo
privadamente por certificado; no se duplica renovación por separar comercios.
No se inventa origen de historia anterior (NULL): queda no cancelable/enviable;
requiere revisión privada, no redondeo ni asignación automática. Timestamp y FK
hacen trazable el origen sin ampliar lecturas públicas de la tabla/columna nueva.

Primera suite completa del endpoint previo al guard: 2589 PASS / 1 skipped /
236 archivos; se conserva pilot-fiscal-http-suite-results.json. La revisión de
seguridad encontró luego el riesgo de cancelación cruzada, por lo que ese pase
no se usa como aceptación final. Después del guard: 150 casos enfocados PASS,
dieciséis carreras PostgreSQL 17.11 PASS, incluidas metadata/acción ajenas
rechazadas y reutilización TA conservada. Build final PASS; Edge real deshabilitado
(3) e integración HTTP/SDK sintética (5) repetidos con código final PASS. Evidencia
pre-ownership conservada por separado; contenedores propios exited y datos locales
conservados. Lint/diff/manifiesto 43 SQL PASS. Escaneo 1204 archivos/47 candidatos,
sólo el literal sintético identificado antes. Suite completa final en ejecución.
SQL 001–008 y nueva Edge continúan sin instalación ni habilitación remotas.

Fuentes para el siguiente componente: la página oficial de WebService consultada
el 21/10 anuncia manual WSFEv1 V4.7 (https://www.afip.gob.ar/fe/ayuda/webservice.asp).
El enlace actual apunta a /ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf;
su lectura por la herramienta agotó tiempo, por lo que no se afirma haber revisado
el PDF completo. Se pudo leer la documentación SOAP pública de FECAESolicitar
(https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECAESolicitar); la de último
autorizado agotó tiempo. Fueron GET de documentación sin autenticación ni emisión.
Verificar manual/WSDL vigentes al implementar envío; no tomar el manual histórico
v2.1 mencionado antes como especificación suficiente para esa etapa.

Cierre final del endpoint con aislamiento (21/10): 2593 PASS / 1 skipped /
236 archivos, exit 0, dos trabajadores y mismos timeouts. Informe durable:
pilot-fiscal-http-ownership-suite-results.json. La única omisión preexistente es
la comparación del set F6 revisado de 942 candidatos, condicionada a configurar
F6_C3A_CANDIDATES_PATH; no se omiten pruebas fiscales nuevas. Build final PASS,
150 enfocadas PASS, 16 carreras PostgreSQL PASS y Edge final 3+5 aserciones PASS.
No hubo cambios de código posteriores. El frontend compilado conserva 634 módulos
y no incluye el backend privado. Instalar SQL 001–008, desplegar Edge y provisionar
secretos siguen pendientes de autorización; no se activó el flag ni se emitió.

### F05/F06 — último autorizado y trabajador de envío preparado — 21/10/2026

Fuentes actuales obtenidas por GET público (sin autenticación): WSDL de homologación
77307 bytes y manual oficial v4.7, 203 páginas, revisión 01/09/2026. La extracción
local sí permitió leer el PDF cuyo acceso web había agotado tiempo. Orígenes y
SHA-256 se conservan fuera de Git en arca-wsfe-official-sources-20261021.json.
Manual: https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
WSDL: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?wsdl

Adaptador preparado para FECompUltimoAutorizado y un FECAESolicitar por cuerpo.
Verifica serie, admite cero como último real, rechaza errores/identidad distinta,
XML ambiguo, redirecciones y respuestas fuera de límites. PES/cotización 1 y
condición IVA explícitos; no infiere tasas ni redondea importes. Conserva IVA,
tributos y fechas del cuerpo canónico. Valida restricciones wire del manual
(punto hasta 99998, descripción hasta 80, alícuota de tributo sin redondear) antes
de pedir TA en el worker. Escape XML preserva CR y rechaza UTF-16 no válido.
Una aprobación recibida, incluso con observaciones, no se convierte en cierre:
FECompConsultar debe coincidir con cuerpo completo y el CAS existente guarda CAE.

SQL 009 preparado: permiso privado exacto de operación/hash/credencial/huella/
revisión, sin filas habilitadas por defecto, vigencia máxima una hora. No hay
DML directo ni para service_role. Callback del transporte sólo recibe permiso
nuevo tras registrar intención y consumir autorización en la misma transacción.
El vencimiento se revalida al consumir; omitir escritura o vencer durante el
registro revierte también la intención. ACK repetido no concede otro envío.
Worker requiere proyecto Staging/backend habilitado y flag privado de emisión
separado para un primer intento; recupera estados inciertos/autorizados sin
reenviar ni alterar venta, stock o caja. Numeración ya ocupada sin intento local
no se atribuye como propia ni se repara silenciosamente.

Validación local parcial: 152 enfocadas PASS, build final PASS 634 módulos;
18 carreras PostgreSQL 17.11 PASS (v3 final). El primer agregado chocó con el
pendiente que otro escenario conserva y falló 55000; se preservó ese fixture y
se probaron las nuevas carreras en series sintéticas 81/82, sin liberar datos.
Contenedores propios detenidos y datos conservados. Evidencias v1/v2/v3 fuera
Git; fiscal-emission-permit-concurrency-20261021-v3.json es el cierre final.
Primer test de timeout falló por avanzar fake timers antes de acabar la validación/
hash: corregido esperando entrar en el guard antes de avanzar, sin relajar plazo.
Lint sin errores; tres avisos control-regex (dos existentes y uno intencional
nuevo para rechazar caracteres XML prohibidos), no se deshabilitaron reglas.

Edge Runtime local: entrypoint público sigue deshabilitado (3 checks PASS).
Recorrido privado con SDK/CMS/custodia/cifrado reales y Auth/SQL/ARCA simulados
PASS: dos Auth, un WSAA, una consulta de número, un envío mock, una consulta
completa y un permiso de emisión; replay recupera el mismo resultado. No hubo
emisión real ni acceso a credenciales originales. Un error de etiqueta del
runner impidió su primer cleanup: se verificó ID/nombre/etiqueta del contenedor
propio, se lo detuvo y se repitió con etiqueta consistente. Ambos contenedores
finales confirmados exited. Evidencia: fiscal-emission-edge-*-result.json.
Escaneo 1210 archivos/47 candidatos, delta 0 respecto al anterior; manifiesto
histórico 43 SQL intacto. Backend de emisión ausente del frontend. Suite completa
en ejecución: este bloque todavía no tiene PASS integrado final.

Pendientes de integración antes de habilitar: preparación desde datos fiscales
reales/IVA de catálogo sin defaults inferidos, revisión en UI, API de emisión
controlada, resolución de rechazos/cancelación y sincronización del nuevo ledger
con bloqueos de devoluciones. El guard actual de devolución consulta afip_cae
(bootstrap/returns/002_owner_envases_return.sql:104); no reconoce todavía el CAE
privado nuevo. Auditar y reforzar antes de permitir emisión a usuarios. Notas de
crédito conservan la decisión fiscal externa pendiente documentada; no implementarla
por inferencia. El worker no modifica afip_cae ni habilita botón/endpoint de emisión.
Instalación SQL 001–009, provisión, JWT/RLS/E2E hospedados, punto verificado y primera
emisión requieren sus gates y permisos. PR03/PR02 siguen PARCIAL/PENDIENTE.

La allowlist del SDK privado incorpora dos RPC específicas para este worker
(cargar preparación y registrar envío): once en total, sin API genérica de tablas
o emisión SOAP directa. El endpoint HTTP de consulta sigue rechazando EMITIR y
el nuevo flag de emisión no está activado. La aprobación privada por cuerpo es
el gate del ensayo controlado inicial; falta diseñar su revisión/otorgamiento en
UI bajo las reglas fiscales reales antes de considerar listo el piloto comercial.

### Cierre adicional del permiso temporal — 21/10/2026

Una regresión nueva demostró que un permiso creado en el futuro podía aceptarse
antes de su vigencia. Se corrigió la comprobación de inicio tanto al cargar como
al consumir el permiso, conservando la validación de vencimiento después de los
bloqueos y el rollback íntegro. Regresión roja conservada como evidencia local;
resultado dirigido posterior: 153 PASS. PostgreSQL 17.11: 18 carreras PASS en
fiscal-emission-permit-concurrency-20261021-v4.json, contenedor propio detenido y
datos conservados. Build posterior PASS (634 módulos). La suite anterior cerró
2655 PASS / 1 skipped / 238 archivos; precede esta última regresión y no se usa
como cierre de la corrección. Suite completa posterior en ejecución. Sin llamadas
ARCA, emisión real, instalación SQL, cambios remotos ni acceso a claves originales.

### Siguiente incremento PR03 — exclusión devolución/fiscalización

Antes de activar emisión, agregar una migración fiscal incremental (sin editar
el manifiesto histórico) que serialice las devoluciones y la reserva fiscal por
la misma fila de venta. Cubrir ambas direcciones: una reserva existente impide
registrar una devolución común; una devolución existente impide reservar el cuerpo
original completo. Mantener recuperables los ACK históricos y no cambiar ventas
no fiscales. Revisar todas las inserciones en devoluciones_venta y el registro
atómico, incluidos caminos heredados; no basta con el campo afip_cae. Validar
ambos órdenes de carrera en PostgreSQL, rollback sin stock/caja y ACL/roles.
No supone resolver notas de crédito ni autoriza instalar el backend. El contrato
de notas de crédito conserva su decisión fiscal externa pendiente. Este diseño
continúa pendiente de implementación y no acredita aceptación hospedada.

Cierre integrado posterior al guard de vigencia: 2656 PASS / 1 skipped /
238 archivos, salida 0 (pilot-fiscal-emission-permission-suite-results.json).
La única omitida sigue siendo la fixture F6 de candidatos no configurada;
ninguna prueba fiscal nueva omitida. Build posterior PASS, 634 módulos;
153 enfocadas y 18 carreras PostgreSQL v4 PASS, Edge sintético 3+7 PASS.
Manifiesto 43 SQL PASS; diff sin errores; escaneo 1210 archivos, 47 candidatos,
delta 0. Este cierre reemplaza el estado de suite en ejecución anterior para
este incremento. SQL 001–009 y Edge fiscal continúan sin instalar/activar.

### PR03 — exclusión devolución/reserva preparada, 21/10/2026

SQL 010 agrega guards privados en devoluciones_venta (incluido el camino heredado)
y fiscal_reservas_homologacion. Ambos bloquean las mismas filas de ventas antes
de comprobar el otro registro. Una devolución previa impide reservar el total
original; cualquier reserva, incierta o autorizada, impide una devolución común.
La mera preparación sin reserva permite devolver y recuperar el ACK. No hay
reescritura de afip_cae, notas de crédito, importes, stock ni caja por estos guards.
Las devoluciones atómicas v1/v2 registran primero el mismo padre, por lo que el
rechazo revierte su transacción. Los permisos existentes no se amplían.

La protección exige READ COMMITTED, aislamiento de las RPC actuales. Se rechazan
REPEATABLE READ/SERIALIZABLE antes de escribir: una snapshot fija no permite
apoyarse en una consulta posterior al lock para ver un commit concurrente. No se
baja el aislamiento silenciosamente ni se actualiza comercialmente la venta para
forzar conflictos. Helpers SECURITY DEFINER con search_path fijo y EXECUTE revocado.

195 pruebas enfocadas PASS (diario/persistencia/worker/devolución real), incluida
falta de efectos de stock/lote/caja en los tres estados fiscales, reserva después
de devolución sin consumir número, replay y aislamiento/ACL. 20 carreras PostgreSQL
17.11 PASS: los dos nuevos órdenes observaron el lock real antes de liberar el
competidor. Primera ejecución falló 42501 por identidad ausente en el fixture
heredado; se agregó la identidad correcta sin eliminar el control. Evidencia
final: fiscal-return-exclusion-concurrency-20261021-v3.json; contenedores propios
detenidos, datos preservados y cero conexiones remotas. La primera compilación
marcó dos accesos unknown en pruebas; corregidos con tipos explícitos. Build final
y suite integrada en ejecución, sin declarar aún cierre integrado de SQL 010.

SQL 001–010 siguen sin instalar; los conflictos históricos, si aparecen en el
preflight de instalación, requieren conciliación y no se borran. Falta resolver
preparación fiscal/revisión UI, rechazos, aceptación hospedada y decisión externa
de notas de crédito. PR03 continúa PARCIAL y PR02 sin CAE real.

Revisión de estilo: el primer comando usó ESLint por error y no encontró su
configuración. El proyecto usa oxlint (package.json); se repitió correctamente
con npm run lint -- src/test/pilotCashReturnSql.test.ts y pasó, salida 0. Sin
cambios en package.json/lock. Build final PASS (634 módulos); escaneo 1211 archivos,
47 candidatos, delta 0; manifiesto histórico 43 SQL PASS y diff sin errores.

Cierre integrado SQL 010: 2666 PASS / 1 skipped / 238 archivos, salida 0,
registrado en pilot-fiscal-return-exclusion-suite-results.json. La omitida sigue
siendo la fixture F6 sin configurar; ninguna prueba fiscal nueva omitida. 195
casos enfocados, 20 carreras PostgreSQL v3, build 634 módulos, oxlint dirigido,
manifest 43 y diff PASS. Escaneo 1211 archivos/47 candidatos/delta 0. Este cierre
sustituye el estado anterior de suite en curso. Sin instalación SQL/Edge, sin
emisión real, sin frontend/deploy nuevo ni cambios en master/Production. Próximo:
preparación fiscal explícita y revisión UI, con resolución de rechazos y los
gates hospedados pendientes; no reutilizar defaults de punto/IVA del legado.

### Próximo incremento PR03 — revisión humana del cuerpo durable

Preparar revisión/confirmación del cuerpo exacto por el Dueño original, con Auth
real antes de SQL, sin leer custodia ni llamar a ARCA. La aprobación conserva
hash, revisión, actor y binding privado del emisor, expira y tiene identidad
idempotente/auditoría inmutable. No sustituye el permiso privado de emisión de
SQL 009 ni habilita el flag. El worker debe exigir revisión vigente antes de TA,
y DB revalidarla al consumir permiso para cerrar carreras/ACK perdido. La UI
recibirá sólo cuerpo validado, estado y recibo de revisión, nunca credenciales.
Agregar acciones cerradas de consulta/aprobación al endpoint aún deshabilitado;
EMITIR sigue fuera del contrato HTTP. Probar roles/tenant, hash/revisión alterados,
replay, expiración/rotación y ausencia de tráfico ARCA. Mantener historia y planes.

### PR03 F07 — revisión humana ligada al cuerpo, preparada (22/10/2026 UTC)

SQL 011 guarda aprobación inmutable por UUID, operación, usuario/Auth originales,
hash/revisión del cuerpo y binding privado del emisor. Vence en diez minutos; el
mismo UUID devuelve el recibo original sin extenderlo. Cambiar hash, revisión,
Auth o emisor no reinterpreta un recibo anterior. Perfil/tenant se revalidan por
el gate privado antes de leer el cuerpo. No hay filas ni flags activos por defecto.
Tablas privadas/RLS, ACL por tabla/columna revocadas y verificación de herencia.

El endpoint preparado incorpora REVISAR_COMPROBANTE/APROBAR_REVISION, con JSON
cerrado de 2 KiB, Auth.getUser y DTO validado/canónico. No devuelve credencial,
certificado, TA, permiso privado ni errores crudos. La revisión no solicita TA,
no toca custodia y no llama a ARCA. EMITIR permanece rechazado. El SDK privado
permite ahora trece RPC concretas, manteniendo host fijo, sin retries/redirecciones.

El worker exige revisión vigente antes de TA. Consumo de permiso/intención vuelve
a comprobarla en DB y enlaza revision_aprobada_id, sin sustituir el permiso exacto
privado de SQL 009. Una consulta/replay de una emisión previa sigue recuperable
sin renovar revisión ni reenviar. Preparación fiscal/IVA y UI aún pendientes; la
aprobación humana del cuerpo no acredita corrección tributaria ni punto disponible.

Regresión real en PostgreSQL local: una revisión vencida durante espera de FOR
SHARE podía consumirse. La prueba roja preservada (fiscal-owner-review-expiry-red-
20261022.json) detectó ACK habilitado en vez de 42501. Se corrigió revalidando tanto
revisión como permiso con clock_timestamp DESPUÉS del lock; ambos vencimientos
ahora revierten intención/consumo. 24 escenarios PostgreSQL 17.11 PASS, incluyendo
los dos órdenes devolución/reserva y replay concurrente de revisión. Evidencia
final: fiscal-owner-review-concurrency-final-20261022.json. Contenedores propios
detenidos, datos conservados, cero conexiones remotas y cero comprobantes reales.

131 pruebas enfocadas PASS. Edge local 3+9 checks PASS (fiscal-owner-review-edge-v2-
*-result.json), con SDK/CMS/cifrado reales y Auth/SQL/ARCA simulados: consulta,
aprobación, mismo recibo, un envío mock y una conciliación mock; ninguna lectura de
credenciales originales. El primer arnés declaró dos workerSafe por una sustitución
de nombres; se preservó su journal y se corrigió sólo el arnés. Después Docker
estaba cerrado; se inició la instalación por usuario y se repitió correctamente.
Build final/suite integrada en curso; no usar todavía un cierre integrado previo
para aceptar SQL 011. Instalación SQL 001–011/Edge, provisión privada, JWT/RLS/E2E
hospedados y emisión real conservan sus gates. PR03 PARCIAL; PR02 sin CAE real.

Revisión adicional pendiente antes de cerrar F07: transportar la identidad Auth
verificada entre las RPC de revisión/consumo. Recibir sólo usuario_id y volver a
resolver Auth desde el perfil podría atribuir a una cuenta reasignada una petición
iniciada por la anterior. Preparar getter/aprobación con actor_auth_id verificado y
wrapper transaccional del consumo que llame al gate con esa identidad, revocando
la entrada de envío sin actor para service_role. Probar reasignación entre Auth y
consulta y entre revisión y envío. No modificar fuentes hasta terminar la suite
actual; su resultado será evidencia previa a este refuerzo, no cierre final.

F07 — refuerzo de identidad completado localmente (22/10/2026 UTC): el servidor
conserva actorAuthId de Auth.getUser, separado del binding privado. Getter y
aprobación reciben esa identidad verificada, sin resolverla otra vez desde un
perfil reasignable. registrar_envio_revisado_homologacion toma el gate y consume
permiso en la misma transacción, manteniendo el lock del perfil/venta. Se revocó
registrar_envio_fiscal_homologacion a service_role y se reemplazó en la allowlist
(trece RPC en total); sólo el wrapper privado lo invoca. Consumidores anteriores
de authorizeFiscalWorker conservan su contrato. Pruebas de cambio de Auth entre
autenticación/revisión y entre revisión/envío rechazan la petición anterior,
incluso con aprobación válida de la cuenta nueva, sin POST fiscal ni consumo.

La suite integrada previa pasó 2697 / 1 skipped / 238 archivos ANTES del refuerzo;
no es su cierre. Final local dirigido: 155 PASS. PostgreSQL: 24 PASS en
fiscal-owner-review-actor-concurrency-final-20261022.json. El primer ensayo de este
refuerzo marcó 23514 en el fixture de plazo máximo por usar dos clock_timestamp;
se corrigió con una única referencia materializada, sin ampliar diez minutos.
Se preservan ambos resultados y datos. Edge final v3: 3+9 PASS, contenedores propios
exited, sin red fiscal real. Build/suite final del actor en curso. Instalación,
provisión, emisión, aceptación hospedada y UI continúan pendientes con sus gates.

Siguiente integración UI: reutilizar HistorialTicketsModal y ui/Modal, conservando
estética/tema. Consultar desde la venta seleccionada mediante resolución de la
operación en servidor, sin pedir UUID técnicos al cajero. Mostrar receptor,
fecha/concepto, desglose/importes y estado; conservar identidad de aprobación antes
del POST y recuperar el mismo recibo ante ACK perdido. Confirmar revisión no debe
mostrarse como factura emitida ni crear otro cobro. Preparación del cuerpo debe
usar datos fiscales explícitos/snapshot, sin defaults heredados de punto/IVA; no
habilitar el antiguo afip-wsfe como fallback. Mantener pendientes integración de
catálogo/tributos/envases, rechazos/NC y gates hospedados; el componente de revisión
backend preparado no acredita por sí solo esos contratos.

Cierre integrado F07 posterior al refuerzo de identidad: 2703 PASS / 1 skipped /
238 archivos, salida 0 (pilot-fiscal-owner-review-actor-suite-results.json). La
omitida sigue siendo la fixture F6 no configurada; ninguna fiscal nueva omitida.
155 enfocadas, 24 carreras PostgreSQL, Edge final v3 3+9, build 634 módulos,
oxlint dirigido y manifiesto histórico 43 SQL PASS. Escaneo 1213 archivos/47
candidatos/delta 0 respecto al cierre SQL 010; backend privado ausente del bundle
público. Este resultado reemplaza la suite anterior a Auth y los estados en curso
para este incremento. Sin nuevas dependencias, instalación SQL/Edge, provisión de
claves, tráfico ARCA autenticado, emisión real ni frontend/deploy nuevo. PR03 sigue
PARCIAL: faltan preparación fiscal y UI, rechazos/NC y aceptación hospedada. No
cambia master/Production; impresora/cajón y Point permanecen diferidos.

### F08 — preparación explícita + pantalla (en implementación)

Mantener prohibida la instalación remota. Primero definir DTO sin número/CUIT/punto/
total editables, ligado al contexto de venta y parámetros del servidor. Condición
fiscal del emisor, receptor, concepto/fechas y desglose requieren selección explícita;
ningún default del afipStore heredado. Validar A/B/C contra condición declarada y
catálogo versionado de condiciones/alícuotas antes de TA. El catálogo no se presume
acreditado por la tabla antigua de IVA global. Las consultas de parámetros reales
conservan autorización específica. Construir cuerpo sólo después de consultar el
último número por el circuito privado habilitado; persistir/reintentar el mismo
cuerpo antes de revisión. La pantalla reutiliza Modal/HistorialTickets y separa
preparación, revisión y aprobación de emisión/CAE. Recepción de envases en factura:
se preguntó por el criterio contable, pendiente; no inventar su tratamiento.
Fuentes oficiales reabiertas: página ARCA y manual enlazado v4.7 de 203 páginas;
no se adopta un supuesto v4.8 desde resultados secundarios.

### 22/10/2026 — F08: preparación explícita y revisión visual, integración aún abierta

Decisión confirmada por el titular: el tratamiento fiscal de envases vacíos descontados del ticket está pendiente de definir con su contador. Esas ventas se bloquean en la preparación; no se inventa un descuento gravado/exento ni se altera su total. Este bloqueo no se extiende a las ventas sin recepción de envases.

Primer incremento local: contrato público de preparación sin CUIT/punto/total/número editables; validación cerrada de datos explícitos, compatibilidad de clase/condición y catálogo versionado suministrado por servidor. El hash de preparación no es el hash final ni una autorización; el número provisional usado para validación estructural se elimina y nunca se reserva/emite. No se cargó catálogo real ni se acreditaron alícuotas desde fixtures.

Componentes FiscalPreparationForm y FiscalOwnerReviewPanel preparados, con controles del tema existente. Fechas dd/mm/aaaa, selección explícita de receptor/emisor/concepto/moneda, importes obligatorios y detalle IVA/tributos. Revisión muestra cuerpo completo; aprobación exige acción humana y ACK del cuerpo/revisión exactos. Respuesta tardía no aprueba otro cuerpo, la aprobación vence en pantalla y no se muestra como CAE. Sin errores privados en mensajes del formulario.

Validación local dirigida: 203 PASS en 6 archivos, incluidas 43 pruebas nuevas de este incremento; oxlint dirigido PASS. Hubo un inicio de Vitest impedido por spawn EPERM y tres fallas iniciales de matchers no instalados; se corrigieron usando comprobaciones DOM existentes y se volvió a ejecutar. Build inicial PASS anterior al formulario; compilación posterior debe acreditarse por separado.

Estado deliberadamente PARCIAL: componentes aún no conectados a HistorialTicketsModal; faltan contexto fiscal autenticado/catálogo acreditado, persistencia de preparación vinculada a snapshot/actor/emisor, resolución de operación desde venta, identificadores durables antes del POST, consulta privada de último número y enlace al cuerpo SQL 003/011. Clasificación del emisor es declarada por Dueño, no verificación de padrón. El catálogo sintético no acredita compatibilidad fiscal real ni cálculo de alícuotas. No cerrar preparación/UI ni aceptación E2E con estas pruebas aisladas. La suite global 2703 PASS corresponde al HEAD f50c974, no a este trabajo local.

Sin SQL fiscal nuevo instalado, Edge desplegado/habilitado, provisión de claves, llamadas autenticadas a ARCA, emisión, merge ni cambios en master/Production. Mantener primer CAE y aceptación hospedada pendientes. Impresora/cajón y Point continúan diferidos. Próximo paso: completar persistencia y adaptación autenticada antes de conectar/activar la pantalla.
Cierre local de este incremento F08: build posterior al formulario PASS (634 módulos), oxlint dirigido PASS, manifiesto histórico 43 SQL PASS y escaneo 1220 archivos/47 candidatos, delta 0 respecto a F07. Evidencias: pilot-fiscal-explicit-preparation-ui-targeted.log, pilot-fiscal-explicit-preparation-ui-final-build.log y pilot-fiscal-explicit-preparation-ui-scan-verified.log fuera de Git. No se ejecutó nuevamente la suite global; 203 PASS es la selección dirigida actual. No se desplegaron los componentes ni se integraron al flujo operativo.

F08 continuación local: preparar SQL 012 sin instalación, con catálogo privado versionado/vigente (sin filas habilitadas ni valores fiscales sembrados), contexto desde venta y Auth verificado, preparación canónica/SHA inmutable ligada a snapshot/actor/emisor y replay exacto. Reutilizar validador SQL 003 mediante número estructural que no se reserva/persiste. Separar futuras consultas de numeración de esta escritura sin red; negar recepción de envases hasta criterio contable. Probar permisos, identidad ajena, cambios de snapshot/emisor/parámetros, ACK perdido y rollback, antes de adaptar HTTP/UI. No cambiar los contratos antiguos ni simular un JWT de usuario en service_role.
### 22/10/2026 — F08: guardado durable explícito preparado (sin instalación)

SQL 012 agrega catálogo privado versionado/vigente y preparación inmutable. No siembra filas ni habilita catálogos. Fuente/fechas/revisión son metadatos de aprovisionamiento pendiente, no prueba automática de parámetros ARCA reales. El servicio verifica Auth una sola vez y conserva ese actor hasta contexto y escritura. DB revalida actor/pertenencia, comercio, venta con artículos, emisor y parámetros bajo locks; toma total y snapshot desde servidor. No simula auth.uid() de usuario con service_role.

La escritura conserva el UUID/canónico/hash original y se repite con el mismo ACK. Rechaza otra identidad, cuerpo, Auth, emisor o snapshot. El wrapper de cuerpo final exige datos exactos preparados (excepto el número observado), parámetros vigentes y actor/emisor originales antes de llamar a SQL 003. La preparación sola no reserva número ni toca TA, stock/caja o red fiscal. Se mantiene tratamiento de envases bloqueado por decisión contable pendiente. La validación estructural reutiliza SQL 003 con un número que no se guarda ni reserva; no se muestra como numeración autorizada.

SDK privado amplía la lista cerrada de 13 a 16 RPC: contexto, guardado y enlace final; no expone tablas ni la entrada SQL 003 sin preparación. Los nuevos métodos aún no están conectados a acciones HTTP/UI. No habilita ninguna emisión ni consulta ARCA por agregar RPC. Clasificación del emisor sigue declarada por Dueño y el cálculo/compatibilidad de alícuotas reales depende de catálogo acreditado/provisión pendiente.

Evidencia dirigida actual: 130 PASS / 4 archivos, incluidas 33 nuevas de SQL/servicio. PostgreSQL 17.11 local: 28 escenarios PASS, incluidos doble guardado, reasignación Auth, cambio de venta y vencimiento de catálogo después de esperar lock (fiscal-durable-preparation-concurrency-20261022.json). Contenedor propio detenido, datos conservados, externos/emisiones 0. Se conservan el fallo inicial de fixture con columna incorrecta y una regresión SQL roja por condiciónEmisor null; corregida comprobando tipo string antes de guardar. No quedaron pruebas omitidas en el pase dirigido. Oxlint dirigido salida 0, con advertencia no-unsafe-finally preexistente en cleanup del runner; manifiesto histórico 43 SQL y diff PASS. Build previo al último ajuste del SDK PASS; cierre de build/suite final todavía pendiente.

PR03/F08 continúa PARCIAL. Faltan acciones HTTP anidadas con control de duplicados/límites, recuperación por venta, UUID durable en cliente, consulta privada de último número con gate propio y unión de los componentes a HistorialTicketsModal. SQL 001–012/Edge sin instalar; no provisión, llamadas fiscales autenticadas, CAE ni deploy nuevo. No modificar master/Production, ni integrar PR #3. Rechazos/NC y aceptación hospedada siguen abiertos; impresora/cajón y Point diferidos.
Control previo a integrar/activar la pantalla: el bootstrap estricto no declara afip_cae en ventas, pero anulación 029 detecta esa columna heredada mediante to_jsonb(v). El nuevo contexto de preparación todavía debe incorporar ese control y recuperar una factura/operación ya existente desde la venta, evitando ofrecer otra preparación. No confundir replay de DATOS_PREPARADOS con estado fiscal actual. Este pendiente queda dentro de F08 antes de HTTP/UI y aceptación, no como excepción de publicación. La suite global en curso corresponde al incremento actual anterior a ese refuerzo.
Cierre integrado de este incremento de persistencia F08: 2779 PASS / 1 skipped / 243 archivos, salida 0 (pilot-fiscal-durable-preparation-suite-results.json). La única omitida sigue siendo la fixture F6 no configurada; ninguna fiscal nueva omitida. 130 dirigidas, 28 escenarios PostgreSQL y build final de 634 módulos PASS. Oxlint de archivos finales sin hallazgos; se conserva advertencia preexistente de finally en el runner. Manifiesto histórico 43 SQL PASS, diff sin errores, escaneo 1224 archivos/47 candidatos/delta 0. Backend privado ausente del bundle público. Este cierre reemplaza los estados de build/suite pendientes anteriores para este incremento, sin cerrar F08 ni las limitaciones de integración/heredados identificadas. SQL 001–012 y Edge siguen sin instalar/activar; cero emisiones, nuevas consultas ARCA autenticadas o deploy frontend.
F08 siguiente integración: extraer gate privado de acceso a venta (Auth→perfil→comercio→venta) para reutilizarlo en contexto y resolución por venta. Detectar cualquier afip_cae heredado no vacío mediante to_jsonb, sin depender de una columna ausente en bootstrap; no inferir validez fiscal de ese registro. Resolver estado/id originales desde venta, sin requerir emisor/catálogo habilitado para saber que ya existe una preparación o autorización. No atribuir operaciones sin vínculo Auth probado a una cuenta reasignada. Servicio/HTTP deben devolver DTO cerrado sin binding/custodia; UI recuperará el mismo flujo antes de proponer datos nuevos.
### 22/10/2026 — F08: HTTP, recuperación por venta e integración visual detrás de flag

Se extrae gate privado Auth→perfil→comercio→venta para reutilizarlo en contexto y resolución. SQL 012 detecta registro afip_cae heredado no vacío vía to_jsonb, incluso cuando el bootstrap estricto no tiene esa columna; bloquea nueva preparación sin afirmar validez de ese registro. Resolver devuelve estado/id originales sin exigir catálogo/emisor activos. Auth reasignado o snapshot cambiado requiere revisión sin exponer id previo. No se vuelve a inferir identidad desde perfil para atribuir el intento a otra cuenta.

Acciones HTTP nuevas RESOLVER_VENTA, DATOS_FISCALES_VENTA y GUARDAR_DATOS_FISCALES. JSON con claves duplicadas (también escapadas/anidadas) y profundidad >12 se rechaza antes de Auth. Guardado tiene máximo 64KiB; consultas/revisión conservan 2KiB; timeout de cuerpo 3s y CORS/origen/host/flag privados conservados. SDK privado amplía allowlist a 17 RPC, sólo agregando resolución. Sin acción EMITIR, TA ni consulta ARCA desde estas acciones.

Cliente conserva UUID y datos exactos antes del POST; almacenamiento fallido impide envío, ACK perdido permite mismo intento, otro cuerpo no reemplaza pendiente. Scope por Auth/comercio/venta; los datos del receptor se retiran tras ACK o GET que recupera ese mismo UUID, conservando sólo identidad local. Aprobación conserva UUID/hash/revisión y vigencia para replay. Verificación de sesión en navegador evita usar la cuenta anterior; no sustituye Auth.getUser/SQL en servidor. Respuestas tardías no cambian otra venta seleccionada.

HistorialTicketsModal integra FiscalDocumentModal para Dueño activo ordinario con flag VITE_KIOSKO_ARCA_REVISION_HOMO=true y piloto estricto. Flag nuevo NO configurado/habilitado. Emisión heredada no es fallback del flujo nuevo. Modal reutiliza estilos/componentes existentes: carga explícita, guardado pendiente, preparación guardada, revisión exacta y aprobación separada de emisión/CAE. Registro heredado o contexto dudoso no ofrece datos nuevos. Si se recupera AUTORIZADA y falla el detalle, se conserva ese estado sin proponer otro comprobante. Se asigna useId al título de Modal para distinguir diálogos anidados; sin cambio de colores/tema.

Pruebas dirigidas actuales: 162 PASS / 8 archivos, con guard de sesión/proyecto, replay tras reinicio, almacenamiento fallido, privacidad tras ACK, historial por roles, carga/guardado/revisión y selección cambiada. PostgreSQL 17.11 local: 30 escenarios PASS, incluidos resolver que espera guardado y CAE heredado confirmado mientras contexto espera venta; contenedor propio detenido y datos conservados. Evidencia fiscal-sale-resolution-concurrency-20261022.json. Build inicial identificó unión discriminada HTTP y literal boolean de fixture; corregidos sin casts de producción. Compilación posterior PASS; último cierre del mensaje de recuperación aún requiere build/suite final. No interpretar suite global 2779 anterior como cierre de estos cambios.

F08 sigue PARCIAL: falta gate privado de consulta de último número y orquestador preparación→cuerpo/reserva→revisión para la primera solicitud, recuperación de constancia fiscal completa, rechazo/cancelación/NC y aceptación hospedada/visual real. Estado DATOS_PREPARADOS se muestra como tal, no como revisión ni factura. Catálogo real/punto de venta/custodia aún sin acreditar/provisionar. Envases descontados del ticket continúan pendientes de contador. SQL 001–012 y Edge siguen sin instalar/activar; frontend nuevo no desplegado. No tráfico ARCA autenticado, CAE, merge ni modificación de master/Production. No activar flag antes de completar esos gates; impresora/cajón y Point siguen diferidos.
Auditoría durante la suite: resolver oculta una preparación cuyo Auth original fue reasignado, pero el getter SQL 011 todavía autoriza por perfil actual y puede recibir un UUID conocido por fuera del historial. Antes de publicar este incremento, añadir validación de actor_auth_id de preparación también en el getter/aprobación del servidor. Conservar compatibilidad de SQL 011 anterior a tabla 012 mediante comprobación explícita de existencia (no inferir Auth desde perfil para preparaciones 012). Probar petición directa de nuevo Auth a cuerpo reservado, sin depender de la UI. La suite en curso precede este refuerzo y no podrá presentarse como su cierre.
Refuerzo F08 posterior a la auditoría de permisos: getter/aprobación SQL 011 y wrapper/trigger de consumo exigen Auth original cuando existe preparación 012. No basta el filtro del historial. Helper privado revocado a todos los roles externos; compatibilidad 011 antes de tabla 012 comprobada tanto en PGlite como PostgreSQL. Petición directa con UUID conocido y Auth reasignado rechazada. Una revisión histórica sintética del Auth ajeno tampoco habilita consumo. Vigencia se evalúa después de los locks y del nuevo guard.

Cliente fija Authorization al token de la sesión que comprobó, en vez de permitir que el SDK seleccione otra cuenta entre getSession e invoke. Token sólo en memoria: no entra a almacenamiento, UI ni logs. Se verificó en el código instalado de FunctionsClient la precedencia de headers explícitos. Sin token de esa sesión no se envía la petición.

Evidencia posterior: 203 PASS dirigidas / 9 archivos; PostgreSQL 32 escenarios PASS (fiscal-sale-resolution-original-actor-concurrency-20261022.json), contenedor propio detenido con datos conservados. Suite global anterior a este guard: 2847 PASS / 1 skipped / 247 archivos (pilot-fiscal-sale-resolution-suite-results.json), no es el cierre del refuerzo. Se conservan la regresión roja de acceso directo y un pase intermedio fallido por referencia de trigger situada en otra función; corregida su ubicación y repetidas las pruebas. Build final del token y suite posterior aún pendientes de cierre.

Escaneo final: 1233 archivos, 48 candidatos; único delta frente a 47 es src/test/fiscalBrowserClient.test.ts:9, asignación explícita de token SINTÉTICO de fixture, revisada como no real. No se ocultó ni ofuscó el candidato. Ninguna credencial real nueva incorporada; claves/certificados originales no usados. Gates remotos/primera emisión permanecen cerrados y F08 continúa parcial por numeración/cuerpo/constancia/rechazos y aceptación.
Pendiente de corrección antes de activar F08: cliente conserva datos antes de POST y trata el error de servidor como incierto. Si los importes tienen formato válido pero no suman el total, la validación servidor rechaza antes de guardar y el pendiente local impide corregir el cuerpo. Añadir validación fiscal pública previa al almacenamiento (reutilizando reglas puras sin importar transporte/TA/custodia al frontend) y definir recuperación/edición tras rechazo definitivo sin descartar una escritura incierta. Mantener prueba de repro de ese caso y no borrar/cambiar UUID a ciegas. Este caso y la consulta privada de numeración bloquean la activación; el flag sigue inicialmente apagado y el incremento no se despliega en este bloque.
Cierre integrado posterior a todos los refuerzos de este incremento: 2850 PASS / 1 skipped / 247 archivos, salida 0 (pilot-fiscal-sale-resolution-original-actor-suite-results.json). La única omitida sigue siendo fixture F6 no configurada; ninguna fiscal nueva omitida. 203 dirigidas / 9 archivos, 32 escenarios PostgreSQL y build final 642 módulos PASS. Manifiesto histórico 43 SQL y diff PASS; oxlint de archivos nuevos/fiscales dirigido sin hallazgos, advertencias preexistentes en efectos de Modal/Historial y finally del runner conservadas. Escaneo 1233 archivos/48 candidatos: único delta es token explícitamente sintético de fixture, no credencial real. Entradas privadas SQL/worker ausentes del bundle. Este cierre reemplaza resultados previos/en curso para el incremento, sin cerrar F08: corrección de datos rechazados, numeración privada/orquestación, constancia, rechazos/NC y aceptación siguen pendientes antes de activar. No deploy frontend ni instalación SQL/Edge; no llamadas ARCA autenticadas, CAE, merge ni cambios en master/Production.
F08 continuación: separar validación de contrato fiscal de transporte SOAP (sin red/TA/custodia en navegador). Reutilizar exactamente preparación pura en formulario y frontera cliente antes de persistir el primer UUID/cuerpo. Rechazo local debe permitir corregir campos sin pendiente ni POST. Un pendiente ya enviado conserva cuerpo/UUID; no se valida contra catálogo cambiado para reemplazarlo ni se borra automáticamente. Resolver aún cancelación/rechazo definitivo de intentos persistidos mediante contrato auditable, no mediante borrado local. Probar suma/IVA/documento/período incorrectos y corrección posterior, además de ACK perdido y bundle sin transporte privado.
F08 siguiente bloque autorizado sólo para desarrollo/pruebas: SQL 013 carga preparación privada por operación con Auth original, snapshot, emisor y catálogo vigentes; si ya existe cuerpo, recuperarlo antes de TA/red. Worker privado de reserva construye cuerpo sólo tras FECompUltimoAutorizado, con gate independiente ARCA_HOMO_PREPARATION_ENABLED inicialmente cerrado. Revalidar antes de consultar y persistir con wrapper 012; reintento/ACK perdido recupera mismo cuerpo, sin FECAESolicitar ni aprobación automática. HTTP/UI nuevo paso PREPARAR_COMPROBANTE sólo devuelve revisión pública. Cualquier consulta WSAA/WSFE real conserva autorización específica pendiente; no instalar/habilitar para probar. Verificar flag/cuenta/metadatos, dos trabajadores, último número/overflow, ACK perdido y ausencia de envío fiscal.
### 22/10/2026 — F08: validación previa y primera preparación de cuerpo, sólo local

Se separa fiscalEmissionContract (reglas puras de cuerpo) del transporte fiscalWsfeEmission. Formulario y cliente reutilizan prepareFiscalData antes de crear primer UUID/cuerpo local. Suma/documento/período/desglose inválidos pueden corregirse sin pendiente ni POST; otro envío simultáneo reusa identidad después de la validación asíncrona y una mutación del llamador no altera la copia validada. Pendiente incierto ya existente mantiene cuerpo/UUID y no se sustituye ni borra. Rechazo definitivo posterior al envío aún requiere contrato auditable de resolución/cancelación.

SQL 013 carga fuente privada vinculada a Auth original, snapshot, emisor y catálogo; cuerpo existente se recupera antes de TA/red, incluso con gate de preparación cerrado. Sin body sólo lee datos explícitos guardados. Worker prepareFiscalVoucher valida canónico/hash/contexto, exige ARCA_HOMO_PREPARATION_ENABLED=true (no configurado/habilitado), carga TA mediante custodia/caché existentes y sólo consulta FECompUltimoAutorizado. Revalida origen justo antes de red, agrega número observado+1 y persiste mediante wrapper 012. Éxito exige leer cuerpo durable; ACK falso/sin commit no confirma. ACK perdido/concurrencia recupera mismo cuerpo; no FECAESolicitar, aprobación, permiso privado ni movimiento venta/stock/caja. Overflow y cambios de actor/emisor se rechazan.

Contexto 012 rechaza devolución previa antes de cargar TA/consultar numeración (guard 010 en reserva sigue vigente). Se observa también devolución que gana el lock mientras fuente espera. HTTP/UI PREPARAR_COMPROBANTE conduce de datos guardados a revisión del cuerpo reservado; fuente privada/custodia nunca se retornan al cliente. Frontend tiene timeout acotado de 40s para ese paso, conserva sesión fijada y recupera por operación ante respuesta incierta. Flag frontend y gate privado siguen apagados; no se usaron claves originales ni se consultó ARCA realmente.

Pase dirigido actual: 264 PASS / 9 archivos. PostgreSQL 17.11 local: 34 escenarios PASS en fiscal-body-preparation-concurrency-final-20261022.json; contenedor propio detenido, datos conservados. Primer intento no arrancó por Docker detenido, preservado como FAIL/cero casos; motor per-user reabierto Hidden y ensayos posteriores separados. Se conservan fallo inicial TypeScript por import de tipo removido y fixture de devolución sin Auth; corregidos sin debilitar permisos. Build final PASS 644 módulos, manifiesto histórico 43 SQL y diff PASS, oxlint dirigido sin hallazgos. Escaneo 1236 archivos/48 candidatos, delta cero frente al cierre anterior (token sintético ya documentado). Consulta/transporte/entradas privadas ausentes del bundle; sólo validación pura se comparte.

Estado: la unión local datos→fuente→consulta simulada→cuerpo durable→revisión está preparada y probada; no acredita gateway Edge nuevo ni JWT/RLS/ARCA hospedados. SQL 001–013 y Edge sin instalar/activar; cero nuevas consultas autenticadas/emisiones reales o deploy frontend. F08/PR03 aún parcial: cancelación/rechazos posteriores a envío, constancia completa/NC, catálogo/punto/custodia reales y aceptación hospedada/visual permanecen gates. Envases descontados siguen pendientes del contador. Production/master intactos, sin merge; impresora/cajón y Point diferidos. La suite global 2850 anterior no es cierre de este incremento: falta el pase global actual.
Cierre integrado de este incremento F08: 2876 PASS / 1 skipped / 247 archivos, salida 0 (pilot-fiscal-body-preparation-suite-results.json). La única omitida sigue siendo fixture F6 no configurada; ninguna fiscal nueva omitida. 264 dirigidas / 9 archivos, 34 escenarios PostgreSQL y build final 644 módulos PASS. Oxlint dirigido sin hallazgos, manifiesto histórico 43 SQL y diff PASS. Escaneo 1236 archivos/48 candidatos, delta cero; candidato sintético previo conservado. Consulta, gate y transporte privados ausentes del bundle. Sustituye los estados de suite en curso/2850 previo para este incremento. No se desplegó frontend ni se instaló SQL/Edge; no TA real, consulta ARCA autenticada, emisión ni merge. F08/PR03 no se da por completado: quedan resolución auditable de rechazos/incertidumbre, constancia/NC, provisión y aceptación hospedadas con sus autorizaciones, además de los gates comerciales/Production.
### 22/10/2026 — F08: constancia fiscal recuperable, siguiente incremento

Contexto verificado: HEAD 3a3cfd3 conserva estado AUTORIZADA y revisión del cuerpo, pero no ofrece constancia completa. Plan incremental: (1) contrato público cerrado de constancia vinculado a operación, venta y hash del cuerpo, validando CAE/vencimiento sin interpretar aprobación como autorización; (2) getter privado con Auth original y registro durable, sin TA/red ni dependencia de catálogo vigente para lectura histórica; (3) servicio/HTTP/cliente y presentación en modal; (4) pruebas de aislamiento, datos alterados, recuperación histórica y respuestas tardías. Reutilizar reglas puras de conciliación, sin importar transporte/custodia en navegador. No construir constancia desde campos heredados ni desde un ACK de aprobación. No instalar SQL/Edge ni habilitar flags. Esta entrada inicia el trabajo: no acredita getter, UI, autenticidad remota ni CAE real. Envases descontados siguen pendientes de definición del contador.

Avance local del contrato de constancia (sin conectar todavía al getter/HTTP/UI): fiscalReceipt valida DTO cerrado HOMOLOGACION/AUTORIZADA, operación y venta esperadas, hash del cuerpo, CAE no nulo y fechas mediante las reglas puras de conciliación existentes. Copia/congela datos y captura identidad/valores antes de awaits; rechaza metadatos privados, aprobación sola, estado incierto, cuerpo alterado y fechas imposibles. Recuperación histórica no exige vigencia actual del CAE ni inventa fecha de proceso. La validez estructural del DTO NO autentica ARCA: el getter futuro debe obtener estos campos del ledger privado y aplicar Auth original. No se generó una constancia desde una respuesta candidata ni desde campos heredados.

Validación de este paso: 88 PASS dirigidas / 2 archivos (pilot-fiscal-receipt-contract-targeted-final.log), build PASS, oxlint dirigido sin hallazgos y diff sin errores. Escaneo 1238 archivos/48 candidatos, sin aumento frente al cierre 3a3cfd3. No suite global nueva ni escenarios PostgreSQL nuevos porque aún no hay cambio SQL ni integración de ejecución; 2876/34 previos siguen siendo evidencia del incremento anterior. Pendientes del mismo plan: getter privado, enlace HTTP/cliente/modal y sus pruebas; no dar constancia completa por implementada ni activar flags. Sin deploy, instalación, tráfico ARCA, CAE real o cambios master/Production.

### 22/10/2026 — F08: recuperación privada de constancia e integración en modal

SQL 014 agrega cargar_constancia_fiscal_homologacion, sólo service_role: gate activo de Dueño/comercio/venta, operación vinculada y Auth original explícito en preparación 012. Lectura exige cuerpo/reserva/ledger autorizados, intento/hash/revisión y ACK exactos coherentes. No usa custodia, TA, catálogo ni emisor vigente para recuperar autorización histórica; no atribuye operaciones heredadas sin Auth original probado. Mantiene orden de locks perfil→comercio→venta→operación. No toca venta, stock, caja, permisos ni numeración. Reutiliza las tablas privadas existentes sin nuevos grants de lectura de tablas.

Servicio obtiene Auth.getUser una vez y conserva ese actor hasta getter; valida DTO cerrado y hash/CAE/fechas antes de responder. CONSTANCIA_COMPROBANTE exige venta y operación (2KiB), conserva origen/host/flag cerrados y no llama red fiscal. SDK privado limita acceso a Auth y 19 RPC explícitas. Cliente coteja venta/operación y no persiste constancia ni datos del receptor. AUTORIZADA en modal carga constancia separada de aprobación/revisión; muestra CAE, vencimiento, emisor/número/receptor/importes/desglose y aviso de homologación sin validez fiscal. Si falla lectura, conserva estado autorizado y permite consulta, sin preparar otra factura. Respuestas tardías no aparecen en otra venta. No se integra todavía con representación fiscal final/PDF/QR ni se completan datos legales del emisor desde defaults actuales: esa constancia es una vista del ledger de homologación, no acredita un comprobante real.

Pruebas dirigidas: 249 PASS / 8 archivos (pilot-fiscal-receipt-integration-targeted-final.log). PostgreSQL 17.11: 36 escenarios PASS (fiscal-receipt-integration-concurrency-20261022.json), incluidos lectura mientras cierre atómico espera commit y Auth reasignado durante espera; contenedor propio detenido, datos conservados, externos/emisiones cero. Ensayo inicial tuvo dos fixtures inválidas (intento de modificar venta protegida y SuperAdmin con comercio), corregidas respetando guards, sin relajar producción; el log fallido se conserva. Build final PASS 646 módulos, manifiesto 43 SQL y diff PASS. Oxlint dirigido sin nuevos hallazgos; warning no-unsafe-finally preexistente del runner conservado. Escaneo 1241 archivos/48 candidatos, delta cero. Entradas SQL/consulta/custodia privadas ausentes del bundle público. Suite global actual en curso; todavía no atribuir 2876 anterior al cierre nuevo.

PR03/F08 sigue PARCIAL: quedan resolución auditable de rechazos definitivos/incertidumbre tras envío, cancelación/NC, representación fiscal final cuando proceda, parámetros/PV/custodia reales y aceptación hospedada/visual con JWT/RLS/E2E. SQL 001–014 y Edge preparados, NO instalados ni habilitados; flags apagados, sin deploy frontend ni consultas ARCA autenticadas/emisión real. PR02 sin CAE real. Envases descontados del ticket pendientes del contador; impresora/cajón y Point diferidos. Master/Production intactos, sin merge. Recuperación integral de respaldo continúa bloqueada hasta instalación/aceptación autorizadas.

Cierre integrado de este incremento F08: 2926 PASS / 1 skipped / 248 archivos, salida 0 (pilot-fiscal-receipt-integration-suite-results.json). La única omitida sigue siendo f6-2d-c3c2-enrichment por fixture de candidatos no configurada; ninguna fiscal nueva omitida. 249 dirigidas / 8 archivos y 36 escenarios PostgreSQL PASS, build final 646 módulos PASS. Manifiesto histórico 43 SQL, diff y revisión de bundle PASS; oxlint sin nuevos hallazgos, warning de finally preexistente documentado. Escaneo 1241 archivos/48 candidatos, delta cero. Este cierre sustituye las referencias anteriores a suite en curso para este incremento; no convierte evidencia sintética local en aceptación JWT/RLS/ARCA hospedada. Flags siguen apagados y SQL 001–014/Edge sin instalar/activar. Sin nuevas consultas ARCA autenticadas, emisión, deploy frontend, merge ni cambios master/Production. Próximo gate local: registrar y resolver rechazos/incertidumbre de manera auditable conservando cuerpo/intento y sin liberar reservas por una respuesta aislada; después cancelación/NC y demás dependencias de aceptación.

### 22/10/2026 — F08: auditoría durable de respuesta de emisión, inicio

Situación: sendFiscalEmission clasifica aprobación/rechazo/códigos, pero el worker descarta esa recepción y sólo concilia. Próximo incremento: contrato puro cerrado y ledger privado append-only por operación/intento/hash/Auth original de la revisión consumida; escritura idempotente más lectura durable para recuperar ACK perdido. Registrar sólo la clasificación/códigos validados, nunca SOAP, TA ni un CAE candidato como autorización. Un resultado distinto para la misma identidad se rechaza sin sobrescribir. El registro puede completar la evidencia tras revocación/expiración posterior al envío ya concedido, usando vínculos históricos del permiso/revisión (no habilita otra emisión ni acceso de otra cuenta). Conciliar sigue obligatorio; fallo de auditoría no debe impedir la consulta de reconciliación ni mostrarse como éxito completo. Sin respuesta recibida por timeout no inventar un rechazo. Probar permisos, identidad original/reasignación, ACK perdido/falso, concurrencia y conservación de reserva/stock/caja. La resolución/corrección definitiva y cancelación/NC continúan después: registrar un rechazo aislado no libera número. SQL/Edge/flags no se instalan/activan ni se llama ARCA real.

### 22/10/2026 — F08: recepción de emisión privada e inmutable, implementación local

SQL 015 agrega fiscal_respuestas_emision_homologacion, tabla privada RLS sin grants de tabla/columnas y trigger que rechaza UPDATE/DELETE. Clave operación/intento; respuesta cerrada contiene sólo clasificación, hasta 200 códigos enteros (errores + observaciones) y puedeReenviar=false. No almacena SOAP, mensajes libres, TA, CAE candidato ni credenciales. Helper privado exige intento durable, hash exacto, permiso consumido y revisión de Auth original; también guard de preparación 012 cuando existe. No deriva Auth del perfil actual. Cambios posteriores del perfil/emisor, revocación o expiración no conceden otro envío ni impiden conservar evidencia de uno ya autorizado. Este getter de evidencia es sólo para trabajador privado: NO reutilizar como ruta pública sin gate activo de Dueño/comercio/venta.

Escritura idempotente devuelve el mismo registro; respuesta distinta para el mismo intento falla cerrada sin sobrescribir. Persistencia siempre relee DB después del intento de escritura: ACK perdido se recupera, ACK falso/sin commit no confirma. SDK amplía allowlist a 21 RPC, sin acceso genérico a tablas. Worker conserva la clasificación válida de sendFiscalEmission y registra antes de reconciliar; si registrar no se confirma, igual intenta consulta íntegra y luego informa FISCAL_RESPUESTA_NO_CONFIRMADA. Un CAE real guardado por la conciliación no se deshace por ese fallo; la evidencia faltante sigue siendo deuda auditable. Reintento de operación ya enviada sólo concilia, no repite POST para reconstruir recepción perdida. Timeout/parseo fallido sin recepción válida no inventa rechazo. Una respuesta R y una autorización posterior por consulta íntegra quedan como evidencias separadas, sin sobrescribir la recepción anterior.

Pruebas dirigidas actuales: 202 PASS / 5 archivos (pilot-fiscal-emission-audit-targeted-final.log). SQL 001–015 aplicado dos veces en fixtures embebidas. PostgreSQL 17.11 local: 38 escenarios PASS (fiscal-emission-audit-concurrency-20261022.json), incluidos dos auditores/replay tras ACK perdido y recepción contradictoria después de esperar lock. Contenedor propio detenido con datos conservados, sin externos/emisiones. Build PASS 646 módulos; manifiesto histórico 43 SQL y diff PASS. Oxlint sin nuevos hallazgos; warning no-unsafe-finally preexistente del runner conservado. Escaneo 1245 archivos/48 candidatos, delta cero frente al cierre anterior. Suite global de este incremento en curso: 2926 anterior no es cierre nuevo.

PR03/F08 sigue PARCIAL. Registrar recepción no resuelve un rechazo definitivo, no corrige cuerpo, no libera número y no concede reenvío/cancelación. Falta diagnóstico público con gate activo, resolución auditable de rechazos/incertidumbre, corrección/cancelación/NC y representación fiscal final, además de parámetros/PV/custodia y aceptación hospedados. SQL 001–015 y Edge sin instalar/habilitar; ninguna acción HTTP de emisión, flags apagados, sin consultas ARCA autenticadas, CAE real ni deploy frontend. Master/Production sin cambios, sin merge. Envases descontados pendientes del contador, restauración integral bloqueada e impresora/cajón/Point diferidos.

Cierre integrado de auditoría de recepción F08: 2979 PASS / 1 skipped / 249 archivos, salida 0 (pilot-fiscal-emission-audit-suite-results.json). Única omitida f6-2d-c3c2-enrichment por fixture no configurada; ninguna fiscal nueva omitida. 202 pruebas dirigidas / 5 archivos y 38 escenarios PostgreSQL PASS; build final de código de producción 646 módulos PASS. Oxlint sin nuevos hallazgos, warning de finally preexistente conservado; manifiesto histórico 43 SQL, diff y bundle privado PASS. Escaneo 1245 archivos/48 candidatos, delta cero. Este cierre reemplaza referencias de suite en curso para este incremento; no atribuye pruebas locales sintéticas a JWT/RLS/ARCA hospedados. El nuevo registro sólo cierra auditoría local de recepción, no el gate de resolución/corrección/cancelación/NC. Próximo bloque: diagnóstico público protegido por Dueño activo/comercio/venta y resolución auditable que no acepte una respuesta aislada para liberar/reemitir. SQL 001–015/Edge sin instalar/activar en remoto, sin nuevas consultas ARCA autenticadas ni CAE real, deploy frontend, merge o cambios master/Production. Permanecen los diferidos y dependencias documentados.

### 22/10/2026 — F08: diagnóstico público protegido, inicio

Próximo incremento: SQL 016 getter específico para Dueño activo ordinario/comercio/venta y Auth original de preparación 012, sin reutilizar el getter histórico de trabajador 015 como permiso de UI. DTO cerrado por venta/operación/hash/estado con recepción clasificada y última decisión de conciliación, sin TA, binding, permiso, mensajes libres ni CAE candidato. HTTP/cliente/modal mostrarán evidencia disponible, distinguirán recepción de autorización y ausencia de respuesta de rechazo. Consulta sólo DB, sin renovar TA ni llamar ARCA; no habilitar botón de reenvío/cancelación. AUTORIZADA exige ledger/constancia coherentes, conserva estado si falla diagnóstico y no se degrada por respuesta antigua. Preservar selección/cierre ante respuestas tardías. Probar aislamiento de Auth/comercio/roles, estado mutable durante espera, DTO/correlación, fallos parciales y presentación. Resolución/corrección/cancelación/NC siguen después; flags y gates remotos permanecen cerrados.

### 22/10/2026 — F08: diagnóstico del Dueño integrado, sólo local

SQL 016 incorpora cargar_diagnostico_fiscal_homologacion con gate activo ordinario de Dueño/comercio/venta y Auth original de preparación 012. No reutiliza el permiso histórico del worker 015 para exponer evidencia a UI. Coteja cuerpo/reserva/preparación y, para AUTORIZADA, exige la constancia durable coherente de 014. Devuelve DTO cerrado con venta/operación/hash/estado, recepción clasificada y última decisión de conciliación; no incluye intento privado, permisos, binding, TA, CAE candidato ni mensajes libres. Última consulta se ordena por timestamp/id; su decisión no degrada el estado autorizado del ledger. Sin catálogo/emisor habilitados puede recuperar diagnóstico histórico, pero comercio suspendido, perfil inactivo/ajeno/reasignado no acceden.

DIAGNOSTICO_COMPROBANTE comparte límites de consulta 2KiB, CORS/host/flag privados y Auth.getUser verificado una vez. Servicio reutiliza lectura cerrada de documentos con dos RPC explícitas (constancia/diagnóstico), sin acceso genérico. Allowlist SDK privado ahora 22 RPC. Cliente coteja venta/operación y no persiste el diagnóstico. Frontend sólo importa contratos/validadores puros, sin transporte/custodia.

Modal muestra recepción y última consulta por separado: ausencia de recepción no afirma rechazo; aprobación recibida no equivale a CAE conciliado. Códigos se muestran como números sin inventar descripciones ARCA. Si durante diagnóstico se confirma AUTORIZADA, carga constancia en vez de abrir revisión. Un resultado atrasado no degrada AUTORIZADA; revisión reservada obsoleta o hash diferente no abre aprobación. Fallo de diagnóstico se informa sin ocultar una constancia válida, y cambio/cierre de venta descarta respuestas tardías. Se reutilizan Modal/estilos existentes, sin nuevos botones de reenvío/cancelación ni cambios de tema.

Evidencia dirigida actual: 295 PASS / 8 archivos (pilot-fiscal-diagnosis-targeted-final.log). Primera ejecución SQL falló por CASE sin agrupar dentro de IF; se conserva log con suite SQL que no pudo inicializar. Se corrigió sintaxis y el pase posterior ejecutó todos los casos, sin omisiones fiscales. PostgreSQL 17.11 local: 40 escenarios PASS (fiscal-diagnosis-concurrency-20261022.json), incluidos diagnóstico durante cierre y Auth reasignado mientras lectura espera. Contenedor propio detenido y datos conservados; cero externos/emisiones. Build final PASS 649 módulos; manifiesto histórico 43 SQL y diff PASS. Oxlint sin nuevos hallazgos, warning de finally preexistente del runner documentado. Escaneo 1249 archivos/48 candidatos, delta cero. Getters SQL, transporte/numeración y gates privados ausentes del bundle. Suite global actual en curso: 2979 previo no es cierre de este incremento.

PR03/F08 sigue PARCIAL: el diagnóstico hace visible la evidencia, pero no resuelve ni corrige rechazo definitivo, cancela operación o libera numeración. Siguientes gates: resolución/corrección/cancelación/NC con historial y protección frente a peticiones tardías, representación fiscal final, provisión/PV/parámetros reales y aceptación hospedada/visual JWT/RLS/E2E. SQL 001–016/Edge sólo preparados para instalación remota autorizada; flags apagados, sin deploy frontend ni nuevas consultas ARCA autenticadas, CAE real, merge o cambios master/Production. Envases descontados pendientes del contador, impresora/cajón/Point diferidos y restauración integral bloqueada.

Cierre integrado de diagnóstico F08: 3031 PASS / 1 skipped / 250 archivos, salida 0 (pilot-fiscal-diagnosis-suite-results.json). Única omitida f6-2d-c3c2-enrichment por fixture no configurada; ninguna fiscal nueva omitida. 295 dirigidas / 8 archivos, 40 escenarios PostgreSQL y build final 649 módulos PASS. Manifiesto histórico 43 SQL, diff y bundle privado PASS; oxlint sin nuevos hallazgos, warning preexistente de finally conservado. Escaneo 1249 archivos/48 candidatos, delta cero. Sustituye las referencias de suite en curso de este incremento sin dar por acreditados JWT/RLS/ARCA/visual hospedados. Diagnóstico local cerrado, PR03/PR02 siguen parciales por resolución/corrección/cancelación/NC, representación fiscal final, provisión/PV y aceptación. SQL 001–016/Edge sin instalar/activar remotamente; sin deploy frontend, nueva consulta ARCA autenticada, CAE real, merge ni cambios master/Production. Próxima implementación debe conservar identidad/historia y bloquear peticiones tardías al resolver intentos, sin liberar números a partir de recepción aislada.

### 22/10/2026 — F08: cancelación previa a numeración y corrección, inicio

Problema: un guardado incierto o datos preparados inválidos por cambios de contexto pueden impedir corregir. Diseño completo: conservar cancelación durable por UUID original (incluso si el guardado aún no llegó), retirar únicamente la operación activa sin cuerpo/reserva y permitir nueva preparación con otra identidad; cualquier petición tardía del UUID cancelado debe fallar antes de crear/reservar. Preservar snapshot/factos/auditoría anteriores, no borrar ni reutilizar UUID. Cambiar unicidad de operación por venta a única activa PREPARADA, con CANCELADA auditada y transición irreversible; resolver por venta sólo ve activa. Gate de Dueño activo/comercio/venta/Auth original y ausencia absoluta de solicitud/reserva. Cancelación no requiere emisor/catálogo vigente y no cancela número, envío, venta ni dinero. Auditar también entrada heredada 001 y helper de reserva 002 para no reactivar por otros caminos.

Primer incremento: SQL 017, guards y pruebas reales de ambos órdenes guardado/cancelación y reserva/cancelación, replay/ACK perdido, Auth/roles, historial y nueva preparación. Luego integración HTTP/cliente/modal, confirmación explícita y recuperación tras ACK perdido antes de descartar pendiente local; esa integración forma parte del alcance y no se dará por terminada con sólo SQL. Intentos con reserva/envío/CAE, corrección fiscal posterior, notas de crédito y autorización/aceptación remotas mantienen sus gates independientes. Sin instalar SQL/Edge ni habilitar flags/consultas ARCA.

### 22/10/2026 — F08: base de cancelación sin número, implementación local

SQL 017 agrega auditoría privada inmutable por UUID, venta/comercio/usuario/Auth y origen SIN_GUARDADO o DATOS_PREPARADOS. Puede cerrar una identidad antes de que llegue el POST original; el trigger de creación rechaza el UUID cancelado incluso por entrada heredada. Operaciones preparadas sin cuerpo/reserva pasan irreversiblemente a CANCELADA y conservan snapshot/contexto/hechos. Un índice parcial garantiza una sola PREPARADA por venta/entorno sin borrar las canceladas. Las funciones actualizadas 001/012 sólo seleccionan activa, y helper 002 exige PREPARADA tras obtener locks para impedir que un worker tardío reserve. 001/012/017 usan lock transaccional por UUID global antes de bloquear operación, también entre ventas/comercios diferentes. No cambia numeración ni toca venta/stock/caja. Si ya existe solicitud o reserva, se rechaza cancelación aun sin envío/CAE.

Cancelación/consulta requieren Dueño activo ordinario y comercio/venta. Con preparación persistida se exige Auth original; operación heredada sin hechos 012 no se atribuye ni cancela automáticamente. Replay devuelve el mismo ACK aun si después hay otra operación activa de esa venta. La lectura confirma coherencia de auditoría/estado/hechos y ausencia de cuerpo/reserva; actualización RETURNING y lectura posterior impiden ACK falso si otro trigger omite/revierte cambio. Contexto/emisor/catálogo vencido no impiden cancelar una preparación legítima sin número. Reactivar, alterar snapshot/identidad o borrar historial se rechazan. Sin filas/flags de provisión ni cambios de permisos de emisión.

Dependencia de instalación: SQL 017 requiere las funciones 001,002,012 actualizadas de esta misma revisión; no aplicar 017 aislado sobre las versiones previas. La familia fiscal sigue sin instalar en remoto y su futuro gate debe verificar versiones/hashes y autorización antes de aplicar el conjunto. Reaplicación 017 sobre cancelación + nueva preparación preservó datos/índice activo en el ensayo.

Evidencia dirigida actual: 289 PASS / 4 archivos (pilot-fiscal-preparation-cancel-targeted-final.log). Primera regresión por columna estado ambigua en resolver 012 se conserva y quedó corregida calificando columna, sin relajar permisos. PostgreSQL 17.11 local: 47 escenarios PASS finales (fiscal-preparation-cancel-concurrency-final-20261022.json), incluidos ambos órdenes cancelación/guardado/reserva, UUID global entre ventas en ambos órdenes y dos cancelaciones mismo ACK. Primer pase 47 también PASS; el final incorpora confirmación reforzada de estado/lectura. Contenedores propios detenidos, datos conservados, externos/emisiones cero. Build PASS 649 módulos, manifiesto histórico 43 SQL y diff PASS. Oxlint sin nuevos hallazgos; warning preexistente de finally del runner conservado. Escaneo 1250 archivos/48 candidatos, delta cero. Suite global actual en curso: 3031 anterior no es cierre nuevo.

Alcance aún pendiente: conectar estas RPC a servicio/HTTP/cliente/modal con confirmación humana, recuperación durable tras ACK perdido y retiro seguro del pendiente local; sólo SQL no cierra el flujo de cancelación/corrección. UI/SDK actuales no llaman las RPC nuevas. Cancelación de cuerpo/número, envío incierto, rechazo definitivo posterior a emisión y notas de crédito conservan sus gates. PR03/F08 parcial, PR02 sin CAE real. SQL 001–017/Edge sin instalar/activar remotamente, sin deploy frontend ni nuevas consultas ARCA autenticadas, merge o cambios master/Production. Envases descontados pendientes del contador, impresora/cajón/Point diferidos y restauración integral bloqueada.

Cierre recuperado del incremento SQL de cancelación: informe completo 3048 PASS / 1 skipped / 250 archivos y success=true (pilot-fiscal-preparation-cancel-suite-results.json). Única omitida fixture F6 no configurada, ninguna fiscal nueva omitida. La aprobación automática falló temporalmente por límite de uso después de arrancar la suite; no se ejecutó la comprobación rechazada ni se eludió el gate. Al continuar, el handle 98929 ya no existía: se recuperó el informe escrito y el log final, sin reiniciar la suite ni inventar código de salida del handle perdido. 289 dirigidas y 47 PostgreSQL finales PASS, build 649 PASS, manifiesto/diff y escaneo 1250/48 sin delta. Sustituye referencias a suite en curso para este incremento, no el estado parcial de integración. SQL/Edge sin instalar remotamente, ningún tráfico ARCA real ni deploy. Falta integrar servicio/HTTP/cliente/modal y retiro seguro de pendiente antes de considerar completo el flujo de cancelación previa a número.

### 22/10/2026 — F08: integrar cancelación confirmada y retiro seguro del pendiente

Continuación del flujo completo: servicio y HTTP con Auth original verificado una sola vez por acción y lectura durable tras escritura (ACK perdido/falso), cliente que conserva UUID ante incertidumbre y sólo retira el pendiente local después de leer cancelación confirmada. Serializar escrituras de preparación/resolución/cancelación por Auth/comercio/venta: Web Locks en navegador y cola por almacenamiento/scope para tests; no borrar una identidad nueva de otra pestaña ni dejar datos del receptor después de confirmar retiro. Navegador sin soporte de lock falla antes de mutar/enviar este flujo fiscal, sin bloquear POS. Confirmación explícita en modal sólo para datos sin cuerpo/número o guardado local pendiente; revisión/envío/CAE no ofrecen esa acción. Probar pérdida de ACK, fallo de almacenamiento, dos instancias, respuesta tardía y corrección con UUID nuevo. Activación hospedada incluye compatibilidad de pestañas/versiones y Web Locks; flags siguen cerrados. La integración no cancela reservas/envíos ni resuelve rechazos fiscales posteriores.

### 22/10/2026 — F08: cancelación/corrección sin número integrada, validación local

Contrato público cerrado de cancelación (venta/operación/CANCELADA/emisión false) compartido por servidor y cliente, sin imports de custodia/transporte al navegador. Servicio valida Auth.getUser una vez por acción y conserva ese actor en escritura + lectura durable; ACK perdido se recupera y ACK falso/sin registro no confirma. Si Auth se reasigna entre ambos pasos, la lectura no adopta al perfil nuevo. Acciones CANCELAR_PREPARACION_FISCAL y CANCELACION_PREPARACION_FISCAL limitadas a 2KiB con gate existente de host/origen/flag. SDK privado ahora 24 RPC explícitas. No se carga TA, custodia ni red fiscal para cancelar o consultar cancelación.

Cliente serializa guardar, resolver, preparar cuerpo y cancelar por Auth/comercio/venta. Adaptador navegador exige Web Locks y revalida flag antes de ejecutar tarea; sin soporte falla antes de mutar/enviar esos métodos, POS general permanece separado. Cola por almacenamiento/scope en runtime de pruebas valida dos instancias. Input/contexto se copian antes de esperar; identidad Auth inicial de navegador queda capturada por valor para no adoptar otra cuenta si el objeto scope se muta. La sesión comprobada sigue fijada por header y no se almacena. Guardados simultáneos coordinados no envían POST paralelo ni crean identidad nueva después de confirmar la primera; un intento incierto conserva UUID y datos para replay.

Tras cancelar, se relee cierre durable antes de retirar sólo el pendiente local cuyo UUID coincide, bajo el mismo lock. Navegador usa removeItem con verificación de ausencia; adaptadores de prueba sin removeItem admiten marcador null. Conserva otras claves/preparaciones y retira datos del receptor. ACK perdido o error de almacenamiento no habilita identidad nueva. Resolver al reabrir recupera cancelación del pendiente original antes de volver a formulario; corrección crea UUID diferente. Una cancelación tardía de UUID anterior no borra el de la preparación nueva de otra instancia. No se descartan pendientes a ciegas.

Modal reutiliza componentes/estilos existentes. Confirmación explícita de cerrar intento sólo para DATOS_PREPARADOS o guardado local pendiente sin preparación recuperada; no ofrece acción en revisión con cuerpo/número, envío incierto o autorización. Explica que historial/venta/cobro se conservan, deshabilita acciones incompatibles y descarta respuestas tardías al cambiar/cerrar venta. Tras cierre confirmado consulta estado y carga datos explícitos de nuevo; incertidumbre conserva intento y permite consulta. Se mantiene validación fiscal sin defaults heredados de IVA/PV/fecha. Snapshot cambiado o identidad sin probar siguen requiriendo revisión manual, no cancelación inferida.

Evidencia actual: 322 PASS dirigidas / 8 archivos (pilot-fiscal-cancellation-ui-targeted-final.log), incluidos servicio+SQL con ACK perdido/reasignación, HTTP, cliente, navegador y modal. Backend SQL sin cambios desde e19537e: evidencia PostgreSQL final de 47 escenarios conservada, no se presenta como nueva ejecución Web Locks hospedada. Build final PASS 651 módulos, manifiesto histórico 43 SQL y diff PASS, oxlint dirigido sin hallazgos. Bundle público no contiene entradas SQL/custodia/gates de emisión privados. Escaneo 1254 archivos/49 candidatos: delta único en src/test/fiscalBrowserClient.test.ts:65, access_token explícitamente SINTÉTICO de fixture de mutación de scope; revisado no real y no se ocultó/ofuscó para cambiar el escaneo. Candidato previo está ahora en línea 10 por cambio de fixture. Suite global de este incremento en curso: 3048 previo no es cierre de integración.

Aceptación pendiente: navegador compatible con Web Locks y versiones/pestañas actualizadas, prueba real de dos ventanas/perfil, JWT/RLS/gateway y visual en comercio aislado de Staging antes de activar flag. SQL 001–017 (con 001/002/012 de esta revisión) y Edge sin instalar/activar remotamente, ningún deploy frontend, nueva consulta ARCA autenticada, CAE real, merge o cambio master/Production. PR03/F08 sigue parcial por resolución/corrección posterior a cuerpo/numeración/envío, rechazo definitivo/NC, representación fiscal final, provisión/PV/parámetros y aceptación hospedada. Envases descontados pendientes del contador, impresora/cajón/Point diferidos y restauración integral bloqueada.

Cierre integrado de cancelación/corrección sin número: 3086 PASS / 1 skipped / 251 archivos, salida 0 observada (pilot-fiscal-cancellation-ui-suite-results.json). Única omitida fixture F6 no configurada, ninguna fiscal nueva omitida. 322 dirigidas / 8 archivos y build final 651 módulos PASS. La evidencia SQL nativa final de 47 escenarios sigue aplicable al backend e19537e sin cambios en este incremento; no se declara una ejecución real de Web Locks/ventanas hospedadas. Manifiesto histórico 43 SQL, diff y bundle privado PASS; oxlint sin nuevos hallazgos. Escaneo 1254 archivos/49 candidatos, único delta fixture sintética documentada. Sustituye las referencias a suite en curso para la integración; no modifica la nota honesta de código de salida no recuperado de la suite SQL anterior.

El flujo local anterior a cuerpo/número queda integrado: cerrar UUID original, impedir petición tardía, conservar historial, recuperar cierre/retirar datos locales bajo exclusión y cargar otra preparación con identidad nueva. Gate remoto sigue pendiente de autorización, versiones/pestañas compatibles con Web Locks, JWT/RLS/visual/E2E aislado y acreditación PV/custodia/parámetros. Corrección/cancelación con cuerpo/número, rechazo definitivo tras envío y NC continúan pendientes; PR03/PR02 no se dan por cerrados. No instalación/activación fiscal remota, deploy frontend, consulta ARCA autenticada nueva, CAE real, merge o cambios master/Production. Se mantienen dependencias del contador, restauración integral bloqueada e impresora/cajón/Point diferidos.

### 22/10/2026 — F08: sustitución de cuerpo reservado, anterior a intención de envío

Incremento local pendiente: permitir corregir datos explícitos de un cuerpo RESERVADA sin intento ni permiso consumido. Crear otra operación/preparación/cuerpo y conservar inmutables los originales; registrar enlace auditado original→sucesora con ambos hashes. Transferir la reserva en la misma transacción manteniendo CUIT/PV/tipo/número y fecha original: no liberar número, no fabricar una consulta FECompUltimoAutorizado ni avanzar la serie. Exigir Auth original activo, venta/snapshot vigente, hash anterior esperado, parámetros/emisor vigentes y tipo de comprobante idéntico. Una modificación de serie, ENVIO_INCIERTO, AUTORIZADA, respuesta de emisión o conciliación queda fuera de esta transición; rechazar sin cambios. Invalidar el permiso anterior sin eliminar auditoría; sucesora sin permiso/revisión heredados. Estado original SUSTITUIDA y resolver apunta sólo a la sucesora activa. Replay idéntico devuelve lectura durable; datos diferentes o sucesora ajena fallan. Orden de locks: venta, UUIDs ordenados, operación, serie, reserva/permiso. Verificar rollback integral, identidad, snapshot, reintento, sustitución encadenada, trabajador tardío y carreras nativas antes de conectar servicio/HTTP/UI. SQL 018 no se instala remotamente ni habilita emisión. Este incremento no declara resueltos rechazos/NC ni aceptación hospedada.

### 22/10/2026 — F08: reserva corregible sólo antes del envío, backend local

SQL 018 prepara una sustitución atómica con nueva identidad y cuerpos históricos conservados; transfiere el mismo número/serie y revoca el permiso antiguo sin heredarlo. Replay recuperable; intención previa, respuesta fiscal, conciliación, autorización, serie diferente o Auth ajeno bloquean la transición. El runner nativo agrega los dos órdenes sustitución/intención revisada, duplicación con ACK idéntico y rollback. Primer pase 51 escenarios PostgreSQL 17.11 PASS, incluido el pase final con intención revisada (fiscal-reserved-replacement-reviewed-concurrency-20261022.json), cero solicitudes externas/emisiones. Falta integrar servicio/HTTP/cliente/UI y su recuperación; no equivale a cancelación de número ni a resolver rechazos/NC. SQL fiscal 001–018/Edge sin instalar o activar remotamente; ninguna emisión/CAE real, despliegue, merge o modificación de master/Production. La suite completa del incremento está en curso; build detectó tipado pendiente en fixtures nuevas y todavía no es PASS. Envases descontados pendientes de contador; restauración integral bloqueada e impresora/cajón/Point diferidos.

Cierre de validación local de SQL 018: 3103 PASS / 1 skipped / 251 archivos, salida 0 observada (pilot-reserved-replacement-suite-results.json). Única omitida fixture F6_C3A_CANDIDATES_PATH sin configurar; ninguna fiscal nueva omitida. Después de esa suite sólo se corrigieron anotaciones TypeScript de filas de fixtures: 160 dirigidas / 4 archivos PASS posteriores y build final PASS 651 módulos (pilot-reserved-replacement-build-typed-final.log). Los primeros errores de ambigüedad SQL y de fixtures/tipado quedaron corregidos; el build anterior fallido no cuenta como PASS. 51 escenarios PostgreSQL 17.11 PASS finales con intención revisada y contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL y diff PASS; oxlint sin nuevos hallazgos, conserva warning preexistente no-unsafe-finally del runner. Escaneo 1255 archivos/49 candidatos, sin nuevos candidatos frente al cierre anterior. El incremento cierra sólo la transacción SQL local; siguen pendientes servicio/HTTP/cliente/UI con recuperación durable y revisión de la sucesora, resolución posterior a intención/rechazo/NC, representación fiscal final y gates hospedados. No instalación remota SQL 001–018/Edge, activación, deploy, nuevas consultas ARCA autenticadas, CAE real, merge o cambio master/Production. Restauración integral bloqueada; contador/envases y diferidos físicos conservados.

### 22/10/2026 — F08: integrar sustitución reservada y recuperación de propuesta

Plan del incremento: contrato público cerrado de sustitución (IDs/hashes/número/estado, sin custodia), propuesta canónica/hash validada sin defaults y persistida localmente ANTES del POST. SQL 018 sigue siendo autoridad de snapshot/serie/parámetros/emisor/Auth; el servicio conserva un Auth.getUser por acción y sólo confirma leyendo el registro durable, incluso tras ACK perdido. Dos acciones HTTP con límites separados, allowlist privada explícita y sin TA/ARCA. Cliente bajo el mismo Web Lock de venta: identidad sucesora/propuesta fijas, reintento exacto, lectura al reabrir, retiro de datos sólo tras confirmación y sin pisar otra preparación. Resolver reconoce enlaces históricos de sustitución sin tratarlos como cancelación de número. Modal ofrece corrección sólo para RESERVADA, confirmación explícita, datos nuevos sin defaults heredados y nueva revisión; mientras hay propuesta incierta oculta aprobación anterior y conserva intento. Probar cuotas/ACK falso/tardío/reinicio/dos instancias, actor reasignado y respuesta ajena, cuerpo/serie inválidos y no exposición de secretos; luego regresión/build antes de publicar. No instalar SQL/Edge, activar flags ni consultar/emitir contra ARCA; rechazos posteriores a intención y NC siguen pendientes.

Ampliación necesaria de recuperación: una propuesta válida localmente puede quedar rechazada por parámetros/emisor que cambiaron antes del POST. No dejar al Dueño atrapado en ese pendiente. Reutilizar SQL 017 para cerrar sólo el UUID sucesor aún no creado; el cierre impide un POST tardío de SQL 018. Si la sustitución ganó primero, el descarte falla y se recupera el cierre de sustitución: nunca cancelar una reserva/cuerpo existente. Confirmación humana separada y lectura durable antes de retirar propuesta local; la operación/número original se conserva. Probar ambos órdenes y reinicio tras ACK perdido. Este flujo no amplía cancelación de números ni emisión.

### 22/10/2026 — F08: circuito de sustitución, recuperación y compatibilidad canónica

Contrato público cerrado y propuesta canónica/hash validados en cliente y servicio. Dos acciones HTTP (sustituir/consultar) con DTO/tamaño/JSON estrictos, origen/proyecto/flags existentes y Auth.getUser una sola vez por acción; SDK pasa de 24 a 26 RPC explícitas, sin acción de emisión. Tras escritura se exige getter durable del mismo Auth/venta/operación/sucesora/hashes, no ACK de escritura. No TA, custodia o tráfico ARCA en estas acciones.

Cliente persiste propuesta y UUID antes de POST bajo Web Lock por venta, verifica límite real de bytes, rechaza cambio de serie local antes de guardar y conserva exactamente el intento tras pérdida de respuesta. Resuelve enlaces durables y relee estado antes de mostrar la sucesora; retira datos sólo tras cierre confirmado, con comparación del registro local para no borrar otro intento. Aprobar/guardar/preparar/cancelar quedan coordinados con la corrección; una propuesta incierta bloquea acciones sobre el cuerpo anterior. Descarte explícito cierra sólo UUID sucesor no creado por SQL 017, nunca un cuerpo/número; si la sustitución ganó se recupera ese cierre. Reabrir recupera cualquiera de los dos resultados.

Modal usa componentes/estética existentes y permite corregir sólo RESERVADA, con confirmación humana y datos expresos nuevamente, sin IVA/fechas heredados ni permiso automático. Mientras la propuesta es incierta oculta aprobación/formulario anterior y permite recuperación o descarte confirmado. Cambiar venta/cerrar descarta respuestas tardías. Pruebas de adaptador Web Locks son sintéticas; visual real/dos ventanas/JWT/RLS hospedados siguen pendientes.

Corrección importante respecto al incremento 76ff310: JSONB::text no coincide con el canónico compacto/ordenado de revisión TypeScript. La prueba nueva cliente→HTTP→SQL→revisión con hash real detectó y cerró ese enlace; SQL 018 usa helper canónico privado y rechaza al instalar cuerpos históricos incompatibles, sin reescribirlos. Se probó Unicode/escapes, propuesta duplicada, Auth reasignado, ACK perdido/falso, cuotas, dos instancias, descarte/transferencia y respuestas tardías. SQL 018 sigue sin instalar remotamente; evidencia previa sólo transaccional no acreditaba ese enlace de revisión.

Validación dirigida actual: 338 PASS / 8 archivos (pilot-fiscal-replacement-integration-targeted-final.log). 53 escenarios PostgreSQL 17.11 PASS del primer pase integrado; pase final de SQL con preflight canónico en curso. Suite global y build final en curso, no se usan 3103/51 anteriores como cierre nuevo. Scan actual 1258 archivos/49 candidatos, sin nuevos candidatos. PR03/F08 parcial por rechazos/incertidumbre posteriores a intención, NC, representación fiscal final y gates hospedados/provisión/PV/parámetros. No instalación/activación remota SQL 001–018/Edge, deploy, consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. Envases pendientes del contador, restauración integral bloqueada e impresora/cajón/Point diferidos.

Revisión de concurrencia entre equipos: además de dos instancias con almacenamiento compartido, cubrir dos terminales con propuestas distintas para la misma operación. Si otra terminal ganó, no atribuir su ACK a la propuesta local ni borrar ésta por hash ajeno. Resolver debe conservar acceso al panel de recuperación; el descarte cierra sólo el UUID local aún no creado y después recupera la preparación ganadora, sin tocar su cuerpo/número. Caso adicional pendiente antes de cerrar esta integración; suite ya iniciada se deja terminar sin editar fuentes y luego se verificará la corrección con evidencia propia.

Actualización de validación integrada: suite anterior 3163 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-replacement-integration-suite-results.json). Se dejó terminar antes de cambiar fuentes. Después se reforzó la recuperación cuando otra terminal ganó y el panel pendiente ante fallo de resolución. Cierre dirigido posterior: 341 PASS / 8 archivos (pilot-fiscal-replacement-two-terminals-targeted-final.log). PostgreSQL 17.11: 54 escenarios finales PASS (fiscal-replacement-two-terminals-concurrency-20261022.json), incluido perdedor con propuesta distinta sin cuerpo parcial; contenedor propio detenido y datos conservados, cero solicitudes externas/emisiones. Build posterior PASS 653 módulos; manifiesto histórico 43 SQL, diff, bundle privado (cero coincidencias) y oxlint sin nuevos hallazgos. Se conserva warning preexistente no-unsafe-finally del runner. Escaneo 1258 archivos/49 candidatos, sin delta de candidatos. Suite global definitiva de dos terminales en curso, por lo que 3163 anterior aún no es cierre de esas últimas guardas. No cambios remotos ni activación de flags.

Cierre integrado de sustitución reservada y recuperación entre equipos: 3166 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-replacement-two-terminals-suite-results.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 341 dirigidas / 8 archivos PASS y 54 escenarios PostgreSQL 17.11 PASS finales (fiscal-replacement-two-terminals-concurrency-20261022.json), incluidos propuestas distintas, ambos órdenes sustitución/intención y descarte/sustitución, rollback y ACK recuperable. Dos almacenes independientes cliente→HTTP→SQL recuperan la ganadora sin cancelar su cuerpo/número. Build final PASS 653 módulos, manifiesto histórico 43 SQL, diff y bundle privado (cero coincidencias) PASS; oxlint sin nuevos hallazgos, warning preexistente del finally del runner conservado. Escaneo 1258 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos, datos conservados, cero solicitudes ARCA autenticadas o emisiones reales. Sustituye las notas de suite en curso para esta integración; el pase previo 3163 se conserva con su alcance anterior.

El flujo reservado anterior a intención queda integrado localmente, incluida la corrección de canónico y el rechazo de instalación sobre historia incompatible. No acredita navegador/visual/Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados. SQL fiscal 001–018 y Edge sin instalar/habilitar remotamente; flag nuevo sin activar, ningún deploy, CAE real, merge o modificación de master/Production. Siguiente bloque local: resolución/corrección posterior a intención/rechazo definitivo y notas de crédito, junto con representación fiscal final. Provisión privada, punto de venta y parámetros reales, aceptación aislada/hospedada y primera emisión homologada expresamente autorizada conservan sus gates. Envases descontados bloqueados hasta criterio del contador; restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales, sin declarar Production Readiness.

### 22/10/2026 — F08: corrección posterior a rechazo recibido, sin borrar intento

Plan incremental local, según manual WSFEv1 v4.7 vigente (https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf, sección FECAESolicitar/errores de comunicación; no usar la sección CAEA como contrato CAE). Un timeout/SIN_CONFIRMACION no acredita rechazo ni habilita reenviar. Para corregir un R recibido ligado al intento/hash/Auth/revisión/permiso consumidos, exigir además FECompConsultar negativo estricto 602 sin ResultGet contradictorio y consulta posterior de último autorizado igual a N−1, ambas frescas al tomar locks. Parámetros/emisor/snapshot actuales y datos explícitos nuevos, misma serie/número. Sin CAE candidato, sin inferir tratamiento de envases y sin permiso/revisión heredados.

Diseño SQL 019: conservar la reserva original y sus FKs/observaciones/recepción, marcarla RECHAZO_CORREGIDO sólo con auditoría inmutable y crear sucesora RESERVADA en la misma transacción. Nunca transferir ni borrar la fila de intento ya enviado. Unicidad global del número para filas no archivadas; transición archivada irreversible y sólo junto a sucesora auditada de la misma venta/serie/número. La serie no avanza ni queda libre entre operaciones. FK del historial se conserva; lectores de recepción histórica admiten el estado archivado, sin conceder otro envío. Original/cuerpo/permiso consumido/revisión/consultas siguen vinculados e inmutables. Intentos sin R, aprobación/CAE o evidencia contradictoria quedan pendientes de conciliación/manual, no se convierten en rechazo corregible.

Componentes y validación: parser/transporte privado de ausencia (rechazar mezcla 602+ResultGet, SOAP Fault, errores distintos, timeout/redirección/XML inesperado; no registrar XML/Token/Sign), SQL 019 y getters con Auth original, propuesta canónica/hash nuevos, rollback/ACK perdido y concurrencia frente a conciliación/sustitución/descarte/otro comercio. Gate privado de recuperación y orquestador con revalidación antes de consultas/commit, deshabilitado por defecto; servicio/HTTP/UI deberán integrarse después de probar este contrato. No ejecutar consultas ARCA autenticadas, instalar SQL/Edge ni habilitar emisión. Credenciales, PV real, aceptación hospedada, NC, representación fiscal final y restauración conservan sus gates. Esta clase R no sustituye recuperación de incertidumbre ni habilita un reenvío automático.

### 22/10/2026 — F08: contrato privado de rechazo corregible preparado localmente

SQL 019 agrega auditoría inmutable de corrección, fuente privada y cierre recuperable. Preserva reserva/intento/recepción/consultas originales y FKs, archiva sólo con transición validada y crea sucesora con el mismo número/serie. Índice global vigente excluye únicamente archivo auditado; trigger impide reactivar/borrar el intento archivado. Aprobación/CAE o evidencia contradictoria, snapshot/emisor/actor cambiados, falta de R o prueba fuera de orden/vencida fallan sin efectos. La prueba se verifica de nuevo después de locks del catálogo y escrituras. Reaplicar SQL conserva el historial; una inserción omitida por trigger no produce ACK y revierte el archivo.

Consulta privada de ausencia: parser acepta sólo 602 de FECompConsultar con ResultGet ausente/nil y sin contradicción; rechaza otros errores, dato positivo, Fault, XML/MIME/HTTP no soportados o timeout. Transporte común conserva la clasificación previa de consultas y revalida antes de fetch. El trabajador correctRejectedFiscalVoucher no tiene ruta HTTP: gate privado nuevo cerrado por defecto, Auth real capturado una vez, fuente/serie/hash originales comprobados antes de TA y consultas, dos lecturas WSFE simuladas, revalidación antes del commit, cierre confirmado sólo por getter. ACK perdido se recupera sin reconsultar si ya está cerrado, aun con gate/emisor deshabilitados. SDK privado ahora 29 RPC; ninguna credencial/TA/XML o mensaje libre se devuelve al cliente.

Evidencia dirigida actual: 280 PASS / 5 archivos (pilot-fiscal-rejected-correction-targeted-final.log), incluidos worker+SQL con ACK perdido y Auth reasignado, sin adoptar otra cuenta, fuente/serie ajena antes de TA, y errores privados saneados. PostgreSQL 17.11: 61 escenarios PASS (fiscal-rejected-correction-final-v2-concurrency-20261022.json), dos correctores, ambos órdenes con conciliador/CAE, rollback, vencimiento al esperar venta y catálogo, y otro comercio sin capturar la serie. Contenedor propio detenido/datos conservados, externos/emisiones cero. Primer pase 59 PASS retenido; segundo intento falló por nombre de variable duplicado en runner antes de crear contenedor, corregido con evidencia nueva sin borrar log. Build final y suite global en curso; 3166 anterior no es cierre del incremento. Manifiesto histórico 43 SQL PASS, oxlint sin nuevos hallazgos y warning preexistente del runner; scan 1260 archivos/49 candidatos, sin nuevos candidatos.

Pendiente antes de activar: integrar acción/recuperación HTTP/cliente/modal de rechazo con confirmación y nueva revisión, manejar incertidumbre sin R y categorías no soportadas, NC, representación final y aceptación hospedada/visual/JWT/RLS/Edge. SQL 001–019/Edge sin instalación/habilitación remota por nosotros, sin consultas ARCA autenticadas nuevas, emisión/CAE real, deploy, merge o cambio master/Production. Credenciales/PV/parámetros, contador/envases y restauración integral mantienen sus gates; impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales.

### 23/10/2026 — Cierre recuperado del incremento privado de rechazo

Suite completa 3227 PASS / 1 skipped / 252 archivos, salida 0 observada al recuperar el mismo handle (pilot-fiscal-rejected-correction-suite-results.json). No se reinició por el cambio de turno/fecha. Única omitida fixture histórica F6_C3A_CANDIDATES_PATH sin configurar, ninguna fiscal nueva omitida. 280 dirigidas / 5 archivos PASS y 61 escenarios PostgreSQL 17.11 PASS finales (fiscal-rejected-correction-final-v2-concurrency-20261022.json). Build final PASS 653 módulos; manifiesto histórico 43 SQL, diff y bundle privado PASS (cero coincidencias de trabajador/gate/RPC privados). SDK limitado a 29 RPC. Oxlint sin nuevos hallazgos; warning preexistente del finally del runner conservado. Scan 1260 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos/datos conservados; cero solicitudes externas/emisiones reales. El fallo de sintaxis inicial del runner quedó corregido y su log conservado; no produjo un contenedor ni se contó como PASS.

El contrato SQL 019 y trabajador privado de R con detalle quedan preparados localmente; no se cierra el flujo de usuario de esa clase todavía. Siguiente: integrar elegibilidad/confirmación/recuperación HTTP–cliente–modal, sin permitir R automático desde timeout/Errors sin detalle, y exigir nueva revisión/permiso para la sucesora. Incertidumbre sin R, notas de crédito, representación fiscal final, provisión/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual continúan pendientes. SQL 001–019 y Edge sin instalación/activación remota por nosotros; no activación de flags, deploy, consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. Se conservan contador/envases, restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales; este cierre no acredita Production Readiness.

### 23/10/2026 — F08: recuperación pública de corrección R, antes del formulario

Incremento local: separar el DTO cerrado de corrección rechazada del trabajador privado y exponer sólo su consulta durable por venta/operación con Auth original. La lectura no crea sucesoras ni carga TA/custodia ni consulta ARCA; no depende del gate de nuevas consultas. Validar respuestas cerradas, estado y pertenencia; errores saneados sin filtrar respuestas privadas. Mantener intactos SQL 001–019, permisos y flags. Probar contrato, HTTP, sesión inválida, respuesta ajena y ausencia durable. Después integrar propuesta persistente y formulario con confirmación explícita y nueva revisión; ese flujo aún no queda cerrado por esta lectura. Contador/envases pendiente confirmado por el titular; conservar el bloqueo y las ventas comerciales.

Progreso: implementación y verificaciones de este incremento pendientes.

Progreso del incremento de lectura: contrato público separado del worker privado, servicio de consulta con Auth una sola vez, acción HTTP CORRECCION_RECHAZO_FISCAL sólo lectura y método rejectedCorrection del cliente. Sin cambios de almacenamiento, propuesta/UUID/permiso ni consultas WSFE al abrir/leer; null sólo ante ausencia durable confirmada. Respuesta ajena, campos privados, estado distinto o error de Auth/SQL fallan cerrados y saneados. Compatibilidad de exportaciones del worker conservada. 338 PASS / 5 archivos dirigidos (pilot-fiscal-rejected-read-targeted-final-20261023.log); 244 PASS previas / 2 archivos retenidas. No se repitió suite global ni PostgreSQL nativo porque este incremento no altera SQL ni transacciones; 3227/1 skipped y 61 escenarios son evidencia histórica del HEAD anterior, no del nuevo incremento. Build final y controles de publicación pendientes de cierre. Formulario/modal de corrección R y persistencia de su propuesta aún pendientes; no se habilitó la escritura HTTP ni emisión.

Cierre local de lectura: build final PASS 654 módulos (pilot-fiscal-rejected-read-build-final-20261023.log), manifiesto histórico 43 SQL PASS, oxlint dirigido y diff PASS. Bundle sin coincidencias de worker/gate/RPC de fuente/custodia privados. Escáner final 1262 archivos / 49 candidatos, sin nuevos pares ruta/tipo frente al cierre e5cbecf; no se muestran valores. 338 dirigidas PASS posteriores al último cambio funcional. Sin solicitudes ARCA autenticadas, emisión/CAE real, instalación SQL/Edge, activación de flags, deploy, merge o cambios master/Production. Siguiente: persistencia diferenciada de propuesta R y confirmación/formulario, manteniendo nueva revisión y bloqueo de envases pendiente del contador.

### 23/10/2026 — F08: integración de propuesta R y confirmación del Dueño

Plan previo al código: extender el pendiente de sustitución con una variante versionada explícita para RECHAZO, preservando íntegros los pendientes v1 de reserva. Ambos comparten el lock y bloquean acciones incompatibles. Ruta de escritura independiente CORREGIR_RECHAZO_FISCAL llama al worker privado 019; sólo él consulta WSFE bajo gate cerrado y confirma por lectura durable. Consulta/reapertura no inicia consultas ARCA. Conservación de UUID/propuesta tras errores, getters diferenciados para recuperación/descarte y cadena durable. UI permite entrar sólo con diagnóstico R del mismo cuerpo, sin evidencia contradictoria; confirmación explícita antes de preparar propuesta, sin datos heredados y con aviso de consultas de recuperación/nueva revisión. SQL sigue siendo autoridad y no hereda aprobación ni permiso. El reintento guardado requiere acción explícita y recuperación previa; ningún efecto automático al abrir. Validar HTTP gate cerrado/ACK, cliente reinicio/rutas/tamaño/errores/descartes/multiterminal, modal confirmación/R vs incertidumbre/otra venta, build y regresiones. Sin instalación SQL/Edge, ARCA real ni emisión. Contador/envases bloqueado, impresora/Point diferidos. Progreso: pendiente.

### 23/10/2026 — F08: corrección R integrada localmente; cierre de regresión en curso

HTTP incorpora CORREGIR_RECHAZO_FISCAL detrás del gate privado cerrado, sin acción de emisión. Cliente conserva propuesta diferenciada v2/RECHAZO con compatibilidad estricta de v1; recovery/descarte usan getter de su clase y siguen enlaces durables de ambas. Modal exige diagnóstico R del mismo cuerpo, sin evidencia contradictoria, confirmación explícita y datos nuevos. Reintentar propuesta R también requiere confirmación; abrir/resolver/descartar no consulta WSFE. La sucesora vuelve a revisión sin heredar aprobación/permiso. Dos almacenes cliente→HTTP→SQL conservan la ganadora y cierran sólo la sucesora local perdedora.

361 pruebas dirigidas PASS / 5 archivos (pilot-fiscal-rejection-ui-targeted-final-20261023.log), build v2 PASS 654 módulos, oxlint/diff/manifiesto histórico 43 SQL PASS, scan 1262 archivos/49 candidatos sin nuevos pares ruta/tipo, backend privado ausente del bundle. Primer pase tuvo un fallo de selección de múltiples alertas en una prueba nueva; segundo pase, una inspección del fixture con rol sin permiso. Corregidos sólo los tests, sin ampliar permisos. Primer build falló por unión HTTP sin discriminación individual; contrato corregido, build posterior PASS. Logs conservados, fallos no contados como PASS. Suite global en curso, no se presenta evidencia antigua como cierre nuevo. SQL/transacciones nativas no cambiaron; 61 escenarios PostgreSQL son evidencia histórica, no nuevo pase. Aceptación visual/JWT/RLS/Edge/Web Locks entre ventanas reales sigue pendiente.

Se conserva la decisión del contador pendiente para envases descontados. Sin consultas ARCA autenticadas, instalación/habilitación SQL 001–019/Edge, flags, deploy o emisión/CAE real; master/Production intactos. Siguiente tras cerrar pruebas: contingencias/incertidumbre sin R, notas de crédito y representación fiscal final; provisión privada/PV/parámetros y aceptación hospedada requieren sus gates. PR03/F08 y PR02 siguen parciales; restauración integral bloqueada e impresora/cajón/Point diferidos.

### 23/10/2026 — Cierre local de propuesta y formulario R

Suite completa 3271 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-rejection-ui-suite-results-20261023.json); única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 361 dirigidas PASS / 5 archivos, build final PASS 654 módulos (pilot-fiscal-rejection-ui-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS; scan 1262 archivos/49 candidatos sin nuevos pares ruta/tipo y backend privado ausente del bundle. El aviso de sourcemap html5-qrcode y el tamaño de chunks no son errores de prueba/build. SQL 001–019 y transacciones no cambiaron: no se repitió PostgreSQL nativo; los 61 escenarios anteriores son historia, no una aceptación nueva. La propuesta R, confirmación, recuperación/descarte y vuelta a revisión quedan integradas localmente. Falta aceptación real visual/JWT/RLS/Edge/Web Locks y comportamiento externo con custodia/PV/parámetros acreditados; no hay CAE real ni Production Readiness. Continúan incertidumbre sin R, NC y representación fiscal final. Sin consultas ARCA autenticadas, instalación/habilitación fiscal remota, flags, deploy, merge o cambio master/Production. Contador/envases bloqueado, restauración integral bloqueada y físicos/Point diferidos.

### 23/10/2026 — F08: endurecer conciliación incierta antes de exponer la acción en UI

Situación: CONCILIAR ya existe como consulta privada, pero el orquestador toma el ACK de escritura y sólo recupera al volver a invocarlo; la autorización se captura una vez antes de esperar TA y no se revalida antes de fetch/registro. Plan: confirmar únicamente por getter durable del mismo ID tras intentar guardar (también ACK perdido/falso), conservar lectura temprana sin TA/red, revalidar contexto Auth original/binding después de TA y justo antes de transporte/registro, sin volver a obtener/inferir Auth. Gate privado nuevo de consultas de conciliación cerrado por defecto en HTTP, comprobado sólo antes de red; replay confirmado debe funcionar sin ese gate/custodia. No cambiar SQL ni numeración, no reenviar FECAESolicitar, no convertir ausencia/error en rechazo ni liberar operación. Validar pérdida/falsedad de ACK, error de getter, actor/emisor reasignados durante TA y después de consulta, gate revocado durante espera, replay HTTP y transporte. Conectar después observación persistente/confirmación/modal con los contratos acreditados; esa UI sigue pendiente. Sin ARCA real/instalación/deploy. Contador/envases y demás gates permanecen.

Ampliación por revisión de autoridad: revalidar por HTTP antes de guardar no cierra por sí solo la ventana entre esa lectura y la transacción mutadora. Agregar SQL 020 con autorización de conciliación ligada a Auth original de preparación cuando existe y wrapper de registro que obtiene/retiene locks de perfil/venta/operación/emisor y compara binding esperado en la misma transacción que SQL 004. Dos RPC privadas nuevas, sin tablas ni modificación de historial. Preparación heredada sin hechos 012 conserva su contrato privado anterior; las preparaciones 012 exigen Auth original. Revalidaciones previas siguen evitando red con identidad cambiada. Validar rollback/no delegación, revisión/certificado rotados y replays antes de exponer UI. SQL 020 se prepara localmente; su instalación queda sujeta al gate fiscal de la familia completa. No afirmar cierre TOCTOU sólo con la lectura anterior.

### 23/10/2026 — F08: conciliación ligada al actor y confirmación durable, local

SQL 020 agrega autorización propia y wrapper de registro: Auth original de hechos 012 cuando existen, binding exacto y locks de perfil/venta/operación/emisor retenidos durante el registro SQL 004. Revalidación final revierte si un trigger/acción interna alterara ese binding. Legacy privado sin tabla 012 conserva el gate anterior, sin inferir hechos inexistentes; no habilita carga UI heredada. Servicio captura Auth una vez y comprueba el mismo binding antes de TA/fetch/registro. Gate HTTP ARCA_HOMO_RECONCILIATION_ENABLED cerrado por defecto; replay confirmado se recupera antes de TA/gate/red. El ACK de registrar se ignora: sólo getter durable del mismo ID confirma, incluido ACK perdido. Falso ACK/getter fallido no autorizan.

479 dirigidas PASS / 6 archivos (pilot-fiscal-reconciliation-bound-targeted-final-20261023.log), build PASS 654 módulos, oxlint sin nuevos hallazgos (warning preexistente no-unsafe-finally del runner), manifiesto 43 SQL/diff PASS, SDK limitado a 31 RPC. Escáner 1263 archivos/49 candidatos, sin nuevos pares ruta/tipo; símbolos privados nuevos ausentes del bundle. PostgreSQL 17.11: 64 escenarios PASS (fiscal-reconciliation-bound-concurrency-v2-20261023.json), incluidos Auth reasignado primero, conciliación primero bloquea reasignación hasta commit y emisor rotado mientras espera; contenedor propio detenido/datos conservados, externos/emisiones cero. Primer intento falló en step 0 por Docker apagado y no creó contenedor: log/JSON conservados; motor iniciado y verificado antes del nuevo pase, sin sobrescribir evidencia. Primer pase de pruebas esperaba el gate nuevo habilitado en un fixture sintético; corregido sólo ese fixture, sin activar gate real. Suite completa en curso, no cierre global aún.

Alcance actual: ruta privada CONCILIAR y confirmación durable compartida. Falta observación persistente/confirmación/modal; revisar la conciliación interna del worker de emisión para usar también la autoridad ligada antes de aceptación hospedada. No se declara cerrada toda incertidumbre. Continúan NC, representación final, custodia/PV/parámetros y JWT/RLS/Edge/visual/E2E hospedados. SQL 001–020/Edge sin instalación/habilitación por nosotros, flags sin activar, cero consultas ARCA autenticadas, CAE real, deploy, merge o cambio master/Production. Envases/contador y restauración integral bloqueados, físicos/Point diferidos; PR03/F08 y PR02 parciales.

### 23/10/2026 — Cierre local del endurecimiento de conciliación

Suite completa 3281 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-reconciliation-bound-suite-results-20261023.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal nueva omitida. 479 dirigidas PASS / 6 archivos y 64 escenarios PostgreSQL 17.11 PASS finales; contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Build 654 módulos PASS, oxlint sin nuevos hallazgos y warning preexistente del runner, manifiesto 43 SQL/diff PASS. Escáner final 1263 archivos/49 candidatos, sin nuevos pares ruta/tipo; símbolos privados SQL 020/gate/custodia ausentes del bundle. SDK cerrado a 31 RPC.

Quedan preparados SQL 020 y la conciliación privada con Auth/binding transaccionales, revalidación tras espera y ACK durable. La autorización original de hechos existentes no se infiere desde una cuenta nueva. No cierra la UI/observación persistente ni el encadenamiento ligado en la conciliación interna del worker de emisión; son el siguiente trabajo local antes de aceptación hospedada. NC/representación final y gates custodia/PV/parámetros/JWT/RLS/Edge/visual/E2E/primera emisión/CAE siguen pendientes. SQL 001–020/Edge sin instalar/habilitar, flags sin activar, ningún deploy, consulta ARCA autenticada nueva, emisión/CAE real, merge o cambio master/Production. Restauración integral bloqueada, contador/envases pendiente y físicos/Point diferidos; PR03/F08 y PR02 permanecen parciales. El primer intento nativo step 0 por Docker apagado y el fixture inicial sin gate sintético quedan documentados como fallos corregidos, no PASS.

### 23/10/2026 — F08: misma autoridad en la conciliación interna de emisión

Plan: extraer composición de conciliación ligada que recibe únicamente la identidad Auth/binding ya verificados por el servidor; no volver a llamar getUser ni atribuir desde perfil. La ruta HTTP mantiene su autenticación actual; worker privado usa la misma función SQL 020 para recuperaciones de ENVIO_INCIERTO/AUTORIZADA y cierre posterior al envío. Revalidación ligada antes del getter, TA/fetch/registro y wrapper transaccional para escritura; replay no necesita gate/TA/red. Una emisión nueva requiere además gate de conciliación activo antes de TA/envío, evitando emitir sin circuito de recuperación habilitado. Si identidad/emisor cambia después de envío, conservar auditoría original y dejar incierto, sin consultar ni adjudicar a otra cuenta. Probar ambos caminos, cambio durante TA y después del POST, gate deshabilitado, ACK perdido/falso y replays. No SQL nuevo ni activación/ARCA real. Tras este contrato continuar observación persistente/confirmación/modal; no declarar esa UI resuelta por este cambio del servidor.

Preparación del siguiente incremento UI (todavía no implementado): contrato público puro de ACK sin importar transporte/custodia al navegador; SQL 021 de lectura por Auth original + venta + operación + observación, sin emisor/TA/red, con vínculo a cuerpo/intento y constancia de ledger para resultado autorizado. Debe permitir recuperar observaciones pendientes históricas de una operación archivada sin confundirlas con autorización actual. HTTP sólo lectura de esa observación y DTO cerrado, no aceptar cuerpo/binding/actor del navegador.

Cliente: registro local de observación sin PII por Auth/comercio/venta, mismo Web Lock que preparación/corrección/aprobación; UUID/hash/número guardados antes de POST CONCILIAR. GET durable antes y después, sin atribuir otro UUID/cuerpo; reiniciar/abrir sólo consulta el getter, nunca WSFE. Getter incierto conserva registro; nueva consulta sólo con confirmación humana explícita y mismo UUID. No borrar por ausencia sola. Resolver una transición durable que bloquea escrituras del cuerpo viejo o una constancia autorizada exacta puede cerrar el pendiente local obsoleto sin fingir que aquella observación se ejecutó; distinguir ese caso en UX y probarlo. Evitar que un ACK atrasado elimine otra observación. Bloquear acciones fiscales incompatibles mientras exista registro incierto; conservar operación comercial/POS. No ofrecer un descarte a ciegas de observación en vuelo.

Modal: mostrar consulta guardada y confirmación de sólo recuperar/consultar homologación sin reenviar ni cobrar; no presentar ACK de consulta como factura emitida. Después del cierre recargar resolución/diagnóstico/constancia y nunca degradar AUTORIZADA por un ACK histórico pendiente. Rechazar respuestas de venta cambiada. Ensayar pérdida de respuesta, cuotas, dos terminales, R corregido por otra terminal, cuenta cambiada y gate cerrado. SQL/Edge/flags siguen sin activar; aceptación real/JWT/RLS/visual y primeras consultas/emisión requieren los gates actuales.

### 23/10/2026 — Conciliación ligada compartida por HTTP y trabajador (local)

Se completa el encadenamiento de autoridad pendiente de 7386fcc: worker de emisión usa la misma composición ligada a Auth/binding/SQL 020 para ENVIO_INCIERTO/AUTORIZADA y cierre después del envío. Auth se verifica una sola vez por invocación; no se adopta otra cuenta tras reasignación. Nueva emisión exige gate de conciliación activo antes de TA; replay confirmado no necesita emisión/consulta habilitadas ni red. Cambio de identidad después de POST conserva auditoría de recepción original y deja incierto, sin consultar con otra cuenta ni registrar un CAE candidato.

533 pruebas fiscales dirigidas PASS / 7 archivos, salida 0 observada (pilot-fiscal-worker-bound-targeted-typed-final-20261023.log), build final PASS 654 módulos (pilot-fiscal-worker-bound-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS. Escáner 1263 archivos/49 candidatos sin nuevos pares ruta/tipo; símbolos privados ausentes del bundle. Primer build falló por argumento AbortSignal omitido sólo en una prueba nueva; corregido y verificado, log conservado. No se repitió suite global ni PostgreSQL nativo: 3281 PASS/1 skipped y 64 escenarios son evidencia histórica de 7386fcc, no cierre global de este incremento. SQL 001–020 no cambió.

Siguiente pendiente concreto: observación guardada/lectura durable/confirmación/modal, detallado en ExecPlan. NC/representación final, custodia/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual/E2E/CAE siguen pendientes; PR03/F08 y PR02 parciales. No consultas ARCA autenticadas nuevas, instalación/habilitación SQL/Edge, flags, deploy, emisión/CAE real, merge o cambios master/Production. Restauración integral bloqueada, contador/envases pendiente y físicos/Point diferidos.

### 23/10/2026 — F08: ejecución del contrato de observación y modal

Implementar ahora el plan de observación definido arriba: SQL 021 sólo lectura de ACK histórico ligado a Auth/venta/cuerpo/intento, contrato público separado del transporte, servicio/HTTP getter y registro local coordinado. Confirmación UI para consulta explícita, recuperación al abrir sólo por lectura, cierre por observación durable o transición/constancia exacta que vuelva obsoleto el intento local, sin fingir ejecución de esa consulta. Añadir pruebas de ambos cierres y no degradar AUTORIZADA. Se mantiene el gate de consultas reales cerrado y no se emiten comprobantes. PR03/F08/PR02 continúan parciales hasta aceptación hospedada y pendientes restantes.

### 23/10/2026 — F08: observación persistente y modal integrados localmente

Implementados SQL 021 sólo lectura histórica y servicio/HTTP CONSULTAR_CONCILIACION con Auth original/venta/cuerpo/intento, contrato público puro de ACK con fechas válidas y SDK limitado a 32 RPC. Cliente conserva ID/hash/número sin PII antes de POST y exige getter durable; reapertura no consulta ARCA. Estado incierto comparte lock y bloquea acciones fiscales incompatibles; no se descarta por ausencia sola. Constancia autorizada exacta o transición durable del cuerpo viejo puede cerrar un pendiente obsoleto sin atribuirle ejecución. Modal exige confirmación, conserva acceso al pendiente si falla resolver, oculta revisión anterior mientras hay consulta y no degrada autorización por ACK histórico. Respuesta de otra venta se ignora.

601 dirigidas PASS / 9 archivos (pilot-fiscal-observation-ui-targeted-v2-20261023.log), build final PASS 655 módulos (pilot-fiscal-observation-ui-build-final-20261023.log), 66 escenarios PostgreSQL 17.11 PASS (fiscal-observation-ui-concurrency-20261023.json), contenedor propio detenido/datos conservados y cero solicitudes externas/emisiones. Incluye consulta con gate cerrado→registro SQL ligado sintético→reinicio y lectura sin emisor, R corregido por otra terminal sin inventar que se ejecutó la observación, lectura histórica después de archivo y Auth reasignado esperando lock. Oxlint sin nuevos hallazgos (warning preexistente finally del runner), manifiesto histórico 43 SQL/diff PASS; escáner 1267 archivos/49 candidatos sin nuevos pares ruta/tipo, símbolos privados de lector/gate/custodia ausentes del bundle. Primeros tests antiguos suponían ausencia de cualquier checkbox en estado incierto: ahora distinguen la aprobación prohibida de la confirmación de sólo consulta. Un test nuevo inspeccionaba ID privado con rol sin permiso; corregido sólo el fixture sin ampliar permisos, fallo conservado. Suite global en curso; no es todavía cierre global.

Alcance: recuperación/consulta de incertidumbre en UI preparada localmente. Si una consulta no confirma autorización se conserva la operación original: no reenvío, cancelación de número ni rechazo inferido. Aceptación hospedada visual/JWT/RLS/gateway/Edge/Web Locks reales, custodia/PV/parámetros y primera emisión/CAE siguen pendientes; también NC y representación fiscal final. SQL 001–021/Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy, consulta ARCA autenticada nueva, emisión/CAE real, merge o cambio master/Production. PR03/F08 y PR02 parciales. Contador/envases y restauración integral bloqueados, impresora/cajón/Point diferidos.

### 23/10/2026 — Cierre local de observación recuperable y modal

Suite completa 3331 PASS / 1 skipped / 253 archivos, salida 0 observada (pilot-fiscal-observation-ui-suite-results-20261023.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal nueva omitida. 601 dirigidas PASS / 9 archivos, build final PASS 655 módulos, 66 escenarios PostgreSQL 17.11 PASS; contenedor propio detenido/datos conservados y cero solicitudes externas/emisiones. Oxlint sin nuevos hallazgos, warning preexistente finally del runner; manifiesto histórico 43 SQL y diff PASS, SDK 32 RPC, escáner 1267 archivos/49 candidatos sin nuevos pares ruta/tipo y símbolos privados ausentes del bundle. Avisos de sourcemap/chunks conservados, no errores.

El flujo local de observar/recuperar/confirmar consulta queda integrado con SQL 021 y mismo ID, sin PII local, sin consulta ARCA al abrir y sin atribuir el cierre de otra terminal a una observación no ejecutada. Datos/estado de la constancia actual prevalecen sobre ACK histórico. No se libera número ni se reenvía factura ante falta de autorización. Este cierre no acredita consultas ARCA/JWT/RLS/Web Locks/Edge/visual/E2E hospedados ni CAE real. Siguientes bloques locales: notas de crédito y representación fiscal final, manteniendo preparación de aceptación hospedada y gates de custodia/PV/parámetros. SQL 001–021 y Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy, consultas ARCA autenticadas nuevas, emisión/CAE real, merge o cambio master/Production. PR03/F08 y PR02 siguen parciales; contador/envases y restauración integral bloqueados, impresora/cajón/Point diferidos.

### 23/10/2026 — F08: representación fiscal, hechos de impresión antes del PDF

Fuentes oficiales revisadas: especificación QR https://arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf (URL actual arca.gob.ar, JSON numérico/base64, CAE tipo E); requisitos de comprobantes https://www.afip.gov.ar/fe/emision-autorizacion/datos-comprobantes.asp y RG 5614 vigente https://biblioteca.afip.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5614%7Co%3A9%7Ca%3A2024%7Cf%3A12%2F12%2F2024 (representación gráfica/transparencia). No usar el PDF histórico de RG1415 con umbrales viejos como regla actual.

Situación: constancia 014 conserva cuerpo/CAE pero no razón social, domicilio comercial/IIBB/inicio, nombre/domicilio receptor ni descripciones impresas; snapshot de líneas conserva IDs/importes, no nombres de catálogo. El generador heredado admite defaults/parseInt/toFixed y configuración mutable; no sirve como fuente histórica de este circuito. Plan del incremento: contrato puro cerrado y SQL 022 privado para registrar una sola vez esos datos explícitos por operación/hash/Auth original, descripciones por IDs exactos del snapshot y otros impuestos nacionales indirectos declarados (sin inferir clasificación desde tributos). Fechas canónicas y decimal monetario, sin defaults; el cuerpo aporta CUIT/PV/IVA/condición y los importes reales. Guardado sólo antes de intención/recepción, con fuente/body vigentes y lectura durable tras ACK; getter histórico sin emisor/catálogo vigentes, metadatos/actor/cuerpo coherentes y sin credenciales. Tabla inmutable y sin permisos públicos. Corregir hechos requiere sucesora reservada con historial conservado, no reescribir presentación.

Después: integrar captura/confirmación y hash de presentación en revisión/permiso de emisión, fuente pública de representación con datos comerciales inmutables y constancia, QR y PDF multipágina sin configuración actual. No declarar representación final ni habilitar emisión por sólo preparar SQL 022. El gate de aceptación debe comprobar explícitamente el vínculo presentación→revisión→envío; sigue pendiente hasta implementarlo. Prueba visual/PDF digital posterior, sin impresora física. Verificar errores/Unicode/fecha/IDs, ACK perdido/falso, Auth reasignado/emisor cambiado, historial y locks nativos. Sin ARCA autenticada, claves, SQL remoto, flags, deploy ni emisión.

Continuación local: 17 pruebas del contrato de representación PASS y 149 regresiones de preparación SQL PASS (incluye carga de SQL 022). Esto no sustituye pruebas dedicadas de permisos, persistencia, concurrencia nativa ni integración revisión/permiso. La primera captura debe preceder también a cualquier revisión humana; replay exacto posterior conserva el historial. Tratamiento fiscal de envases descontados confirmado pendiente de contador; bloqueo conservado. Sin instalación remota ni emisión.

### 23/10/2026 — Representación: contrato histórico privado, integración pendiente
SQL 022 y servicio privado guardan una sola vez hechos explícitos de emisor/receptor y descripciones por IDs exactos del snapshot, ligados al cuerpo/hash y Auth original. Fecha canónica e importe decimal obligatorio, sin defaults de configuración mutable. Guardado inicial anterior a cualquier revisión o intención; replay exacto permite recuperación histórica tras revocación/sustitución. Tabla inmutable sin acceso directo para anon/authenticated/service_role. Sólo lectura durable confirma éxito ante ACK perdido/falso; no se agrega ruta HTTP ni emisión.

Evidencia local: 221 pruebas dirigidas PASS / 4 archivos (pilot-fiscal-presentation-targeted-20261023.log); 70 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-concurrency-v2-20261023.json), con duplicados, rollback, Auth reasignado y emisor revocado esperando lock. Contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Primer ensayo no inició por Docker apagado; evidencia fallida conservada. Aserción histórica sobre campos privados corregida porque la secuencia cae de un UUID aleatorio causaba falso positivo; control ahora identifica claves JSON. Oxlint sin nuevos hallazgos; warning finally preexistente del runner conservado. Manifiesto histórico 43 SQL PASS; escáner 1272 archivos/49 candidatos sin nuevos pares ruta/tipo frente al cierre anterior. Suite global 3331/1/253 corresponde al HEAD anterior, no se repitió en este incremento.

Pendiente imprescindible: captura/confirmación en UI y vínculo del hash de presentación a revisión/permiso/envío, fuente final/QR/PDF, notas de crédito y aceptación hospedada. Este contrato aislado NO cierra representación fiscal, PR03/F08 ni PR02. SQL 001–022 y Edge sin instalar/habilitar por nosotros, flags sin activar; sin deploy, claves, ARCA autenticada, emisión real/CAE, merge o cambios master/Production. Envases descontados pendientes del contador, restauración integral bloqueada; impresora/cajón/Point diferidos.

Cierre de comprobaciones del incremento: build final PASS 655 módulos (pilot-fiscal-presentation-build-20261023.log), diff PASS y cero coincidencias de servicio/RPC/gate privados en dist. Escáner comparado por ruta/tipo: delta vacío. No se repitió la suite global; 221 dirigidas y 70 nativas son la evidencia actual.

### 23/10/2026 — F08: aprobación ligada a representación (incremento privado)
Implementar SQL 023 sin instalación: vínculo inmutable revisión/presentación, aprobación con hash esperado explícito y lectura durable. Cuando existen hechos 022, la aprobación antigua debe rechazarse; no atribuir al Dueño datos que no confirmó. Consumo privado con hechos exige la misma revisión/hash/Auth/cuerpo y no debe seleccionar una aprobación antigua distinta. Mantener los contratos históricos sin presentación para no reescribir auditoría; esto no acredita el gate obligatorio para nuevas preparaciones 012, que debe quedar impuesto junto a captura/UI antes de activación. El incremento es parcial y no habilita endpoint/flags/emisión. Probar hash/actor/ACK/permisos/replay y consumo ligado; después integrar DTO/UI y la exigencia de datos para toda preparación nueva. No activar con fallback heredado ni llamar ARCA.

### 23/10/2026 — Revisión ligada a los hechos históricos (parcial)
SQL 023 conserva vínculo inmutable entre revisión y hash de presentación. La aprobación exige hash esperado explícito de cuerpo y presentación, venta/Auth original y misma revisión; la ruta anterior rechaza operaciones con hechos 022. Helper histórico queda privado sin execute externo. El consumo verifica el mismo revision_aprobada_id elegido por 011 y su vínculo/Auth/hash, revirtiendo intención y uso del permiso si falta. Guardado de hechos después de cualquier revisión sigue bloqueado; no se reconstruye aprobación histórica ni se extiende vigencia por replay.

Servicio privado captura Auth una vez y confirma exclusivamente mediante lectura durable del mismo UUID/cuerpo/hash; replay temprano no escribe, ACK perdido/falso no confirma a ciegas. DTO cerrado sin permiso/custodia; SDK 36 RPC. No se agrega ruta HTTP ni acción de emisión. Compatibilidad de historia sin hechos preservada: aún falta exigir presentación para toda preparación nueva 012, captura/confirmación UI y revisión pública ligada antes de activar. Este incremento NO acredita esa obligatoriedad global ni cierra representación final/QR/PDF/NC.

Evidencia: 521 pruebas dirigidas PASS / 8 archivos, salida 0 (pilot-fiscal-presentation-review-targeted-20261023.log), 73 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-review-concurrency-20261023.json), build final PASS 655 módulos. Se probaron hash distinto, ruta antigua/helper bloqueados, inserción del vínculo omitida sin aprobación parcial, selección de revisión más reciente sin vínculo que revierte intención/permiso, replay y dos workers/mismo UUID. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL PASS, oxlint sin nuevos hallazgos (finally preexistente del runner), escáner 1276 archivos/49 candidatos. Suite global 3331/1/253 sigue siendo evidencia histórica de 14fccb0, no nuevo pase.

SQL 001–023 y Edge sin instalar/habilitar por nosotros; flags sin activar, sin deploy/claves/ARCA autenticada/emisión real/CAE ni merge/cambios master/Production. PR03/F08 y PR02 parciales. Envases descontados pendientes del contador y bloqueados; restauración integral bloqueada; impresora/cajón/Point diferidos. Siguiente gate local: integrar captura y DTO/confirmación ligada, luego imponer presentación en toda intención nueva de preparación 012 sin fallback histórico; aceptación hospedada y autorización de instalación siguen separadas.

### 23/10/2026 — F08: fuente pública para captura y acciones de representación
La pantalla no dispone de IDs inmutables de detalles; no usar IDs/nombres del catálogo actual para reconstruirlos. Preparar SQL 024/getter acotado de líneas del snapshot (ID, cantidad, precio y subtotal decimales explícitos), con Auth original/venta/operación/cuerpo. Integrar acciones HTTP cerradas para contexto/hechos/guardado/aprobación ligada y su recuperación, usando servicios existentes y límite 64KiB sólo para propuesta. Sin emisor/custodia/TA/ARCA ni nueva emisión. Luego integrar cliente bajo el mismo Web Lock, captura/UI y obligatoriedad para toda intención nueva 012; no activar mientras falte ese guard. Este incremento de transporte/fuente es dependencia concreta de la captura, no cierre de UI ni representación final.

### 23/10/2026 — F08: captura histórica y aprobación ligada integradas localmente
SQL 024 aporta sólo IDs, cantidades y precios/subtotales del snapshot inmutable, con venta/operación/Auth original/cuerpo. No reconstruye nombres ni precios desde catálogo actual. HTTP agrega CONTEXTO_REPRESENTACION, DATOS_REPRESENTACION, GUARDAR_REPRESENTACION, APROBAR_REPRESENTACION y APROBACION_REPRESENTACION: objetos cerrados, 64KiB sólo para propuesta y 2KiB para consultas/aprobación, Auth real único por servicio, sin TA/custodia/ARCA ni acción EMITIR. Respuesta pública de hechos contiene canónico/hash; datos derivados se recomputan después de verificarlos en el cliente. SDK privado 37 RPC.

Cliente captura revisión/fuente/hechos antes del hash asíncrono, comprueba IDs/hash y fecha/impuesto contenido contra cuerpo y comparte Web Lock por venta con las otras mutaciones. Sólo getters durables confirman guardado/aprobación ante ACK perdido/falso. No persiste datos de emisor/receptor/descripciones en navegador; guarda únicamente UUID/vence de aprobación ya existente. Captura de identidad esperada antes del fetch evita atribuir una respuesta a referencias mutadas.

Modal existente integra formulario sin defaults de configuración, fecha dd/mm/aaaa, cantidades/importes con coma decimal, nombres/domicilios/IIBB/inicio/descripciones e impuesto nacional contenido declarado sin sumarlo otra vez. Guarda antes de mostrar aprobación; panel muestra los datos conservados y exige confirmación ligada. Recuperar aprobación vuelve a comprobar vínculo exacto. La pantalla reservada ya no llama APROBAR_REVISION. Sucesoras reservadas/R exigen hechos nuevos, sin heredar datos ni aprobación; revisión antigua sin hechos pide corrección conservando el número. Fallos de lectura/venta cambiada no muestran aprobación o formulario de reemplazo a ciegas. Artefacto visual/hospedado aún no acreditado.

Cierre: suite completa 3421 PASS / 1 skipped / 259 archivos, success=true y salida 0 observada (pilot-fiscal-presentation-ui-suite-results-20261023.json y pilot-fiscal-presentation-ui-suite-run-20261023.log). Única omitida F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal omitida. Selección dirigida 484 PASS /9 archivos; selección adicional cliente/formulario 11 PASS /2 (4 de formulario se superponen, no sumar como pruebas únicas). 75 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-ui-concurrency-v2-20261023.json), incluidos catálogo cambiado y Auth reasignado sin revelar líneas; contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Primer ensayo falló en step 0 por Docker apagado, sin crear contenedor; log conservado. Build final PASS 659 módulos, salida 0 (pilot-fiscal-presentation-ui-build-final-20261023.log). Build anterior v2 dejó log incompleto y handle ausente; no se cuenta como PASS. Pase nuevo final posterior a controles/decimal sí observado.

Oxlint sin nuevos hallazgos, warning finally preexistente del runner; manifiesto histórico 43 SQL/diff PASS. Escáner 1283 archivos/49 candidatos y delta ruta/tipo vacío; entradas privadas del nuevo servicio/RPC/custodia ausentes del bundle. Fallos iniciales de unión TypeScript, fixtures de sucesoras que devolvían hash anterior y DTO HTTP con datos derivados extra se corrigieron antes del cierre global; no se contaron como PASS ni se ampliaron contratos/permisos.

PR03/F08 y PR02 siguen parciales. Próximo gate local obligatorio: exigir hechos/revisión ligada en TODA intención nueva desde servidor y antes de TA/envío, sin fallback de preparación heredada; preservar recuperación/historia de intentos ya existentes. Luego fuente final/QR/PDF/NC y aceptación hospedada/visual/Web Locks/JWT/RLS/Edge, custodia/PV/parámetros y primera emisión/CAE expresamente autorizados. SQL 001–024/Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy ni nuevas consultas fiscales autenticadas/claves/emisión real. Sin merge ni cambios master/Production. Contador/envases descontados bloqueados; restauración integral bloqueada; impresora/cajón/Point diferidos.

### 23/10/2026 — F08: obligación global antes de nueva intención (en implementación)
SQL 025 deberá exigir preparación 012, hechos 022 y revisión 023 del mismo cuerpo/Auth/emisor para toda intención nueva, sin exención para operaciones heredadas. Guard privado antes de TA y guard transaccional de reserva/consumo; revocar execute directo del helper de intención para que sólo el wrapper revisado pueda crearlo. Replay/conciliación de intentos ya existentes conserva historia, sin fabricar hechos/aprobaciones ni otro envío. Migrar fixtures de emisión al flujo explícito real; mantener los ensayos de contratos históricos identificados como tales. En PostgreSQL, comprobar actualización sobre historia previa y escenarios posteriores a 025, distinguiendo ambas fases de evidencia. Probar faltantes, cuerpo/hash/actor, catálogo/emisor, vencimiento durante locks, ACK, rollback y recuperación, antes de publicación. Sin SQL remoto, flags, TA real, ARCA autenticada, emisión/CAE o deploy.

### 23/10/2026 — Retiro local de la ruta fiscal heredada
Hallazgo de revisión: afip-wsfe conserva firma/emisión antigua sin vincular JWT al comercio/revisión nueva; el plan ya prohibía desplegarlo como backend nuevo, pero el archivo seguía ejecutable. Retirarlo localmente con respuesta 410 incondicional y sin acceso a cuerpo, secretos, base o red; Git conserva la implementación histórica. No desplegar ni modificar instalación remota. Además, emitirComprobantePrueba del store aún podía fabricar una demostración CAE desde un caller directo en piloto estricto: agregar el mismo guard temprano que ya tiene emitirFacturaVenta, preservando modo legado false. Probar ausencia de red/lectura/mutaciones y respuesta retirada. Este cierre complementa SQL 025; no presupone estado remoto del endpoint ni autoriza activación.

### 23/10/2026 — F08: obligación global de representación y retiro legado preparados
SQL 025 exige para TODA intención nueva preparación explícita 012, hechos 022 y revisión ligada 023 del mismo Auth/cuerpo/emisor/parámetros. Compara cuerpo sin número con datos preparados, canónico/hash y catálogo vigente; no hay exención para operación heredada. Trabajador usa RPC autorizar_envio_presentado_homologacion antes de TA/numeración; valida DTO cerrado y mismo ID de revisión/cuerpo. Trigger de reserva revalida dentro de la transacción que crea intención y 011/023 conservan consumo/revisión exactos. Execute directo de registrar_intento_fiscal_homologacion queda revocado a anon/authenticated/service_role; wrappers SECURITY DEFINER revisados siguen siendo la entrada. SDK privado 38 RPC, sin nueva acción HTTP/EMITIR.

Vigencia de revisión se comprueba tras el último lock del vínculo; contexto/parámetros se recargan allí para detectar vencimiento durante espera antes de TA. Reasignación de Auth, rotación de emisor, parámetro/cuerpo/revisión ajenos o faltantes fallan cerrados. Getter 023 también rechaza presentar aprobación antigua como vigente tras rotar emisor: debe corregirse preparación, no reinterpretar ACK ni fabricar otra aprobación. Recuperación de intenciones ya existentes no crea hechos/revisiones ni otro intento; historia se conserva.

Fixtures de emisión/devolución migrados a preparación/hechos/aprobación reales en PostgreSQL embebido. No se restauraron permisos antiguos para pasar pruebas. Casos de devolución con factura reservada/incierta/autorizada siguen rechazados sin cambios de stock/caja; autorización sintética se crea por ledger, no UPDATE privilegiado de estado. Aislamiento incompatible ahora rechaza desde el primer gate de preparación, conservando ausencia de reserva/devolución.

Retiro local de afip-wsfe: entrypoint delega a respuesta 410 sin leer cuerpo, secretos, base o red; implementación anterior conservada en Git. No se comprobó ni modificó su instalación remota. Store bloquea emitirComprobantePrueba al inicio en piloto estricto, antes de cargar configuración, fabricar demostración CAE o persistir; false conserva comportamiento legado. El plan ya prohibía ese endpoint como fallback y ahora el código local lo deja retirado. Antes de aceptación hospedada, verificar y retirar/denegar cualquier instalación antigua con autorización específica.

Cierre final: 3436 PASS /1 skipped /260 archivos, success=true y salida 0 observada (pilot-fiscal-required-presentation-suite-v2-results-20261023.json y suite-v2-run). Omitida sólo fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal omitida. 493 dirigidas PASS /7 archivos; selección retiro/store/devolución 64 PASS /3 con superposición, no sumar como únicas. Primer global 3429 PASS/2 fallidas/1 skipped conservado: fixtures de devolución aún invocaban helper revocado; corregidos sin reabrir grants. Fallos dirigidos de fixtures/emisor/aislamiento conservados, no contados como PASS.

PostgreSQL 17.11: 85 escenarios PASS (fiscal-required-presentation-concurrency-v3-20261023.json). Fases explícitas: 73 casos de compatibilidad previos a instalar 025; instalación repetida preserva reservas; 12 posteriores (10 específicos de 025 +2 de catálogo/CAE heredado). No afirmar que los 85 se ejecutaron con 025 desde el inicio. Nuevos: replay histórico sin crear hechos, nueva operación heredada bloqueada, helper directo denegado, dos workers/un consumo, rollback y vencimientos de revisión/parámetros esperando op/vínculo, Auth/emisor durante espera. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Pases previos de 83/84 conservados; final v3 añade parámetros después del último lock.

Build final PASS 659 módulos/salida 0 (pilot-fiscal-required-presentation-build-v2-final-20261023.log); manifiesto histórico 43 SQL/diff PASS. Oxlint sin nuevos hallazgos; warnings previos finally del runner y errInvoke del store conservados (éste no modificado). Escáner 1286 archivos/49 candidatos sin nuevos pares ruta/tipo; guard/RPC/retirement/custodia privados ausentes del bundle público. Avisos históricos de sourcemap/chunks no son errores. No se editaron fuentes durante el global final.

El gate LOCAL de obligación de datos/revisión antes de intención queda preparado. PR03/F08 y PR02 siguen parciales: fuente final/QR/PDF/NC, aceptación hospedada JWT/RLS/Edge/Web Locks/visual y retiro remoto legado, custodia/PV/parámetros y primera emisión/CAE siguen pendientes. SQL 001–025/fiscal Edge sin instalar/habilitar por nosotros, flags apagados, sin deploy/claves/ARCA autenticada/emisión real ni merge/cambios master/Production. Envases descontados pendientes del contador; restauración integral bloqueada; impresora/cajón/Point diferidos. Próximo bloque local: fuente íntegra para representación autorizada y QR/PDF, sin reconstrucción desde catálogo/configuración actuales.

Instalación futura: usar familia 001–025 compatible, incluida 023 actualizada para rechazar replay tras rotación de emisor. No instalar 025 aislada sobre versiones incompatibles; aceptación y autorización remotas siguen siendo requisitos.

### 23/10/2026 — F08: fuente íntegra de representación autorizada (en implementación)
SQL 026 deberá unir constancia 014 autorizada, hechos 022, líneas 024 y vínculo 023 de la revisión realmente consumida. Reutilizar prueba histórica 015, sin emisor/catálogo vigente, TA o red; descripción IVA del receptor desde revisión histórica de parámetros y condición del emisor desde preparación explícita. Verificar sumatoria de subtotales contra snapshot/total fiscal, IDs exactos, tiempos de consumo y mismo cuerpo/hash/Auth. El checkout 008 exige suma de detalles=total y manualCheckoutRequest también valida ese reparto; no recalcular descuentos/envases a partir de precio×cantidad ni inventar un ajuste para historia inconsistente. Denegar representación si falta vínculo o coherencia; constancia 014 permanece disponible. DTO cerrado/validador puro/servicio privado y acción de sólo lectura, sin PII local. Después QR/PDF a partir de esa única fuente, sin usar TicketData/configuración actuales. Pruebas de cambios de catálogo/emisor, historia, autorización, campos/hash/IDs/importes y ACK/errores; SQL remoto y emisión siguen gated.

QR: especificación oficial revisada nuevamente (https://arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf): URL actual https://www.arca.gob.ar/fe/qr/, JSON versión 1/Base64, valores numéricos exactos para importe/cotización/documentos/CAE y tipo E. Preparar generador puro que vuelva a validar la representación completa, sin afipQR heredado, defaults, parseInt/toFixed ni conversión de decimales por float. Serializar números desde cadenas canónicas validadas y proteger Base64 como parámetro URL. Salida marcada sólo homologación/sin validez fiscal; no consulta ni acredita ARCA. PDF/imagen y validación visual posteriores.

### 23/10/2026 — Representación fiscal: avance local y decisión del Dueño
El tratamiento fiscal de los envases recibidos que descuentan el ticket sigue pendiente de definir con el contador, confirmado por el Dueño. Mantener bloqueada la preparación fiscal de esas ventas; no inferir su tratamiento ni aplicar defaults.
Fuente histórica SQL 026, servicio/acción de lectura y generador QR puro preparados localmente. Cruzan autorización, revisión consumida, Auth original, cuerpo/hash, líneas e importes sin reconstruir desde catálogo/emisor actuales. No hay PDF ni QR visual exportable todavía. SQL 001–026 y Edge sin instalación/activación remota autorizada.
Validación dirigida: 481 PASS /7 archivos; después de corregir exclusivamente el tipo de una prueba negativa, QR 6 PASS. PostgreSQL 17.11: 87 escenarios PASS, con 73 anteriores a 025 y 14 posteriores a 025+026; cero solicitudes externas/emisiones. La suite global 3436 PASS/1 skipped pertenece al HEAD anterior y no constituye una ejecución global de estos cambios. Compilación final PASS con salida 0 (pilot-fiscal-representation-source-build-v2-20261023.log); manifiesto de 43 SQL y diff sin errores. Revisión local: lint sin hallazgos nuevos (warning finally previo del runner), escáner 1293 archivos/49 candidatos sin nuevos pares ruta/tipo, controles privados ausentes del bundle. Publicación aún pendiente. Continúan pendientes PDF/validación visual, notas de crédito, aceptación hospedada, custodia, PV acreditado y primer CAE autorizado. Impresora y Point diferidos; Production/master intactos.

### 23/10/2026 — F08: PDF local desde representación autorizada
Continuación: generar A4 paginado con marca permanente de homologación/sin validez fiscal en cada página, identificación/cuerpo/CAE/QR de la fuente 026 y detalle comercial histórico, sin consultar stores ni recalcular descuentos. Mostrar campos fiscales explícitos y subtotales finales registrados, distinguiendo precio/cantidad comerciales de la determinación impositiva del cuerpo. No inventar IVA por renglón ni etiquetar aprobación del layout/legal/comercial como completada. Revalidar fuente completa antes de exportar, congelarla ante esperas asíncronas, denegar glifos no soportados antes de producir un PDF ilegible; soporte tipográfico completo y aceptación fiscal del layout seguirán gate si falta evidencia. Probar importes, alteración de cuerpo/fuente, paginación y textos largos, ausencia de red/descarga automática. Generar muestras sintéticas fuera de Git y renderizar/inspeccionarlas; integrar botón sólo después de cerrar modelo/layout y pruebas. No emisión/instalación remota ni cambios en funciones de ticket legado.
### 23/10/2026 — PDF local de homologación preparado; aceptación fiscal pendiente
Fuente/QR publicados en 4f83002 (PR #3 Draft, base remota 03a798f, sin merge). PDF A4 paginado desde fuente 026 revalidada y capturada antes de esperas; muestra datos históricos, detalle comercial con subtotales finales, importes fiscales explícitos, CAE/QR e identificadores/hash. No calcula IVA por renglón ni vuelve a calcular descuentos desde cantidad×precio. No usar este avance como acreditación de un layout fiscal/comercial completo.
Descarga explícita integrada al modal detrás del gate de homologación existente (sin activar): consulta representación autorizada, comprueba venta/operación/cuerpo/CAE y conserva constancia ante fallo. Doble clic excluido; cierre/cambio de comprobante descarta resultados tardíos; no emite, no toca stock/caja ni almacena PII. Generador puro no descarga/imprime ni consulta stores/red. Importación diferida de PDF.
151 PASS dirigidas /6 archivos (PDF, exportador, modal, modelo, QR y cliente), build final v4 PASS/salida 0; lint sin hallazgos en el bloque. Escáner1297 archivos/49 candidatos sin nuevos pares ruta/tipo; controles/custodia privados ausentes del bundle. Evidencia: pilot-fiscal-representation-pdf-ui-targeted-v4-20261023.log y pdf-build-v4. No se repitió suite global ni PostgreSQL por este cambio de representación; 3436/1skip/260 y 87 escenarios corresponden a ejecuciones anteriores documentadas, no sumar a estas151 como pruebas únicas. Fallos iniciales de fixture de201caracteres/matchers no disponibles conservados en logs, corregidos sin cambiar contratos o añadir dependencias. Render/inspección visual de muestras sintéticas de1 y21 páginas; extracción pdfplumber confirma200renglones, total/CAE y marcas en todas las páginas, sin texto fuera de límites. Poppler avisó de fuentes auxiliares Symbol/ArialUnicode no disponibles; Helvetica usada inspeccionada legible. PyMuPDF no instalado; comprobación final realizada con pdfplumber disponible.
Límite explícito: Helvetica admite Latin-1 (tildes/ñ), se bloquean glifos fuera de ese conjunto antes de generar PDF y se informa en UI; falta fuente Unicode adecuada y aceptación del layout/semántica fiscal/comercial. Sólo A/B/C y PES/cotización1 del contrato vigente. No hay validación física del QR/impresora ni emisión real. Muestras fuera de Git, datos/CAE enteramente ficticios; no son comprobantes de ARCA. Sigue pendiente aceptación hospedada JWT/RLS/Edge/visual, instalación autorizada de SQL001–026/Edge, notas de crédito, PV/custodia y primer CAE expresamente autorizado. Envases descontados bloqueados hasta definición del contador; restauración integral bloqueada. Production/master intactos; impresora/cajón/Point diferidos.

### 23/10/2026 — F08/NC: inventario y contrato previo a persistencia
La factura usa raíz única por venta/entorno (001), tipos1/6/11 y cuerpo versión1 cerrado. SQL010 impide devoluciones comerciales de ventas reservadas/autorizadas. No ampliar esos enums ni levantar010 para habilitar NC: necesita identidad/cuerpo/serie/diario propios y vínculo inmutable a factura. Consultado el índice oficial vigente: manual WSFEv1 v4.7 (revisión01/09/2026), https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf; el PDF3.4.2 encontrado por búsqueda es histórico y no la referencia vigente. ARCA indica que el emisor originario debe relacionar la nota a comprobante(s) previo(s); contrato del piloto usará exactamente una factura propia de mismo CUIT, con tipo/punto/número/fecha del cuerpo autorizado, sin período genérico ni MiPyME. Estas son restricciones del piloto, no afirmar que ARCA prohíbe otras variantes.
Primer incremento: propuesta pura no persistida de NC parcial/total de devolución, original026 revalidado, UUID de solicitud, fecha/motivo explícitos, líneas vinculadas por detalle/cantidad/importe/reposición e importes/IVA/tributos explícitos, exactos con enteros. Derivar sólo referencia/tipo3/8/13 desde factura A/B/C; no inventar número/PV actual/IVA proporcional/permiso/envío. Fecha operativa se recibe como contexto explícito futuro del servidor; propuesta no acredita ese origen. Límites por caso contra factura no equivalen a saldo disponible: persistencia futura debe bloquear factura/retornos/casos, reservar cantidades y componentes impositivos acumulados y recalcular importe comercial contra snapshot/receta e historial. Condición IVA receptor deberá declararse explícita y validarse contra catálogo vigente, sin heredarla automáticamente de factura. Antes de trabajador NC: revisión/credenciales actuales/CUIT original, numeración propia y asociación en XML/FECompConsultar/hash/respuesta, cancelación/ACK/crash/concurrencia y aplicación comercial exactamente una vez. Devolución/caja/stock siguen bloqueados por010; este contrato no los libera ni crea una emisión.
### 23/10/2026 — NC: propuesta parcial/total preparada localmente
Se agregó fiscalCreditDraft como contrato puro, separado del cuerpo versión1 de facturas. Revalida original026, captura fuente/propuesta antes de esperas, fija asociación exacta y tipo3/8/13 desde facturaA/B/C, exige fecha/motivo/IVA receptor y cantidades/importes/reposición explícitos. Desglose de impuestos y límites por caso con enteros exactos; no infiere IVA proporcional ni modifica impuestos/identidad de la factura. Descripción de tributos80caracteres y alícuota3+2 del manual oficial WSFEv1 v4.7 (https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf), conservando escala canónica4 sólo con decimales adicionales cero, sin truncar/redondear. Referencia general del emisor/origen: https://www.arca.gob.ar/facturacion/comprobantes/tipos.asp. La fecha no anterior a factura es política del piloto, no una prohibición general atribuida a ARCA.
102 PASS /3 archivos (NC, representación y conciliación), buildv2 PASS/salida0; lint sin hallazgos; manifiesto43 y diff PASS; escáner1299archivos/49candidatos sin nuevos pares ruta/tipo, contrato privado ausente del bundle. Evidencia pilot-fiscal-credit-draft-targeted-v2-20261023.log /credit-draft-build-v2 /credit-draft-scan-v2. No suite global/PostgreSQL nuevos por este contrato puro, ni nueva instalación SQL/Edge, HTTP/worker/flag, red autenticada, numeración, emisión, CAE real o efectos venta/stock/caja. No sumarlas con pruebas históricas como ejecución única.
Estado PROPUESTA_NO_PERSISTIDA/emision_habilitada=false: el hash sólo fija contenido, no acredita permisos, catálogo, fecha/saldo de servidor o devolución válida. El contrato todavía no valida saldo acumulado ni reparto comercial proporcional contra historial y receta; SQL010 conserva bloqueo de devolución fiscal. Próximo: persistencia de caso/identidad y saldos con locks, originalAuth/currentissuer/CUIT/catálogo/revisión, cancelación/replay/ACK/crashes/concurrencia, contrato/XML/conciliación específico NC y aplicación comercial exactamente una vez. Se consultó al titular cuándo entregar efectivo/reponer stock respecto de la confirmación ARCA; decisión pendiente, sin asumir respuesta. NC/PR03/F08/PR02 parciales. Tipografía/aceptación del PDF, pruebas hospedadas JWT/RLS/Edge, PV/custodia y primer CAE con autorización siguen pendientes; contador/envases bloqueado, restauración integral bloqueada, impresora/cajón/Point diferidos. PR #3 Draft, sin merge ni cambios master/Production.

### 23/10/2026 — NC: decisión de reintegro y diseño de reserva durable
El titular confirmó: entregar efectivo y reponer stock solamente DESPUÉS de que ARCA confirme la NC. Respuesta incierta => conciliación, sin efectos comerciales. Preparación/reserva no equivale a autorización; SQL010 sigue intacto hasta integrar el cierre comercial con prueba de CAE NC y aplicación única.
Diseño incremental027: casos NC privados e inmutables por UUID, Auth original y factura026; canónico/hash validados también en SQL, actor/comercio/venta/factura bloqueados en orden existente, emisor actual del mismo CUIT y parámetros vigentes capturados sin crear permiso/envío. Serializar por factura con READ COMMITTED, verificar snapshot vigente y ausencia de devoluciones incompatibles; límites acumulados de cantidades, importes, componentes/IVA/tributos y reparto histórico acumulativo de centavos. Reservar no modifica efectivo/stock ni acredita receta/pagos/catalogación NC para enviar (son gates posteriores obligatorios).
Cancelación previa a envío append-only, mismo Auth/hash, nunca delete/reutilización del UUID. Para conservar reparto de centavos, sólo cancelar el caso activo más reciente de esa factura; revertir sucesores primero. Getter/replay históricos conservan identidad aun si cambian emisor/catálogo; no reactivar cancelados. La futura intención/worker NC debe ampliar este estado y hacer incompatible cancelación después de intención bajo los mismos locks antes de habilitarse; actualmente no existe ruta de emisión NC. Probar ACL/RLS/role, Auth reasignado, saldo/centavos, dos escritores/cancelación/rollback y vencimientos durante locks con PostgreSQL real antes de publicación. Sin instalar SQL/Edge remotamente.
### 23/10/2026 — NC: saldo durable SQL027 preparado y decisión confirmada
El titular confirmó entregar efectivo y reponer stock DESPUÉS de confirmación ARCA de la NC. Incertidumbre => conciliación; preparación o reserva no permiten efectos comerciales. Se conserva SQL010 hasta cerrar el circuito de autorización NC y aplicación exactamente una vez.
SQL027 agrega borradores/cancelaciones privados, canónico/hash, Auth original/factura026, emisor actual del mismo CUIT y parámetros vigentes capturados. Revalida asociación/fecha/textos/decimales/importes/IVA/tributos en SQL; READ COMMITTED y locks por venta/factura serializan cantidades/componentes acumulados y prorrateo histórico de centavos. UUID/cuerpo inmutables, ACK consultable, replay no reactiva cancelados; cancelación append-only sólo del caso activo más reciente para conservar reparto. Todas las respuestas mantienen emision/reintegro/reposicion_habilitada=false. No escribe efectivo/stock/devoluciones ni reserva numeración NC.
245 PASS /3 archivos (SQL202, contratoNC31, representación12), build PASS/salida0; manifiesto43/diff PASS. Oxlint sin hallazgos nuevos (finally previo del runner); escáner1300archivos/49candidatos sin nuevos pares ruta/tipo; funciones privadas ausentes del bundle. Evidencia pilot-fiscal-credit-reservation-targeted-v3-20261023.log /credit-reservation-build-v1 /credit-reservation-scan-v1. La suite global3436/1skip/260 es histórica, no una nueva ejecución de este cambio. Primer ensayo SQL falló por CASE sin paréntesis (186 omitidas por fallo de suite, no PASS); corregido y luego186 PASS. Fixture tributaria ocultaba helperinput, corregida sin debilitar contratos; registros fallidos conservados.
PostgreSQL17.11:95 escenarios PASS/salida0 en fiscal-credit-reservation-concurrency-v2-20261023.json. Fases:73 anteriores a025,14 posteriores a025+026,8 nuevos después de instalar027 dos veces. Casos027: mismoUUID/unACK, UUIDdistintos/saldo único, cancelación/saldo/historia, rollback durante espera, centavos/cancelación inversa, Auth reasignado, emisor revocado y parámetros vencidos esperando lock. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-301893a0 detenido y datos conservados. v1 falló en paso0 por Docker apagado; se inició Desktop en segundo plano, se confirmó motor29.9.2 y se ejecutó v2, sin borrar la evidencia anterior.
Pendiente: servicio/HTTP/cliente/UI del caso, receta/pagos/unidades elegibles y preparación fiscal NC completa con catálogo específico, revisión/credenciales actuales, serie/cuerpo/worker/FECompConsultar propios y exclusión con cancelación DESPUÉS de intención (debe instalarse ese guard en la misma migración que agregue intención NC antes de habilitar worker). SQL027 sólo tiene borradores, no una ruta de envío. Antes de habilitar devolución comercial: CAE NC durable coincidente y aplicación única, caja abierta y políticas de reintegro, E2E/concurrencia. Nueva reserva aún no acredita elegibilidad comercial o fiscal de emisión. SDK/HTTP no ampliados por este incremento. Backup JSON de la app no acredita copia de estas tablas privadas: incluir borradores/cancelaciones NC en dump y aceptación de restore integral autorizado junto al resto del diario fiscal. Restore integral sigue bloqueado.
SQL001–027/Edge no instalados/habilitados remotamente por nosotros; flags apagados, ningún deploy, TA/consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. NC/PR03/F08/PR02 parciales. Contador/envases, PDFtipografía/aceptación, PV/custodia y aceptación hospedada conservan gates. Impresora/cajón/Point diferidos.

### 23/10/2026 — NC: servicio privado y transporte de borradores
Incremento siguiente: servicio verifica Auth.getUser exactamente una vez y usa ese Auth capturado en fuente026 y RPC027; captura propuesta antes de esperar, fecha Argentina desde reloj servidor (SQL vuelve a comprobarla), prepara canónico/hash sin confiar actor/origen enviados por browser. ACK público cerrado de10campos, mismoUUID/venta/operación/hash y tres habilitacionesfalse. Guardado/cancelación recuperan por getter tras respuesta perdida, sin reenviar escritura automáticamente; ausencia confirmada distinta de error. Nunca retornar fuente/credenciales/datos fiscales privados en ACK.
Agregar3RPC al SDK privado (39→42) y acciones HTTP GUARDAR_BORRADOR_NC/BORRADOR_NC/CANCELAR_BORRADOR_NC con JSON estricto/límites existentes (64KiB escritura,2KiB consultas), no actor externo. Flag privado ARCA_HOMO_CREDIT_DRAFTS_ENABLED apagado por defecto exigido antes de crearAdmin para guardar; consulta/cancelación conservan recuperación bajo gate backend/Auth/SQL, sin requerir abrir guardado. No EMITIR, TA/custodia/WSAA/WSFE, número NC ni efectos comerciales. Probar DTO/ACK alterado, sesión/Auth una vez, reloj Argentina, ACK perdido y SQL real usando el mismo dispatch protegido. Sigue decisión confirmada CAE antes de efectivo/stock; no activar flags ni instalar SQL/Edge remotamente.
### 23/10/2026 — NC: servicio y HTTP privados preparados localmente
Servicio verifica Auth.getUser una vez/captura ese Auth para fuente026 y RPC027, propuesta y scope capturados antes de esperas y fecha operativa Argentina del reloj servidor (SQL la revalida). Guardado/cancelación recuperan ACK mediante getter durable después de respuesta perdida; no reenvían automáticamente escritura. Ausencia confirmada devuelve null, error no equivale a ausencia. ACK cerrado de10campos ligado a venta/factura/UUID/hash, emision/reintegro/reposicion false; sin devolver fuente/canónico/metadatos de custodia. DTO exige strings literales, sin coerción de arrays; se corrigió también esa validación de condición emisor en la fuente compartida y se agregó regresión.
HTTP incorpora GUARDAR_BORRADOR_NC (64KiB), BORRADOR_NC y CANCELAR_BORRADOR_NC (2KiB), JSON estricto/duplicados/raíces cerradas y las protecciones de host/origen/backend/sesión existentes. Guardado exige ARCA_HOMO_CREDIT_DRAFTS_ENABLED exactamente true antes de crear Admin; apagado por defecto/no activado por nosotros. Consulta/cancelación siguen disponibles con gate de guardado apagado bajo backend/Auth/SQL, para recuperar casos; no habilitan emisión ni efectos comerciales. SDK privado39→42RPC explícitas. No acción EMITIR_NC, TA, custodia, WSAA/WSFE ni flags públicos nuevos.
512 PASS /10 archivos, salida0 observada (pilot-fiscal-credit-service-targeted-v5-20261023.log), buildv3 PASS/salida0. Incluye HTTP–servicio–SQL027 con Auth simulado/identidad capturada y PostgreSQL embebido: ACK perdido de guardado/cancelación, gate propio, recuperación sin flag de escritura, Auth reasignado entre fuente y guardado (sin caso creado), DTO/hash y reloj Argentina, más regresiones contrato/fuente/PDF/QR/modal. No acredita JWT/RLS/Edge hospedados. Se conservan fallos previos de paréntesis/alias/factory de fixture y unión de tipos; corregidos sin casts de escape, supresiones ni cambios de permisos. Lint dirigido limpio; manifiesto43/diff PASS; escáner1303archivos/49candidatos sin nuevos pares ruta/tipo; servicio/RPC/flag privado ausentes del bundle. SQL no cambió en este incremento:95 escenarios PostgreSQL17.11 del cierre027 son evidencia anterior, no una nueva ejecución de este servicio; suiteglobal3436/1skip/260 histórica.
Estado: puente backend preparado, no se cierra NC/PR03/F08/PR02. Pendientes cliente durable/UI de caso, elegibilidad comercial/pagos/receta/unidades y catálogo NC, revisión/permiso/cuerpo/serie/worker/conciliación NC, exclusión cancelación–intención y cierre comercial único con CAE NC confirmado, conforme decisión del titular. SQL001–027/Edge sin instalación/activación remota por nosotros, ningún deploy fiscal, consulta autenticada ARCA nueva, emisión/CAE real, merge ni cambio master/Production. Contador/envases, PDFtipografía/aceptación, PV/custodia y aceptación hospedada siguen gates; restauración integral bloqueada e impresora/cajón/Point diferidos.

### 23/10/2026 — NC: prerequisitos de cliente durable sin datos fiscales locales
Al trazar el cliente se identificaron dos requisitos previos: reconstruir casos desde servidor cuando se pierde almacenamiento local y descartar un intento aún no confirmado sin permitir que un envío tardío lo cree después. No implementar borrado local basado sólo en ausencia de lectura.
Preparar028: desistimiento append-only por UUID/factura/Auth/hash para caso no creado, mutuamente excluyente con INSERT de borrador bajo mismo advisory/lock de factura; consultar/cancelar devuelve ACK CANCELADA y SQL bloquea escritura tardía. Caso existente conserva cancelación inversa027. No efectos comerciales/ARCA. Preparar029: historial de casos propios por factura, páginas fijas de10/cursorsecuencia estable, canónico/hash/ACK de cada caso y validación estricta en servicio/cliente; no tablas públicas ni datos de custodia. Cancelados sin caso no consumen saldo y se recuperan por identificador, no requieren aparecer como NC financiera en historial.
Cliente posterior almacenará sólo UUID/factura/hash/intención, sin canónico, motivo, receptor o credenciales; antes de guardar escribe/verifica registro local y coordina WebLocks del mismo Auth/comercio/venta. Tras reinicio consulta mismoUUID; para retry conserva cuerpo sólo en memoria o exige reconstrucción exacta por hash, nunca genera otroUUID silenciosamente. Desistimiento confirmado permite retirar el registro local; pérdida total del browser recupera casos desde historial servidor. UI detrás de flag propio y gate fiscal existente, sin activar. Decisión CAE NC antes de efectivo/stock permanece obligatoria.
### 23/10/2026 — NC: recuperación durable y desistimiento de intentos no confirmados
SQL028 conserva un desistimiento append-only por UUID/factura/Auth/hash para intentos aún sin caso. Guardado y desistimiento son mutuamente excluyentes bajo READ COMMITTED, locks de factura y advisory común; un envío tardío no crea un caso cancelado. Casos existentes conservan cancelación inversa027. SQL029 recupera historial propio paginado (10 casos/cursor secuencia), propuesta canónica/hash y ACK; revalidación estricta de fuente original y de cada propuesta en servicio/cliente. SDK privado42→43 RPC. Lectura no requiere habilitar nuevos guardados; sí backend/Auth y SQL autorizado. Historial no acredita elegibilidad, saldo actual ni CAE.
Cliente integrado en FiscalClient.credits: sólo IDs/hash/intención en almacenamiento aislado por Auth/comercio/venta; sin motivo, canónico, receptor o credenciales locales. Exclusión compartida con cliente fiscal existente, registro previo verificado, UUID explícito estable por intento, lectura antes/después de escritura y recuperación del mismo identificador; ausencia/error no borra pendientes ni genera otro UUID. Cancelación sólo retira pendiente tras ACK CANCELADA durable. Pérdida total del almacenamiento recupera casos confirmados desde historial del servidor. Aún sin pantalla NC ni nuevo flag público activado.
Validación:398 PASS /6 archivos, salida0 (pilot-fiscal-credit-client-targeted-v3-20261023.log); incluye215 comprobaciones SQL embebidas e integración HTTP–servicio–SQL con Auth simulado. Buildv2 PASS, lint dirigido limpio, manifiesto bootstrap43/diff PASS. Escáner1310archivos/49candidatos, sin nuevos pares ruta/tipo frente a cierre anterior; RPC/flag/tablas privados ausentes del bundle. La primera integración tuvo error de separación de líneas en prueba; corregido, registros fallidos conservados. Suite global3436/1skip/260 histórica, no ejecutada nuevamente.
PostgreSQL17.11 local:100 escenarios PASS/salida0, fiscal-credit-recovery-concurrency-v1-20261023.json. Fases:73 antes025,14 después025/026,8 después027 y5 nuevos después instalar028/029 dos veces. Nuevos: desistimiento gana guardado tardío, guardado gana cancelación sin historia contradictoria, desistimiento concurrente idempotente, rollback libera guardado y lectura de historial espera cancelación confirmada. Cero solicitudes externas/emisiones. Contenedor propio kiosko-pr03-local-810e3581 detenido con datos conservados. No acredita Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados.
Decisión del titular preservada: efectivo y reposición sólo DESPUÉS de CAE NC confirmado y aplicación comercial única; incertidumbre exige conciliación. SQL001–029/Edge no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, TA/consulta autenticada ARCA nueva, emisión real, merge ni cambios master/Production. Backup JSON no cubre diario fiscal privado: aceptación de dump/restore debe incluir también desistimientos NC; restore integral sigue bloqueado. NC/PR03/F08/PR02 continúan parciales. Siguiente: pantalla de casos/recuperación y preparación explícita con elegibilidad comercial/pagos/receta/unidades y catálogo NC; después revisión/cuerpo/serie/worker/conciliación y cierre comercial único, siempre bajo gates. Impresora/cajón/Point diferidos; contador/envases pendiente.

### 23/10/2026 — NC: pantalla de casos y recuperación (en curso)
Integrar panel en constancia autorizada existente detrás de VITE_KIOSKO_ARCA_CASOS_NC_HOMO, apagado por defecto y subordinado a revisión fiscal/piloto estricto. Consulta explícita de fuente/historial, páginas sucesivas, estado guardado/cancelado sin presumir CAE, recuperación del pendiente local y cancelación confirmada sólo del caso activo más reciente (SQL conserva autoridad). Misma estética Button/bordes/formularios existentes; limpiar respuestas al cambiar factura/cerrar. Fallos no borran almacenamiento ni habilitan efectivo/stock. Probar paginación, ACK incierto, errores saneados, doble clic, respuestas tardías y gate cerrado. Este panel aún no crea propuestas: sigue preparación con catálogo NC/elegibilidad/pagos/receta y posterior envío/conciliación NC. Sin activación, instalación remota ni ARCA.

### 23/10/2026 — NC: panel de casos, recuperación y cancelación preparado
Constancia autorizada integra FiscalCreditCasesPanel bajo VITE_KIOSKO_ARCA_CASOS_NC_HOMO exactamente true, subordinado a revisión fiscal/piloto estricto y apagado por defecto; no activado por nosotros. Consulta explícita de representación de la misma factura/hash/CAE y páginas validadas de historial. Muestra fecha/motivo/importe/renglones y estado guardado/cancelado, sin convertir reserva en autorización. Cancelación sólo tras confirmación y del caso activo más reciente al terminar paginación (SQL sigue autoridad); pendiente incierto ofrece recuperación/cancelación conservando UUID. Errores no borran datos, respuestas tardías se descartan al cerrar/cambiar factura, doble clic se excluye. Si cancelación confirma pero historial falla se retiran filas anteriores para no mostrar un caso activo obsoleto. Controles compartidos Button/estética existente, sin nuevo modal divergente; aceptación visual hospedada pendiente.
125 PASS /7 archivos, salida0 (pilot-fiscal-credit-cases-ui-targeted-v3-20261023.log); buildv2 PASS/salida0, lint final limpio, manifiesto bootstrap43 y diff PASS. Escáner1312archivos/49candidatos, sin nuevos pares ruta/tipo respecto17e0578; RPC/flag/tablas privados ausentes del bundle. Pruebas incluyen confirmación, almacenamiento corrupto/ajeno, ausencia sin borrar pendiente, ACK incierto, cancelación sin caso, fallo de historial posterior, dos páginas/reintento, doble clic, respuestas tardías y gate modal cerrado/abierto. Primer pase falló por esperar un botón aún deshabilitado en una prueba; corregida la espera sin cambiar contratos. No se repitió SQL/concurrencia:100 PostgreSQL17.11 del cierre17e0578 son evidencia anterior, no del panel. Suiteglobal3436/1skip/260 histórica. No acredita Web Locks entre ventanas/JWT/RLS/Edge hospedados.
Pantalla de consulta/recuperación preparada; creación explícita NC aún pendiente de elegibilidad comercial/pagos/receta/unidades y catálogo específico, seguida de revisión/cuerpo/serie/worker/conciliación y aplicación comercial única. No presentar el módulo NC completo. Efectivo/stock sólo después de CAE NC confirmado, según titular; incertidumbre exige conciliación. SQL001–029/Edge no instalados/habilitados remotamente por nosotros, sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado; contador/envases y PV/custodia/aceptación pendientes, impresora/cajón/Point diferidos.

### 23/10/2026 — NC: fuente comercial histórica previa al formulario (en curso)
Inventario: snapshot fiscal012 congela detalles/total, pero no pagos ni receta. Checkout_manual_entradas.snapshot y checkout_manuales.solicitud contienen pagos/receta; deben coincidir entre sí y con resultado confirmado, venta/detalles/pagos y salidas físicas. No inferir componentes desde combo_items actual. Preparar SQL030 como getter privado con Auth original026, venta completa e importes coherentes, DTO mínimo sin referencias de pago/PII/costos ni acceso directo a tablas. Bloqueos NOWAIT de cierre histórico evitan invertir espera checkout→venta; conflicto exige nueva consulta. No modifica guard010 ni habilita emisión/reintegro/reposición.
La fuente debe conservar restricciones visibles: medio original (efectivo íntegro requerido por decisión del piloto), conceptos libres sin reposición física, combos sólo enteros y fracciones históricas sin redondear. Snapshot de checkout antiguo NO guarda es_pesable/unidad_medida: no atribuirle esa evidencia desde catálogo actual; soporte explícito de unidades para nuevas ventas y conciliación de casos antiguos permanece requisito antes de habilitar el formulario/cierre final. Catálogo fiscal NC específico también sigue pendiente. Probar ACL/Auth, fuentes ausentes/incoherentes, pagos/receta modificados, libre/combo/fraction y locks en PostgreSQL; luego contrato/servicio/transporte y formulario.

### 23/10/2026 — NC: fuente comercial histórica SQL030 preparada
Getter privado cargar_fuente_comercial_nc_homologacion cruza Auth original/factura026, snapshot fiscal012, cierre confirmado checkout_manuales y snapshot de checkout_manual_entradas, identidad/caja/fecha/total/detalles/pagos actuales y receta contra salidas originales. Conserva componentes del cierre (no combo_items/catalogo actual), conceptos libres sin salida física, fracciones históricas exactas y depósitos por renglón; excluye recepción de envases no fiscalizable. Pagos no efectivos se informan sin habilitar reintegro. Caja original puede estar cerrada: lectura histórica no habilita caja de devolución. DTO mínimo sin referencias de pago, PII, costos, credenciales ni snapshots completos; checksum checkout_sha256 es SHA256 del snapshot::text PostgreSQL, NO canónico fiscal ni dato a recomputar desde browser.
Sólo service_role con fuente026/RC/Dueño activo/Auth original. Toma cierre/entrada/caja con FOR SHARE NOWAIT después del lock de venta, evitando invertir la espera checkout→venta; conflicto exige reconsulta. No modifica guard010/guardar027, no crea reservas/casos ni efectos comerciales. SDK permanece43RPC: getter aún no añadido al SDK/servicio/HTTP/cliente; ése es el siguiente enlace. La fuente no acredita elegibilidad final ni autorización de emitir: al diseñar intención/cierre NC revalidar/bindear hechos comerciales bajo locks; no usar una consulta previa como permiso.
Inventario confirmado: cierres antiguos no conservan es_pesable/unidad_medida. Fuente devuelve unidades_historicas=NO_REGISTRADAS; no atribuye metadatos actuales al pasado ni redondea historia. Falta captura durable de unidades para ventas nuevas y conciliación explícita de antiguas, además de catálogo NC/pagos/receta elegibles y formulario. NC/PR03/F08/PR02 siguen parciales. Efectivo/reposición sólo después de CAE NC confirmado según titular, con aplicación comercial única; incertidumbre exige conciliación.
256 PASS /3 archivos (SQL233 +historial/cliente23), salida0: pilot-fiscal-credit-commercial-targeted-v6-20261023.log. Buildv2 PASS/salida0, lint sin nuevos hallazgos (finally previo del runner), manifiesto bootstrap43/diff PASS; escáner1313archivos/49candidatos sin nuevos pares ruta/tipo, entrada privada ausente del bundle. Pases fallidos conservados: fixture leía con rol sin SELECT, checksum intentaba usar helper fiscal que sólo admite números enteros y mutación sintética no conservaba delta_stock; se corrigieron fixtures/checksum comercial sin relajar canónico fiscal/ACL. UUID históricos válidos se normalizan en DTO sin reescribir snapshots. Suiteglobal3436/1skip/260 histórica, no repetida.
PostgreSQL17.11:104 escenarios PASS/salida0, fiscal-credit-commercial-concurrency-v2-20261023.json. Fases73antes025,14después025/026,8después027,5después028/029,4después instalar030 dos veces. Nuevos: cierre bloqueado falla NOWAIT sin deadlock; pago modificado durante espera no acredita fuente; lectores duplicados recuperan mismo DTO sin efectos; Auth reasignado no revela pagos/receta a cuenta original ni nueva. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. v1 también104PASS antes del ajuste de UUID; v2 prueba SQL final. No JWT/RLS/Edge/Web Locks/visual hospedados.
SQL001–030/Edge no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado; contador/envases, PV/custodia y aceptación hospedada pendientes, impresora/cajón/Point diferidos. No nuevas tablas para backup en030; sigue pendiente acreditar dump/restore de todo el diario privado.

### 23/10/2026 — NC: contrato y transporte de fuente comercial (en curso)
Preparar validador cerrado de DTO030 ligado a representación026, sumas con BigInt, renglones/receta/libres/pagos coherentes y tres habilitacionesfalse; NO_REGISTRADAS literal sin inferir unidades. Servicio Auth.getUser una vez, mismo Auth capturado en ambas RPC; acción FUENTE_COMERCIAL_NC sólo lectura (2KiB, campos cerrados), SDK43→44RPC; cliente revalida y no persiste fuente/PII. Sin habilitar flags, emisión, devolución o cambio de SQL030. Probar payloads extra/ajenos/inconsistentes, RPC/Auth fallidos, captura antes de esperas, almacenamiento intacto e integración HTTP–SQL real local. Después UI explicará elegibilidad antes de ofrecer formulario, pendiente de unidades/catálogo NC.

### 23/10/2026 — NC: contrato/transporte de fuente comercial preparado
Validador DTO cerrado de13campos ligado a representación026 validada, venta/operación/hash/total, líneas históricas exactas y receta normalizada sin IDs duplicados/desordenados. Sumas de renglones/pagos con BigInt y decimales canónicos; PRODUCTO exige componente propio1.000, COMBO receta no vacía/unidades completas, LIBRE sin componentes/fracciones. Medios admitidos explícitos y pago_integro_efectivo recomputado, tres habilitacionesfalse y NO_REGISTRADAS literal. Captura antes de esperas y resultado profundamente congelado. Checksum comercial opaco del servidor: no se reconstruye desde navegador ni se usa como permiso.
Servicio Auth.getUser una vez, actor capturado en fuente026 y getter030; no se vuelve a inferir identidad desde perfil reasignado. Acción FUENTE_COMERCIAL_NC sólo lectura, JSON/campos cerrados y2KiB, bajo gates backend/origen/host/sesión existentes sin requerir flag de guardar. SDK43→44RPC explícitas; cliente credits.commercialSource revalida contra la factura capturada y no lee/escribe storage. Sin TA/custodia/ARCA, nueva propuesta, aprobación, emisión, reintegro o reposición. UI/formulario aún no conectado a este nuevo método; no habilitar creación hasta resolver elegibilidad/unidades/catálogo NC.
399 PASS /7 archivos, salida0: pilot-fiscal-credit-commercial-transport-targeted-v3-20261023.log. Incluye HTTP–servicio–SQL030 embebido con Auth simulado, reasignación entre RPC (no expone datos), SDK allowlist, DTO/receta/medios/importes/flags alterados, errores saneados, captura antes de esperas, storage intacto y regresiones de panel/cliente/historial. Buildv2 PASS/salida0, lint dirigido limpio; manifiesto bootstrap43/diff PASS; escáner1316archivos/49candidatos sin nuevos pares ruta/tipo respecto69b2cd7; entradas privadas ausentes del bundle. No cambió SQL:104 escenarios PostgreSQL17.11 de69b2cd7 son evidencia anterior, no una ejecución nueva del transporte. Suiteglobal3436/1skip/260 histórica. Sin JWT/RLS/Edge/E2E/Web Locks/visual hospedados.
Fuente comercial no acredita saldo, unidades históricas, catálogo NC ni autorización final; futuras intención y aplicación comercial deben revalidar/bindear hechos bajo locks. Siguiente: captura durable/conciliación de unidades, catálogo NC y formulario explícito con pagos/receta elegibles, luego revisión/cuerpo/serie/worker/conciliación/aplicación única. Efectivo/reposición sólo después de CAE NC confirmado por decisión del titular, incertidumbre exige conciliación. NC/PR03/F08/PR02 parciales. SQL001–030/Edge no instalados/habilitados remotamente por nosotros, sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado, contador/envases y PV/custodia/aceptación pendientes; impresora/cajón/Point diferidos.

### 23/10/2026 — NC: captura durable de unidades en checkout (en curso)
Agregar SQL031 opcional con configuración privada por comercio, apagada por defecto; no cambiar snapshot/ACK v1 ni backfill de ventas antiguas. AFTER INSERT de checkout_manual_entradas captura metadata de producto/componentes bajo locks ordenados, ligada a checksum de snapshot y actor original validado. No capturar si la venta/cierre ya existe. Conceptos libres conservan UN/no pesable; combos se registran como completos, componentes desde receta original. Guard de primer cierre compara metadata bajo locks ya tomados por checkout y revierte transacción si cambió; replay confirmado no recotiza catálogo. Config desactivada después de preparar no evita guard de captura existente. Evidencia inmutable/privada y snapshot protegido; flags/custodia remota requieren autorización separada.
Getter NC histórico separado ligado a030 devolverá CAPTURADAS con canónico/hash o NO_REGISTRADAS sin inventar unidades de catálogo actual. Captura no implica saldo, catálogo NC, permiso de emisión ni reposición/reintegro. Probar default apagado, producto/pesable/combo/libre, cierre real y rollback, cambio de metadata, ACK/replay, ACL e instalación repetida; carreras de preparación/cambio/cierre en PostgreSQL real. Luego transporte tipado/formulario y conciliación histórica explícita siguen pendientes.

### 23/10/2026 — NC: evidencia durable de unidades SQL031 preparada
Configuración privada por comercio apagada por defecto (checkout_unidades_config_homologacion) y evidencia inmutable (checkout_unidades_homologacion). AFTER INSERT de entrada comercial nueva captura tipo/es_pesable/unidad de producto/componentes bajo locks ordenados, ligada a actor verificado y checksum del snapshot; no cambia payload/ACK v1 ni captura retroactivamente ventas/cierres existentes. Fuente deriva catálogo al preparar, nunca al devolver. Metadatos se conservan ante replay o cambios posteriores; snapshot/identidad de entrada protegidos, campos de política de supervisor siguen funcionando. Config apagada después de preparar no evade evidencia ya existente.
Primer cierre real compara checksum/metadata bajo locks del checkout; cambio de unidades revierte venta/pagos/stock y conserva intento. Replay confirmado no recotiza ni duplica stock. Se preserva una venta de combo pesable admitida por checkout: capturar hechos no impone la política de devolución de combos completos. La intención inicial del plan de restringir combos al registrar queda sustituida por esta separación, probada con componente físico entero. Guard de devolución/elegibilidad NC sigue aparte; no se declara elegible automáticamente un combo fraccionado.
Getter privado cargar_unidades_nc_homologacion usa fuente030/Auth fiscal original y devuelve CAPTURADAS con canónico/hash o NO_REGISTRADAS/null sin inferir catálogo actual. No agregado aún al SDK/servicio/HTTP/cliente: SDK44RPC permanece. Integración debe consultar031 como evidencia de unidades; DTO comercial v1 no incorpora este registro y no debe usarse solo para decidir si existe. Falta contrato/transporte/UI de unidades, conciliación histórica explícita, catálogo NC y formulario, luego revisión/cuerpo/serie/worker/conciliación/aplicación comercial única. No hay emisión, reintegro o reposición habilitados. Efectivo/stock sólo después de CAE NC confirmado según titular.
300 PASS /3 archivos (SQL252 +contrato comercial29 +envases19), salida0: pilot-checkout-units-targeted-v6-20261023.log. Incluye cierre real producto/pesable/combo/libre, rollback por metadata cambiada, ACK/replay/preparación duplicada, defaultfalse, activación posterior sin backfill, instalación repetida con evidencia, ACL/immutabilidad y Auth reasignado. Buildv2 PASS/salida0, lint sin nuevos hallazgos (finally previo del runner), manifiesto bootstrap43/diff PASS. Escáner1317archivos/49candidatos sin nuevos pares ruta/tipo y unidades privadas ausentes del bundle. Primeras fixtures usaban importe con centavos y ACK sin campos de política: corregidas al checkout real de enteros, sin relajar guards. Prueba de reinstalación corregida para no hacer COMMIT de transacción de fixture; selección reejecutada. Suiteglobal3436/1skip/260 histórica, no repetida.
PostgreSQL17.11:108 escenarios PASS/salida0, checkout-unit-evidence-concurrency-v3-20261023.json. Fases73antes025,14después025/026,8después027,5después028/029,4después030 y4después031 instalado dos veces. Nuevos: dos preparadores/unUUID/una evidencia; unidad cambia durante espera/cierre revierte negocio; rollback de preparación no deja evidencia/libera editor; cierre gana edición posterior y replay conserva unidades sin doble stock. Contenedor propio kiosko-pr03-local-eb24070d detenido/datos conservados, cero solicitudes externas/emisiones. v1 falló paso104 por caja sintética creada después de fecha del ticket; se corrigió cronología fixture sin cambiar controles. v2 pasó108 antes del ajuste de combo pesable; v3 acredita SQL final.
SQL001–031/Edge y configuración de captura no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. NC/PR03/F08/PR02 siguen parciales; aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual pendiente. Backup JSON no acredita nuevas tablas privadas de configuración/evidencia: incluirlas en dump y prueba futura de restore integral autorizado junto al diario fiscal; restauración integral sigue bloqueada. Contador/envases, PV/custodia pendientes; impresora/cajón/Point diferidos.

### 23/10/2026 — NC: contrato/transporte de unidades (en curso)
Integrar getter031 con contrato cerrado ligado a factura026 y fuente comercial030, canónico/hash recomputado, renglones/productos/componentes exactos y metadatos de unidad/pesable literales. Distinguir CAPTURADAS (sin permiso de emitir/devolver) de NO_REGISTRADAS/null. Auth una vez, mismo actor en consultas; acción sólo lectura y cliente sin storage. SDK44→45RPC, sin activar flags ni instalar remotamente.
Al integrar se observa que030 imponía cantidades enteras a la venta original de cualquier combo, mientras031 conserva combos pesables admitidos por checkout. Corregir esa mezcla de hechos y elegibilidad: fuente030 debe conservar cantidades originales verificables, incluso combo pesable fraccionado; LIBRE sigue entero como checkout. Unidades capturadas acreditan metadatos, no permiso de devolver. La política del formulario/NC seleccionada seguirá comprobándose bajo su propio gate y no se infiere del catálogo actual. Probar cadena real local checkout→factura sintética→030→031/transporte, claves/hash/cantidades incoherentes, perfiles reasignados y recuperación de casos antiguos sin metadatos.

### 24/10/2026 — PR03: transporte verificado de unidades históricas NC
Se incorporó por fast-forward c7dbacd (objetivo común de .agent/PLANS.md), preservando cambios locales. Este incremento reduce el blocker de elegibilidad NC de PR #3/PR03 y la dependencia de PR02; no cierra esos gates.
Contrato031 cerrado ligado a factura026 y fuente comercial030: canónico/hash recomputado, IDs/receta/cantidades exactas, unidades literales y metadata profundamente congelada. CAPTURADAS conserva hechos, NO_REGISTRADAS requiere null explícito; errores nunca se convierten en ausencia. Ningún estado concede emisión, reintegro o reposición. Fuente030 conserva combos pesables fraccionados admitidos por checkout; la política de devolución sigue separada. No se infieren unidades del catálogo actual.
Servicio verifica Auth una vez y transmite ese mismo actor a las tres RPC; SQL vuelve a comprobar autorización. HTTP UNIDADES_NC sólo lectura, objeto cerrado/2KiB y gates existentes; SDK44→45RPC. Cliente captura entradas antes de esperar, revalida y no usa storage. Pruebas cruzan checkout real local → factura sintética → SQL030/031 → HTTP, incluidos combo pesable, ausencia y reasignación Auth entre consultas.
Evidencia local: selección432 PASS/7archivos (pilot-credit-units-targeted-v2-20261024.log); buildv2 PASS, oxlint dirigido limpio, manifiesto43/diff PASS. PostgreSQL17.11:108 escenarios PASS (credit-units-transport-concurrency-v1-20261024.json), fases73antes025,14después025/026,8después027,5después028/029,4después030,4después031; cero solicitudes externas/emisiones, contenedor propio detenido/datos conservados. Escáner1320archivos/49candidatos, sin nuevos pares ruta/tipo. Suite global anterior es histórica y no prueba este HEAD. Primer build falló por tipos de fixtures; corregidos y verificados sin relajar validación. Intento ESLint no aplicaba al proyecto (sin configuración); se usó oxlint declarado en package.json.
SQL001–031/Edge/flags no instalados ni activados remotamente; sin secretos, ARCA autenticada nueva, CAE, merge o cambios master/Production. Aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual pendiente; no confundir esta evidencia con Staging. Restauración integral bloqueada; incluir tablas privadas en futuro dump/restore autorizado. Impresora/cajón/Point diferidos.
Siguiente blocker local: elegibilidad explícita y formulario de caso NC usando fuente comercial y unidades acreditadas, sin autorizar automáticamente ventas históricas sin registro ni tratamiento de envases pendiente del contador; después catálogo/cuerpo/revisión/serie/worker/conciliación NC y aplicación única sólo tras CAE NC confirmado. Al cierre técnico definitivo de PR #3 ejecutar suite global y controles sobre ese HEAD antes de aceptación hospedada autorizada.

### 24/10/2026 — NC: consulta visible de hechos originales preparada
Primer paso de la captura/elegibilidad: panel existente integra consulta explícita de fuente comercial030 y unidades031, ambas revalidadas contra factura026. Muestra descripción histórica, cantidades/subtotales, pagos originales, receta sin nombres inferidos del catálogo actual y metadata de unidades/pesable. CAPTURADAS no se presenta como permiso ni saldo; NO_REGISTRADAS exige conciliación explícita. Pagos mixtos no presuponen efectivo, conceptos libres no presuponen stock y envases conservan los gates documentados.
Consulta sin storage/mutaciones: doble clic excluido, fuentes ajenas rechazadas, resultados anteriores retirados al reconsultar, error saneado distinto de ausencia, cambio de comprobante/desmontaje descarta respuestas tardías. Reutiliza Button y gate de panel NC existente, apagado por defecto; no se agrega flag ni se activa remotamente. Revisión React/POS: sólo lectura, no acciones de caja/stock/cobro.
132 PASS/5archivos (pilot-credit-source-ui-targeted-v1-20261024.log), buildv1 PASS/salida0 y oxlint dirigido limpio. Escáner1322archivos/49candidatos sin nuevos pares ruta/tipo; manifiesto43 y diff PASS. No cambió SQL:108 escenarios PostgreSQL del commit5261e69 son evidencia anterior, no una ejecución nueva del panel. No acredita aceptación visual/JWT/RLS/Edge/Web Locks hospedados ni CAE real.
Pendiente inmediato: formulario explícito y guardado de caso con cantidades/importes/impuestos, UUID estable y recuperación; deberá distinguir comprobaciones previas de elegibilidad final bajo locks, conservar pendientes inciertos y no inferir IVA ni unidades antiguas. Luego catálogo NC/revisión/cuerpo/serie/worker/conciliación/aplicación comercial única con CAE NC confirmado. PR03/PR02 siguen parciales. Sin SQL/Edge/flags remotos, secretos, nuevas solicitudes ARCA, emisión, merge o cambios master/Production; restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — NC: captura explícita y guardado de caso integrados localmente
Formulario conectado al panel existente después de consultar hechos y terminar historial. Campos iniciales vacíos: fecha dd/mm/aaaa, motivo, código IVA receptor, selección/cantidades/importes por detalle, reposición no preseleccionada, seis totales y detalles IVA/tributos explícitos. No calcula IVA proporcional ni usa configuración fiscal heredada; códigos IVA detallados se eligen entre los de la factura original, sin declarar vigente un catálogo NC. Coma/punto decimal se convierten a escala canónica sin separadores de miles. Confirmación humana obligatoria; guardar sólo reserva un borrador sin emisión/efectos comerciales.
Precomprobación revalida factura026/fuente030/unidades031 capturadas y propuesta; exige cantidades enteras donde corresponde y receta física representable, niega reposición de conceptos libres. NO_REGISTRADAS bloquea captura hasta conciliación. Esto es control previo de UI, no autoridad de saldo ni permiso de emisión: SQL027 conserva reserva acumulada/fecha/parámetros/Auth, pero aún falta ligar/evaluar elegibilidad comercial bajo locks en servidor antes de intención y aplicación NC; no sustituir ese pendiente con este PASS.
Un UUID por formulario/intento; validación local permite corregir antes de envío. Desde primer envío se congela contenido y se usa cliente durable existente (persistencia antes de POST, getter durable, Web Lock). Panel valida ACK exacto de venta/factura/UUID/hash antes de declarar guardado, conserva pendiente recuperable ante incertidumbre y distingue CANCELADA de caso guardado. Fallo de historial posterior a ACK mantiene confirmación, retira filas obsoletas y pide reconsulta sin ofrecer otro envío del mismo formulario. Doble clic/cierre/cambio de factura no producen guardados tardíos desde validación desmontada. Sin nuevo storage fiscal/PII ni flags activados.
413 PASS/8archivos, salida0 (pilot-credit-draft-form-targeted-v4-20261024.log), buildv3 PASS, oxlint dirigido limpio, manifiesto43/diff PASS. Incluye regresiones SQL embebidas y cliente, UI→guardado simulado→ACK/historial, entradas corregibles, fecha imposible, fracción no pesable, receta/combo, libre, ausencia de unidades, ACK ajeno y pendiente incierto. Primeras pruebas fallaron por consultar botón antes del fin de carga y por propiedad disabled local en lugar de estado heredado de fieldset: corregidas las pruebas sin retirar guards; v3 156PASS previo conservado, v4 agrega casos y SQL. Escáner1325archivos/49candidatos sin nuevos pares ruta/tipo, servicios/flag privados ausentes del bundle. SQL no cambió:108 escenarios PostgreSQL17.11 de5261e69 son evidencia anterior, no repetidos para el formulario. No aceptación visual/JWT/RLS/Edge/Web Locks hospedados ni CAE real.
Siguiente bloqueo PR03: ligar/verificar comercialmente casos nuevos bajo locks (unidades/receta/pagos/envases y reserva), sin reinterpretar borradores históricos ni conceder permisos; catálogo específico NC vigente, revisión/cuerpo/serie/worker/FECompConsultar y aplicación comercial única sólo tras CAE NC confirmado. Continúan PR03/PR02 parciales, suite global final pendiente al cerrar bloque técnico. SQL001–031/Edge/flags sin instalación/activación remota por nosotros; sin secretos/ARCA nueva/CAE/merge/master/Production. Contador/envases y aceptación hospedada pendientes; restore integral bloqueado, impresora/cajón/Point diferidos.

### 24/10/2026 — NC: vínculo comercial obligatorio para casos nuevos (SQL032)
AFTER INSERT en borradores027 exige fuente030 íntegra y unidades031 CAPTURADAS para TODO caso nuevo, incluso si se omite el navegador. Tabla privada fiscal_nc_comercial_homologacion guarda factura/actor/propuesta y fuente mínima canónica/hash con unidades originales canónicas/hash; RLS y ACL/columnas cerradas, helper sin EXECUTE y registros inmutables. Inserción/caso/saldo/vínculo comparten transacción: fallo revierte todo, ACK sólo retorna tras triggers. No configura defaults ni infiere catálogo actual; snapshot no expone referencias de pagos/costos/PII.
El guard toma locks existentes de factura/actor/venta y estabiliza filas de pagos/detalles/movimientos con FOR SHARE NOWAIT, sin invertir espera checkout→venta. Valida metadata de línea/componente, cantidades enteras o escala física válida y niega reposición de libres. Pagos mixtos quedan como hechos, no permiso de efectivo. Fuente030 ya bloquea historia incompatible/envases recibidos y devoluciones ordinarias; tratamiento fiscal de envases pendiente del contador no se inventa. Registro acredita hechos comprobados en ese instante, no elegibilidad futura: intención/aplicación NC deberán exigir vínculo y revalidar fuente/políticas bajo sus locks, además de CAE NC confirmado antes de efectivo/stock.
Historia preservada: 032 no recaptura borradores antiguos. Su replay/getter/cancelación siguen recuperando ACK sin backfill; ausencia de vínculo NO acredita elegibilidad. Replay/cancelación de caso ligado conserva evidencia aunque luego cambien pagos/catálogo y no se presenta como permiso actual. Cancelación no borra registros. No cambia contrato HTTP/ACK/SDK45 ni habilita emisión, numeración NC o efectos comerciales.
331 PASS/5archivos, salida0 (pilot-credit-binding-targeted-v4-20261024.log), buildv3 PASS; oxlint sin hallazgos nuevos (warning finally preexistente del runner), manifiesto43/diff PASS. Escáner1326archivos/49candidatos sin nuevos pares ruta/tipo; backend privado ausente del bundle. SQL embebido: escenarios históricos001–031 conservan su fase; pruebas032 instalan dentro de transacción/reaplican dos veces para verificar transición y rollback. Incluye checkout real→factura sintética→caso/vínculo, HTTP/servicio/Auth simulado, ACK perdido sin repetir escritura, ausencia/fraction/libre/mixto, ACL/immutabilidad, rollback y replay/cancelación sin reinterpretar historia. No afirmar que todos los escenarios históricos corrieron bajo032.
PostgreSQL17.11:112 escenarios PASS/salida0, credit-commercial-binding-concurrency-v3-20261024.json. Fases73antes025,14después025/026,8después027,5después028/029,4después030,4después031 y4después032 instalado dos veces. Nuevos: dos workers/unUUID/unvínculo, fila de pago bloqueada NOWAIT y pago cambiado tras esperar guard previo, rollback caso/vínculo y worker en espera, Auth reasignado. Fixture032 siembra metadata privada enteramente sintética para aislar carreras; captura real031 se prueba en cuatro escenarios anteriores y en cadena real embebida. Cero solicitudes externas/emisiones, contenedor propio kiosko-pr03-local-264ea52e detenido/datos conservados. v1/v2 fallaron por exigir NOWAIT a toda la RPC: UPDATE de pago primero bloquea venta mediante proteger_lineas_venta_anulada (guard029); se corrigió ensayo para verificar ambos caminos, sin cambiar guards. Evidencia fallida conservada.
SQL001–032/Edge sin instalación/activación remota por nosotros, flags sin activar; sin secretos, ARCA autenticada nueva, CAE, merge o cambios master/Production. Antes de instalación autorizada incluir fiscal_nc_comercial_homologacion en dump/restore privado junto al diario y unidades; JSON app no lo cubre, restore integral bloqueado. Recuperación/rollback de rollout debe mantener guardado NC deshabilitado, preservar evidencia y no quitar trigger para reabrir escritura heredada.
Siguiente gate local: fuente/catálogo específico NC vigente y preparación fiscal NC ligada al caso/vínculo, revisión/permiso/cuerpo/serie/worker/FECompConsultar propios, exclusión cancelación–intención y aplicación comercial única. Intención nueva debe rechazar casos sin vínculo o cancelados; no basta este registro histórico. PR03/PR02 siguen parciales; aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual, PV/custodia, contador y primer CAE autorizado pendientes. Suite global definitiva al cierre técnico. Impresora/cajón/Point diferidos.

### 24/10/2026 — NC: catálogo privado y contexto de preparación (SQL033)
Catálogo NC separado de parámetros012 de facturas: fiscal_parametros_nc_homologacion sin filas semilla y habilitado=false por defecto. Valida tipos3/8/13, descripción, vigencias por tipo, condiciones con comprobantes NC explícitos, alícuotas, ausencia de duplicados/coerciones y fechas reales; sólo revocable, corregir exige nueva revisión. RLS/ACL/columnas privadas y helpers sin EXECUTE público. No copia listas de facturas ni presupone que código de condición existente sea válido para NC. Consulta autenticada/provisión real de parámetros sigue pendiente de autorización específica.
Getter cargar_contexto_nc_homologacion verifica Auth fiscal original/factura026, caso activo/UUID/hash, vínculo032, fuente030 actual y evidencia031 contra lo congelado; pagos/detalles/movimientos bajo locks compartidos NOWAIT tras venta/actor/factura. Rechaza caso cancelado, sin vínculo, hechos cambiados o emisor privado que difiere de la revisión/credencial/certificado/PV capturados. Exige catálogo NC habilitado y vigente después de locks, tipo válido para fecha del caso, condición y alícuotas explícitas. No inspecciona claves/TA, no acredita PV ni padrón real, no reserva número NC y no modifica caso/caja/stock.
DTO público cerrado17campos ligado a caso/factura/hash y checksums comercial/unidades, CUIT/PV/revisiones/tipo y listas NC, emision_habilitada=false. Validador puro revalida propuesta histórica exacta/canónico/hash y original, captura antes de esperas, rechaza arrays coercionados/extra/duplicados/textos de control y congela profundamente. Escenarios A/B/C preservan tipoNC3/8/13 y exigen alícuotas acreditadas. Getter aún sin SDK/servicio/HTTP/cliente/UI (SDK45RPC permanece): siguiente integración no debe declararlo permiso, usar defaults o aceptar casos sin vínculo.
358 PASS/4archivos, salida0 (pilot-credit-context-targeted-v2-20261024.log), buildv2 PASS, lint sin hallazgos nuevos (finally preexistente del runner), manifiesto43/diff PASS. Escáner1329archivos/49candidatos sin nuevos pares ruta/tipo; entradas privadas ausentes del bundle. Pruebas SQL conservan escenarios históricos001–031 en su fase; los032/033 instalan explícitamente dentro de cada transacción y reaplican dos veces. Incluyen default sin catálogo, contexto íntegro validado puro, cancelación/Auth/hash/emisor/pagos cambiados, vigencias y clases incompatibles, legacy sin backfill y ACL. No aceptación hospedada.
PostgreSQL17.11:116 escenarios PASS/salida0 (credit-context-concurrency-v1-20261024.json):73antes025,14después025/026,8después027,5después028/029,4después030,4después031,4después032 y4después033 instalado dos veces. Nuevos: lectores recuperan mismo contexto sin efectos, cancelación gana lectura en espera, catálogo revocado durante espera y vencimiento durante último lock; no devuelve contexto obsoleto. Metadata032 sintética para aislar esas carreras, captura031 real cubierta en su fase y cadena embebida. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-62f2ffd9 detenido/datos conservados. Primer chequeo de sintaxis del runner detectó nombre de variable repetido antes de crear contenedor; corregido sin cambiar gates. Warning de regex de control nuevo sustituido por validación de puntos de código, sin supresión ni pérdida de control.
Se revisaron sólo páginas públicas oficiales WSFE (24/10/2026): FEParamGetTiposCbte devuelve tipos/fechas; FEParamGetCondicionIvaReceptor devuelve condición/descr/clase. No se ejecutaron esos métodos con Auth ni se reutilizó una autorización consumida. Fuentes: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetTiposCbte y https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetCondicionIvaReceptor. Datos sintéticos no prueban que catálogo/punto/emisor estén acreditados por ARCA.
Siguiente: transporte de contexto NC con Auth único/identidad exacta y lectura explícita desde panel; preparación fiscal NC durable con catálogo/revisión/vínculo capturados y cuerpo separado de factura v1. Después serie/permiso/worker/FECompConsultar NC y exclusión cancelación–intención; efectivo/stock sólo tras CAE NC confirmado y aplicación única. No se amplía factura v1 ni se habilita fallback legacy. PR03/PR02 siguen parciales; suite global definitiva y aceptación hospedada pendientes.
SQL001–033/Edge/flags no instalados/habilitados remotamente por nosotros, sin secretos/ARCA autenticada nueva/CAE/merge/master/Production. Incluir catálogo NC en dump/restore privado futuro autorizado junto al diario/unidades/vínculo; JSON app no acredita cobertura, restore integral bloqueado. Contador/envases y PV/custodia pendientes; impresora/cajón/Point diferidos.

### 24/10/2026 — NC: contexto integrado con identidad mínima (SQL034/transporte/panel)
CONTEXTO_NC sólo lectura, JSON estricto/cerrado5campos y2KiB: venta/operación/caso/hash, sin actor ni canónico/PII en solicitud. SQL034 recupera contexto033 y canónico/hash del caso durable bajo sus mismos guards/locks, sólo service_role; no tablas nuevas ni escritura. Evita reenviar canónicos de hasta60KiB y sus escapes dentro de un límite de consulta. SDK45→46RPC explícitas (fuente_contexto034;033 sigue interno a ese puente). No amplía límites de otras acciones.
Servicio captura scope antes de esperar, verifica Auth.getUser una vez y transmite ese Auth a fuente026/034; clona respuesta antes de esperas, exige raíz privada cerrada2campos, revalida propuesta/canónico/hash exactos y DTO033 contra factura/caso. Devuelve sólo contexto17campos, nunca el paquete privado/canónico. Error/Auth reasignado/DTO ajeno no se convierten en ausencia o permiso, no hay reintentos ni TA/custodia/ARCA. Lectura funciona con flag de guardar apagado bajo gates backend/origen/host/sesión; no se activó ningún flag.
Cliente credits.context captura fuente/propuesta, revalida antes de consultar y compara contexto recibido con el mismo caso; envía sólo identidad mínima y no lee/escribe storage. Panel existente muestra consulta manual sólo para caso activo sin pendiente/acción competidora, CUIT/PV/tipoNC/condición/revisión y advertencia de nueva comprobación. Doble clic excluido, resultados anteriores retirados al reconsultar, errores saneados; cambio/desmontaje y apertura de cancelación descartan resultado tardío. No ofrece preparar/emitir/obtener CAE/dinero/stock ni presenta contexto como permiso. Reutiliza estética/Button y gate de casos NC existente sin activación.
448 PASS/7archivos, salida0 (pilot-credit-context-ui-targeted-v4-20261024.log), buildv4 PASS, manifiesto43/diff PASS, lint sin nuevos hallazgos (finally preexistente del runner). Escáner1334archivos/49candidatos sin nuevos pares ruta/tipo; backend privado ausente del bundle. Incluye HTTP–servicio–SQL033/034 real embebido con Auth simulado, reasignación entre RPC, ACL, tamaño2KiB con JSON válido, identidad capturada antes de esperas, canónico/contexto alterados, storage intacto y UI integrada/error/factura distinta/cancelación/respuestas tardías. Primera selección/build detectaron una sustitución accidental de fixture de representación ajena: restaurada antes de las verificaciones finales, sin cambiar contrato o permisos. No aceptación visual/JWT/RLS/Edge/Web Locks hospedados.
PostgreSQL17.11:118 escenarios PASS/salida0 (credit-context-source-concurrency-v1-20261024.json):73antes025,14después025/026,8después027,5después028/029,4después030,4después031,4después032,4después033 y2después034 instalado dos veces. Nuevos: lectores recuperan mismo contexto/canónico durable sin escritura y cancelación confirmada durante espera no expone canónico. Metadata032/033/034 sintética para aislar carreras; captura real031 en su fase/cadena embebida. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-ed45a7b3 detenido/datos conservados. No sumar evidencias anteriores como suite global actual.
Siguiente bloqueo: preparación fiscal NC durable ligada a este contexto/caso/vínculo/revisión de catálogo/emisor, cuerpo NC separado de factura v1 y asociación exacta al comprobante original. Luego revisión/permiso/serie/worker/FECompConsultar NC, exclusión cancelación–intención y aplicación única sólo tras CAE NC confirmado. Lectura de contexto no sustituye revalidación final ni autorización. PR03/PR02 siguen parciales, suite global definitiva y aceptación hospedada pendientes.
SQL001–034/Edge/flags sin instalación/activación remota por nosotros; sin secretos, consultas ARCA autenticadas nuevas, emisión/CAE real, merge o cambios master/Production.034 sólo agrega función de lectura; dump/restore integral debe conservar esquema y diario/tablas privadas ya documentadas, JSON app no acredita cobertura y restore integral sigue bloqueado. Contador/envases, PV/custodia/catálogo real pendientes; impresora/cajón/Point diferidos.

### 24/10/2026 — NC: preparación fiscal durable sin número (SQL035)
Contrato FiscalCreditPreparation separado de factura v1: clase PREPARACION_NC, caso/propuesta/contexto y hashes de fuente/unidades, revisiones de emisor/catálogo y datos fiscales sin numero. Conserva receptor/concepto/moneda de factura verificada e importes/IVA/tributos explícitos del caso; asociación única exacta tipo/PV/número/CUIT/fecha del comprobante original. NC3/8/13, sin IVA proporcional, valores heredados de configuración o número ficticio. Para conceptos2/3 períodos/vencimiento se ingresan expresamente y validan; no se copian de factura. Para concepto1 se exige null explícito. Reutiliza la regla de períodos del piloto; no declara validación fiscal/ARCA completa ni construye XML emitible.
SQL035 guarda preparación canónica/hash y contexto histórico en fiscal_preparaciones_nc_homologacion, privada/RLS/ACL/columnas e inmutabilidad. Servidor construye datos desde034/caso/factura, compara SHA del contexto declarado con033 actual y revisa vigencia antes del insert; un cambio de revisión no prepara silenciosamente datos distintos. Una preparación por caso, sin reservar serie, crear intención, tocar caja/stock o emitir. Igualdad byte a byte SQL–TypeScript comprobada para facturasA/B/C y conceptos1/2/3.
Getter privado valida Auth fiscal original/caso y recupera canónico/contexto/propuesta durables sin exigir emisor/catálogo actuales. Guardado recupera primero registro existente, exige mismo contexto/períodos y conserva original ante ACK perdido o reintento. Cancelación previa impide preparación tardía; posterior conserva preparación y devuelve CANCELADA sin reactivación/permisos. Corregir contenido requiere cerrar caso y nueva identidad; no sobrescribir preparación. Casos antiguos sin vínculo no obtienen preparación ni backfill. Getters históricos no prueban vigencia actual: futura numeración/revisión/intención debe revalidar caso/vínculo/contexto/políticas.
387 PASS/6archivos, salida0 (pilot-credit-preparation-targeted-v2-20261024.log), buildv2 PASS, manifiesto43/diff PASS, lint sin hallazgos nuevos (finally previo del runner). Escáner1337archivos/49candidatos sin nuevos pares ruta/tipo; persistencia privada ausente del bundle. Pruebas: canónicos/hash idénticos, servicios/mixtos explícitos y períodos inválidos en servidor, contexto cambió, pagos/emisor/cancelación, rollback/ACK recuperable, lectura con catálogo/emisor revocados, Auth reasignado, legacy/ACL/inmutabilidad y ausencia de nuevas series/reservas/movimientos/devoluciones. Fixture común ampliada A/B/C; regresiones cliente/panel/transporte incluidas. Primera selección350PASS/3archivos conservada; final387 no es suite global.
PostgreSQL17.11:123 escenarios PASS/salida0, credit-preparation-concurrency-v1-20261024.json. Fases73antes025,14después025/026,8después027,5después028/029,4después030,4después031,4después032,4después033,2después034 y5después035 instalado dos veces. Nuevos: doble worker/un canónico sin número, cancelación gana preparación, preparación gana y queda cancelada, rollback libera worker y contexto anterior no se reemplaza con revisión nueva. Fixtures nativas de metadata NC sintéticas para aislar carreras; captura real y cadena/canónico independientes en pruebas embebidas. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-43a2123d detenido/datos conservados.
Se revisó sólo documentación pública de FECAESolicitar y manual oficial WSFEv1v4.7 (revisión01/09/2026) para mantener asociación con comprobante original: https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf. GET del WSDL falló en la herramienta; no se ejecutó una solicitud SOAP autenticada ni se asumió aceptación del XML. Preparación sin número no es todavía solicitud WSFE completa ni CAE.
SDK46 y HTTP/cliente/UI aún no ampliados para guardar/leer035: siguiente transporte debe recuperar antes de escritura, validar packet histórico/canónico/hash, conservar identidad/contenido inciertos y diferenciar contexto histórico de actual; captura explícita de períodos y revisión visual pendientes. Después cuerpo NC numerado/revisión/permiso/worker/FECompConsultar y exclusión cancelación–intención. Dinero/reposición sólo tras CAE NC confirmado y aplicación única. PR03/PR02 parciales; suite global definitiva y aceptación hospedada pendientes.
SQL001–035/Edge/flags sin instalación/activación remota por nosotros; sin secretos, ARCA autenticada nueva, emisión/CAE, merge o master/Production. Incluir fiscal_preparaciones_nc_homologacion/contexto histórico en dump/restore privado autorizado junto al diario, catálogo, unidades y vínculo; JSON app no acredita cobertura y restore integral sigue bloqueado. Contador/envases, PV/custodia/catálogo real pendientes; impresora/cajón/Point diferidos.

### 24/10/2026 — Validación histórica de preparación NC035
Se agregó validateFiscalCreditPreparationRecord: packet cerrado de13 campos, identidad venta/operación/caso y propuesta exacta; contexto histórico validado y preparación reconstruida desde factura/caso/períodos explícitos, comparando canónico completo y SHA. Rechaza campos extra, permisos, número propio, contexto o contenido alterados. Conserva CANCELADA como historial sin emisión/reintegro/reposición. No acredita vigencia actual ni reemplaza autorización SQL. Sin cambios SQL/HTTP/SDK/UI o instalación remota.28 pruebas enfocadas PASS; oxlint y diff check PASS. Build PASS (675 módulos; advertencia existente de tamaño de chunks). Siguiente: integrar lectura/guardado recuperable en servicio/transporte/cliente/UI antes de cuerpo numerado y emisión; PR03/PR02 permanecen parciales.

### 24/10/2026 — Servicio privado de recuperación histórica NC035
loadFiscalCreditPreparation verifica Auth una vez y conserva actor/scope capturados; lee factura026 y preparación035 con caso/hash exactos, valida propuesta y evidencia histórica completa. Sólo null durable significa ausencia; error/undefined/hash o caso distinto fallan saneados, sin reintento, escritura, catálogo vigente, TA o red ARCA. SDK permite únicamente nueva lectura035 (47 RPC); guardar035 aún fuera de allowlist y sin HTTP/cliente/UI.39 pruebas PASS/3 archivos y45 SDK PASS; build675 módulos PASS anterior al único agregado de allowlist/fixture SDK; oxlint/diff PASS. No se acredita JWT/RLS hospedado ni aceptación integral. Próximo: guardado con recuperación previa y transporte/cliente/UI; revisión/numeración/worker NC continúan pendientes. SQL/Edge/flags sin instalación remota; cero CAE, secretos, merge o cambios Production. Objetivo común permanece activo.

### 24/10/2026 — Guardado recuperable interno de preparación NC035
saveFiscalCreditPreparation captura scope/períodos antes de Auth, verifica Auth una vez y factura026; recupera035 antes de catálogo/escritura. Registro existente exige contexto/períodos idénticos y conserva cancelación. Ante ausencia confirmada carga034, verifica propuesta/contexto y reconstruye preparación sin número, comparando SHA esperado antes de escribir una vez. Respuesta de guardar no es ACK: consulta035 y compara evidencia completa/canónico/hash. Error o ausencia posterior queda no confirmado; no reintenta ni sustituye identidad. SQL sigue autoridad transaccional frente a carreras. Helper interno aún no expuesto por HTTP ni guardado en allowlist SDK (47 lecturas/operaciones previas); requiere gate de escritura default-off y cliente durable/UI.48 PASS/3archivos, oxlint/diff PASS; build675 módulos PASS (antes de los últimos2 tests, sin cambio de implementación posterior). Cobertura: recuperación activa/cancelada, ACK perdido/error devuelto, fallo de lectura previa, ausencia posterior, cambio de contexto/períodos, campos extra, captura antes de Auth y actor único. No se modificó SQL ni se ejecutó ARCA/red autenticada, instalación remota, CAE, secretos, merge o Production. PR03/PR02 parciales; sigue transporte/cliente/UI, luego numeración/revisión/worker/conciliación NC y aceptación autorizada.

### 24/10/2026 — Transporte HTTP de preparación NC035
PREPARACION_NC lee por venta/operación/caso/hash; GUARDAR_PREPARACION_NC agrega contexto_sha256 y entrada cerrada de3 períodos explícitos. Ambas acciones limitadas a2KiB, parser JSON estricto, UUID/hash y claves exactas; fechas calendario/concepto se validan nuevamente en servicio. Nueva bandera privada ARCA_HOMO_CREDIT_PREPARATION_ENABLED exige true exacto sólo para guardar, default-off; lectura histórica conserva recuperación con escritura apagada bajo gates globales de Staging/origen/backend/Auth. SDK48 incluye guardar035. Servicio devuelve únicamente evidencia normalizada validada, no packet privado de contexto/propuesta. No es permiso, numeración, CAE ni devolución comercial.68 pruebas de transporte/servicio/SDK y121 HTTP existentes PASS; lint/diff PASS. Build675 módulos PASS, advertencia conocida de tamaño de chunks. Pendiente cliente con persistencia mínima/Web Locks/recuperación ante ACK perdido e interfaz explícita, luego revisión/numeración/worker NC y aceptación hospedada. Ninguna bandera fue activada ni SQL/Edge instalado remotamente; sin secretos, ARCA autenticada, CAE, merge o Production.

### 24/10/2026 — Lectura cliente de preparación NC histórica
Record normalizado conserva contexto histórico verificado. HTTP usa fiscalCreditPreparationWire cerrado7 campos, sin duplicación de datos derivados ni propuesta privada; preparación sólo canónico/hash. validateFiscalCreditPreparationWire reconstruye y valida evidencia completa contra factura/caso capturados y contexto histórico. credits.preparation consulta identidad mínima, acepta sólo null confirmado, valida respuesta y no toca storage ni otorga permisos. Activa/cancelada conservan estado. No exige catálogo actual; futura emisión debe revalidarlo. Guardado durable cliente/Web Locks e interfaz todavía pendientes.178 PASS/4archivos más75 paneles PASS; lint/diff PASS. Primera selección falló3 tests por simulador sin sobre HTTP, corregido; build inicial detectó mocks de componentes sin método preparation, corregidos, build final676 módulos PASS, advertencia conocida de tamaño de chunks. Ninguna instalación/activación remota, ARCA autenticada, CAE, secretos, merge o Production. PR03/PR02 permanecen parciales.

### 24/10/2026 — Guardado y recuperación durable en cliente NC
credits.savePreparation valida factura/caso/contexto/períodos, calcula preparación y usa exclusión por venta compartida. Recupera primero; antes de POST guarda/lee metadata mínima6 campos(version,operationId,requestId,proposalSha,preparationSha,contextSha), aislada Auth/comercio/venta. Sin canónico/PII/períodos en storage. Un POST como máximo por llamada; sólo lectura durable con hash/contexto idénticos retira pendiente. credits.recoverPreparation captura factura/caso, valida identidad local y recupera sin POST; ausencia/error conserva pendiente. Reintento explícito exige mismo contenido; nuevas reservas/cancelación bloqueadas mientras preparación incierta. Caso pendiente previo impide nueva preparación. Invariantes SQL035 siguen autoridad contra carreras, no el lock local.120 PASS/5archivos, luego4 pruebas del cliente nuevamente PASS tras endurecer uso de propuesta validada; build676 módulos PASS, lint/diff PASS. Pruebas: ACK perdido, persistencia antes de POST, cuota local, recarga/ausencia posterior, bloqueo de cancelación y dos instancias con exclusión en memoria/un POST. No acredita Web Locks de navegadores ni JWT/RLS hospedados. Primera revisión automática no pudo ejecutarse por límite de uso; al retomar permitió herramientas y se verificó estado antes de continuar. Pendientes: formulario/períodos/revisión visual, recuperación/cierre explícito de pendientes nunca persistidos (no borrar sólo por null), cancelación coordinada, cuerpo numerado/permiso/worker/conciliación/aplicación NC. Sin instalación/activación remota, secretos, ARCA autenticada, CAE, merge o Production. PR03/PR02 parciales y objetivo común activo.

### 24/10/2026 — Cierre coordinado de preparación NC incierta
Se reemplaza el bloqueo absoluto de cancelar con preparación pendiente por cancelación explícita del mismo caso/operación/SHA. Guarda intención CANCELAR antes de consultar/enviar; sólo ACK durable CANCELADA exacto permite retirar metadata de preparación y luego pendiente del caso. Error/null/estado activo conservan ambos. Recover del caso tras recarga también retira preparación del mismo caso al verificar cancelación durable. Identidad distinta sigue bloqueada sin red. No se elimina preparación del servidor ni historia; SQL028/035 serializan cancelación/preparación y la cancelación impide preparación tardía. Depende de la arquitectura actual sin intención NC emitible; futura intención/worker requiere gate SQL de exclusión cancelación–envío antes de habilitarla.17 pruebas cliente PASS inicialmente; build detectó inferencia demasiado estrecha del mock send al agregar ACK de cancelación, corregido mediante Promise<unknown> (sin cast/any), regresión ampliada92 PASS/4archivos, lint/diff y build676 módulos PASS (advertencia conocida de chunks). Pendiente formulario/períodos/revisión, integración de recuperación/cancelación en UI, cuerpo numerado/serie/permiso/worker/conciliación NC y aceptación hospedada. Sin nueva SQL ni instalación remota, flags, secretos, ARCA autenticada, CAE, merge o Production. Objetivo común/PR03/PR02 siguen incompletos.

### 24/10/2026 — Formulario de preparación NC integrado al historial
FiscalCreditPreparationPanel se incorpora a casos activos detrás del gate UI ya existente/default-off. Consulta manual recupera035 antes de catálogo actual; con pendiente usa recoverPreparation sin POST. Si hay preparación histórica valida contexto/canónico/hash nuevamente, muestra estado/NC/PV/total/períodos y no ofrece guardado. Con ausencia confirmada sin pendiente obtiene contexto actual y habilita captura; concepto1 envía null explícitos y conceptos2/3 requieren períodos/vencimiento dd/mm/aaaa sin copiar factura. Confirmación obligatoria antes de guardar; preflight puro verifica calendario/concepto, servidor vuelve a validar. Antes de envío bloquea edición y conserva identidad ante error; consulta/cancelación explícitas, checkbox separado para cancelar y ACK validado completo. Cancelación confirmada actualiza el listado padre; cambio de caso/desmontaje descarta respuestas tardías y running ref impide dobles acciones. No es pantalla de aprobación fiscal numerada ni CAE, no entrega dinero/reposición.
34 PASS/4archivos (panel nuevo5, casos/contexto y cliente), lint/diff PASS. Primera selección falló por matcher toBeDisabled no instalado, corregido a matches(':disabled'); build inicial vio esa misma deuda de test y luego build677 PASS. Build final tras últimos ajustes de texto/fecha677 PASS; símbolos RPC privados/bandera privada/servicio ausentes del bundle público. No se realizó comprobación visual hospedada, JWT/RLS ni Web Locks reales. Próximo: consolidar revisión y aceptación local de la preparación, cuerpo NC numerado/serie/revisión/permiso/worker/FECompConsultar, exclusión cancelación–intención y aplicación única sólo tras CAE NC. Mantener provisión/PV/aceptación hospedada/emisión detrás de autorización. Sin SQL/Edge instalado, flags activados, secretos, ARCA autenticada, CAE, merge o Production. Objetivo común/PR03/PR02 parciales.

### 24/10/2026 — Aceptación local integrada de preparación NC035
Runner SQL embebido amplía dispatch a cargar/guardar_preparacion_nc_homologacion. Nuevos ensayos recorren cliente real → sobre/HTTP real → servicio real/validadores → RPC035/SQL embebido, conservando Auth sintético. FacturasA/B/C y conceptos1/2/3: ausencia, un POST, recuperación tras recrear cliente y canónico/hash idénticos a preparación pura; no nuevas series/reservas/movimientos/devoluciones. ACK HTTP perdido después de confirmar servidor se recupera sin otro POST incluso tras revocar catálogo/emisor; no requiere parámetros actuales para leer historia. Cancelación por HTTP conserva preparación histórica CANCELADA y reintento no reactiva ni escribe otra vez. No se invocan loaders de TA ni fetcher ARCA.
324 PASS/salida0 de archivo completo (pilot-credit-preparation-integrated-v2-20261024.log), incluidos7 casos nuevos; primera ejecución317PASS/7FAIL por typo kiosk en fixture, corregido a kid. Prueba adicional Auth-to-lectura: reasignar perfil entre fuente026 y getter035 conserva actor original y deniega tanto al actor anterior como al reasignado;1PASS/324 filtradas (pilot-credit-preparation-auth-v1-20261024.log). No se presenta filtrado como omisiones de cobertura: las324 pasaron antes de agregar ese test, sin cambio de implementación posterior. Build677 módulos PASS (pilot-credit-preparation-integrated-build-v1-20261024.log, antes del último test Auth), lint/diff PASS. Auth local sintético y SQL embebido no acreditan JWT/RLS/Edge/Web Locks hospedados ni concurrencia PostgreSQL nativa adicional. No se repitieron123 nativas previas: no cambió SQL ni implementación de concurrencia.
Próximo gate local: cuerpo NC numerado/serie/revisión/permiso/worker/FECompConsultar y exclusión cancelación–intención; aplicación comercial única sólo tras CAE NC confirmado. Revisar coherencia/UX integral de preparación, luego aceptación autorizada con PV/catálogos/custodia reales. No instalar fiscal remoto, activar flags, usar secretos ni emitir por estas pruebas. Sin nuevas consultas ARCA autenticadas, CAE, merge o cambios master/Production. PR03/PR02 y objetivo común siguen parciales.

### 24/10/2026 — Contrato puro del cuerpo NC numerado
FiscalCreditRequest separado de FiscalRequestData/factura v1: clase NOTA_CREDITO, identidad venta/operación/caso/propuesta/preparación y reserva_id; solicitud con datos exactos de035, asociación única original y número propio entero1..99999999. Revalida wire035/caso/factura/contexto histórico, rechaza CANCELADA y exige reserva cerrada14 campos con serie/CUIT/tipo/PV/identidades/SHA exactos, estado RESERVADA y emisión false. Captura todo antes de await, canónico ordenado/hash SHA256 y deep freeze. No cambia importe/IVA proporcional ni el número asociado a la factura; A/B/C, servicios/mixtos conservan períodos explícitos. Contrato de reserva valida forma/enlace, NO acredita existencia/exclusividad/vigencia SQL ni origen confiable: siguiente adaptador privado debe obtenerla/revalidarla bajo lock de serie y caso antes de persistir. No se expone al cliente/HTTP/SDK ni se genera XML/permiso.
69 PASS/3archivos, nuevos22 escenarios cuerpo NC, incluyendo límite/tipo entero, otra serie/caso/hash/estado/permisos/extra, cancelación y captura antes de await. Factura v1 sigue rechazando cuerpo NC. Lint/diff y build677 módulos PASS, advertencia conocida de chunks. Pendiente SQL durable de serie/reserva/cuerpo NC y exclusión cancelación–intención antes de worker, revisión temporal del Dueño ligada al cuerpo exacto, FECompConsultar NC y aplicación única sólo tras CAE confirmado. No se ha reservado numeración real ni emitido. Sin instalación fiscal remota, flags activados, secretos, ARCA autenticada nueva, CAE, merge o Production. PR03/PR02 parciales.

### 24/10/2026 — SQL036: reserva/cuerpo NC durables privados
Preparado fiscal_nc_series_homologacion(CUIT/PV/tipo3/8/13) y fiscal_nc_reservas_homologacion por caso/UUID, checksum/canónico, número/último y consulta observada. RLS/tabla/columnas/helpers revocados; sólo getter/reservar EXEC service_role, fuera de allowlist SDK/HTTP. Getter verifica Auth original/caso/preparación; replay conserva preparación/UUID y recupera historia con emisor/catálogo apagados, sin exigir consulta fresca ni modificar número. Nuevas reservas exigen READ COMMITTED, caso/preparación activos, contexto033 idéntico al histórico035, lock por caso y serie; revalida tras esperar y rechaza último agotado/negativo/timestamp infinito/futuro o mayor30s. El futuro adaptador privado debe acreditar origen WSFE real: forma/fecha SQL no autentican un último autorizado inventado por quien ya posee privilegio privado.
Cuerpo canónico producido en SQL coincide con FiscalCreditRequest y asociación original, A/B/C y conceptos1/2/3. Reserva/cuerpo inmutables, únicos por caso/UUID/serie+número. Serie se mantiene cerrada ante cualquier reserva hasta futura resolución privada; no existe todavía workflow para continuar serie tras resultado ARCA. Trigger de cancelación excluye borrado simple de caso numerado; instalación rechaza historia con reserva y cancelación simultáneas. Cancelación previa impide numeración tardía; no se emite ni cambia stock/caja/devoluciones. Futuro flujo de cancelación/resolución numerada y exclusión intención/worker son prerequisito antes de exposición remota.
12 pruebas036 PASS (325 filtradas, pilot-credit-reservation-sql-v1-20261024.log); selección completa359 PASS/2archivos (337 SQL y22 contrato, pilot-credit-reservation-sql-v2-20261024.log). Reaplicación036 dos veces por fixture. Tests: igualdad byte a byte SQL/TS, replay/UUID distinto, consulta inválida/rollback sin serie parcial, cancelación previa/posterior, catálogo/emisor revocados, ACL columnas/tabla e inmutabilidad. Build677 módulos PASS (pilot-credit-reservation-build-v1-20261024.log); manifiesto bootstrap43 PASS, no incluye opcionales fiscales; lint sin hallazgos nuevos, finally previo del runner. Concurrencia nativa ampliada5 escenarios:128 PASS/salida0, credit-reservation-concurrency-v4-20261024.json; PostgreSQL nativo con036 instalado dos veces después de123 escenarios previos. Verifica mismo caso/una reserva, cancelación antes/después de numerar, rollback y consulta vencida esperando serie. Contenedor propio kiosko-pr03-local-0270dfcd detenido/datos conservados, cero solicitudes externas/emisiones. Intento v3 conservado como FAIL en paso124 por esperar42501 cuando contrato correcto devuelve55000 al cancelar antes de numerar; corregida expectativa del test, sin relajar SQL. primer check sintáctico detectó nombre duplicado en runner y se corrigió; siguiente intento no creó contenedor por Docker cerrado, luego se inició app local y respondió29.9.2. No contar intentos fallidos como PASS.
SQL001–036 no instalado/activado remotamente por nosotros. Sin SDK/HTTP/worker nuevos ni reserva/consulta/CAE reales; incluir tablas NC nuevas en dump/restore autorizado, restauración integral sigue bloqueada. PR03/PR02 y objetivo común parciales. Próximo: resolución de reserva NC, adquisición privada de numeración verificada, revisión/worker/conciliación y aplicación única, luego aceptación hospedada autorizada. Sin secretos, consultas ARCA autenticadas nuevas, master/Production o merge.
Prueba adicional036: dos casos parciales legítimos distintos sobre venta pesable de0.500 (0.250/$62 cada uno) preparan datos por pipeline real; tras reservar primero, segundo no avanza serie aunque declare siguiente último autorizado.13 pruebas036 PASS (325 filtradas, pilot-credit-reservation-sql-v3-20261024.log). Refactor menor del helper de instalación036 para reaplicar dos veces; selección final360 PASS/2archivos (pilot-credit-reservation-sql-v4-20261024.log) y build final677 módulos PASS (pilot-credit-reservation-build-v2-20261024.log, avisos conocidos de chunks/timings). No se usa metadata retrospectiva en estos escenarios embebidos. Fixtures nativas de unidades siguen sintéticas para aislar carreras, como documentado antes; no son backfill ni aceptación real.

### 24/10/2026 — SQL037 y servicio de lectura del cuerpo NC reservado
cargar_fuente_cuerpo_nc_homologacion recupera packet privado cerrado3 campos(preparacion035,reserva036,cuerpo canónico/SHA), con Auth fiscal original/caso/preparación/UUID de reserva y locks heredados, sin exigir catálogo/emisor actuales. NULL sólo ante reserva ausente del caso autorizado. Sin tablas nuevas ni escrituras; EXEC service_role, tablas permanecen privadas. SDK49 admite lectura037, fuera de HTTP/cliente/UI. loadFiscalCreditRequest captura scope y verifica Auth una vez, representación026 y propuesta exacta del caso, luego valida packet/cuerpo.
validateFiscalCreditRequestRecord reconstruye preparación/cuerpo numerado contra factura/caso/reserva, compara canónico/SHA completos y devuelve CUERPO_NC_RESERVADO inmutable/emisión false. Rechaza extra/permisos/hash/canónico/UUID/número/preparación cancelada alterados. Es evidencia histórica; no aprobación, credencial, vigencia actual ni permiso. No se debe usar este getter como autorización de envío.
419 PASS/3archivos (342 SQL embebido,30 contrato/servicio,47 SDK), salida0 pilot-credit-request-source-v1-20261024.log. Nuevos: A/B/C lectura real servicio/SQL tras apagar emisor/catálogo; Auth reasignado entre fuente y getter bloquea cuenta anterior/nueva; sólo null como ausencia, identidad/Auth único, contenido reconstruido y ACL indirectas del SDK. SQL037 se reaplica dos veces en fixtures. Build677 módulos PASS (pilot-credit-request-source-build-v1-20261024.log), lint/diff sin hallazgos nuevos salvo finally previo del runner.
PostgreSQL nativo130 escenarios PASS/salida0:037 instalado dos veces tras128;2 nuevos lector espera reserva confirmada y recupera canónico/hash enlazados, Auth reasignado mientras espera no revela cuerpo. credit-request-source-concurrency-v1-20261024.json. Contenedor propio kiosko-pr03-local-172b31ba detenido/datos conservados; cero solicitudes externas/emisiones. Auth/metadata nativas sintéticas, no JWT/RLS/Edge/Web Locks hospedados ni backfill real. Suite global definitiva sigue pendiente.
Siguiente: adquisición privada de numeración NC con WSFE auténtico y gates, revisión temporal Dueño sobre cuerpo exacto, permiso/intención/worker, resolución/FECompConsultar NC y aplicación comercial única sólo tras CAE. Serie continúa cerrada mientras reserva pendiente. SQL001–037/Edge/flags no instalados/activados remotamente por nosotros. Getter nuevo debe estar incluido en esquema de dump/restore autorizado, sin tablas nuevas; backup JSON no cubre diario fiscal y restore integral sigue bloqueado. Sin secretos, ARCA autenticada nueva, CAE, merge o master/Production. PR03/PR02/objetivo común parciales.

### 24/10/2026 — Adaptador privado de último número NC (SOAP sintético)
FiscalCreditNumberXml valida serie cerrada4 campos HOMO/CUIT módulo11/PV1..99998/tipo3/8/13, y decodifica FECompUltimoAutorizado con XML seguro existente (límites bytes/nodos/profundidad, sin DTD/entidades, esquema/namespace/duplicados). Conserva último0..99999999 exacto; no convierte cero en ausencia ni incrementa automáticamente. Rechaza serie equivocada, decimales/exponentes/negativos/agotamiento fuera de rango, Errors de negocio y acciones ajenas. Events sólo se validan; no se devuelven mensajes privados. WSFE no retorna CUIT en esta respuesta: parser no autentica emisor ni transporte. Futuro worker debe acreditar binding de TA/contexto y autoridad de consulta, no atribuirlo al XML.
Consulta privada usa endpoint homologación y SOAPAction fijos, POST/redirect:error, TA escapado y callback obligatorio antes de enviar. Captura serie antes de await; no crea TA, escribe SQL, reserva, reintenta ni emite. Reutiliza postPrivateFiscalWsfe con deadline/aborto/lectura acotada/content-type/UTF8 y añade guard fijo URL/método/redirect/acciones. Comparte sólo validador CUIT/bloque Auth; normalizeFiscalSeries/parser/factura v1 siguen rechazando NC, sin ampliar contrato de emisión existente. Helpers nuevos son internos, no HTTP ni cliente/UI; callback por sí mismo no sustituye autorización SQL.
130 PASS/3 archivos inicialmente (pilot-credit-number-xml-v1-20261024.log). Regresión ampliada627 PASS/8 archivos (pilot-credit-number-xml-v2-20261024.log), incluidos29 nuevos de numeración NC y contratos/XML/worker/preparación SQL/cache existentes. Build677 módulos PASS (pilot-credit-number-xml-build-v1-20261024.log); manifiesto43/diff PASS; lint sin nuevos hallazgos, regex de controles preexistentes de Auth/escape conservados. Símbolos del adaptador/transporte NC ausentes del bundle público. No se repitió PostgreSQL nativo130 previo: no cambió SQL/locks. No es suite global ni aceptación hospedada; todos fetchers nuevos sintéticos, cero consultas ARCA autenticadas/emisiones reales.
Siguiente: fuente/binding SQL privado específico de numeración NC y worker gated que recupere037 antes de TA/consulta, valide emisor/caso/preparación actuales y persista036 tras consulta auténtica; sin inferir autorización del estado AUTORIZADA de la factura original. Luego revisión Dueño sobre cuerpo exacto, permiso/intención, resolución/FECompConsultar NC, aplicación única tras CAE y aceptación hospedada autorizada. SQL001–037/Edge/flags no instalados/activados remotamente por nosotros; sin secretos, CAE, merge o master/Production. PR03/PR02/objetivo común parciales.

### 24/10/2026 — SQL038: fuente/binding específicos de numeración NC
cargar_fuente_numeracion_nc_homologacion exige trabajador service_role, READ COMMITTED, Dueño activo/no SuperAdmin del comercio, Auth original/caso y preparación SHA exactos; rechaza cancelación y reserva existente (recuperar037 antes de consulta nueva). Contexto033 actual debe ser idéntico al histórico035 y el emisor vigente conserva revisión/credencial/certificado del caso. Fuente privada devuelve sólo preparación y binding cerrado20 campos con finalidad NUMERACION_NC, identidades venta/operación_origen/caso/Auth/comercio y metadata de emisor/catálogo. Sin tokens, claves ni permiso de emisión/TA. Sin tablas nuevas, SDK50 lectura038, no HTTP/UI ni worker.
FiscalCreditNumberBinding es deliberadamente incompatible con FiscalWorkerBinding de facturas: NO operacion_id y usa revision_emisor. Se identificó que createSharedFiscalTicketLoader utiliza binding.operacion_id en RPC de lease/renovación TA ligadas a operaciones de factura. No pasar UUID de caso NC ni tomar factura AUTORIZADA como permiso sustituto; falta coordinador/lease específico NC compatible con reutilización de TA por certificado. Validator reconstruye preparación y cruza scope/Auth/SHA/CUIT/PV/tipo/revisiones, congela metadata y rechaza extras/cancelación/permisos. loadFiscalCreditNumberingSource verifica JWT vía Auth.getUser una vez, conserva actor original en026/038 y devuelve metadata saneada; no consulta cache/custodia/WSAA/WSFE.
Primera selección SQL0387 PASS/2FAIL por fixtures que violaban constraints de usuarios (EMPLEADO inexistente y SuperAdmin con comercio), corregidos a CAJERO y SuperAdmin sin comercio; no se relajó esquema. Contratos94 PASS/3archivos inicialmente; selección final445 PASS/4archivos (351 SQL embebido,17 fuente,29 SOAP NC,48 SDK), salida0 pilot-credit-number-source-v2-20261024.log. Cobertura: actor y scope, sin permiso heredado, casos reservados/cancelados, emisor/catálogo/pago cambiados, roles/SuperAdmin, Auth reasignado, captura antes de await y metadata cerrada. Build677 módulos PASS (pilot-credit-number-source-build-v1-20261024.log); manifiesto43/diff PASS, lint sin hallazgos nuevos (finally previo). Símbolos de fuente/binding privados ausentes del bundle.
PostgreSQL nativo133 PASS/salida0;038 reaplicado tras130 y3 escenarios: reserva gana/exige recuperar cuerpo, emisor revocado esperando y Auth reasignado esperando no devuelven fuente para TA. credit-number-source-concurrency-v1-20261024.json. Contenedor propio kiosko-pr03-local-788e3147 detenido/datos conservados; cero solicitudes externas/emisiones. Auth/metadata sintéticas, sin acreditar aceptación JWT/RLS/Edge/Web Locks real ni backfill. Suite global definitiva pendiente.
Siguiente: coordinación privada de TA NC con identidad de caso/actor/emisor y guardias propias, reutilizando TA válido/cifrado por certificado sin renovar en paralelo; trabajador gated que recupere037 antes de TA/consulta y revalide038 antes de enviar, persista036 y recupere cuerpo exacto. Luego revisión Dueño/permiso/intención, resolución/FECompConsultar y aplicación comercial única tras CAE. SQL001–038/Edge/flags no instalados/activados remotamente por nosotros; sin secretos, consultas ARCA autenticadas nuevas, CAE, merge o master/Production. Incluir038 en esquema de dump/restore autorizado, sin nuevas tablas; restore integral sigue bloqueado. Objetivo común/PR03/PR02 parciales.

### 24/10/2026 — SQL039: coordinación TA NC compartida por certificado
coordinar_ta_nc_homologacion separa SOLICITAR/INICIAR/CONFIRMAR/CANCELAR/ESTADO con scope Auth/caso/preparación/binding completos. Comparte fiscal_ta_homologacion e intentos globales por certificado para no renovar en paralelo con facturas. Nueva tabla privada/inmutable fiscal_nc_ta_vinculos_homologacion liga intento a caso/Auth/binding NC; intento global NC conserva operacion_origen_id=NULL, sin inventar operación de factura. Funciones008 no lo pueden adoptar/cancelar; intentos históricos de factura no se adoptan ni rellenan como NC. EXEC sólo service_role; helper histórico sin EXEC público/service y tablas/columnas/RLS revocados.
SOLICITAR/INICIAR exigen fuente038 actual y la revalidan tras lock del TA; propietario/gen/CAS y permiso de envío único. TA vigente >60s se comparte sólo cifrado, margen cercano exige esperar vencimiento; PREPARADA/ENVIO_INCIERTO no generan otra renovación. Nuevas generaciones conservan intentos anteriores. CANCELAR sólo antes de envío, con replay sin liberar generación siguiente. Una vez iniciado, incertidumbre no se libera por timeout ni cancelación. CONFIRMAR almacena únicamente sobre cerrado(version/keyId/nonce/ciphertext/expiresAt), vigencia <=12h1m, resultado/hash durables e idempotentes; rechaza texto plano/extras/sobre inválido. Confirmación de respuesta ya recibida y cancelación de preparación sin envío usan binding histórico del mismo Auth/caso, no permiso038 nuevo: conservan TA cifrado aun si caso/emisor se canceló/revocó entretanto, pero no permiten un envío nuevo. ESTADO no expone IDs de preparación ajena (COMPARTIDA), nunca Token/Sign. Sobre no acredita por sí solo AES/WSAA; futuro loader privado debe cifrar/descifrar y verificar contexto/TA reales.
11 pruebas039 PASS inicialmente (351 filtradas, pilot-credit-ticket-sql-v1-20261024.log); se agregó replay de cancelación contra generación nueva. Selección final385 PASS/2archivos (363 SQL embebido +22 cache, pilot-credit-ticket-sql-v2-20261024.log);98 persistencia/loader heredados PASS aparte (pilot-credit-ticket-legacy-v1-20261024.log). No sumar filtrados como omitidos de aceptación: escenarios039 se instalan/reaplican explícitamente dentro de sus transacciones; baseline histórico por fases se conserva y no todos los tests antiguos corren tras039. Pruebas: lifecycle/ACK, cancelación antes/después, confirmación tras caso cancelado/emisor revocado, TA compartido de factura PREPARADA/ENVIO/DISPONIBLE sin apropiación, sobres inválidos, tabla privada/inmutable y RPC heredada no cancela NC. Cifrados SQL sintéticos, no validación criptográfica nueva ni TA auténtico.
PostgreSQL nativo137 PASS/salida0:039 instalado dos veces después de133,4 nuevos escenarios. Dos comercios NC/certificado una preparación, dos workers un permiso envío, cancelación gana impide envío tardío, envío gana preserva incertidumbre. credit-ticket-concurrency-v2-20261024.json; contenedor propio kiosko-pr03-local-7b100a86 detenido/datos conservados. Primer ensayo133 previos yFAIL por fixture intentando helper canónico privado con service_role; corregido cálculo sintético por observer de pruebas, sin ampliar ACL. Fixtures nativas rotan metadata sólo en comercios sintéticos antes de crear casos, no claves reales/backfill. Cero solicitudes externas/emisiones.
Build677 módulos PASS (pilot-credit-ticket-build-v1-20261024.log), manifiesto43/diff PASS, lint sin nuevos hallazgos (finally previo). Sin cambio de implementación TypeScript ni nuevo SDK/HTTP/loader/worker; coordinación039 aún fuera de allowlist. Siguiente: loader TA NC específico con cifrado/contexto certificado y callback de envío autorizado por039, integración worker de numeración gated/recuperación037 y persistencia036; luego revisión/permiso/intención/worker/conciliación/resolución NC y aplicación única tras CAE confirmado. No usar cargador de factura mediante cast. Pérdida de Auth original o envío incierto requieren recuperación privada controlada, no apropiación automática de lease. SQL001–039/Edge/flags no instalados/activados remotamente por nosotros; sin secretos, WSAA/WSFE autenticados nuevos, CAE, merge o Production. Dump/restore autorizado debe incluir nuevo vínculo TA NC y diario/TA cifrado previos; JSON app no cubre esto, restore integral sigue bloqueado. Objetivo común/PR03/PR02 parciales, aceptación hospedada pendiente.

### 24/10/2026 — cargador TA NC privado, avance local sin activar
Implementado cargador específico NC sobre coordinación039, sin convertir el binding en operación de factura. Cifra con AES-GCM y contexto de certificado, reutiliza sobres, exige guard antes de claves/envío y ACK INICIAR único. Un ACK perdido tras posible envío no cancela ni renueva; confirmación perdida puede recuperarse por lectura del cifrado. TA tardío tras aborto se conserva pero no se entrega al consumidor. Validación cerrada de metadata y SDK privado habilitado sólo para RPC039, sin instalación/flags remotos.
Pruebas focalizadas iniciales72 PASS/3 archivos (credit-loader-tests-v2.log), build PASS (credit-loader-build.log), lint sin hallazgos. Nueva prueba SDK agregada después: resultado final registrado en credit-loader-tests-v3.log. Cifrado real con claves efímeras y TA sintéticos; no ARCA ni secretos reales. Pendiente integración de este cargador con SQL039 real, custodia/CMS NC específico y worker de numeración/recuperación037/reserva036. Pérdida de ACK SOLICITAR conserva preparación pendiente; no renovación automática. No aceptación hospedada ni cierre PR03/PR02, CAE, merge o Production. Cambios locales aún sin publicar.

### 24/10/2026 — PR03: cargador TA NC cifrado integrado con SQL039
Cargador privado específico NC, sin convertir binding/permiso de factura. AES-GCM real con claves efímeras sintéticas; coordinación global por certificado y vínculo NC propio. Integración PGlite con039 instalado dos veces prueba reutilización entre instancias, ACK CONFIRMAR perdido recuperable, ACK INICIAR perdido sin cancelar/reenviar y fallo de clave previo que libera sólo preparación. No alteración de venta/stock/caja. Selección538 PASS/5archivos (credit-loader-final-tests.log), incluyendo367 SQL embebidos y98 persistencia heredada; no suite global ni aceptación hospedada. Build PASS (credit-loader-final-build.log), lint sin hallazgos, manifiesto bootstrap43/diff PASS; símbolos privados ausentes del bundle. Prueba filtrada previa4PASS/363omitidos sólo diagnóstica, no sumar como cobertura adicional. Sin cambios SQL: concurrencia nativa137 previa permanece evidencia de039, no prueba nueva del cargador.
Pendientes: custodia/CMS NC específico, worker numeración con recuperación037 y reserva036, revisión/permiso/intención/envío/conciliación/resolución NC y aplicación comercial única después de CAE. ACK SOLICITAR perdido conserva preparación y requiere recuperación controlada; no renovación automática. SDK incluye coordinación privada039, sin HTTP/UI ni activación nueva. SQL001–039/Edge/flags no instalados/activados remotamente por nosotros, sin secretos reales, consultas ARCA autenticadas nuevas, CAE, merge, master o Production. PR03/PR02 parciales; restore integral bloqueado; impresora/cajón y Point diferidos. Este bloque se publica en rama del PR3 conservando historial.

### 24/10/2026 — PR03: custodia/CMS WSAA específico NC preparado localmente
Nuevo adaptador NC con binding cerrado038, snapshot antes de awaits, firma CMS antes del callback durable039 y transporte WSAA de homologación fijo. La custodia usa revisión_emisor explícita y comparte únicamente el descifrado privado PKCS8 ya validado; no convierte NC en binding/operación de factura. Certificado/huella/revisión/proyecto y RSA no exportable se verifican antes de transporte. Token/Sign no enumerables, errores sanitizados, sin nuevos endpoints/flags/SQL.
Selección195 PASS/7archivos (credit-wsaa-final-tests.log), incluye7 nuevos escenarios NC: PKCS8 cifrado sintético→CMS firmado real→TA simulado ligado al uniqueId firmado, revisión/huella/proyecto/shape inválidos y permiso rechazado/abortado. Ajuste posterior conserva catch sanitizado de custodia de factura:56 PASS/3archivos repetidos (credit-wsaa-post-review-tests.log); no sumar como251 únicas. Ninguna clave/certificado real ni solicitud ARCA externa. Provisionamiento/uso real siguen gated.
Siguiente dependencia: worker de numeración NC con Auth original capturado una vez, recuperación037 antes de TA, fuente038 vigente antes de claves/consulta y reserva036 una sola vez/ACK perdido. Luego revisión/permiso/intención/envío/conciliación/resolución NC y aplicación comercial sólo tras CAE confirmado. No se ha cerrado PR03/PR02 ni aceptación hospedada. SQL001–039/Edge/flags sin instalación/activación remota por nosotros, sin CAE, merge/master/Production. Restore integral bloqueado; físicos/Point diferidos.
Cierre del bloque local: buildv2 PASS (credit-wsaa-build-v2.log), lintv2 sin hallazgos, diff PASS y símbolos privados ausentes del bundle público. Trabajo probado se publica en la rama del PR3; no despliegue fiscal remoto.

### 24/10/2026 — PR03: proceso privado de numeración NC preparado
Nuevo prepareFiscalCreditNumber captura Auth una vez y conserva la identidad original en cada RPC. Recupera037 antes de TA incluso con gate de numeración cerrado; requiere gate privado ARCA_HOMO_CREDIT_NUMBERING_ENABLED exacto para trabajo nuevo. Fuente038 revalidada antes de claves/WSAA/WSFE, TA cifrado coordinado039, consulta de último número con callback y reserva036 una sola vez. Confirmación final sólo por lectura037 y validación de canónico/hash/preparación; ACK RPC no acredita persistencia. No FECAESolicitar ni efectos de dinero/stock. SDK privado incluye reserva036 (52RPC); sin endpoint/acción UI ni activación remota.
Selección anterior477 PASS/5archivos (credit-number-worker-final-tests.log); no incluye último ajuste de recuperación al fallar fuente por carrera. Ocho escenarios posteriores8PASS/367omitidos (credit-number-worker-race-tests.log), antes de ese ajuste. Verificación del último ajuste y noveno escenario en curso: credit-number-worker-race-v2.log y build-v2. No declarar estos resultados posteriores PASS hasta observar finalización/salida. Intercalaciones inyectadas en PGlite, no nueva prueba de procesos PostgreSQL concurrentes. SQL sin cambios;137 nativas previas acreditan sólo coordinación SQL039.
Pendientes: exposición privada controlada y recuperación de identidad de reserva por cliente, revisión/permiso sobre cuerpo NC numerado, intención/envío/FECompConsultar/resolución NC y aplicación única después de CAE confirmado; además aceptación hospedada JWT/RLS/Edge/E2E y custodia/PV/parámetros reales. Gate nuevo apagado por ausencia; no consultas ARCA autenticadas nuevas, SQL/Edge/flags remotos, emisión/CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos. Revisor automático interrumpió una edición/verificación por límite de uso; operación no ejecutada entonces. Revisión volvió a permitir operaciones al retomar, sin bypass ni ampliación de autoridad.

Cierre de verificación 24/10/2026: último ajuste de recuperación de fuente y noveno escenario9 PASS/367omitidos (credit-number-worker-race-v2.log). Los omitidos son filtrado por nombre, no aceptación. Buildv2 PASS, lintv2 sin hallazgos, manifiesto bootstrap43/diff PASS; símbolos worker/gate privados ausentes del bundle público. Selección477 previa y9 enfocadas posteriores se reportan por separado, sin inventar suite global actual. Se publica bloque probado en rama PR3, con endpoint/UI e instalación/activación remota todavía pendientes.

### 24/10/2026 — PR03: revisión humana NC durable preparada (SQL040)
Revisión específica de cuerpo numerado NC, separada de factura y de permiso de envío. Tabla privada/inmutable liga UUID de revisión, caso/reserva, Auth original, cuerpoSHA/preparaciónSHA y contexto de emisor/catálogo/hechos comerciales. Vencimiento fijado a diez minutos, replay histórico no lo extiende ni acredita vigencia actual. Nueva aprobación exige Dueño activo único/no SuperAdmin, cuerpo exacto y contexto033 vigente igual al conservado en035. Getter histórico ligado a037; no permite aportar un cuerpo alternativo ni borra historia al revocar emisor. Revalidación tras INSERT/espera evita acreditar aprobación nueva con contexto vencido/cambiado. Contrato TypeScript reconstruye cuerpo/hash y rechaza aprobaciones ajenas/extra/alteradas; es evidencia histórica, no autoridad/permiso.
Evidencia:415 PASS/2archivos (385 SQL embebidos +30 contrato/cuerpo NC, credit-owner-review-final-tests.log). Nueve escenarios040 y alteraciones de DTO; instalación/reaplicación040 explícitas por fixture con ROLLBACK, baseline histórico por fases se conserva. PostgreSQL17.11 nativo140 PASS:137 anteriores,3 después040 instalado dos veces (credit-owner-review-native-v1.json/.log): dos trabajadores misma revisión un ACK/vencimiento, emisor revocado y Auth reasignado esperando bloquean aprobación. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-e460972f detenido/datos conservados. Build PASS, lint del cambio sin hallazgos; runner conserva warning no-unsafe-finally previo. Manifiesto bootstrap43/diff PASS no valida opcional040; símbolos privados ausentes del bundle.
Pendientes: conectar transporte/SDK privado y captura/revisión visible con UUID durable, separar aprobación histórica de vigencia al conceder futuro permiso, intención/envío/FECompConsultar/resolución NC y aplicación comercial única sólo tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, llamadas ARCA autenticadas nuevas, CAE, merge/master/Production. PR03/PR02 y aceptación hospedada siguen parciales. Dump/restore privado futuro debe incluir revisiones NC además de diario/TA/unidades/reservas; JSON app no lo cubre y restore integral permanece bloqueado. Impresora/cajón/Point diferidos. Se publica incremento probado en rama del PR3.

### 24/10/2026 — PR03: servicio y transporte de revisión NC preparados
Servicio privado verifica Auth una vez, conserva scope/Auth original, valida representación/caso/cuerpo040 y enlaza UUID de aprobación al cuerpoSHA/preparaciónSHA esperados antes de escribir. Un único POST y lectura durable posterior, incluso con ACK perdido; respuesta ajena/hash incoherente no se acepta. SDK privado añade cargar/aprobar revisión040 (54RPC). HTTP REVISION_NC cerrado6campos/APROBAR_REVISION_NC cerrado8campos, máximo2KiB, IDs/hash estrictos y origen/proyecto/Auth/gate backend existentes. Escritura con ARCA_HOMO_CREDIT_REVIEW_ENABLED exacto true, apagado por ausencia; lectura/recuperación histórica permitida con gate de escritura cerrado. DTO explícito sólo cuerpo canónico/hash y aprobación, sin paquete SQL/contexto/custodia. No TA, WSAA/WSFE ni CAE/efectos comerciales.
Seis escenarios de servicio iniciales6PASS/385omitidos por filtro (credit-review-service-v1.log); build/lint finales PASS y manifiesto bootstrap43/diff PASS, símbolos privados ausentes del bundle. Selección HTTP/SQL completa en curso en credit-review-transport-final.log: registrar resultado antes de cerrar/publicar. SQL sin cambios en este incremento;140 nativas anteriores siguen evidencia de040, no nueva aceptación de transporte hospedado.
Pendientes: cliente con UUID/hash durables y recuperación antes de repetir escritura, validación de wire y pantalla NC, transporte controlado de numeración, permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación comercial sólo tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros, sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.

Cierre 24/10/2026: selección completa565 PASS/3archivos (credit-review-transport-final.log), incluyendo servicio/HTTP NC integrado conSQL040 y controles HTTP/SDK existentes. Build PASS (credit-review-transport-build.log), lint sin hallazgos, manifiesto bootstrap43/diff PASS y símbolos privados ausentes del bundle. Sin aceptación hospedada nueva. Se publica trabajo probado en rama del PR3.

### 24/10/2026 — PR03: cliente durable de revisión NC preparado
Cliente de revisión integrado a credits del cliente fiscal y exclusión compartida existente por venta. Reconstruye el wire canónico/hash contra fuente/propuesta/preparación explícitas verificadas, sin confiar en datos fiscales recibidos ni en campos extra. Antes de POST persiste y relee sólo7campos (version/operación/caso/propuestaSHA/preparaciónSHA/cuerpoSHA/revisiónUUID), aislados por Auth/comercio/venta; no guarda canónico/PII. Un POST y GET del mismo UUID, ACK perdido recuperable. Pendiente incierto sobrevive recarga y approve con pendiente sólo recupera, sin nuevo POST/UUID; hash/ACK ajenos no lo retiran. Fallo storage impide POST. Guardado de casos/preparación y cancelación se bloquean mientras hay revisión incierta; recuperar sigue disponible. API cliente permite leer/revisar/recuperar pero pantalla de aprobación todavía pendiente.
Evidencia:511 PASS/5archivos cliente/contrato/SQL (credit-review-client-final-tests.log),75 PASS/2pantallas existentes (credit-review-client-ui-tests.log). Tras corrección de tipado en prueba de respuesta ajena39 PASS del archivo afectado repetidos (credit-review-client-post-types-tests.log); no sumar como pruebas únicas extra. Buildv1/v2 detectó fixtures y tipado de prueba desactualizados; se corrigieron sin casts ni relajar tipos y buildv3 PASS. Lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS. Validadores puros/acciones HTTP entran al navegador por diseño; RPC SQL/custodia privada y prefijos de secretos ausentes del bundle. SQL/HTTP sin cambios,140 nativas y565 transporte previas no acreditan navegador/Web Locks/aceptación hospedada actuales.
Pendientes: pantalla NC con recuperación antes de confirmar, transporte controlado de numeración y UUID durable correspondiente, permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación comercial sólo tras CAE. Aprobar/reconstruir un cuerpo no acredita vigencia actual, Auth/RLS hospedado ni permiso de emisión. SQL001–040/Edge/flags sin instalación/activación remota por nosotros, sin provisión/uso de secretos reales, nuevas consultas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos. Se publica incremento probado en rama del PR3.

### 24/10/2026 — PR03: pantalla de revisión NC integrada
Panel del Dueño integrado dentro de preparación activa verificada, en el historial NC existente y detrás de sus gates actuales. Consulta manual, sin red/aprobación al abrir. Recupera pendiente antes de consultar revisión nueva; valida nuevamente wire/cuerpo/hash/preparación. Muestra numeración reservada sin emitir, emisor/receptor/asociación, fecha/períodos dd/mm/aaaa, líneas/importes/IVA/tributos y referencia hash. Checkbox explícito antes de guardar; guard de operación simultánea, bloqueo tras respuesta incierta y descarte de respuestas tardías al cambiar cuerpo. Aprobación se presenta como constancia con vencimiento registrado, nunca CAE ni permiso vigente. No botón de emisión, efectivo ni reposición. Se elimina contradicción del panel de preparación que decía sin número al poder existir reserva.
Evidencia:124 PASS/5archivos UI/contrato (credit-review-panel-final-tests.log); después se agregaron fechas de servicios/integración y12 PASS/2paneles (credit-review-panel-integration-tests.log), no sumar repetidas como suite única. Primera selección2fallos por matcher no configurado, corregido con aserción nativa sin dependencia nueva. Buildv3 PASS, lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS. RPC SQL/custodia/prefijos de secretos privados ausentes del bundle; validadores puros/acciones HTTP públicos esperados. No aceptación visual hospedada, Web Locks/JWT/RLS/Edge ni CAE nuevos; SQL/HTTP sin cambios.
Pendientes prioritarios: recuperación con reintento EXPLÍCITO del mismo UUID ante aprobación cuyo primer POST no se ejecutó (por ejemplo gate cerrado), sin reemplazar identidad ni renovar una aprobación ya persistida; transporte de numeración y su identidad durable; permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única después de CAE. La recuperación actual sólo hace GET: ausencia/error no prueban rollback y no retiran el pendiente. No activar este circuito remotamente antes de resolver esos pendientes y aceptación hospedada. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros, sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado, físicos/Point diferidos. Se publica incremento probado en rama del PR3.

### 24/10/2026 — PR03: reintento explícito de revisión NC con identidad original
Nuevo retryReview sólo por decisión explícita: toma pendiente durable existente y verifica scope/cuerpo/preparación/hash, intenta recuperar primero y, si no pudo confirmar, relee el cuerpo actual antes de un único POST con el MISMO UUID/hash. Un GET fallido no prueba ausencia ni permite cambiar identidad. Revalidación de pendiente tras lectura/exclusión, sin crear UUID ni retirar por errores. Si ya existe aprobación, recuperar evita POST; si el ACK/GET previo se perdió, replay SQL040 conserva vencimiento original. Pantalla consulta cuerpo validado tras recuperación incierta y exige checkbox para reintento; nunca reintenta al consultar ni al abrir, ni ofrece nueva identidad. No emite ni concede permiso.
Evidencia inicial:130 PASS/5archivos cliente/pantallas (credit-review-retry-tests-v1.log) y2 escenarios integrados cliente→HTTP→servicio→SQL040 PASS/392omitidos por filtro (credit-review-retry-sql-v1.log): primer POST gate cerrado sin ejecución y aprobación confirmada con ACK/lectura perdidos. Ambos preservan UUID/cuerpo; segundo conserva vencimiento exacto tras repetir. Selección completa en curso en credit-review-retry-final-tests.log; registrar final antes de publicar. Build PASS, lint sin hallazgos, manifiesto bootstrap43/diff PASS y RPC SQL/custodia privados ausentes del bundle. SQL/HTTP sin cambios;140 nativas previas no sustituyen navegador/JWT/RLS/Edge/Web Locks ni visual hospedados actuales.
El bloqueo documentado en dd8a3be de reintento explícito queda implementado localmente; aceptación hospedada aún pendiente. Próximos: transporte/cliente de numeración con UUID durable, permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única después de CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado, físicos/Point diferidos.
Cierre 24/10/2026: selección completa524 PASS/6archivos (credit-review-retry-final-tests.log), build/lint/manifiesto43/diff PASS. No sumar130 iniciales o2 filtrados como pruebas únicas extra. Sin aceptación hospedada nueva ni emisión. Incremento probado publicado en rama PR3.

### 24/10/2026 — PR03: transporte privado de numeración NC integrado
HTTP CUERPO_NC cerrado5campos y NUMERAR_NC cerrado7campos, máximo2KiB, IDs/hash estrictos y proyecto/origen/Auth/backend existentes. NUMERAR conecta worker NC con keyring/custodia/CMS/TA cifrado específicos; recupera037 antes de gates de trabajo nuevo/claves/consultas. Gate privado de numeración apagado por ausencia; sin activación implícita. CUERPO devuelve null sólo ante ausencia confirmada por037; errores no significan ausencia. DTO explícito canónico/hash/aprobaciónnull/emisiónfalse, sin contexto/custodia ni permiso de envío. Cuerpo existente prevalece incluso con gate de numeración cerrado; preparaciónSHA incompatible se rechaza. Sin acciones CAE.
Evidencia final578 PASS/5archivos (credit-number-http-final-v2.log), buildv3 PASS, lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS; RPC SQL/custodia/prefijos secretos ausentes del bundle. Siete escenarios HTTP integrados: ausencia, lectura histórica, recuperación, preparación distinta, gate cerrado, custodia ausente cancela preparación TA sin envío y flujo positivo de PKCS8 cifrado sintético→CMS firmado→WSAA/WSFE simulados→reserva036/GET037. Recuperación posterior no lee claves ni repite WSAA/WSFE. Primer ensayo positivo falló porque fixture de factura usaba permiso con huella fija; se corrigió fixture para copiar metadata del emisor sintético del ensayo, sin cambiar guard/ACL. Siete filtrados PASS/394omitidos (credit-number-http-positive-v2.log), incluidos en578, no sumar. Sin certificados/claves reales ni solicitudes externas. SQL sin cambios,140 nativas anteriores no son aceptación hospedada del transporte/JWT/RLS/Edge.
Siguiente: cliente de numeración con identidad durable antes de POST, recuperación037/CUERPO antes de repetir, reintento explícito mismo UUID y bloqueo de mutaciones mientras incierto; interfaz de reserva antes de revisión. Luego permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, nuevas consultas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales; restore integral bloqueado y físicos/Point diferidos. Se publica incremento probado en rama PR3.

### 24/10/2026 — PR03: cliente durable de numeración NC preparado
Cliente integrado a credits/exclusión compartida por venta. Valida fuente/propuesta/preparación explícitas y wire/canónico/hash antes de aceptar cuerpo. Guarda/relee sólo6campos de identidad (versión/operación/caso/propuestaSHA/preparaciónSHA/reservaUUID), aislados por Auth/comercio/venta; sin canónico/PII. GET CUERPO_NC antes de POST; cuerpo existente se recupera sin identidad nueva. Un POST NUMERAR y GET durable tras ACK perdido. Pendiente sobrevive recarga; number con pendiente sólo recupera y no repite POST. retryNumber explícito conserva UUID y sólo vuelve a enviar tras ausencia confirmada; error de lectura mantiene pendiente y bloquea POST. Cuerpo durable del mismo caso/preparación prevalece si otro trabajador ganó reserva, sin exigir apropiarse de su UUID. Caso/preparación/cancelación/aprobación bloqueados mientras numeración incierta; recuperaciones de lectura disponibles.
Evidencia inicial65 PASS/3archivos cliente (credit-number-client-v1.log), integración positiva cliente→HTTP→custodia PKCS8 sintética/CMS→WSAA/WSFE simulados→SQL036/037 PASS (credit-number-client-http-tests.log;1PASS/400omitidos por filtro). Solicitud conserva identidad antes de enviar, pierde ACK simulado y recupera; segunda llamada con gate cerrado no usa claves/servicios. Selección completa en curso credit-number-client-final-tests.log, registrar resultado antes de publicar. Buildv2 PASS, lintv2 sin hallazgos, manifiesto bootstrap43/diff PASS; RPC SQL/custodia privada ausentes del bundle. Sin SQL/HTTP nuevos ni aceptación de JWT/RLS/Edge/Web Locks/visual hospedados;140 nativas previas no acreditan cliente real.
Pendiente inmediato: interfaz de reserva/recuperación/reintento antes de revisión; después permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, nuevas consultas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales; restore integral bloqueado y físicos/Point diferidos. No declarar emisión por ver cuerpo numerado.
Cierre 24/10/2026: selección completa541 PASS/6archivos (credit-number-client-final-tests.log), buildv2/lintv2/manifiesto43/diff PASS y privado SQL/custodia ausente del bundle. No sumar65 previas ni1 filtrada como pruebas únicas adicionales. Incremento probado publicado en rama PR3; interfaz y aceptación hospedada pendientes.

### 24/10/2026 — PR03: interfaz de reserva/recuperación NC integrada
Panel de numeración dentro de preparación activa verificada y antes de revisión del Dueño en historial NC. Consulta manual CUERPO/recuperación, sin red/escritura al abrir. Sólo null confirmado habilita elección de reservar; error/DTO alterado bloquea sin presumir ausencia. Checkbox explícito informa que se fijan número/datos y no se cancela como borrador. Pendiente con ausencia confirmada ofrece reintento original explícito; ACK incierto bloquea otra reserva hasta consultar. Cuerpo validado muestra numeración sin emitir y recién entonces habilita panel de revisión manual, sin aprobar automáticamente. Descarte de respuestas tardías por cuerpo/caso/preparación y datos de confirmación reconstruidos de preparación canónica, no props derivados sin validar. Botones/componentes comunes existentes, sin nuevo diseño de ventana.
Evidencia:143 PASS/6archivos UI/contrato (credit-number-panel-final-tests.log). Después se agregó integración desde preparación y14 PASS/2paneles (credit-number-panel-integration-tests.log), no sumar repetidas como suite única. Buildv3/lintv3 en curso al registrar; confirmar resultados antes de publicar. Sin SQL/HTTP/clientes nuevos ni aceptación visual hospedada/JWT/RLS/Edge/Web Locks;541 cliente/SQL y140 nativas previas permanecen evidencia histórica, no pruebas actuales de navegador real.
Pendiente siguiente: permiso vigente ligado a revisión/cuerpo/Auth/emisor y exclusión de intención/envío NC; después FECAESolicitar/FECompConsultar/resolución y aplicación comercial única sólo tras CAE. Contingencias, respaldo/restore y aceptación hospedada siguen sus gates. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, nuevas consultas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales; restore integral bloqueado, físicos/Point diferidos. No declarar emitida la NC por ver número/aprobación.
Cierre 24/10/2026: buildv3 PASS, lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS y símbolos privados comprobados ausentes del bundle.143 pruebas principales y14 finales de integración se informan por separado por solaparse. Se publica bloque probado en rama PR3; visual/aceptación hospedada pendientes.

### 24/10/2026 — PR03: verificación de permiso privado NC preparada (SQL041)
Permisos y revocaciones privados/inmutables, RLS/ACL de tabla/columnas cerradas incluso para service_role. Instalación vacía, habilitado=false por defecto, sin provisión automática. Verificador privado liga permiso a caso/reserva/cuerpoSHA/preparaciónSHA/revisión/Auth original/credencial/certificado/revisión de emisor. Dueño activo único/no SuperAdmin, contexto033 igual a preparación/revisión, permiso/revisión vigentes y sin revocación. Bloquea serie y permiso, revalida contexto/vencimientos después de esperar; vencimiento no puede superar diez minutos del permiso ni el de la aprobación. Revocar agrega hecho sin alterar permiso/historia. Salida PERMISO_NC_VERIFICADO con emision_habilitada=false: verificar NO consume, no concede transporte y no reemplaza intención atómica futura. Sin SDK/HTTP/UI ni autoridad de factura reutilizada.
Evidencia:415 PASS/1archivo SQL embebido (credit-permission-full-sql.log), incluye14 nuevos041 instalados/reaplicados por fixture/ROLLBACK; baseline histórico por fases conservado, no afirmar todos los tests previos bajo041. Filtrado14PASS/401omitidos (credit-permission-sql-v1.log) incluido, no sumar como pruebas únicas. PostgreSQL17.11 nativo143 PASS/salida0,140 antes041 y3 tras041 instalado dos veces (credit-permission-native-v1.json/.log): revocación gana mientras verificador espera permiso, permiso vence esperando serie y Auth reasignado esperando no transfiere autoridad. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-5c379017 detenido/datos conservados. Build PASS, manifiesto bootstrap43/diff PASS (no acredita041 opcional), lint sin hallazgos nuevos; runner conserva warning no-unsafe-finally previo. Símbolos privados comprobados ausentes del bundle.
Siguiente: intención NC durable y consumo/exclusión atómicos en MISMA transacción que verificar041, recuperación histórica antes de revalidar permisos vencidos para no perder incertidumbre, binding/TA propio de envío/consulta NC (no convertir binding de factura ni reutilizar finalidad NUMERACION_NC que038 bloquea con cuerpo existente), worker FECAESolicitar/FECompConsultar/resolución y aplicación única sólo tras CAE. Backend no debe enviar con sólo la verificación de este módulo. SQL001–041/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión de permisos reales/credenciales, uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales y aceptación hospedada pendiente. Incluir permisos/revocaciones NC en dump/restore privado autorizado; JSON app no los cubre, restore integral bloqueado y físicos/Point diferidos. Se publica incremento probado en rama PR3.


### 24/10/2026 — PR03: intención NC durable y consumo atómico (SQL042)
Registro privado inmutable por caso, UUID global único y permiso consumible una sola vez. Registrar verifica041 bajo lock de serie y guarda cuerpo/hash/revisión/Auth originales antes de cualquier transporte. Reintento del mismo UUID recupera ENVIO_INCIERTO/nuevo_envio=false incluso después de revocar emisor o vencer permiso; otra identidad exige conciliación, sin nuevo envío. Rollback no consume ni deja registro parcial. Después de INSERT se revalida autoridad y frescura porque la unicidad global también puede esperar; no autorizar con permisos vencidos durante esa espera. Getter histórico conserva incertidumbre sin renovar autoridad. ACL/RLS cerradas, sin SDK/HTTP/worker ni transmisión automática.
Evidencia enfocada:10 PASS/415 omitidos por filtro (credit-intent-sql-v1.log), SQL042 instalado/reaplicado por fixture dentro de ROLLBACK. PostgreSQL17.11 nativo148 PASS/salida0:143 anteriores y5 después042 instalado dos veces (credit-intent-native-v1.json/.log): mismo intento concurrente una autorización, rollback, revocación, vencimiento esperando serie y colisión UUID global seguida de rollback/vencimiento durante INSERT. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-79e78b46 detenido/datos conservados. Build PASS, manifiesto bootstrap43 PASS (no acredita opcional042), lint sólo warning no-unsafe-finally previo del runner, símbolos privados ausentes del bundle. Suite SQL completa425 PASS/1archivo/salida0 (credit-intent-full-sql.log); incluye los10 enfocados, no sumarlos. Baseline histórico se conserva por fases, no afirmar todas las pruebas previas bajo042.
Pendiente: fuente/binding y TA propios de emisión/consulta NC; worker FECAESolicitar/FECompConsultar con recuperación de intención antes de nuevos permisos; resultados/resolución durables y aplicación comercial única sólo después de CAE confirmado. SQL valida forma/frescura de consulta, no su procedencia WSFE: el futuro adaptador privado debe acreditarla. No reutilizar permiso de factura ni finalidad NUMERACION_NC. SQL001–042/Edge/flags sin instalación/activación remota por nosotros; sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales y aceptación hospedada pendiente. Dump/restore privado autorizado debe incluir intenciones además de permisos/revocaciones/revisiones/TA/unidades/reservas; JSON app no lo cubre, restore integral bloqueado. Impresora/cajón/Point diferidos.


### 24/10/2026 — PR03: fuente privada de envío NC (SQL043)
Fuente exige041 vigente/cuerpo/revisión/permiso exactos y ausencia de intención042, bajo el mismo lock de serie. Devuelve cuerpo durable/permiso y binding explícito finalidad ENVIO_NC, con número/reserva/hashes/Auth/emisor/credencial/certificado/revisiones; no inventa operacion_id de factura ni reutiliza NUMERACION_NC. Consultar fuente no consume permiso y emision_habilitada=false:042 y futuro worker siguen obligatorios. Intención existente exige recuperación/conciliación, sin preparar otro envío. No SDK/HTTP/TA/worker nuevo, ni exposición al navegador.
Evidencia:11 PASS enfocados/425 omitidos (credit-send-source-v2.log), instalación/reaplicación043 por fixture/ROLLBACK. Primer ensayo falló porque intentaba mutar revisión de catálogo inmutable; corregido para deshabilitar mediante operación permitida, sin relajar trigger. PostgreSQL17.11 nativo151 PASS:148 anteriores y3 tras043 instalado dos veces (credit-send-source-native-v1.json/.log): intención gana y bloquea fuente tardía, revocación durante espera y Auth reasignado no transfieren autoridad. Contenedor propio kiosko-pr03-local-a6705460 detenido/datos conservados; cero solicitudes externas/emisiones. Build/manifiesto bootstrap43/diff PASS, lint sólo warning finally previo; símbolo privado ausente del bundle. Suite SQL completa436 PASS/1archivo/salida0 (credit-send-source-full-sql.log); incluye11 enfocados, no sumarlos. Baseline histórico conserva instalaciones por fases, no afirmar todos los casos anteriores bajo043.
Siguiente: validador cerrado del nuevo binding/cuerpo y proveedor TA/custodia específico ENVIO_NC, consulta/reconciliación con finalidad propia posterior a intención (no usar043 ni038), worker con042 confirmado antes de transporte y resultados/resolución durables. Aplicación comercial única sólo tras CAE. SQL001–043/Edge/flags sin instalación/activación remota por nosotros, sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales; aceptación hospedada y punto de venta acreditado pendientes. Restore integral bloqueado; dump privado debe incluir todos los diarios/TA/permisos/intenciones NC, JSON app insuficiente. Impresora/cajón/Point diferidos.


### 25/10/2026 — baseline pre-fiscal aportado por el titular y gate de instalación
El titular informa PRE_FISCAL_BASELINE PASS en Staging: Owner/Cashier mismo kiosco F4A, separación UI, RLS/policies/aislamiento/auth.uid/activo/SuperAdmin revisados,99 SECURITY DEFINER y0 para anon; pgcrypto1.3 y uuid-ossp1.1 instalados; http/pg_net/pgjwt disponibles pero NO instalados; tablas/RPC/schemas/Edge/secrets/flags fiscales0. Esta entrada registra evidencia aportada, no una verificación remota realizada por Codex en esta fecha, ni acredita SQL fiscal instalado. No instalar extensiones preventivas: WSAA/WSFE se comunica desde backend privado/Edge/worker.
Antes de solicitar instalación: entregar HEAD/PR abierto-sin merge/master y Production sin cambios dentro del alcance verificado; tests/build/lint con hallazgos explícitos; permiso NC, intención, FECAESolicitar, FECompConsultar, pérdida de ACK, conciliación, resolución CAE y efecto comercial EXACTLY ONCE con evidencia; inventarios finales de SQL/Edge/secrets/flags (sólo nombres, nunca valores). No marcar DONE un contrato parcial ni ocultar lint previo. CODE REVIEW → GO/NO-GO explícito → SQL Staging → verificación DB → Edge → secrets → flags → redeploy Vercel → E2E sin ARCA real → homologación autorizada. Este orden no concede autorización de instalar/activar/provisionar/emitir. No tocar Supabase/Vercel mientras se termina el bloque. Mantener versión instalada y código final concordantes; si difieren, detener aceptación. Production/merge/emisión mantienen gates específicos. Restore integral bloqueado y físicos/Point diferidos.


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

Inspección del siguiente paso: fiscalVoucherXml/fiscalReconciliation actuales limitan identidad a tipos1/6/11. No castear NC3/8/13 a factura para reutilizarlos. Adaptador de consulta NC debe validar explícitamente asociación al comprobante original (CbtesAsoc), concepto/receptor/fechas/importes/IVA/tributos/moneda y CAE/vencimiento contra cuerpo canónico reservado;602 sin comprobante contradictorio no concede automáticamente reenvío. Esta inspección no implementa ni acredita FECompConsultar NC.


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


### 25/10/2026 — En curso: conexión HTTP privada de consulta NC
Acción CONCILIAR_NC con sobre cerrado de seis campos y límite2KiB; consulta UUID ligada a venta/operación/caso/hash, sin actor/URL/cuerpo fiscal suministrable. Ensambla trabajador existente con custodia CONSULTA_NC y guard045 obligatorio/WSAA específico. Recuperación durable precede flag de consulta y acceso a secretos. No agrega permiso de emisión ni efecto comercial. Validación en curso; no instalado ni activado remotamente.


### 25/10/2026 — PR03: consulta NC conectada al endpoint privado, sin activación
Acción CONCILIAR_NC admite únicamente seis campos: acción, venta, operación original, caso, hash de propuesta y UUID de consulta; límite2KiB, sin actor/URL/credenciales/cuerpo enviados por cliente. Ensamblado con trabajador existente, custodia CONSULTA_NC bajo guard045 y WSAA específico. Recupera primero evidencia047 incluso con flag de consulta cerrado/custodia deshabilitada; nuevas consultas exigen flag privado existente. No agrega emisión ni efectos comerciales. Backend/proyecto/Auth vigentes siguen obligatorios.
Evidencia local:129 PASS HTTP (credit-consult-http-tests-v1.log),2 PASS SQL047 HTTP/509 omitidos por filtro (credit-consult-http-sql-v1.log). Recuperación por caso sin UUID original, ausencia de evidencia conserva409, cero acceso a claves/red en recuperación o gate cerrado, saldos intactos. Entradas extras/actor/URL/hash/UUID/límite rechazadas antes de Auth; error Auth sanitizado. Build/lint/diff/manifiesto bootstrap43 PASS; warning previo de chunks permanece. No nueva concurrencia ni suite SQL global511 acreditada. Sin secretos reales/ARCA autenticado/CAE real.
Siguiente: incidencias/conflictos durables y resolución de serie; completar envío NC042→FECAESolicitar y efecto comercial EXACTLY ONCE sólo después de CAE confirmado. SQL001–047/Edge/flags no instalados/activados remotamente por nosotros. CODE REVIEW y GO/NO-GO explícito con inventarios finales antes de instalación. PR03/PR02 parciales; master/Production sin cambios por este bloque, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — En curso: SQL048 conflictos durables NC
Conservar observación contradictoria y una incidencia inmutable en la misma transacción; mantener autorización original. DATOS_DISTINTOS también bloquea. Recuperación por caso prioriza conflicto y flags comerciales siguen false. Gate privado de ausencia de conflicto serializa con registro bajo lock de serie y revalida Auth tras espera; no acredita CAE ni permiso comercial. Resolución humana/serie y aplicación siguen pendientes. Validaciones en curso, sin instalación remota.


### 25/10/2026 — PR03: incidencias NC durables y bloqueo preparado (SQL048)
048 conserva observación contradictoria e incidencia privada/inmutable en la misma transacción sin reemplazar CAE original. DATOS_DISTINTOS también crea incidencia aun sin CAE previo. GET por caso prioriza CONFLICTO_NC_NO_APLICAR; histórico conserva receipt original y una observación posterior coincidente no borra el conflicto. Trabajador/validador/HTTP admiten el estado explícito, siempre con emisión/reintegro/reposición false. Ninguna resolución automática ni liberación de serie.
Gate exigir_nc_sin_conflictos_homologacion requiere trabajador privado/READ COMMITTED/original Auth/intención, toma lock de serie y revalida identidad tras espera. Futura aplicación comercial debe mantenerlo dentro de su transacción junto a sus restantes precondiciones: ausencia de incidencia NO es autorización CAE/negocio. Registro revalida Auth después de lock. SDK sigue60 RPC, sin exponer gate nuevo ni ampliar acciones HTTP. Tablas/columnas privadas con RLS/ACL cerradas y trigger inmutable; futuras copias privadas deben incluir fiscal_nc_conflictos_homologacion.
Evidencia:148 PASS/2archivos HTTP/receipt (credit-conflicts-tests-v1.log),21 PASS SQL enfocados/500 omitidos por filtro (credit-conflicts-sql-v1.log), instalación048 dos veces por fixture y rollback. Conflicto sin reemplazo, replay/UUID alterado, rollback, DATOS_DISTINTOS, no borrado por observación posterior, Auth ajena/ACL/inmutabilidad, HTTP histórico con flag/custodia cerrados sin claves/red, worker con CAE concurrente sintético y efectos comerciales intactos. PostgreSQL17.11 nativo166 PASS/salida0 (credit-conflicts-native-v1.json/.log),163 anteriores y3 tras048 instalado dos veces: CAE contradictorio esperando queda durable, gate esperando conflicto confirmado rechaza55000, rollback no deja bloqueo fantasma. Contenedor propio kiosko-pr03-local-82eec6b9 detenido/datos conservados;0solicitudes externas/emisiones. Build/diff/manifiesto bootstrap43 PASS; lint sin errores con warning finally previo del runner, Vite conserva aviso de chunks. Símbolos privados ausentes del bundle. Suite SQL completa521 PASS/1archivo/salida0,603s (credit-conflicts-full-sql-v1.log); incluye los21 enfocados, no sumarlos como casos únicos. Baseline conserva instalación por fases, no afirmar todos los tests anteriores bajo048.
Siguiente: contrato/evidencia explícitos de resolución de incidencias y serie; completar envío042→FECAESolicitar/ACK perdido/conciliación y efecto comercial EXACTLY ONCE después de CAE. No confundir incidencia registrada con incidencia resuelta, ni ausencia de conflicto con autorización de aplicación. SQL001–048/Edge/flags no instalados/activados remotamente por nosotros. Sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production; CODE REVIEW/GO-NO-GO/inventarios finales antes de instalación. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — En curso: XML/transporte NC bajo ACK042
Preparar FECAESolicitar NC3/8/13 desde043/cuerpo037 reconstruidos, asociación completa explícita, identidad TA y consumo042 con nuevo_envio=true antes del único fetch. Replay/ACK perdido nunca concede red. Respuesta de envío sólo candidata, exige FECompConsultar/diario posterior. Manual ARCA v4.0 p68/código10241 confirma que PES omite CanMisMonExt; corregir serializador previo también. WSDL público no recuperable mediante navegador, no declarar aceptación de esquema hospedado. Sin endpoint/SDK/activación de emisión ni uso de credenciales reales.


### 25/10/2026 — PR03: XML/transporte NC preparado bajo ACK042 original
Adaptador privado FECAESolicitar NC3/8/13 reconstruye fuente043/cuerpo037 contra factura original/propuesta, verifica TA por entorno/wsfe/CUIT/credencial/certificado y serializa asociación completa (tipo/PV/número/CUIT/fecha), períodos, IVA/tributos y decimales explícitos. Captura entrada/TA antes de awaits, endpoint/SOAPAction fijos y transporte exclusivo de envío separado de consulta/numeración. Deadline padre acota validación/ACK/red/stream; sólo un fetch, sin retry. Callback privado consumeIntent debe ejecutar POST042 real; exige ACK cerrado ligado al cuerpo/actor/reserva/revisión/permiso con nuevo_envio=true. GET/replay false, ACK perdido/error y revocación no conceden red. El validador no acredita por sí solo procedencia SQL del callback: ensamblaje del worker seguro sigue pendiente.
Decodificación SOAP compartida conserva validación específica de factura y admite expectativa NC reconstruida, sin ampliar identidad de factura a NC. Resultado A/R/incierto devuelve sólo candidato/códigos/puedeReenviar=false, nunca CAE/XML/Token/Sign ni permiso comercial. Una respuesta A exige FECompConsultar completo/diario antes de confirmar; rechazo o timeout tampoco autorizan reenvío ni liberan serie. No aplicación caja/stock.
Corrección relacionada: factura y NC en PES omiten CanMisMonExt, conforme manual ARCA v4.0 p68/código10241. No modifica cuerpos/hash persistidos; corrige serialización de protocolo. Fuentes públicas consultadas: https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf y https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECAESolicitar . WSDL no recuperable por navegador (500/502), no se declara validación de esquema hospedado ni consulta autenticada.
Evidencia local:328 PASS/6archivos (credit-emission-tests-v2.log),123 PASS/2archivos trabajador previo de factura/XML (credit-emission-regression-v1.log),4 PASS transporte042SQL/521 omitidos por filtro (credit-emission-sql-v1.log). Fixture SQL usa042 real con permiso/revocación/ACK perdido/replay y transporte sintético; en envío normal existe intención antes de fetch y segunda invocación no repite, saldos comerciales intactos. Pruebas cubren NC3/8/13/períodos, TA/cuerpo alterado, identidad/permiso/revisión de ACK, abort/expiry/deadline, rechazo/incierto/HTTP/SOAP/DTD/duplicados/CAE inválido, acciones separadas y mutación posterior sin cambio de XML. No sumar ejecuciones históricas solapadas. Build/lint/diff/manifiesto bootstrap43 PASS; aviso Vite previo de chunks permanece. Símbolos privados ausentes del bundle. Sin cambios SQL ni nueva concurrencia;166 anteriores y suiteSQL521 del commit anterior no acreditan ejecución global525 actual.
Siguiente: trabajador NC completo Auth/flag privado/recuperación previa→fuente043/TA044→último autorizado→POST042→este transporte→consulta045/046/diario047/048. Falta durable de respuesta/rechazo, resolución de incidencias/serie y efecto comercial EXACTLY ONCE tras CAE. No hay nueva acción HTTP de emisión ni ampliaciónSDK60, flags/secretos nuevos activados, instalación remota, ARCA autenticado/CAE real, Supabase/Vercel, merge/master/Production. SQL001–048/Edge/flags siguen sin instalar/activar remotamente por nosotros; gate final CODE REVIEW/GO-NO-GO/inventarios antes de instalar. PR03/PR02 parciales; restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — En curso: trabajador NC de envío y recuperación
Orquestar Auth original/cuerpo037/intención042 antes de secretos, flag privado de envío cerrado, fuente043/TA044/último autorizado/POST042 ACK original→transporte. Ante cualquier incertidumbre, recuperar intención y conciliar045/046/047/048 sin reenviar. Segunda verificación Auth del trabajador de consulta exige mismo actor original y señal padre. No cambia instalación remota ni habilita emisión. Diario de candidato/rechazo, resolución de serie/incidencias y aplicación comercial siguen pendientes.


### 25/10/2026 — PR03: trabajador NC privado preparado, recuperación antes de envío
Nuevo emitFiscalCreditOperation verifica Auth, fija actor original y reconstruye representación/propuesta/cuerpo037. Lee intención042 antes de flag de envío/TA/secretos: existente nunca autoriza otro POST. Envío nuevo requiere ARCA_HOMO_CREDIT_SEND_ENABLED=true exacto (default cerrado/no activado), fuente043 bajo guard actual, TA044 con factory/custodia guardada, último autorizado autenticado con TA ligado y consulta vigente, nuevo POST042 bajo locks y ACK original→transporte. Captura dependencias/identidades; fallo/ACK perdido/SOAP incierto pasa sólo a recuperación y consulta, nunca retry de emisión. Flag cerrado tras consumo deja intención sin fetch. Deadline60s encadena abort hacia numeración/transporte/consulta.
Después de intención, consulta045/046/047/048 mediante trabajador existente. Ese trabajador verifica Auth nuevamente y exige mismo actor capturado antes de esperar; ninguna fase infiere Auth desde perfil. No se evita Auth con cliente sintético de producción: pruebas usan Auth remoto simulado. Consultas durables/autorización/conflicto se recuperan antes de claves/flags de trabajo. Si consulta/GET no queda confirmado, sólo devuelve intención histórica ENVIO_INCIERTO con emisión/reintegro/reposición false; no descarta la fila. SDK privado63 RPC (60 anteriores+fuente043/TA044/POST042), sin RPC genérico de emisión/verificación de permiso ni acción HTTP nueva. Factory real de custodia sigue dependencia privada; ensamblaje HTTP de envío/activación no realizado.
Evidencia:327 PASS/7archivos (credit-emission-worker-tests-v3.log),13 PASS integración SQL/525 omitidos por filtro (credit-emission-worker-sql-v2.log). SQL041–048 local/TA y transporte sintéticos: envío normal y segunda invocación con un solo FECAESolicitar; respuesta de envío perdida recupera consulta; ACK042 perdido no envía; intención previa consulta aun con envío cerrado; histórico con custodia/ambos flags cerrados sin claves/red; revocación tras numeración impide intención; segundo Auth distinto no consulta; consulta fallida devuelve pendiente; ACK/GET durable perdidos se recuperan sin repetir emisión; cuerpo alterado y flag cerrado tras consumo no envían. RPC siempre con actor original y saldos comerciales intactos. Unitarios cubren Auth60s, mutación del actor esperado durante espera y aborto padre sin RPC/red. Ejecuciones v1/v2 previas solapadas no sumar. Buildv2/lintv2/diff/manifiesto bootstrap43 PASS; aviso Vite previo de chunks permanece. Símbolos privados ausentes del bundle. Sin cambios SQL ni nueva concurrencia;166 carreras previas y suiteSQL521 anterior no acreditan global538 actual.
Pendiente: diario durable de candidatos/rechazos (worker aún no guarda el candidato FECAESolicitar), resolución de incidencias/serie, aplicación comercial EXACTLY ONCE tras CAE, interfaz/ensamblaje controlado de envío, aceptación hospedada JWT/RLS/TA/ARCA real. Reutilizar UUID de consulta recupera esa observación; una consulta nueva requiere identidad explícita nueva, nunca otro intento de envío. No se declaran cerrados NC send/robustez fiscal ni gate final. SQL001–048/Edge/flags no instalados/activados remotamente por nosotros; sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production. CODE REVIEW/GO-NO-GO/inventarios finales antes de instalación; PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — En curso: SQL049 diario de candidatos NC
Respuesta candidata por intención única, cerrada/inmutable/privada y ligada a cuerpo/Auth/caso; códigos sin SOAP/CAE/credenciales. Replay antes de vigencia, Auth revalidada tras lock de serie, recuperación independiente de custodia/flag. No convierte rechazo en permiso de reenvío ni aprobación en CAE. Integrar worker para guardar candidato antes de conciliación y validar recuperación. Sin instalación/activación remotas.


### 25/10/2026 — PR03: respuestas candidatas NC durables preparadas (SQL049)
049 agrega fiscal_nc_respuestas_envio_homologacion privada/RLS/ACL de tabla y columnas cerradas incluso service_role, con trigger inmutable. Una respuesta por caso/intención, ligada a Auth original/cuerpo/hash. Sobre cerrado conserva recibido_en y candidato/códigos numéricos, sin SOAP/CAE/credenciales. Registra sólo tras intención042, READ COMMITTED y lock de serie, revalidando Auth después de esperar. Replay exige observación original exacta y ocurre antes de vigencia; otro contenido no reemplaza historia. Getter recupera sin permiso/custodia aún vigentes, pero exige Auth original activo. Null no prueba que no hubo emisión ni permite reenviar.
Trabajador guarda candidato FECAESolicitar antes de conciliación, ignora ACK como prueba y valida GET049. Recuperación de intención valida también el diario si existe antes de consultar. ACK perdido recuperable sin repetir POST; GET perdido mantiene incertidumbre y siguiente llamada recupera sin emitir. Diario alterado bloquea recuperación. Ausencia de candidato después de pérdida de respuesta no se rellena ni simula: intención y consulta completa siguen siendo vías de recuperación. Aprobación candidata no crea autorización047, rechazo/SIN_CONFIRMACION no concede reenvío/libera serie; flags comerciales false. SDK65 RPC (63+GET/registro049), sin nuevas acciones HTTP/flags/secretos.
Evidencia local:332 PASS/7archivos (credit-send-responses-tests-v2.log),38 PASS SQL enfocados/525 omitidos por filtro (credit-send-responses-sql-v2.log). Incluye16 escenarios del worker y22 de049: A/R/incierto, replay/otro contenido, rollback, custodia/permiso cerrados, identidad/fechas/códigos/sobres inválidos, ACL/inmutabilidad/otro actor/ausencia de intención; ACK/GET candidato perdidos y diario alterado, saldos intactos/sin CAE por candidato. Ejecuciones v1 solapadas no sumar. PostgreSQL17.11 nativo169 PASS/salida0 (credit-send-responses-native-v1.json/.log),166 anteriores y3 tras049 instalado dos veces: dos workers/misma respuesta unregistro/sinCAE, otra respuesta esperando rechaza22023 sin reemplazo, rollback sin respuesta fantasma. Contenedor propio kiosko-pr03-local-d5c29c2f detenido/datos conservados;0solicitudes externas/emisiones. Build/lint/diff/manifiesto bootstrap43 PASS; lint mantiene warning finally previo del runner, Vite aviso previo de chunks. Símbolos privados ausentes del bundle. No se acredita suite SQL global563 actual;521 anterior corresponde a otro HEAD/instalación por fases.
Siguiente: resolución explícita de incidencias/rechazos/serie y efecto comercial EXACTLY ONCE tras CAE, interfaz/ensamblaje controlado de envío y aceptación hospedada. Dump/restore privado autorizado debe incluir respuestas049 junto a intención/consultas/autorizaciones/conflictos; JSON de aplicación insuficiente y restore integral bloqueado. SQL001–049/Edge/flags no instalados/activados remotamente por nosotros; sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production. No se declara cerrado gate NC/fiscal ni PR03/PR02; CODE REVIEW/GO-NO-GO/inventarios finales antes de instalar, físicos/Point diferidos.


### 25/10/2026 — En curso: resolución autorizada de serie NC (SQL050)
Resolver sólo con intención/CAE047 exacto y sin conflicto conocido de toda la serie. Marcador privado histórico/inmutable sin aplicación comercial. Próxima reserva exige ausencia de pendientes, numeración vigente no anterior a máximo confirmado y nueva consulta; conflicto posterior en un caso histórico bloquea nuevas reservas/permisos/gate comercial aunque exista marcador. Rechazo/timeout/602 no libera numeración. Resolución de incidencias y rechazo definitivo sigue pendiente. Validaciones en curso, sin instalación remota.


### 25/10/2026 — PR03: resolución de numeración NC autorizada preparada (SQL050)
050 agrega marcador histórico privado/RLS/ACL/inmutable por caso/intención/reserva, derivado exclusivamente de autorización047 ligada al cuerpo037. No admite CAE/importe/identidad fiscal suministrados por cliente ni candidatos049 como autorización. Registro READ COMMITTED bajo lock de serie, Auth original revalidada tras espera y rechazo si cualquier caso de la misma serie tiene incidencia048. Getter/replay conserva marcador histórico con custodia/permiso cerrados, sin concesión comercial; conflicto posterior no borra historia.
Reserva036 actualizada por050: mantiene reserva/cuerpo histórico y sólo admite otro caso cuando no hay reservas sin resolución, no hay conflictos conocidos de serie y consulta de numeración es vigente/no anterior al máximo confirmado. No reutiliza números ni borra filas. Guard041 de permiso y gate048 previo a futura aplicación ahora comprueban conflictos de toda la serie; un conflicto histórico bloquea una reserva/permiso posterior aun si el caso original ya tiene marcador. Cancelación de NC numerada sigue prohibida. Rechazo/timeout/602 no libera serie y su corrección/resolución explícita sigue pendiente; no eliminar UNIQUE/reservas para sortearlo sin contrato de ocupación/auditoría alternativo.
Evidencia local:10 PASS SQL050/563 omitidos por filtro (credit-resolution-sql-v2.log), instalación050 dos veces por fixture. Exige CAE/no candidato, R/incierto/602 denegados, conflictos previos/posteriores, replay/rollback, custodia/permiso cerrados, Auth/ACL/helper interno/inmutabilidad y efectos comerciales intactos. Ensayo de dos casos parciales reales del mismo origen/serie: segundo bloqueado antes de resolver primero, Last anterior rechazado, CAE+resolución habilitan número24 después23, replay conserva24 y conflicto posterior bloquea permiso del segundo caso. PostgreSQL17.11 nativo172 PASS/salida0 (credit-resolution-native-v1.json/.log),169 anteriores y3 tras050 instalado dos veces: dos resolutores un marcador, conflicto confirmado mientras espera impide resolver y rollback sin marcador fantasma. Contenedor propio kiosko-pr03-local-e59bcfc8 detenido/datos conservados;0solicitudes externas/emisiones. Build/diff/manifiesto bootstrap43 PASS, lint sin errores con warning finally previo del runner; avisos Vite de chunks/timings previos. No suite SQL global573 acreditada; ejecución por fases no equivale a todo bajo050.
Siguiente: aplicación comercial EXACTLY ONCE tras CAE/resolución y sin conflicto, resolución explícita de incidencias/rechazos/corrección de numeración, servicio/interfaz controlados y aceptación hospedada. Marker RESOLUCION_NC_REGISTRADA_NO_APLICADA no es permiso actual de serie/caja/stock: los guards deben revalidarse dentro de cada transacción. SDK65/HTTP sin ampliar, nuevos RPC050 sólo preparados en SQL/service_role. Backup privado autorizado debe incluir resoluciones050 además de diarios previos; JSON de aplicación insuficiente/restore integral bloqueado. SQL001–050/Edge/flags no instalados/activados remotamente por nosotros; sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production. PR03/PR02 y gate final siguen abiertos; CODE REVIEW/GO-NO-GO/inventarios antes de instalar; físicos/Point diferidos.


### 25/10/2026 — En curso: preparación comercial NC (SQL051)
Precondición ejecutable para aplicación posterior en la misma transacción: CAE/resolución050/conflictos de serie actuales, comercio/capacidad habilitados, Dueño Auth original y caja abierta; contrastar fuentes030/031 con vínculo032 y derivar importes/receta/unidades originales, sin Auth spoofing ni catálogo actual como receta. No aplica efectos ni entrega permiso reutilizable fuera de transacción. Siguiente mutación requiere diario exactly once, reposición costos/lotes y adaptar exclusión010/historia común para NC verificadas; no relajar devoluciones comunes. Validaciones en curso.


### 25/10/2026 — PR03: preparación comercial NC bajo locks (SQL051)
051 prepara, sin aplicar, el contrato que usará la mutación comercial: resolución050/CAE/cuerpo exacto, conflicto actual de toda la serie, Dueño ordinario activo/Auth original, comercio activo/capacidad DEVOLUCIONES_EFECTIVO y caja abierta del mismo comercio. Contrasta fuentes030/031 con vínculo032/canónicos/hashes y deriva importes, cantidades y receta originales. No obtiene receta ni precio de venta del catálogo actual; comprueba compatibilidad actual de unidades/stock de cada físico y rechaza un componente convertido en combo. Devuelve PLAN_NC_SIN_APLICAR y flags false, sin permiso reutilizable fuera de la transacción. No suplantación de Auth ni efectos de caja/stock/lotes/costos.
Evidencia:13 PASS SQL051/573 omitidos por filtro (credit-commercial-plan-sql-v2.log): derivación/replay sin mutaciones, suspensión/capacidad/caja cerrada/ajena/Auth/conflicto/unidad/virtual/stock unitario fraccionado, roles y caja original cerrada con reintegro en otra caja; precio actual999 no altera importe histórico124. Regresión92 PASS/2archivos (credit-commercial-plan-regression-v1.log), facturas y devolución común con todos los SQL hasta051; fixture de factura instala dependencias comerciales reales/suscripción, no excluye051 para aprobar. PostgreSQL17.11 nativo175 PASS/salida0 (credit-commercial-plan-native-v3.json/.log),172 anteriores y3 tras gates/051 instalados dos veces: cierre de caja, suspensión comercial y producto convertido en combo durante espera impiden plan, sin devolución. Contenedor propio kiosko-pr03-local-5b176512 detenido/datos conservados;0solicitudes externas/emisiones. v1/v2 nativos fallaron en fixture (caja original030 NOWAIT y unicidad de caja abierta por comercio); se corrigió a turno original cerrado+caja de reintegro nueva, sin debilitar controles SQL. Contenedores fallidos también detenidos/datos conservados. No sumar ejecuciones solapadas.
Buildv2/lintv2/sintaxis runner/manifiesto bootstrap43/diff PASS; lint conserva warning finally previo, Vite avisos previos. No suite SQL global586 acreditada ni aceptación JWT/RLS hospedada. SDK65/HTTP sin ampliar;051 requiere módulos comerciales/capacidades, instala con capacidades cerradas por defecto (sólo fixtures sintéticos habilitados).
Siguiente necesario: mutación comercial exactamente una vez en la misma transacción que vuelva a ejecutar051, con diario privado, reintegro, reposición contra EGRESOS originales y costos/lotes, confirmación/rollback/ACK perdido. Adaptar exclusión010 y fuentes027/030 para distinguir sólo devoluciones fiscales enlazadas a ese diario de devoluciones comunes; no bypass por flags/GUC ni por rol. El flujo común sigue bloqueando ventas fiscalizadas hasta ese circuito. Resolución de incidencias/rechazos, servicio/interfaz controlados y aceptación real pendientes. SQL001–051/Edge/flags sin instalar/activar remotamente por nosotros, sin Supabase/Vercel, secretos reales, ARCA autenticado/CAE real, merge/master/Production; gate final abierto, CODE REVIEW/GO-NO-GO/inventarios antes de instalar. Restore integral bloqueado y físicos/Point diferidos.


### 25/10/2026 — En curso: aplicación comercial NC atómica (SQL052)
Diario privado por caso/cuerpo/caja y reposiciones originales, efectos y cabecera común en una transacción. Recalcular051 bajo locks; recuperación previa a gates de trabajo/caja abierta. Excepción010 sólo por diario privado ligado a cabecera, sin GUC/rol genérico; fuentes027/030 reconocen exclusivamente ese historial. Reposición histórica compartida con flujo común para costos/lotes; preservar Auth real de cada caller. Validar ACK perdido/rollback/concurrencia y regresiones completas antes de publicar; sin instalación/activación remotas.

### 26/10/2026 — SQL052: recuperación y rollback local, gate abierto
Cambios locales sin publicar: el ensayo carga costo40 antes del checkout para capturar evidencia histórica real; costo ausente sigue bloqueado. Helper compartido conserva rechazo READ COMMITTED. La cabecera común admite únicamente INSERT enlazado al diario privado y Dueño/Auth original activo, sin suplantar auth.uid(), GUC ni bypass genérico por rol. GET de aplicación durable verifica actor original activo/ordinario y alcance del diario sin exigir comercio/capacidad/caja vigentes; no concede nueva aplicación.
Evidencia: credit-application-sql-v9.log,12 PASS/586 omitidos por filtro(598totales): ACK perdido/replay, caja original inmutable, suspensión posterior, rollback explícito, capacidad/conflicto/caja/costo ausente, ACL3roles/helper privado, fallo tardío de caja revierte stock/historia/journal, actor ajeno/inactivo rechazado. credit-application-regression-v2.log:92 PASS/2archivos. Versiones anteriores fallaron por fixture sin costo, mensaje de aislamiento, trigger común Auth y lectura de intención ligada a comercio activo; se corrigieron sin relajar nueva aplicación051. Fallos v7/v8 de fixture multi-command se corrigieron separando sentencias. Manifiesto bootstrap43 y diff PASS. No suite global598 ni concurrencia nativa052 acreditadas.
Pendiente antes de publicar/cerrar bloque: concurrencia PostgreSQL052, costos/lotes/combos/parciales adicionales, inventarios finales e integración controlada; build en ejecución al registrar esta entrada. HEAD publicado d260b20; SQL052 no comprometido. Sin instalación remota, ARCA autenticado/CAE, secretos, merge/master/Production. Baseline pre-fiscal provisto por usuario se conserva como evidencia del usuario, no verificación remota nueva. Gate CODE REVIEW/GO-NO-GO permanece abierto.
Cierre de comprobaciones locales del turno: build PASS (credit-application-build-v1.log, exit0); oxlint archivos de pruebas modificados PASS sin diagnósticos (credit-application-lint-v1.log). Concurrencia nativa052 y revisión integral siguen pendientes; no publicar todavía.

### 26/10/2026 — SQL052 aplicación comercial NC local verificada; gate remoto abierto
SQL052 añade diario inmutable por caso/cuerpo/Auth/caja y vínculos de reposición, FK diferida a cabecera común, reintegro de caja y reposición de stock/costo/lote en la misma transacción. Recalcula051 bajo locks; replay devuelve resultado durable sin repetir efectos. La recuperación exige Dueño original activo/ordinario pero no nueva elegibilidad comercial ni caja abierta. Exclusiones010/029 sólo permiten INSERT enlazado al diario privado y actor original; no auth.uid() suplantado, GUC ni bypass de rol. Fuentes027/030 reconocen exclusivamente esas devoluciones enlazadas, preservando exclusión de factura original y devoluciones comunes.
Evidencia local: credit-application-sql-v13.log:16 PASS/586 omitidos por filtro(602totales); ACK perdido, rollback, falla tardía, ACL3roles, Auth activo original, diario/cabecera inmutables, costo original40 pese a actual999, helper de lote agotado reactivado con0.125, y dos NC parciales0.250+0.250 de62+62 aplicadas sin duplicados/saldo doble. El ensayo de lote es del helper interno; no acredita por sí solo UI fiscal/lotes hospedados. credit-application-regression-v3.log:92 PASS/2archivos (flujo común y worker factura con052 instalado). No suite global602 acreditada.
credit-application-native-v3.json:178 PASS PostgreSQL17.11,175 previos+3 después de052 instalado dos veces: dos appliers un ACK/stock/caja, rollback del primero con waiter que aplica una vez, error tardío de caja revierte todo y reintento único. Datos sintéticos, no JWT/RLS hospedado ni emisión ARCA;0solicitudes externas/0emisiones. Contenedor kiosko-pr03-local-8d1c4112 detenido/datos conservados. v1/v2 fallaron en fixtures (lectura directa RLS no devuelve caja y costo histórico ausente); se corrigió pasando caja explícita y capturando costo antes de la salida, sin ampliar ACL ni fallback de costo. Los contenedores fallidos también detenidos.
SDK65/HTTP aún sin acción de aplicación; servicio/contrato de respuesta e integración controlada siguen pendientes, además de aceptación hospedada y primer CAE autorizado. SQL001–052 y Edge no instalados remotamente por nosotros. Revisión final/inventarios/CODE REVIEW/GO-NO-GO antes de instalación; master/Production intactos. Restore integral bloqueado; impresora/cajón/Point diferidos. Este avance cierra evidencia local SQL052, no PR03/PR02 ni Production Readiness global.
Comprobaciones finales SQL052: buildv3 PASS/salida0; lintv3 sin errores con warning finally previo del runner; node --check, manifiesto bootstrap43 y diff PASS. Símbolos privados de aplicación ausentes de dist/assets. No se suman suites solapadas ni se atribuye suite global602.


### 26/10/2026 — En curso: servicio privado de aplicación NC
Contrato cerrado de ACK052 y servicio Auth original: recuperar antes del flag de trabajo, comprobar cuerpo/intención/CAE local, resolver050 y aplicar052, recuperando por GET tras ACK perdido. Sin transporte ARCA ni HTTP público nuevo; extender allowlist SDK sólo a4RPC050/052. Pruebas de servicio/SQL y contratos en curso, no publicar sin verificar.

### 26/10/2026 — Servicio privado aplicación NC y ACK cerrado (validación local)
applyFiscalCreditCommercialOperation verifica JWT mediante Auth una vez y captura scope/actor esperado antes de awaits. GET052 antes del flag de trabajo recupera ACK durable aun con comercio/caja suspendidos; no transporta ARCA ni solicita TA/credenciales. Trabajo nuevo requiere ARCA_HOMO_CREDIT_APPLY_ENABLED=true exacto (privado, default cerrado/no activado), backend/proyecto Staging fijo vigentes, representación/propuesta/cuerpo/intención exactos y autorización047 sin conflicto. Registra resolución050, ignora ACK y valida GET con CAE/cuerpo/serie/número/intento/consulta/reserva; después aplica052 y confirma únicamente por GET. Error o ACK perdido conserva incertidumbre recuperable sin POST de emisión/reintento automático. Cancelación/deadline45s limita Auth/RPC; resultado no entrega permiso para otro efectivo.
validateFiscalCreditCommercialApplication exige forma cerrada, IDs/caja/hash, importes/cantidades finitos en precisión fija, suma de detalles, ausencia de duplicados, flagsfalse y copia profundamente congelada. En trabajo nuevo contrasta cuerpo/propuesta; recuperación histórica confía en el alcance/Auth que SQL052 verifica sobre diario inmutable, sin reconstruir desde catálogo. SDK65→69: sólo GET/POST050 y GET/POST052 adicionales; HTTP público sin acción nueva.
Evidencia: credit-commercial-worker-sql-v2.log:28 PASS/586 omitidos por filtro(614totales),16SQL052+12modos de servicio real PGlite (Auth sintético): normal, ACK resolución perdido, ACK aplicación perdido/error, GET final perdido, flag cerrado/tras resolución, conflicto, Auth ajeno, recuperación suspendida y resolución/aplicación alteradas. credit-commercial-contract-v1.log:95 PASS/3archivos (ACK cerrado, SDK fijo, abort/inputs/actor esperado/scope capturados/error sanitizado). Sin sumar suites solapadas ni suite global614 actual. Build RTK v2 y lintv2 PASS; Vite chunk warning previo. Manifiesto bootstrap43 y diff PASS; símbolos del servicio/flag/RPC ausentes de dist/assets. SQL052 no cambió: evidencia nativa178 del commit69d75a8 sigue aplicable a la mutación, no acredita JWT/HTTP hospedados.
Pendiente integrar acción controlada/interfaz/recuperación y resolución de incidencias/rechazos, inventario final/revisión GO-NO-GO y aceptación hospedada antes de primer CAE autorizado. Ninguna instalación/flag remoto, secretos reales, ARCA autenticado, merge/master/Production. Restore integral y físicos/Point conservan gates/diferidos.
Regresión adicional del fixture con opción de resolución: credit-commercial-prior-sql-v1.log23 PASS SQL050/051,591 omitidos por filtro(614totales). Default conserva resolución previa; modo de servicio false acredita creación050 real. Sin nuevo SQL ni cambios en gates remotos.


### 26/10/2026 — En curso: HTTP y cliente durable de aplicación NC
Separar APLICACION_NC sólo lectura de APLICAR_NC explícita, identidades/caja sin importe/Auth suministrados por cliente, recuperación antes de flags de nueva mutación. Cliente con pendiente por Auth/comercio/venta/caso/hash/caja y exclusión Web Locks inyectada, GET como única confirmación, reintento explícito conserva identidad. No conectar UI ni habilitar remoto antes de validar contratos/roles/fallos. Pruebas en curso.

### 26/10/2026 — HTTP/cliente de aplicación NC verificados localmente
APLICACION_NC es sólo lectura con5campos (acción,venta,operación,caso,hash); recupera caja original desde diario, sin requerir caja actual/flag APPLY/custodia. APLICAR_NC exige además sesion_caja_id explícita (6campos); no acepta importes, CAE, Auth ni parámetros de decisión del navegador. Ambos respetan parser estricto/límites/CORS/backend Staging y Auth verificado. Request.abort llega al servicio; no nueva acción de emisión ARCA. El flag privado APPLY sólo se evalúa para trabajo nuevo, permitiendo replay de aplicaciones confirmadas con flag cerrado.
credits.commercial integra status/apply/recover/retry y pendiente sólo de IDs/hash/caja, separado por Auth/comercio/venta, usando exclusión inyectada del cliente fiscal. Consulta historial sin caja elegida; confirma exclusivamente por GET validado y mismo comercio, nunca ACK. GET fallido no provoca POST automático; retry explícito conserva caso/hash/caja y revalida bloqueos después de esperar. Storage fallido impide envío. Pendiente comercial bloquea guardado/cancelación/preparación/revisión/numeración NC; recuperación no entrega permiso de nuevo efectivo.
Evidencia: credit-commercial-http-sql-v1.log17 PASS/743 omitidos por filtro(760totales entre3archivos), incluidos4 recorridos cliente→HTTP→PGlite con Auth sintético: ACK HTTP perdido, consulta/replay tras suspensión/cierre/flagoff, lectura ausente sin mutación y Cajero rechazado. credit-commercial-http-regression-v2.log243 PASS/7archivos: HTTP, cliente comercial/común/preparación, worker, panel casos y documento. Última revalidación de bloqueo posterior a GET: credit-commercial-client-final-v1.log10 PASS/1archivo; se solapa con regresión, no sumar. Dos clientes con storage/cola compartidos son simulación local, no prueba de ventanas/Web Locks hospedados. Buildv1 falló porque2mocks antiguos no incluían nuevo contrato; se agregaron mocks tipados, sin casts/bypass. Buildv2 PASS previo al último guard; buildv3 final en comprobación. Lintv2 sin diagnósticos, manifiesto bootstrap43/diff PASS.
Sin cambios SQL/SDK69 ni flags remotos; evidencia nativa178 de SQL052 conservada sin atribuirla a nuevo HTTP/Auth hospedado. Interfaz de aplicación todavía sin renderizar: siguiente bloque debe mostrar estado real por caso y recuperar pendientes sin presentar borrador/revisión como CAE, con confirmación explícita/caja real antes de solicitar aplicación. No declarar PR03/PR02 completos. Instalación/aceptación hospedada/inventarios/GO-NO-GO y CAE autorizado siguen pendientes; master/Production/secretos reales/ARCA autenticado intactos, restore integral bloqueado y físicos/Point diferidos.
Cierre final HTTP/cliente: build RTKv3 PASS/salida0 después del último guard/test; lintv2 sin diagnósticos. Símbolos de workers/flag privado/RPC052 ausentes de dist/assets. Aviso Vite chunk previo. No suite global completa ni aceptación hospedada acreditadas.


### 26/10/2026 — En curso: interfaz de aplicación y recuperación NC
Panel comercial por caso: consulta explícita sin escrituras, caja del comercio y confirmación renovada para aplicar/reintentar, pendiente original recuperable sin caja actual, y estado positivo sólo tras ACK durable validado. Estado de borrador ya no se afirma como sin emitir; ocultar preparación/cancelación tras aplicación confirmada. Flag VITE_KIOSKO_ARCA_APLICACION_NC_HOMO subordinado a casos/revisión/strict y default cerrado, sin activación remota. Pruebas UI/contratos en curso.

### 26/10/2026 — Interfaz aplicación/recuperación NC local preparada
FiscalCreditCommercialPanel consulta sólo por decisión explícita, sin llamada automática al montar. Ausencia de aplicación no se presenta como CAE. Solicitud nueva requiere consulta previa, caja abierta del mismo comercio y checkbox explícito; fallo conserva pendiente y exige confirmar nuevamente para retry original. Recuperación no exige caja actual; doble clic bloqueado y respuesta de un componente desmontado/caso anterior ignorada. Receipt validado por forma/identidad/comercio/importe antes de mostrar éxito; pendiente ilegible bloquea escrituras. La interfaz no concede autoridad fiscal: servicio/SQL siguen revalidando todo.
FiscalCreditCasesPanel elimina afirmaciones genéricas de sin emitir/sin aplicar de un borrador histórico: muestra estado sin consultar hasta lectura positiva; luego oculta preparación/cancelación/solicitud comercial de ese caso y advierte no repetir reintegro. Banner de pendiente puede recuperar sin cargar representación/historial, conservando caso/caja. POS→Historial→Documento→Casos conecta callback posterior a confirmación: vuelve a leer productos, resumen de caja e historial, sin ajustar cantidades/importes optimísticamente ni llamar al sincronizador de cierre de caja. Error del refresco no revierte el hecho confirmado ni dispara otra aplicación.
Nuevo flag público VITE_KIOSKO_ARCA_APLICACION_NC_HOMO requiere además strict/revisión/casos; default ausente/false y no activado remotamente. No sustituye ARCA_HOMO_CREDIT_APPLY_ENABLED privado ni privilegios SQL. Sin cambios SQL001–052/SDK69/HTTP.
Evidencia credit-commercial-ui-regression-v6.log135 PASS/8archivos (panel nuevo/casos/documento/preparación/revisión, cliente comercial, gates e historial): no llamadas al montar, consulta no acredita CAE, confirmación/caja válida, error/retry explícito, recuperación sin caja/historia, doble clic, respuesta tardía al cambiar caso, importe inválido, storage ilegible, flags compuestos, ocultamiento de mutaciones después de ACK y fallo de refresco conserva confirmación. v1 falló por matcher jest-dom no instalado y texto histórico esperado; se corrigieron assertions DOM/textos, sin agregar dependencia ni debilitar controles. v2/v3/v4/v5 se solapan; no sumar ejecuciones. Lint inicial introdujo avisos de inicialización en efectos, corregidos con estado inicial perezoso y guard de vida capturado. Lintv3 sin errores con3avisos previos en efectos de Historial/POS (fuera de líneas cambiadas); panel nuevo sin avisos. Build RTKv3/salida0, manifiesto bootstrap43/diff PASS; símbolos privados worker/flag APPLY/RPC052 ausentes de dist/assets. Aviso Vite chunk previo.
No acreditar validación visual real, JWT/RLS/ventanas hospedadas ni suite global completa. Siguiente: completar integración controlada de estado/conciliación/envío NC e incidencias/rechazos, inventarios/revisión GO-NO-GO y aceptación hospedada/visual antes de primer CAE autorizado. No instalación/flags remotos, secretos reales, ARCA autenticado, merge/master/Production; restore integral bloqueado y físicos/Point diferidos. PR03/PR02 y objetivo global siguen abiertos.
### 26/10/2026 — Bloque único FINAL LOCAL CLOSURE solicitado por el titular
No publicar commits parciales ni entregar informes de piezas. Completar integración HTTP/envío/consulta/recuperación/incidencias/UI y verificación final/inventarios en este mismo bloque; sólo solicitar decisiones necesarias. Ninguna instalación remota, Vercel, activación, secretos reales, ARCA/CAE, merge/master/Production.
Checklist de cierre (no convertir en PASS por intención):
- [x] Envío HTTP estricto, permiso privado descubierto por servidor, intención existente nunca reemite; abort/ACK perdido.
- [x] UI durable de envío/consulta por caso/revisión/cuerpo/Auth, reload/doble clic/operación incompatible.
- [x] Rechazo/incertidumbre/conflicto/CAE diferenciados, no éxito por FECAESolicitar, recuperación047–050 y aplicación052.
- [x] Flags independientes/defaultcerrado y frontend subordinado.
- [x] Suite completa relevante final, SQL/concurrencia, build/lint/bundle/secret scan.
- [x] Inventario SQL/Edge/secrets(sólo nombres)/flags, prerrequisitos, instalación/verificación/activación/rollback.
- [x] Informe final único con evidencia/limitaciones, PR Draft/master/Production y remoto NOT DONE.
Hallazgo de integración: permiso041 es privado e inmutable, pero no hay RPC para descubrir el permiso elegible desde revisión/cuerpo. No inventar UUID ni exponer tabla/grant: añadir helper SQL053 de lectura privada que selecciona una única autorización existente y llama al verificador041; no crea/habilita permisos. El inventario final debe reflejar053 en vez de congelar artificialmente la lista en052. Provisionamiento privado sigue gateado.
### 26/10/2026 — Bloque final local en integración, aún sin cierre ni publicación
Se conectan ENVIAR_NC y ESTADO_ENVIO_NC al HTTP privado con DTO cerrado, permiso descubierto sólo en servidor mediante SQL053 (sin grant/creación), y propagación de cancelación. Cliente durable guarda sólo IDs/hash y conserva identidades de intento/consulta; POST no prueba éxito. UI separa envío, lectura histórica, nueva consulta, incertidumbre, rechazo, conflicto, CAE y aplicación. Flags públicos de envío/consulta independientes, subordinados a strict/revisión/casos; privados conservan autoridad. Renovación explícita de revisión sólo del mismo cuerpo pendiente, sin reemplazar intento ni consulta.
Evidencia parcial: transporte/contratos273 PASS4archivos en primera regresión; estado/servicio/cliente56 PASS3archivos y ampliación incidencias62 PASS4archivos; UI/regresión99 PASS5archivos; SQL0538 PASS/618 skipped; worker lookup/ausencia/abort3 PASS/626 skipped; UI/HTTP156 PASS4archivos tras corregir textos históricos; cliente/gates31 PASS2archivos. Ejecuciones solapadas: no sumar. PostgreSQL17.11 nativo180 PASS (178previos+2nuevos053), instalación053dosveces, revocación mientras espera, sin intención/envío; contenedor propio detenido/datos conservados,0peticiones externas/0CAE. Estos ensayos sintéticos no acreditan JWT/RLS hospedados.
Suite completa v1 sigue en ejecución; se inició antes de estabilizar textos y registró4fallos de expectativas antiguas en NumberPanel. La regresión enfocada posterior pasó, pero v1 no es evidencia final; ejecutar suite completa sobre versión estabilizada. Build integrado v5 PASS689módulos; lint cambiado sin diagnósticos, lintglobal sin errores con advertencias previas que deben inventariarse; diff/manifiesto bootstrap43 PASS. Patrón de secretos en27archivos cambiados sin hallazgos, no sustituye revisión manual ni escaneo del bundle final. Verificaciones finales/bundle/evidencia global siguen pendientes.
Inventario candidato con53SQL+hashes, Edgeexacta, nombres de secrets, flags privados/públicos y orden/prerrequisitos/rollback incorporado en docs/arca-homologacion.md; no plan duplicado. Revisión final/informe/commit único todavía pendientes. GitHub verificado: PR3abierto/Draft/no merge, remoto HEAD27b8b34 y base master03a798f. Masterlocal41bebe9 conserva reflog del15/10, no se modifica ni sincroniza por este bloque.
No instalar Supabase/Edge, Vercel, flags, secretos reales ni comunicaciones ARCA; sin CAE/merge/Production. Restore integral bloqueado, físicos/Point diferidos y tratamiento fiscal de envases pendiente de contador. PR02/PR03/Production Readiness global no cerrados.

### 26/10/2026 — Verificación final: aislamiento del ensayo y recorrido HTTP completo
La ejecución global v1 fue interrumpida deliberadamente después de sus4fallos conocidos de textos obsoletos y cambios de código posteriores; no era un resultado final ni se reinició por un mero timeout de observación. v2, ya con progreso detallado, detectó un timeout de infraestructura de5s en el worker NC integrado normal (10,293s observados) tras cientos de instalaciones DDL sobre una única instancia WASM; los casos posteriores heredaron transacción abortada. v2 se detuvo como FAIL/no acreditada; no convertir cascadas en fallos de negocio ni ocultar el primer error.
Corrección del harness: cada caso conserva BEGIN/ROLLBACK y las mismas assertions; reemplazar PGlite y reinstalar exactamente el baseline cada32casos libera DDL/recursos acumulados. Presupuesto de infraestructura de este archivo30s, limpieza/recreación120s, sin cambiar deadlines ni guards de producción. Suite final segmentada, sin exclusiones funcionales: todo fiscalPreparationSql (634casos) por separado y todos los otros305archivos en otra ejecución. Resultados terminales aún pendientes; no PASS por intención.
Nuevo recorrido integral cliente→HTTP→custodia cifrada sintética→lookup053→intención042→FECAESolicitar simulado→consulta047:1 PASS/633skipped. Perdió ACK HTTP y recuperó CAE sintético sólo por GET durable; nuevo send con flags cerrados no transporta ni reemite. Nunca se llamó ARCA real ni se usaron secretos reales. HTTP histórico4 PASS/629skipped acredita lectura con trabajo cerrado y rechazo de Cajero. Rechazo/conflicto/consulta incompleta se presentan separados; conflicto conocido bloquea solicitudes/retry comerciales en UI conservando recuperación histórica. Banner fiscal recupera sin representación/preparación/historial, con scope/hash originales; regresión final de esa interfaz38PASS3archivos.
Revisión visual local mediante navegador, componente y Modal reales en claro/oscuro con datos sintéticos y backend en memoria: ausencia→confirmación explícita→ACK perdido simulado→incertidumbre→consulta→CAE sintético separado de devolución comercial. Capturas fuera del checkout final-local-preview-light.png y final-local-preview-dark.png. No acredita ARCA, JWT/RLS hospedados, Web Locks reales entre terminales ni aceptación visual hospedada/móvil. Pestaña/servidor y3archivos temporales del ensayo retirados; sin cambios de preferencias del usuario ni entornos remotos.

### 26/10/2026 — Resultado final: candidato local para CODE REVIEW, sin GO remoto
Se completó el remanente local del bloque solicitado: envío privado controlado, consulta/conciliación, estados durables e incidencias, recuperación de interfaz y aplicación comercial exactamente una vez. No equivale a Production Readiness ni a aceptación hospedada. El rechazo conserva la intención/numeración y bloquea reenvío; no se habilita corrección destructiva ni reemisión automática. El conflicto bloquea nueva aplicación y permite leer/recuperar lo históricamente registrado.

| Gate del cierre local | Resultado y evidencia |
| --- | --- |
| Flujo HTTP NC / permiso privado / intención042 | PASS; SQL053 sin creación/grant, SDK70, DTO cerrado, integración cliente→HTTP→custodia sintética→SQL |
| FECAESolicitar y conciliación FECompConsultar | PASS local sintético; candidato no acredita CAE,047/048 prueban el estado,049 conserva respuesta y050 resolución |
| ACK perdido / crash / duplicados | PASS local; conservar identidades originales y ninguna segunda emisión con intención existente |
| Rechazo / incertidumbre / conflicto | PASS local; visibles, sin liberar números ni reenvío automático; conflicto bloquea aplicación nueva |
| Venta-stock-caja y aplicación comercial | EXACTLY ONCE local;052 atomicidad, journal privado, costos/lotes históricos, rollback y recuperación |
| UI / reload / doble clic / pendientes incompatibles | PASS local; recuperación sin cargar preparación/historial, revisión renovada sólo para el mismo cuerpo, autoridad final en backend/SQL |
| Flags / configuración | PASS; privados independientes y opcionales cerrados por defecto; públicos subordinados, sin activación remota |
| Suite SQL final | 634 PASS/1archivo, final-local-sql-full-v3.log, salida0; fixtures WASM recreadas cada32casos, presupuesto de infraestructura30s |
| Resto de suite final | 4113 PASS/1skip/305archivos, final-local-rest-full-v3.log, salida0; sin excluir módulos funcionales |
| Suite completa combinada sin solapamiento | 4747 PASS/1skip/306archivos; único skip previo F6.2D requiere reviewedDraftPath ausente, no fiscal |
| PostgreSQL17.11 / concurrencia | 180 PASS, final-local-native-v1.json; SQL053instalado2veces, revocación durante espera,0redexterna/0CAE; contenedor propio detenido/datos conservados |
| Build | PASS, salida0,689módulos; final-local-build-definitive-v1.log/.exit; aviso previo de tamaño de chunk |
| Lint | Sin errores;137advertencias existentes; final-local-lint-global-v3.log; módulos nuevos sin diagnósticos |
| Bootstrap / diff | PASS; manifiesto43archivos base y git diff --check; no confundir con instalación fiscal |
| Inventario final | PASS;53SQLsecuenciales/hashes correctos, Edgeexacta, nombres de secrets/flags y orden/prerrequisitos/rollback en docs/arca-homologacion.md |
| Bundle / revisión de secretos | PASS local sin hallazgos;70RPCprivadas y símbolos/custodia/flags privados ausentes del bundle; patrón en35archivos cambiados+revisión de fronteras, no certificación absoluta de seguridad |
| Visual | PASS de muestra local sintética en claro/oscuro; aceptación visual hospedada/móvil pendiente |
| PR3 | Abierto/Draft/sin merge; verificar HEAD final tras publicación única |
| master | No modificado; base/remoto03a798f, masterlocal41bebe9 del15/10 conservado |
| Production | Sin acciones/modificaciones por este bloque |
| Instalación remota / flags / secretos reales | NOT DONE |
| ARCA real / CAE real / merge | NOT DONE |

La evidencia de ejecuciones anteriores fallidas se conserva: v1no final por expectativas antiguas; v2FAIL por timeout de infraestructura/cascada; no sumar ni presentar como PASS. La suite final segmentada cubre todos los634casos del archivo fiscal y todos los otros305archivos. El presupuesto30s del archivo coincide con el usado en su ejecución final; deadlines de transporte/trabajador se mantienen y prueban aparte.
Siguiente gate: revisión final del PR y decisión explícita GO/NO-GO. Sólo con GO: prerrequisitos/SQL→verificaciónDB/RLS/RPC→Edge→provisión autorizada→flags por etapas→frontendStaging→aceptación hospedada sin ARCA real→autorización específica de homologación. Punto de venta acreditado, custodia real, JWT/RLS/terminales reales, primer CAE, backup/restore privado, transición/piloto comercial conservan sus gates. No llamar esos pendientes PASS por los ensayos locales. Restauración integral bloqueada, tratamiento fiscal de envases pendiente del contador, impresora/cajón/Point diferidos. PR02/PR03 y objetivo global siguen abiertos.

Verificación del inventario antes de publicar:15SQL históricos tenían CRLF en el checkout y LF en Git. El inventario final usa SHA-256 del blob Git canónico LF (comprobado equivalente a normalizar sólo CRLF), sin modificar ninguno de esos SQL. Evita falsos desajustes por autocrlf y conserva detección de diferencias reales de contenido. La verificación final se realiza contra el índice/commit aprobado, no contra finales de línea dependientes de la máquina.

## Preinstalación fiscal y respaldo privado — 26/10/2026

- El titular dio GO únicamente a SQL001–053 y verificación DB/RLS/RPC de Staging
  `acoyfwwmhaeruciyedri`, fijados al cierre `9054cce410ae26b123f151bee2f1ad56c10767bd`.
  Edge, secretos, flags, Vercel, ARCA, master y Production quedan fuera.
- Preflight hospedado de metadatos en transacción READ ONLY con ROLLBACK:
  0 tablas fiscales, 0 funciones fiscales/homologación, 0 SECURITY DEFINER públicos
  ejecutables por anon; 15 tablas requeridas presentes con RLS; 8 funciones
  prerrequisito presentes con una sobrecarga; pgcrypto1.3 y uuid-ossp1.1 instalados.
  No se instalaron http/pg_net/pgjwt. Esto no acredita aún firmas/definiciones
  completas, JWT/RLS E2E ni instalación fiscal.
- El proveedor Free no incluye backups. El titular confirmó que no existe una
  copia reciente y autorizó preparar un respaldo privado. Se añadió el asistente
  `scripts/respaldar-staging-privado.ps1`; procedimiento y límites en
  `docs/respaldo-postgresql-windows.md`. Quince pruebas locales PASS y preflight
  real del cliente Docker PASS; sin conexión a la DB durante estas pruebas.
- PENDIENTE: ejecución humana con contraseña PostgreSQL ingresada sólo en terminal,
  verificación posterior del archivo/manifiesto/contexto privado y compatibilidad
  del esquema antes de SQL001. No se ejecutó ningún SQL fiscal. El GO ya otorgado
  permanece vigente; no se amplía por preparar el respaldo.
- PR07 continúa parcial: archivo listado/hash no demuestra restauración integral;
  Storage, copia externa y restore aislado permanecen pendientes. Conservar las
  decisiones históricas y el bloqueo de restauración integral de la UI.

## Respaldo pre-fiscal real verificado — 26/10/2026

El titular ejecutó el asistente con la contraseña sólo en su terminal. Carpeta
privada `pre-fiscal-9054cce-20261026-115042-f88d9a2aa958480e9e9193955d2ac116`.
Verificación independiente: contexto Staging/commit9054cce correcto, SHA256 de
dump y roles coincide con ambos manifiestos, archivos con ACL sólo del usuario;
índice pg_restore real sin red contiene las siete tablas críticas. Dump1118614
bytes y roles6173bytes. BACKUP_ARCHIVE_VERIFIED_NOT_RESTORED. No se leyeron datos
comerciales ni contraseña. PR07 no cerrado: restore, Storage y copia externa pendientes.
Preflight hospedado repetido antes de instalación: mismo baseline cero fiscal,
RLS de quince tablas, ocho funciones y extensiones mínimas. Source53SQL idéntico
al commit aprobado; GO SQL001–053 vigente. Edge/secrets/flags/ARCA quedan fuera.

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

## Edge fiscal cerrada autorizada — 26/10/2026 (en verificación)

El titular autorizó exclusivamente desplegar arca-homologacion en Staging y
comprobar gateway/CORS/gates cerrados. Sin provisión ARCA, flags, Vercel ni emisiones.
Se preparó bundle privado de74módulos desde bac8ac1, sin minificar/tree-shaking,
con imports npm exactamente fijados por deno.json;341976bytes, SHA256
10dc48715527c3e1a1daa230e1945d862814aa8726e83b85928839348f1c40c2.
Cuatro casos sobre ese bundle en Node (no Deno) PASS,0red/0lecturas de credenciales.
Desplegado mediante editor oficial; Verify JWT activado confirmado en Settings.
Pruebas hospedadas: POSTsinJWT401; POSTJWTficticio401; OPTIONSorigenStaging204
con CORS limitado; OPTIONSorigenajeno403 sin allow-origin. Probador oficial:
POSTde prueba ENVIAR_NC sin datos comerciales devuelve503HOMOLOGACION_NO_HABILITADA.
No se enviaron comprobantes ni se habilitó preparación/revisión/envío/aplicación.
Pendiente cerrar comprobación del código remoto y diarios vacíos tras estas pruebas.

### Cierre del despliegue Edge cerrado — 26/10/2026

- Código remoto de index.ts copiado desde el editor y comparado completo con el
  bundle local, normalizando sólo CRLF/LF: MATCH. SHA256 canónico
  10dc48715527c3e1a1daa230e1945d862814aa8726e83b85928839348f1c40c2.
- Inventario remoto: cuatro funciones. Se agregó sólo arca-homologacion; los tres
  endpoints previos conservan sus fechas de actualización. Verify JWT sigue ON.
- Gateway/CORS: cuatro comprobaciones HTTP hospedadas PASS. El probador oficial
  confirma503HOMOLOGACION_NO_HABILITADA. No interpretar ese probador como un JWT
  de Dueño/Cajero ni como aceptación de identidad/RLS con usuarios reales.
- Verificación DB posterior READ ONLY/ROLLBACK:41tablas fiscales,0filas,
  70/70RPC privadas restringidas y0SECURITY DEFINER públicos accesibles a anon.
- Ninguna provisión de credenciales ARCA, flag activado, cambio Vercel, llamada
  ARCA, emisión, cambio Production/master ni merge en este bloque.
- Reproducción local con scripts/preparar-edge-fiscal-staging.mjs (exige sources
  de funciones sin diferencias contra bac8ac1) y scripts/verificar-paquete-fiscal-cerrado.mjs:
  mismo hash,74módulos/cuatro imports fijados y4casos PASS sin red ni credenciales.
  Node es una comprobación del paquete; el arranque Deno real se acredita por la
  respuesta503 hospedada. Lint de ambos scripts PASS. El frontend no cambió.

Evidencia local en ../edge-staging-bac8ac1/:manifest.json,remote-code-match.json,
hosted-negative-checks.json,settings-jwt-on.png,closed-gate-503-ax.txt/PNG,
post-deploy-db-ax.txt y functions-inventory-ax.txt. No incluye credenciales.

**Primer pendiente:** aceptación con JWT Auth reales de Dueño/Cajero/otro comercio.
La configuración hospedada etiqueta el control como «Verify JWT with legacy
secret»; el JWKS público de Staging publica una clave ES256 (consulta200, sin
registrar su material). Esto obliga a comprobar compatibilidad con un JWT Auth
real antes de cerrar el gate: no asumir incompatibilidad o aceptación sólo por
la etiqueta/JWKS. No se desactiva gateway ni cambia signing key para sortearlo.
El siguiente gate de flags/provisión conserva autorización propia; envío,
consulta ARCA, preparación, revisión y aplicación siguen cerrados. PR03 parcial,
PR02 sin primer CAE y objetivo global abierto.

## Preparación de aceptación JWT real sin flags — 26/10/2026

Se añadió scripts/comprobar-jwt-fiscal-staging.ps1 para resolver el primer
pendiente de compatibilidad con un inicio Auth real, sin activar backend ni
usar service_role/custodia/ARCA. El titular introduce localmente clave pública,
correo y contraseña de la cuenta de ensayo; ningún valor va a argv, archivos,
variables de entorno o salida. Host fijo acoyfwwmhaeruciyedri, HTTPS y cero
redirecciones. Rechaza JWT API de servicio y anon de otro proyecto antes del login.

El asistente crea sólo una sesión Auth de prueba y POSTea '{}' a la Edge cerrada:
503HOMOLOGACION_NO_HABILITADA confirma paso del gateway (salida0);401 indica
rechazo del JWT real (salida2). Cualquier otro resultado no confirma el gate.
Sólo se imprime algoritmo/status; nunca JWT, respuestas externas ni credenciales.
Finalmente solicita logout?scope=local únicamente para la sesión nueva, incluso
si el gateway falla; no hay cierre global ni reintentos automáticos. Un fallo de
logout devuelve1 y requiere diagnóstico antes de repetir. El access token no
se persiste; la prueba no acredita revocación instantánea de ese token ni roles/RLS.
Documentación de scopes: https://supabase.com/docs/guides/auth/signout.

Pruebas Windows con Auth y gateway simulados cubren éxito503 con excepción HTTP,
rechazo401, backend no cerrado, fallos Auth/red/logout, key de servicio y proyecto
ajeno; no ejecutan Auth real. Primera ejecución local del test falló por un mock
UseBasicParsing sin tipo switch; se corrigió el mock, sin relajar assertions.
La ejecución humana con cuenta real permanece PENDIENTE. No se modifica Edge,
SQL, flags, signing keys, Vercel ni Production con este asistente.

Validación final del asistente JWT:10pruebas Windows PASS (incluida clave publishable),
lint enfocado PASS y -Preparar PASS sin red. Evidencia
../fiscal-staging-jwt-script-final.log. La prueba con credenciales reales sigue
sin ejecutar; no se atribuye PASS hospedado ni a roles ni a RLS.
Build final del asistente: rtk npm run build PASS, salida0; aviso previo de chunks grandes. Sin cambios de runtime fiscal ni despliegue adicional.

## Fallo Auth del primer JWT real y diagnóstico seguro — 26/10/2026

El titular ejecutó el asistente con prueba1@gmail.com y entradas privadas en
terminal. Falló en login Auth antes de probar gateway; el mensaje original no
incluía status/causa. No hay JWT real aceptado/rechazado por Edge acreditado.
No se cambia la contraseña, clave pública, signing key ni flags por inferencia.

El asistente ahora clasifica únicamente códigos Auth conocidos (error_code/code),
clave pública rechazada,429/5xx y errores de conexión/TLS/DNS/timeout. Publica
sólo categoría de lista cerrada y HTTPstatus; mensajes desconocidos/credenciales
no se imprimen. Lee como máximo4097caracteres del stream de error. Se fijaron
Content-Type charset=utf-8 y bytes UTF8 del JSON para preservar contraseñas con
caracteres especiales en WindowsPowerShell. No atribuir el fallo real a encoding
sin el nuevo resultado del titular.

18pruebas Windows PASS, incluida contraseña sintética Unicode, errores Auth400,
401,429,503,timeout y cuerpo desconocido sensible;10escenarios previos conservados.
Lint enfocado y -Preparar PASS sin conexión. Evidencia
../fiscal-staging-jwt-diagnostic-v1.log. Códigos oficiales de referencia:
https://supabase.com/docs/guides/auth/debugging/error-codes.
Siguiente paso: un intento humano con el asistente actualizado y comunicar sólo
JWT_CHECK_NOT_CONFIRMED/JWT_GATEWAY_*/TEST_SESSION_*; sin credenciales ni respuesta
externa completa. Aceptación JWT/RLS hospedada y gates fiscales siguen pendientes.
Build final de esta corrección: rtk npm run build PASS, salida0; aviso previo de chunks grandes. Sin cambios SQL/Edge ni despliegue remoto.

## JWT Auth real ES256 atraviesa el gateway — 26/10/2026

Evidencia aportada por el titular al ejecutar el asistente95e240e con la cuenta
prueba1@gmail.com y entradas sólo locales:

- JWT_GATEWAY_PASS_BACKEND_CLOSED alg=ES256 status=503.
- TEST_SESSION_LOGOUT_LOCAL_CONFIRMED; sin solicitud de cierre global.

Se acredita compatibilidad real del JWT ES256 de esa cuenta con el gateway y
respuesta del backend cerrado. No fue necesario desactivar verify_jwt, cambiar
signing keys ni activar flags. No atribuir el fallo anterior de Auth a una causa
concreta: el nuevo intento pasó, pero no hay diagnóstico del rechazo original.
El cierre local acredita la petición scope=local de la sesión de ensayo; no
implica revocación instantánea de access tokens existentes.

Esto NO cierra actor/rol activo/aislamiento SQL/RLS ni aceptación E2E. El handler
retorna503 antes de crear el cliente privado y verificar actor; esas capas aún
no se ejercitaron con el JWT real. PR03 permanece parcial y PR02 sin primer CAE.

Siguiente paso concreto preparado: solicitar autorización para activar de forma
temporal sólo ARCA_HOMO_BACKEND_ENABLED=true en Staging, realizar comprobaciones
de Auth/roles/rechazos y lecturas con cuentas de ensayo, y volver a false al
terminar. Mantener todos los demás flags cerrados. No provisionar emisores,
catálogo/custodia/keys ARCA, no invocar mutaciones fiscales/comerciales, no llamar
ARCA ni cambiar Vercel/Production. La activación del gate base habilita el
handler base; no debe describirse como un modo de sólo lectura global. Las
pruebas se limitarán explícitamente a lecturas y rechazos; aceptación positiva
completa con fixtures requiere su propio alcance. El GO anterior de Edge excluyó
flags: no cambiar esta configuración hasta recibir la autorización nueva.

## GO base temporal y preparación coordinada — 26/10/2026

Autorización nueva recibida: «Sí, sólo backend base temporal y pruebas de acceso».
Cubre únicamente Staging acoyfwwmhaeruciyedri, backend base durante el ensayo y
retorno a false. Resto de exclusiones anterior conservado. No activar antes de
tener el asistente autenticado listo; no terminar un turno con el gate abierto.

Panel de Secrets inspeccionado: cinco custom secrets preexistentes operativos,
ningún ARCA_*; no se revelaron valores ni se cambió configuración remota.
Preparado `-ComprobarAccesos` en el asistente existente: identidad Auth original,
perfil propio activo Dueño/Cajero/noSuperAdmin, tabla privada con limit0/rechazo403,
espera acotada10min/120lecturas de acción fija DATOS_FISCALES_VENTA con UUID nulo,
logout local incluso ante fallo. Sin RPC arbitrario, filas fiscales, mutaciones,
credenciales ARCA ni persistencia de tokens. Ver docs/arca-homologacion.md.

Validación local:27pruebas nativas Windows PASS (18previas+9acceso), con rechazo
de identidad inválida, perfil inactivo, SuperAdmin, grant expuesto, timeout,
fallo de red y respuesta inesperada; Dueño/Cajero sintéticos pasan. Lint enfocado
PASS y build PASS689módulos, aviso conocido de chunks grandes. Esto prueba el
asistente, no la aceptación real. JWT real previo conserva su alcance gateway.

Pendiente inmediato: titular ejecuta asistente y comunica ACCESS_PROBE_READY;
aplicar el GO ya concedido, lecturas/rechazos, cierre false y verificación final.
No pedir otra autorización equivalente. Un409 genérico no prueba por sí solo
Auth privado/RPC correcto: investigar evidencia adicional antes de declararlo PASS.
PR03 parcial/PR02 sin CAE; sin merge, master ni Production.

## Ensayo real Dueño y retorno del gate base a false — 26/10/2026

Titular ejecutó8595c44: AUTH_PROFILE_CONFIRMED role=OWNER,
PRIVATE_TABLE_DIRECT_DENIED403, ACCESS_PROBE_READY. Se aplicó el GO existente
únicamente a ARCA_HOMO_BACKEND_ENABLED en acoyfwwmhaeruciyedri: true a las
18:14:59 y false a las18:15:31 (Argentina;21:14:59/21:15:31UTC). Ventana32s,
sin cambios en otros flags, SQL, Edge, Vercel, credenciales ARCA ni Production.
Panel muestra el digest SHA256 de false
fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa;
probador oficial posterior:503HOMOLOGACION_NO_HABILITADA. VerifyJWT sigue ON.

Titular confirmó BASE_READ_NEGATIVE_OBSERVED409 y
TEST_SESSION_LOGOUT_LOCAL_CONFIRMED. Invocations corrobora503 antes de abrir,
409 a las18:15:03 y503 final a las18:15:52. Evidencia adicional en Unified Logs:
GET /auth/v1/user del runtime Deno200 a las18:15:02; POST privado
/rest/v1/rpc/cargar_datos_preparacion_homologacion del mismo runtime403 a las
18:15:03; PostgreSQL42501 «Preparación fiscal no autorizada.»; logout humano204
scope=local a las18:15:03. No se leyeron headers, tokens ni secretos. Esto acredita
ejecución del cliente privado y rechazo de negocio, superando la ambigüedad del
409 aislado. No prueba preparación positiva, toda policy RLS ni motivo interno
exacto de rechazo (UUID centinela sin venta, con controles previos de actor/comercio).

Resultados: identidad/perfil Dueño real PASS; acceso directo a una tabla privada
rechazado PASS; Auth del backend real y ruta RPC privada ejecutados PASS;
rechazo negativo observado PASS; cleanup local y gate cerrado PASS. PR03 sigue
parcial: faltan Cajero/otro comercio y aceptación positiva/E2E con fixtures
expresamente autorizados. No se crearon fixtures ni se aprovisionó emisor/custodia.
No convertir este rechazo en autorización de emisión ni primer CAE.

Evidencia local fuera de Git: ../backend-base-invocations-20261026.txt,
../backend-base-closed-20261026.png y ../backend-base-closed-503-20261026.png.
El titular informó que no tiene cuenta Cajero disponible para el siguiente
ensayo. El baseline anterior de Owner/Cashier fue aportado por el titular, no
prueba disponibilidad actual ni autoriza crear/reasignar usuarios ahora.
Siguiente paso: preparar cuenta aislada Cajero bajo autorización específica;
mantener backend false hasta que su asistente autenticado esté listo.

## Cuenta Cajero de ensayo disponible — 26/10/2026

El titular eligió prueba2@gmail.com para Cajero. Se dejó el alta Auth en manos
del titular para introducir su contraseña localmente; ninguna contraseña se
copió a código, argumentos, documentos ni artefactos. Posterior búsqueda Auth
confirmó una identidad nueva; preflight READ ONLY verificó email confirmado,
sin bloqueo/borrado,0perfiles asociados y1Dueño activo/noSuperAdmin en el comercio
exacto «Ensayo envases devoluciones 7faa9ea4».

Se vinculó únicamente esta identidad nueva mediante INSERT en public.usuarios:
nombre «Cajero prueba interactiva», rolCAJERO, activo=true, es_superadmin=false,
mismo comercio del Dueño. Transacción con lock/statement timeout, locks de
identidad/Dueño/comercio, guard de nombre/estado activo del comercio, identidad
Auth/correo exactos y aborto si existe perfil por Auth o correo; sin UPDATE,
reasignación, Auth metadata, credenciales ni cambios de permisos SQL.
Verificación independiente posterior REPEATABLE READ READ ONLY/ROLLBACK:
profile_count1/cashier_scope_confirmedtrue. Evidencia local fuera de Git:
../cajero-profile-verified-20261026.png. No tablas fiscales, ventas, stock, caja,
Edge, flags, Vercel ni Production modificados en este paso.

Cuenta disponible no equivale a login probado. Pendiente: ejecutar8595c44 con
-ComprobarAccesos y esta cuenta, comunicar ACCESS_PROBE_READY y ejercitar el
rechazo fiscal del Cajero bajo ventana base temporal ya autorizada, cierre false
y correlación de Auth/RPC/PostgreSQL. Luego otro comercio y aceptación positiva.
No repetir el ensayo Dueño ni declarar PR03/E2E completados.

### Ventana Cajero sin asistente listo — 26/10/2026

El titular respondió «Cajero listo». Se interpretó como ACCESS_PROBE_READY del
asistente y se abrió sólo el gate base21:28:58UTC; volvió a false21:29:18UTC
(18:28:58–18:29:18Argentina,20s). Luego el titular aclaró que sólo había iniciado
sesión en la aplicación web. Por tanto, NO hubo ensayo fiscal Cajero acreditado.
El ingreso web real no sustituye el asistente ni los rechazos de su ruta privada.

Digest remoto coincide con SHA256(false); probador oficial posterior devuelve
503HOMOLOGACION_NO_HABILITADA y verifyJWT continúa ON. Otros flags ARCA ausentes,
sin credenciales, llamadas ARCA, mutaciones fiscales/comerciales solicitadas,
despliegues, master/Production ni merge. Evidencia fuera de Git:
../cajero-window-closed-503-20261026.png. No sumar este caso a PASS de roles/RLS.

Próximo intento: pedir la línea literal AUTH_PROFILE_CONFIRMED role=CASHIER y
ACCESS_PROBE_READY de PowerShell antes de abrir otra ventana. No basta «listo»
o sesión web. El GO de acceso temporal conserva su alcance; no solicitar otra
autorización equivalente ni reusar/extractar tokens de la sesión web.

## Cajero real: rechazo privado y cleanup confirmados — 26/10/2026

Titular aportó las líneas literales AUTH_PROFILE_CONFIRMED role=CASHIER,
PRIVATE_TABLE_DIRECT_DENIED403 y ACCESS_PROBE_READY de PowerShell. Bajo el GO
base temporal vigente se abrió sólo ARCA_HOMO_BACKEND_ENABLED21:31:56UTC y se
retornó a false21:32:17UTC (18:31:56–18:32:17Argentina,21s). Los demás flags ARCA
siguen ausentes; no se leyó ni provisionó ninguna credencial ARCA.

Consola final aportada: BASE_READ_NEGATIVE_OBSERVED409 y
TEST_SESSION_LOGOUT_LOCAL_CONFIRMED. Correlación de registros hospedados:
18:31:23 login200;18:31:24 Auth/user200 y perfil propio200;18:31:25 tabla
fiscal_operaciones_homologacion limit0 rechaza403/42501;18:32:01 Auth/user200
desde Deno, RPC cargar_datos_preparacion_homologacion403 desde Deno y PostgreSQL
42501 «Preparación fiscal no autorizada.»; logout scope=local204 también18:32:01.
Esto acredita identidad real y ejecución privada del rechazo del caso centinela;
sin depender sólo del409 público. No prueba todas las acciones del Cajero ni
separación entre comercios: todavía se consulta un UUID sin venta.

Cierre verificado: digest SHA256(false) en panel, verifyJWT ON y probador oficial
503HOMOLOGACION_NO_HABILITADA. Evidencia local fuera de Git:
../cajero-real-closed-503-20261026.png. No mutaciones fiscales/comerciales
solicitadas, instalaciones, Vercel, ARCA, CAE, master/Production ni merge.
No se cerró globalmente la sesión web del Cajero.

La dependencia de login/ensayo negativo Cajero queda superada. PR03 sigue parcial.
Primer pendiente: aislamiento hospedado entre comercios con casos reales de
ensayo. Preparar consultas de venta propia/ajena y controles positivos de la
misma sesión; un resultado vacío sin control positivo no acredita RLS. Antes
de crear fixtures remotos, revisar disponibilidad de fixtures aislados existentes
y su alcance. Sin emisor/catálogo/custodia no declarar aceptación positiva fiscal
ni cerrar PR02 (primer CAE). No repetir Dueño/Cajero centinela como nuevo progreso.

## Preparación de aislamiento entre comercios sin nuevos fixtures — 26/10/2026

Inventario remoto REPEATABLE READ READ ONLY/ROLLBACK: comercio «Ensayo envases
devoluciones 7faa9ea4» activo con10ventas,2Dueños; F4A_TEST_20261011_R1 activo con
7ventas/1Dueño; tres comercios Ensayo comercial/restauración suspendidos sin
ventas. No se reactivaron ni mutaron. Selección READ ONLY confirmó10ventas
COMPLETADA propias y venta00418e7b-eca6-487c-bffe-b85b405cd9cb del fixture F4A.
Estos datos permiten un control real sin crear cuentas o ventas adicionales.

Preparado modo -ComprobarAislamiento en el asistente Windows existente. Reutiliza
login seguro UTF8, Auth/user y perfil propio (no confía en claims decodificados),
scope exacto del comercio de ensayo y logout scope=local en finally. Tres GET:
venta propia positiva, id ajeno sin filtro de kiosco→200[], relectura propia
positiva. Sólo id/kiosco_id; no importes, detalles, clientes ni pagos. No flags,
esperas, RPC/Edge, ARCA o mutaciones comerciales/fiscales. Modos excluyentes.

Primera suite37casos:35PASS/2FAIL en positivos de aislamiento; reproducción nativa
confirmó que @('[]'|ConvertFrom-Json) cuenta1 en WindowsPowerShell5.1, mientras
PowerShell7 cuenta0. Se separó decodificación de enumeración, sin relajar200[]
ni controles positivos. Subensayo de diagnóstico confirmó el rechazo en la
comprobación de lista ajena. Se conserva la falla histórica; validación final
se registra después de la corrección, no convertir esas ejecuciones en PASS.

Marcador RLS_SALES_READ_ISOLATION_OBSERVED exige revalidar existencia ajena por
lectura independiente después del ensayo, evitando declarar aislamiento si el
fixture fue eliminado. Falta ejecución humana con Cajero/Dueño y comprobación
posterior; NO hay RLS hospedado nuevo acreditado por preparar/simular el asistente.
PR03 parcial y fiscal positivo/CAE pendientes. Detalles en guía ARCA existente.

Validación posterior a la corrección:37pruebas nativas Windows PASS (27previas y
10aislamiento), incluyendo Dueño/Cajero positivos sintéticos, scope incorrecto,
control propio ausente/ajeno, exposición de fila ajena,403ajeno, JSON incorrecto,
red y pérdida del positivo final. No hubo tráfico remoto desde esos tests.
Lint enfocado/diff PASS; -Preparar -ComprobarAislamiento PASS sin login/red.
Build final PASS689módulos, aviso conocido de chunks grandes. Evidencia de
selección hospedada fuera de Git: ../isolation-fixtures-20261026.txt.

## Aislamiento real de lectura de ventas confirmado — 26/10/2026

Titular ejecutó108e797 por separado con prueba1@gmail.com y prueba2@gmail.com.
Ambas sesiones informaron RLS_SALES_READ_ISOLATION_OBSERVED: roleOWNER/CASHIER,
own1/foreign0/positive_recheck1, y TEST_SESSION_LOGOUT_LOCAL_CONFIRMED.
No se abrió el backend base para estas consultas directas con JWT real.

Verificación remota posterior independiente REPEATABLE READ READ ONLY/ROLLBACK:
foreign_sale_exists=true para la venta exacta00418e7b-eca6-487c-bffe-b85b405cd9cb,
vinculada al comercio activo F4A_TEST_20261011_R1; own_completed_count10;
owner_scope_valid=true/cashier_scope_valid=true/ventas_rls_enabled=true.
Se conserva ../isolation-postcheck-20261026.txt fuera de Git. La ausencia de
fila ajena en las dos sesiones no se explica por eliminación del fixture.

PASS hospedado limitado: lectura SELECT de ventas propias y ocultamiento de
esa venta ajena para esos dos actores, con positivos antes/después y existencia
ajena acreditada antes/después. No acredita todas las tablas/policies, escrituras,
aislamiento fiscal completo, bidireccionalidad con actor de F4A ni E2E positivo.
No se modificaron fixtures, roles, flags, SQL/Edge, Vercel o Production.

Siguiente dependencia: aceptación positiva de preparación fiscal. SQL012 requiere
venta propia elegible, emisor habilitado del comercio y catálogo vigente. No
puede sustituirse con un409 genérico ni con parámetros/IVA/PV heredados. Preparar
alcance y fixture revisables antes de solicitar el nuevo GO de provisión/API
con mutaciones; el GO actual sólo cubre lecturas/rechazos/base temporal. No
provisionar custodia/secretos ni llamar ARCA para resolverlo sin autorización.
PR03 sigue parcial; PR02 sin primer CAE y resto del objetivo común conservado.

## Preparación de consultas de parámetros reales — 26/10/2026

Lectura del contrato SQL012 confirmó dependencias del contexto positivo:
venta propia COMPLETADA/importe positivo/detalles/sin devolución/CAE previo,
emisor habilitado y parámetros vigentes. Se pospone provisión hasta disponer de
datos fuente revisables; no tomar IVA ni PV2 de configuración heredada.

Ampliado sólo diagnóstico local C#/PowerShell existente: allowlist suma
FEParamGetTiposIva y FEParamGetCondicionIvaReceptor según contrato oficial de
homologación, documentado con enlaces en guía ARCA. Parser estricto y exportador
de campos públicos/hash/fecha/origen, sin XML/Auth/Token/Sign ni sobrescritura.
Mantiene clases originales sin inventar correspondencias ni condiciones fiscales.
Modo CatalogosPreparacion comparte una autenticación/TA en memoria para dos
consultas exactas, sin retries. Fallo en segundo paso conserva evidencia parcial
sin marcador global de éxito; nunca instala ni activa nada en Staging.

Validación local:7tests PASS; el primero compila C# real y acredita48checks
(32previos+16parser/exportación), incluidos fechas/duplicados/forma, métodoajeno,
negocio, nooverwrite y rechazo de credenciales reflejadas.5tests del wrapper con
SDK sintético comprueban una autenticación/dos consultas, fallo segunda llamada,
fallo de exportación y preflight de directorio/modos antes de credenciales.
No hubo consultas firmadas ni uso de credenciales originales en los tests.

Primer wrapper:6PASS/1FAIL por CS0162 del mock C# con constante export-fail
(no ejecutó el asistente); reproducido y corregido a campo de modo runtime.
Se corrigió diagnóstico del stage exportación como WSFE y cleanup del nuevo
test sin añadir unsafe-finally. Lint:0errores y1warning unsafe-finally previo.

GO pendiente, no consumido: uso de certificado original/clave local para una
autenticación WSAA y dos lecturas de catálogo WSFE, exportación pública local.
No cubre instalación/provisión, flags, Vercel, ARCA Producción o CAE. La
provisión y aceptación positiva hospedada siguen gates posteriores distintos.
Build final PASS689módulos, aviso previo de chunks grandes; diff PASS. El cambio
es local/scripts/tests/documentación, sin SQL, runtime Edge o frontend remoto.

## Catálogos WSFE reales obtenidos bajo GO — 26/10/2026

GO humano: «Sí, consultar ambos catálogos en homologación». Se ejecutó174441c con
el certificado público original fuera del checkout y clave cifrada/DPAPI locales
existentes, sin rotación ni lectura de valores al chat. Par/TRA/CMS PASS y una
autenticación WSAA real PASS, seguida exactamente por FEParamGetTiposIva y
FEParamGetCondicionIvaReceptor: ambos PASS,6tipos IVA y11condiciones receptor.
CATALOGOS_PREPARACION_EXPORTADOS=true/salida0,0comprobantes emitidos. Sin retries.

Dos evidencias públicas y manifiesto de hashes verificados fuera de Git:
../arca-parametros-homologacion-20261026-edce7a368bf6424e8cd161300f9327d8/.
FuenteTiposIva SHA256a2dfdfcf253c484c70d2585f09d9496b6a0762d8e17160a4e4521075afdf50c1;
archivo90e6a06b8a761c3687a2d285a19f8a2d872e35b50b9f106ebe43e2babf8be5c5.
FuenteCondicionIva SHA2569a678f82589f1e291070e59b19be5c4a7deb83b4891f48d5ccba0c56ebb9ea84;
archivo66f806b0ed472876e6a5c4a3ba3fb17834233b698f73fc0eba04eb06f50e7b85.
Clases recibidas: A/ALEY/C, B/C, C/49. Se conservaron originales; no equiparar
ALEY/49 con los tipos1/6/11 ni aplicar un IVA por defecto.

Se verificó esquema/entorno/flags false y ausencia de campos Token/Sign/PEM en
los JSON; sin XML crudo ni CUIT emisor exportados. El manifiesto contiene sólo
nombres, métodos, conteos, clases, fechas y SHA256 de archivos/respuestas públicas.
Token/Sign permanecieron en memoria del proceso, que terminó; no se guardó TA.
Expiración informada por WSAA:2026-10-27T10:03:32.688Z. No asumir disponibilidad
local del TA ni repetir autenticación/consultas fuera del GO consumido.

El GO se consumió sin tocar Supabase, flags, Vercel, emisores/custodia/catálogos
remotos, ARCA Producción o CAE. No se consultaron puntos ni numeración. PR02
permanece pendiente: PV2 sigue sin acreditación en WSFE (historia602 conservada).
Siguiente trabajo local autorizado: normalizar/revisar estos campos públicos y
preparar el alcance concreto de provisión, sin instalarlo. La aceptación positiva
necesita emisor/punto acreditados y su GO; estos catálogos no los sustituyen.

## Siguiente bloque local: propuesta de catálogo inactivo — 26/10/2026

Plan: validar bytes/hashes y forma de ambas evidencias públicas; convertir sólo
A/B/C a1/6/11, conservando exclusiones ALEY/49 explícitas y rechazando clases
desconocidas; validar fechas de alícuotas sin inventar IVA ni condición de una
venta; generar SQL/manifest local con habilitado=false y guards de autorización,
destino, vigencia y baseline vacío. No generar emisor/PV/custodia ni conectar.
Vigencia de propuesta de ensayo: máximo24h desde la consulta más antigua y sin
cruzar el día de evaluación de tasas; vence_en/revisión se indican explícitos.
Probar integridad/entrada, SQL como datos, no activación, baseline/replay y clocks
en PostgreSQL local antes de publicar. No aplicar sin otro GO de provisión.

## Propuesta local de catálogo inactivo validada — 27/10/2026

Implementado scripts/plan-fiscal-parameters.mjs, sin cliente HTTP/DB ni lectura
 de credenciales. Valida los bytes SHA256 revisados, esquema/origen/operación,
fechas, duplicados y clases. Normaliza exclusivamente A/B/C a tipos 1/6/11;
ALEY y 49 quedan excluidos explícitamente, nunca equiparados. No elige IVA de
una venta ni condición del emisor/receptor. No genera emisor, PV o custodia.

El SQL resultante sólo inserta una revisión habilitado=false y exige destino
Staging y hash de propuesta aprobados explícitamente en la sesión, vigencia
recomprobada en servidor y tabla de parámetros completamente vacía bajo lock.
No UPDATE/DELETE/upsert: un baseline distinto o replay bloquea. El ajuste de
sesión es un seguro operativo, no autentica por sí mismo el proyecto: antes de
cualquier instalación se debe verificar independientemente el destino real y
obtener un GO humano específico. El generador no ejecuta SQL ni fija esos ajustes.

Política local de revisión del ensayo: consulta de menos de 24h y vencimiento
sin cruzar el día argentino usado para evaluar vigencia de alícuotas. No es una
regla atribuida a ARCA ni amplía la vigencia del catálogo en producción.

Con los JSON públicos ya obtenidos se produjo fuera de Git:
../catalogo-inactivo-propuesta-20261027/catalogo-inactivo.sql y revision-publica.json.
6 alícuotas y 11 condiciones; exclusiones ALEY/49; revisión propuesta 1.
Hash de propuesta c753a5bdeb4a3f262a6a63b3cd26badaa453d34fe4f58ac40b4c7968593e0473.
Vence 27/10/2026 18:59 Argentina (21:59Z). Si vence, no editar manualmente el
SQL ni prolongarlo: revisar evidencia y generar una propuesta nueva válida.
SQL_EXECUTED=false, habilitado=false, issuer_provisioned=false, emission_enabled=false.

Validación: 26 pruebas del plan, incluidas inserción/descripciones como datos,
destino/GO, replay y vencimiento en PGlite con DDL canónico SQL012. Build PASS
(689 módulos; advertencia de chunks existente). ESLint no aplica al repositorio
sin su configuración; se usa el verificador canónico oxlint. Sin cambios remotos,
flags, secretos, WSAA/WSFE nuevos ni CAE. Aceptación positiva sigue pendiente del
punto acreditado, provisión autorizada y actores reales; esto no cierra PR03.

Cierre de validación del bloque: 33/33 pruebas en fiscalParameterPlan y wsaaHomologacion; oxlint de los dos archivos nuevos PASS sin advertencias después de sustituir el regex de controles por validación de caracteres. Build PASS. No se ejecutaron consultas ARCA ni SQL remoto en estas verificaciones.

## Catálogo público inactivo instalado bajo GO — 27/10/2026

GO específico recibido: «Sí, sólo catálogo inactivo y verificación». Se revalidó
propuesta e98225f/hash c753a5bdeb4a3f262a6a63b3cd26badaa453d34fe4f58ac40b4c7968593e0473
y vencimiento antes de ejecutar. Panel identifica kioskopos-staging/ref exacto
acoyfwwmhaeruciyedri; la etiqueta main PRODUCTION del branch de este proyecto
no es el proyecto productivo lllkjnqpltnwvxzphncr. Baseline REPEATABLE READ READ
ONLY/ROLLBACK: read_only=on, catálogos=0, emisores=0, propuesta vigente=true.

Se pegó SQL de la propuesta, agregando sólo los SET LOCAL de destino/hash
expresamente aprobados dentro del BEGIN; comparación íntegra del editor con
fuente PASS antes de Run. Una ejecución Success; sin retry. La verificación
posterior independiente READ ONLY/ROLLBACK comparó todos los campos JSONB,
revisión, fuente_sha256, consulta, vencimiento y habilitado contra manifiesto:
read_only=on, revisions=1, enabled=0, exact_match=true, iva_rows=6,
receiver_rows=11, issuers=0, rls=true, direct_access_closed=true.
Direct access comprobó privilegios de tabla y columna para anon/authenticated/
service_role. No acredita por sí solo todas las policies ni E2E fiscal positivo.

Evidencias locales fuera de Git: ../catalogo-inactivo-staging-verificado-20261027.png
y ../catalogo-inactivo-verificacion-20261027.sql. Los artefactos originales se
conservan como propuesta, con sql_executed=false histórico: no reescribirlos como
si fueran un diario de ejecución. Esta entrada documenta la instalación real.
Sólo una fila inactiva nueva; no activar catálogo, emisor, permisos, custodia,
flags o Vercel. Sin nuevos usos de certificados/WSAA/WSFE, CAE, merge o Production.
Vencimiento conservado:27/10/2026 18:59 Argentina; no autoriza prolongación.

Primer pendiente: acreditar punto de venta de homologación y preparar provisión
revisable del emisor/custodia antes de aceptación positiva. PV2 sigue sólo
configurado en KioskoPOS según evidencia humana previa; el catálogo instalado
no lo acredita. Nuevas consultas ARCA/provisión/activación conservan GO separado.

## Diagnóstico explícito de serie, sin emisión — plan 27/10/2026
El titular confirmó que no dio de alta otro PV. El 602 previo sólo acredita ausencia de datos de FEParamGetPtosVenta; no demuestra que un trámite productivo sea necesario o suficiente para homologación. No extrapolar particularidades de WSCT a WSFE. Manual oficial WSFE v4.0 p18 define602 y p19 publica wsfev1@arca.gov.ar como canal funcional de homologación. Antes de pedir alta productiva, preparar una única lectura FECompUltimoAutorizado con PV/tipo expresamente indicados, parser estricto de identidad y límites; nunca convertir éxito/número0 en acreditación de habilitación o permiso de emitir. Backend ya tiene esa operación para preparación, pero el diagnóstico local aún no. Añadir modo mutuamente excluyente con preflight antes de DPAPI, sin exportar Auth/SOAP y tests nativos/mock sin red. Mantener consultas reales/custodia/provisión/CAE pendientes de su nuevo GO. Fuente: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECompUltimoAutorizado y https://arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf .

### Resultado local del diagnóstico de serie — 27/10/2026

Implementado modo separado -ConsultarUltimo -PuntoVenta N -TipoComprobante T,
sin defaults, limitado a puntos1..99998 y tipos1/6/11. Parámetros de texto ASCII
validados antes de DPAPI: no permitir el redondeo implícito de PowerShell de
1.5 a2. Rechaza combinación con catálogos/exports/consulta genérica y alcance
huérfano; requiere Conectar y wsfe. La operación genérica no admite invocar
FECompUltimoAutorizado sin su contrato específico.

C# reutiliza transporte fijo HTTPS sin redirects/40s/1MB y parser SOAP común;
el nuevo parser exige único resultado, PtoVta/CbteTipo iguales a solicitud y
CbteNro entero0..99999999; rechaza duplicados, anidamiento/atributos, campos
ajenos, Errors malformado, negocio602 y faults. Sin reintentos ni persistencia.
Salida sólo metadatos numéricos/hash y PUNTO_HABILITADO=NOT_PROVEN,
NUMERACION_RESERVADA=false, COMPROBANTES_EMITIDOS=0. TA en memoria solamente.
Un resultado0 o positivo no es acreditación de alta/habilitación, reserva ni
permiso de emitir. No cambiar los gates para acomodar un resultado favorable.

Historia: primera ejecución14PASS/1FAIL por reporte ausente del mock business;
se sustituyó su condición C# constante por campo y se verificó existencia de
reporte para mejorar diagnóstico. Después41/41PASS; revisión añadió rechazo
explícito de fracciones y combinaciones incompatibles antes de leer claves.
No ejecutar con certificado real sin GO nuevo. El TA obtenido26/10 expiraba
27/10/2026 10:03:32.688Z; ya no existe en memoria, no intentar recuperar ni guardar
credenciales, ni repetir LoginCms durante su vigencia como supuesto refresco.
Una futura ejecución exige nueva autorización específica de autenticación y
consulta y comprobar la ventana/estado; no hay proceso de espera ni tarea
programada. No asumir que la disponibilidad de WSAA está acreditada por reloj.

La revisión oficial no encontró un procedimiento específico WSFE homologación
que permita afirmar que se debe crear un punto productivo para resolver602.
La particularidad de puntos libres documentada para WSCT no acredita WSFE.
Si persiste la incertidumbre, el titular puede consultar al canal funcional
oficial wsfev1@arca.gov.ar: cómo configurar/validar PtoVta para WSFE homologación
con CUIT ya autorizado y FEParamGetPtosVenta602, sin modificar altas productivas.
No se envió mensaje a terceros ni se compartieron XML/credenciales.

Cierre local final:48/48PASS en3archivos (15 tests de último,7 previos WSAA y26 propuesta de parámetros); componente C# real29checks nuevos y48anteriores, sin red. Oxlint del archivo nuevo sin errores/advertencias; build PASS689módulos con advertencia de chunks previa; diff PASS. Sin nuevas consultas ARCA o cambios remotos.

## Compatibilidad del preparador Windows y custodia — plan 27/10/2026
GO humano recibido para una autenticación WSAA y FECompUltimoAutorizado PV2/tipo11 al retomar después de27/10 07:04 Argentina, sin retries ni tarea programada. A00:28 todavía no corresponde; no ejecutado, sin handle de espera ni TA disponible. Mientras tanto se revisó provisión: preparador exige mínimo12 caracteres pero fiscalPrivateCustody mínimo16; compatibilidad declarada PBES2 .NET todavía sólo cubierta por fixtures PKIJS. Preparar prueba cruzada con salida real del preparador y certificado sintético Test, descifrado/clave no exportable/CMS usando lector de producción. Alinear mínimo futuro a16 sin debilitar custodia ni usar/rotar claves originales. Si material histórico no cumple, tratarlo como gate privado de reprotección con GO independiente, nunca pedir contraseña por chat. No modificar Edge/SQL remoto ni secretos por esta revisión.

### Compatibilidad cruzada comprobada — 27/10/2026

El preparador ahora exige16 caracteres en función/prompt, coincidiendo con el
mínimo de custodia. No se debilita el lector ni cambia formato/algoritmos.
Prueba Windows nueva ejecuta el preparador real (RSA3072, PBES2/PBKDF2-SHA256,
200000 iteraciones/AES256-CBC) en directorio temporal exclusivo de ensayo con
ACL privada y frase Unicode sintética. Certificado de laboratorio firmado por
CA sintética CN=Computadores Test para la clave del CSR. No es certificado ARCA.
El lector real de custodia importa la clave NO exportable, verifica huella y
revisión; prepareWsaaRequest firma/verifica CMS. Contraseña incorrecta falla
con mensaje cerrado; no salida PEM/CMS en diagnósticos. Limpieza sólo del root
sintético previamente validado; material original/DPAPI nunca leído o rotado.

Pruebas de frontera: rechaza12/15 y acepta16, además de CUIT/alias/destino y
sobrescritura/ACL previos. Primer pase23/23PASS en3archivos. Esto acredita
interoperabilidad criptográfica .NET→PKIJS/WebCrypto con material sintético,
no custodia real instalada ni WSAA hospedado. Si una contraseña histórica tiene
12–15 caracteres, no funcionará con el gate actual: requiere revisión privada
y, si se autoriza, reprotección, sin exponerla ni regenerar certificado por defecto.
No se comprobó longitud de la contraseña real ni se infirió que deba cambiarse.
No secretos/flags/SQL/Edge/Vercel remotos, usos de claves originales, ARCA o CAE.

Cierre final del incremento:23/23PASS en3archivos y build689PASS después del último cambio. Oxlint:0errores,0advertencias nuevas; permanece no-unsafe-finally previo de arcaHomologationPreparation.test.ts, nuevo interop sin advertencias. Diff PASS. No suite global ni aceptación hospedada de custodia acreditadas por este incremento.

## Renovación de catálogo conservando historial — plan 27/10/2026
La primera carga autorizada dejó revisión1 inactiva. El generador inicial sólo acepta baseline vacío; no servirá para una renovación después de caducar la evidencia. Ampliarlo localmente con snapshot público revisado (bytes/SHA256) opcional y completo de revisiones existentes. Exigir revisión siguiente, consulta posterior y evidencia no registrada; ligar snapshot al hash aprobado. Bajo el mismo lock SQL comparar todas las filas/campos tipados y conteo antes de INSERT inactivo; cualquier cambio/activación concurrente bloquea. Nunca UPDATE/DELETE ni autoactivar/renovar vigencia, conservar modo inicial con guard vacío. Probar renovación, replay, baseline ajeno/cambiado y preservación exacta con PGlite. Sin ejecutar SQL, consultar ARCA, importar ni activar nada remotamente.

### Renovación local preparada — 27/10/2026

Generador amplía el modo inicial, que conserva baseline vacío, con baselinePath/
baselineSha256 opcionales en pareja; en API pura baselineText/baselineSha256.
Snapshot JSON es array completo de filas: revision, condiciones, alicuotas,
fuente_sha256, consultado_en, vence_en, habilitado. SHA256 de bytes revisados,
forma/campos/rangos y unicidad obligatorios, máximo1MB/100revisiones. No valores
privados ni emisor/PV/credenciales en este snapshot. Fecha UTC puede mantener
precisión original; comparación DB usa jsonb_populate_recordset sobre tipo
canónico y to_jsonb de ambas filas, no formateo aproximado de timestamps.

Nueva revisión debe ser max(snapshot)+1; consulta más reciente que todo el
historial y fuente no registrada. El hash aprobado incluye hash del baseline.
El guard bajo SHARE ROW EXCLUSIVE exige conteo y todas las filas/campos tipados
idénticos al snapshot; cambio de habilitado, payload o revisión concurrente
bloquea. INSERT nuevo siemprefalse, sin UPDATE/DELETE/upsert. No desplaza ni
reactiva revisiones. Vigencia de fuente/propuesta y GO/destino siguen exigidos.
Los ajustes de sesión no reemplazan verificar proyecto real; snapshot exige
lectura independiente fresca y revisión antes de un GO de renovación específico.

38 pruebas PASS en fiscalParameterPlan:26 previas y12 nuevas, incluyendo SQL
PGlite preservación exacta/replay/cambios de baseline y CLI snapshot/hash,
nooverwrite y checksum inválido sin directorio generado. El caso payload
simula drift local con sólo DDL canónico, no pretende acreditar un UPDATE
permitido por el trigger de inmutabilidad ni concurrencia PostgreSQL nativa.
Oxlint enfocado PASS sin advertencias. No nueva propuesta real/revisión2
materializada/importada, ni renovación de la fila1 ya instalada. No ARCA,
uso de certificados originales, SQL/Edge/flags/Vercel remotos ni emisión.
Suite integrada final iniciada en proceso local aparte, aún sin resultado.

Compatibilidad del modo inicial comprobada con evidencias públicas existentes: hash y SQL íntegro reproducen exactamente la propuesta c753a5bd... ya aprobada, sin escribir archivos ni reejecutar SQL. No se alteraron sus artefactos originales. Guía incorpora lectura de snapshot READ ONLY/UTC/ROLLBACK como preparación futura, no ejecutada en este incremento.

Relectura offline de evidencia pública original: condición5 Consumidor Final trae literalmente C/49 y se conserva como comprobantes[11] tras excluir49. No agregar6/FacturaB por conocimiento previo ni modificar JSON/fechas para hacerlo compatible. Es observación de ese snapshot, no conclusión normativa sobre todas las FacturasB. La primera consulta autorizada PV2/tipo11 no se amplía a otros tipos o catálogos por esta observación. Cualquier aclaración/actualización externa conserva su GO.

### Cierre integrado local sobre el árbol final — 27/10/2026

Suite completa vitest run --maxWorkers=2, salida0:4853PASS/1skipped,
4854totales,311archivos,0fallos. Informe:
../pilot-local-closure-20261027-catalog-renewal.json y .log.
SHA256 JSON dd13e61e8c2ec72dfddfaf8ef0f7471f140943a8f51e809fdfc0090b9acdb150.
Omitida histórica: F6.2D-C3C-2 local enrichment SQL generator / preserves the
reviewed942-position candidate set and cutover blockers, por fixture externo
de revisión no configurado. No omisiones fiscales nuevas. Este pase incluye
WSAA/catálogos/último, aislamiento/helper Windows y compatibilidad de custodia
sintética, además de los módulos previos; no convierte fixtures en aceptación
hospedada de Auth/RLS/ARCA ni prueba el punto o el CAE.

Renovación dirigida38/38PASS; oxlint enfocado sin errores/advertencias,
node --check/diff PASS. Build final689módulos PASS, advertencia de chunks previa.
Símbolos del generador/normalizador/custodia privados ausentes de dist/assets.
SQL de herramientas sólo probado en PGlite en este incremento: no se repitió
concurrencia PostgreSQL nativa, cuyos180casos previos quedan históricos. No
modificó SQL001–053, runtime Edge ni frontend; no instalar/activar por esta suite.
El proceso completo se observó vivo por su handle y terminó0; no se reinició
por falta de salida del reporter JSON mientras trabajaba.

Estado remoto no alterado por este bloque: revisión1 previamente instalada
permanece fuera del alcance de cambios (sin renovación/activación solicitada),
provisión de emisor/custodia y flags pendiente. GO WSAA+último PV2/tipo11 después
de07:04Argentina aún no ejecutado; a esta hora sigue antes del límite humano.
Sin CAE, merge, cambios master/Production o tareas programadas. Objetivo global
PR02–PR11 continúa pendiente; no declarar cierre de PR03 por evidencia local.

## Consulta real de último autorizado — 27/10/2026 11:49 Argentina

GO humano de WSAA+una lectura PV2/tipo11 después de07:04 ejecutado una vez,
con fuentes del diagnóstico idénticas a a13f8bb (HEAD936260e), árbol limpio y
presencia de certificado/clave cifrada/DPAPI originales confirmada sin valores.
Par/TRA/CMS PASS, WSAA PASS y FECompUltimoAutorizado PASS: punto2/tipo11,
último observado0. Respuesta SHA256
978afca494593ee80af25f5ece93b51dbf39d062bc2056315f0f6801738ecf4c.
Sin retries, número reservado=false y comprobantes emitidos0, proceso salida0.
PUNTO_HABILITADO=NOT_PROVEN conservado; no convertir lectura en acreditación
completa de emisión o alta productiva necesaria. El602 histórico del listado
permanece como hecho distinto, no se repitió ese método.

Log de metadatos fuera de Git:../arca-ultimo-homologacion-20261027-pv2-t11.log,
SHA256 a77052f26acbe20c751eef3fe3dcc9402f7544a483b29d15b87643587983ec60.
TA sólo en memoria del proceso terminado, no guardado ni provisionado.
Expiración informada:28/10/2026 02:49:53.999Z (27/10 23:49:53.999 Argentina).
No realizar otro LoginCms durante esa vigencia como supuesto refresco ni
extraer TA del proceso ya terminado. El GO específico está consumido; nuevas
consultas/autenticaciones requieren autoridad independiente y coordinación.
Sin Supabase/flags/Vercel, emisor/custodia/secretos provisionados ni CAE.

## Separar escritura de datos del gate base — plan 27/10/2026

Revisión previa a aceptación positiva encontró GUARDAR_DATOS_FISCALES disponible
con backend base, mientras emisor/catálogo habilitados harían viable su escritura.
Antes de autorizar ese contexto positivo, agregar gate privado independiente
ARCA_HOMO_DATA_PREPARATION_ENABLED, literaltrue y defaultcerrado, en HTTP y servicio.
Revalidar después de await/contexto/canónico antes de RPC; no repetir Auth ni
inferir otro actor. GET contexto/resolución histórica no dependen del gate nuevo.
No implica que toda la API base sea sólo lectura ni reemplaza permisos SQL.
Pruebas de ausente/false/case incorrecto/revocación/lectura y sin red/credenciales.
Actualizar inventario y preparar candidato Edge cerrado contra commit explícito,
sin sobrescribir el paquete instalado bac8ac1. Staging permanece con runtime
anterior; no habilitar emisor/catálogo allí antes de desplegar este control con
nuevo GO específico y completar la revisión de los demás caminos de escritura.

Implementación local del gate completada:175pruebas de HTTP/servicio PASS, incluyendo5valores no true en cada frontera, revocación de datos/base/destino tras contexto, recuperación histórica legible y sin Auth/RPC/red al bloquear HTTP. Empaquetador admite commithex40/salida nueva, verifica diff de fuentes/no versionadas y nooverwrite;4casos CLI adicionales PASS (179dirigidas/3archivos). Verificador ahora valida hash/destino/imports y no altera paquete; candidato agregará5casos con base true y datos apagados. Oxlint/sintaxis/diff PASS, build689PASS previo al último test CLI; compilación final y regresión global actual en curso. Runtime remoto sigue anterior sin gate nuevo: no provisionar ni habilitar por este incremento.

Compilación final689PASS y fronteras de bundle privado PASS;179dirigidas/3archivos y oxlint/sintaxis/diff sin hallazgos nuevos. Se fija commit local de fuentes para crear el candidato reproducible antes de publicar; suite integrada continúa en su mismo proceso, sin reinicios. El paquete bac8ac1 instalado no se sobrescribe ni despliega por preparar este candidato.

### Candidato reproducible de gate de datos — aafb32c

Fuentes fijadas en commit aafb32c. Paquete nuevo fuera de Git:
../edge-staging-data-gate-20261027-aafb32c/.
74módulos,342453bytes; SHA256
37db174616cde300cb04aed47e5609c39841c569d99f4d26576171730ebf6c9b.
Manifiesto fija Staging acoyfwwmhaeruciyedri, arca-homologacion y JWT=true;
externalsnpm4 conservan versiones pinneadas. No se tocó el paquete bac8ac1.
Verificador del paquete completo:9casos PASS, network0/privateCredentialReads0,
base ausente cerrada y, con base true sintética, guardado cerrado ante5valores
no true del nuevoflag. Verificador comprueba bytes/hash/imports antes de
cargar código, env/fetch sintéticos; no escribe dentro del candidato.
Log ../edge-data-gate-verification-20261027.log, sin credenciales reales.

Build final689PASS, frontera del bundle público sin flag/custodia privados,
oxlint global0errores/137advertencias previas (informe local
../fiscal-data-gate-lint-20261027.json). No nueva aceptación remota ni SQL nuevo.
Regresión integrada sigue en mismo handle; no publicar un PASS global hasta
su terminación. Instalar este candidato requiere nuevo GO, verificando JWT ON,
código remoto exacto y backend cerrado; no activar flags ni provisionar por ello.

### Regresión global inicial y corrección de limpieza local — 27/10/2026

Primer pase posterior al gate:4872PASS/1FAIL/1skip,312archivos, salida1.
Informe ../pilot-local-data-gate-20261027.json y .log se conservan como FAIL.
Único fallo: ensayo sintético f6-3b-initial-platform-admin-production,
compensates a profile transaction failure..., ENOTEMPTY al rm de su carpeta
f6-initial-admin temporal. No fallo del gate nuevo ni ejecución en Production.
Código confirma persistencia/evidencia/close aguardados; no se acreditó el origen
exacto del error de filesystem. No dar el pase global como aprobado.

La limpieza ahora verifica ruta absoluta bajo tmp y prefijo propio antes de
rm recursivo, con3reintentos acotados/100ms ante errores transitorios manejados
por Node. Un fallo persistente sigue fallando; no se quitan aserciones de
compensación/Auth/caja ni se omite la prueba. No borra carpetas de ensayos
anteriores ni cambia scripts/runtime productivos. Revalidar ese contrato y
repetir el pase integrado final por el fallo, sin reinstalar nada remoto.

### Alcance de punto y coordinación de próximos ensayos — 27/10/2026

Se contrastó manual oficial WSFE v4.7 (01/09/2026), sección
FECompUltimoAutorizado, p127: documenta11000 para rango1..99998,11001 para tipo
habilitado y11002 para punto habilitado en el WS. La respuesta real del ensayo
fue válida para PV2/tipo11 y no devolvió esos errores. Esto permite registrar
PV_SERIES_READ=PASS para esa consulta/CUIT/entorno, no afirmar un alta en
Producción ni que toda FECAESolicitar futura será aceptada. Se conserva el
marcador conservador PUNTO_HABILITADO=NOT_PROVEN del diagnóstico y el602 previo
como hechos distintos. No pedir un alta productiva por inferencia. Fuente:
https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf .
El0 observado no se importa como número reservado ni se reutiliza como consulta
fresca del worker: cualquier numeración futura debe revalidarse con su GO.

Pendiente de orquestación real antes de nuevas autenticaciones: provisionar y
aceptar custodia/keyring/caché privados mediante su GO, y coordinar vigencia del
catálogo con las consultas en ese mismo circuito. SQL013 exige catálogo vigente
y revisión igual antes de preparar cuerpo; no borrar/prolongar manualmente la
fila1 para sortear expiración. Un diagnóstico aislado que descarta TA no lo
hace disponible al servidor y no autoriza extraerlo/almacenarlo después.
Preparar el alcance coordinado antes de solicitar la próxima auth; no repetir
LoginCms ni consultas de catálogos sólo para desbloquear otro paso. No se
implementó ni habilitó una vía nueva de refresco remoto en este incremento.

### Segundo pase y entrada heredada detectada — 27/10/2026

Segundo pase global4871PASS/2FAIL/1skip,312archivos/salida1 conservado en
../pilot-local-data-gate-final-20261027.json/.log. Los2fallos son ENOTEMPTY
al limpiar temporales del otro archivo f6-3b-initial-platform-admin.test.ts;
la variante production antes corregida pasó. Se unifica limpieza en helper
específico de pruebas: ruta resuelta/tmp/prefijo propios y5reintentos acotados,
fallo persistente propagado. Los17casos de ambos contratos F6 pasan enfocados;
no se omiten aserciones ni modifican scripts de administración o datos reales.

Se confirmó en fuentes001–053 que preparar_operacion_fiscal_homologacion
(uuid,uuid,uuid,jsonb) aún concede EXECUTE a authenticated. Requiere Dueño activo
propio y no reserva/emite ni toca caja/stock, pero puede insertar contexto y
snapshot desde RPC público sin gate HTTP. Ningún módulo posterior la revoca;
SQL012 ya crea operaciones por su ruta privada sin llamarla. El nuevo gate de
GUARDAR_DATOS no cierra por sí solo esa entrada. Estado remoto actual debe
revalidarse por lectura antes de aplicar; no afirmar que ya está revocado.

Plan SQL054: revocar ejecución externa de esa entrada sin borrar historia ni
cambiar su cuerpo. Guard de identidad/owner/SECURITY DEFINER/search_path y SHA256
normalizado del cuerpo001 ce6da3e9c57e5bd82e594497220be1669f6abeb431dc154df3d1df99bb367141;
exigir ruta012 privada disponible; comprobar que queda sólo autoridad del owner
DB. Idempotente, transaccional, no DML ni activaciones. Guardar fixtures
históricos anteriores en su fase y probar explícitamente después de054 las
negativas de roles y que la preparación privada sigue funcionando. No instalar
sin nuevo GO; no atribuir cierre de creación fiscal sólo al nuevo flag Edge.

### Validación enfocada de SQL054 — 27/10/2026

12/12 casos SQL054 PASS en PostgreSQL embebido, con bootstrap canónico y
SQL001–012 reales. Ruta012 sigue preparando datos con service_role después de
la revocación; las tres identidades externas fallan antes de insertar contexto.
Se prueban idempotencia, conservación de cuerpo/historia, cuatro clases de
drift y rollback frente a un ejecutor inesperado. No acredita todavía baseline
completo001–054, JWT hospedado ni nueva concurrencia nativa.

208/208 pruebas enfocadas PASS en6archivos (SQL054, servicio, HTTP, empaquetado y
ambos contratos F6). Oxlint de los archivos modificados sin diagnósticos; diff
sin errores. Limpieza temporal compartida: sólo hijos resueltos de tmpdir con
prefijo propio, reintentos acotados y propagación de fallos persistentes.

Inventario incremental054 SHA256
96a12b2f4738993af429c11deb539ff144b6dc04c2f381fee5fae3966e35b066.
Candidate Edge aafb32c mantiene manifest/hash anteriormente documentados porque
este incremento no cambia fuentes de funciones. Ambos quedan sólo locales.
Siguiente cierre: regresión completa en reporte nuevo
../pilot-local-data-gate-v3-20261027.json/.log, build y lint finales. No sustituir
los dos reportes FAIL anteriores ni declarar su deuda resuelta hasta salida0.

### Cierre integrado final del incremento — 27/10/2026

Suite completa v3:4885PASS/0FAIL/1skip históricoF6,313archivos,salida0.
Reporte ../pilot-local-data-gate-v3-20261027.json; SHA256
fa8d34c0a121a3983c81344bf66c706ec2f67907c116fe29864fff2b227464b7.
El único skip sigue siendo F6.2D-C3C-2 sin F6_C3A_CANDIDATES_PATH; ninguna
prueba fiscal nueva omitida. Los17contratos F6 pasan ahora también integrados.
Los dos reportes FAIL previos quedan preservados como historia, no sobreescritos.
Build final689módulos/salida0; lint global0errores/137advertencias previas,
../fiscal-data-gate-lint-v3-20261027.json; diff PASS. Símbolos
ARCA_HOMO_DATA_PREPARATION_ENABLED/emitFiscalCreditOperation/
FISCAL_CREDENTIAL_KEYRING ausentes del bundle público generado.

SQL054 y Edge candidato cerrado aafb32c siguen sin instalar. Antes de solicitar
su ejecución remota: revisión del bloque, respaldo actualizado verificable y
GO específico; no reutilizar el GO001–053 ni el del runtime anterior. El respaldo
pre-fiscal anterior no acredita por sí solo el estado fiscal actual. Mantener
cerrados emisor/custodia/permisos/flags y frontend remoto. PR03 parcial, PR02 sin
CAE; no cambios en master/Production ni merge.

### Respaldo previo054 preparado — 27/10/2026

Tras autenticación humana de Git, e21866d ya está publicado en PR3 Draft;
HEAD/base verificados por API, sin merge. Descripción actualizada conserva
historia y diferencia consulta real/validación local/candidatos remotos.

El asistente de respaldo agrega -FiscalInstalado053 sin cambiar modo histórico:
carpeta pre-sql054 única, siete tablas comerciales y41tablas fiscales exigidas
en TOC, función heredada y ACL exactas requeridas. Manifiesto indica etapa y
alcance TOC, equivalencia de esquema/restauración false. Sin nuevas lecturas de
contraseñas, fuentes privadas ni conexión DB por el agente.

15/15 pruebas Windows del asistente PASS con Docker/entrada secreta simulados (incluye
cinco casos nuevos); oxlint enfocado/diff PASS. Build posterior689 PASS. No se
repitió la suite global4885 tras este incremento exclusivo de respaldo: ese
resultado corresponde a e21866d, no al nuevo árbol. El nuevo contrato quedó
cubierto por las15pruebas dirigidas, sin cambios de aplicación/backend fiscal.

Primer preflight real falló en cliente local, sin crear copia ni pedir secreto;
Docker Desktop no ejecutándose confirmado. Se inició el ejecutable local
existente y el mismo preflight -Preparar -FiscalInstalado053 pasó: cliente17,
CA/TLS verify-full disponibles, sin descarga/exportación/DB. Docker queda abierto
para el siguiente paso humano. Respaldo nuevo sigue PENDIENTE de ingreso privado
local por el titular; no instalar054 ni actualizar Edge antes de verificar copia
y recibir GO nuevo. No repetir autenticación ARCA ni modificar flags/Production.

### Corrección de TOC real del respaldo — 27/10/2026

El titular ejecutó el asistente y recibió fallo en índice fiscal previo054.
Lectura local pg_restore --list con red deshabilitada/montaje readonly confirmó
41/41tablas, función exacta y ACL presente. Causa: ACL imprime nombres de
argumentos mientras FUNCTION imprime sólo tipos. Fixture inicial omitía esa
variante real y dio un falso rechazo. Se corrige el patrón para firma exacta
con/sin nombres conocidos, manteniendo tipos y rechazo de sobrecargas.

17/17 pruebas Windows PASS (incluyen ACL real con nombres, identidad sin nombres,
sobrecarga distinta y ausencias); lint enfocado/diff PASS. Patrón real de la
fuente corregida aplicado al mismo TOC local: functionMatches=1/aclMatches=1,
sin modificar archivo ni conexión DB. Categorías seguras específicas añadidas.
No nueva suite global/build por esta corrección exclusiva de PowerShell y sus
pruebas; build689 anterior sigue histórico. Copia parcial no contiene contexto
confirmado: roles/manifiesto requieren completar un respaldo nuevo con contraseña
local del titular. No reutilizarla como PASS ni instalar054/Edge. Se conserva.
La comprobación nativa adicional054 sobre baseline completo sigue pendiente;
sólo se inspeccionó el runner, sin modificarlo ni declarar resultados nuevos.

### Baseline completo SQL054 y respaldo actual verificados — 27/10/2026

El titular confirmó copia pre-sql054-20261027-130712-d9e56bc166c34b96b8f2e2fba92af64f
bajo %USERPROFILE%\KioskoPOS-Privado\Backups\Staging. Verificación local
independiente: contexto BEFORE_SQL054/ref Staging exactos; SHA del dump coincide
con contexto/manifiesto y SHA de roles con su manifiesto; roles sin cláusula
PASSWORD; ACL owner-only/raíz protegida sin reparse; sin parciales. Lista fiscal
coincide exactamente con41tablas del source. pg_restore --list con --network none
y montaje readonly confirmó48/48TABLE DATA (7comerciales+41fiscales), función y ACL
exactas. No se leyó/imprimió contenido de filas ni credenciales. Backup PASS como
archivo verificado, no restauración, Storage, cifrado ni copia externa.

Se amplió el runner local después de sus180casos históricos, instalando054 dos
veces sobre baseline001–053 real. Snapshot de todas las tablas públicas conserva
hashes de filas; funciones conservan cuerpo/owner/search_path/seguridad y ACL
ajenas. Tres roles fallan con42501/permission denied antes de negocio. Preparación
privada concurrente produce una operación, ACK idéntico y ninguna reserva.

Primer pase:182casos completados yFAIL42501 al crear comercio sintético positivo
SOLO_LECTURA. Fixture nueva no había contratado suscripción tras instalar el gate
comercial; corregida sólo con plan/suscripción sintéticos explícitos, sin debilitar
SQL ni omitir aserciones. Conservar ../fiscal-concurrency-054-20261027.json/.log.
Segundo pase PASS183escenarios, PostgreSQL17.11,0peticiones externas/0emisiones:
../fiscal-concurrency-054-v2-20261027.json/.log, SHA256
98ffea8f745d5c2431fd6d713e7bbe75d414496b752a489a092a79d966d0567b.
Contenedor propio detenido, datos sintéticos conservados; los demás intactos.
node --check/diff PASS; oxlint0errores y una advertencia no-unsafe-finally previa.
No nuevo build/suite global por este cambio exclusivo del harness PostgreSQL;
4885/313 y build689 anteriores conservan su alcance/commit documentados.

Paquete Edge cerrado aafb32c revalidado:9casos PASS,0red/0lecturas privadas,
backend flag absent/default closed. SQL054/hash y paquete sin cambios.
Pendiente siguiente: revisión y GO específico para sólo SQL054→DB/ACL→Edge cerrado
→JWT/CORS/gates. Respaldo actual ya disponible. No instalar, activar flags,
provisionar claves/emisor, redeploy Vercel, llamar ARCA o emitir sin autorización.
No merge/master/Production. PR03 y objetivo global siguen parciales.

### Verificadores previos/post054 preparados sin ejecución remota — 27/10/2026

El GO nuevo sigue pendiente. Se inspeccionó el generador local histórico de
verificación: reconoce REVOKE054, pero escribe rutas9054cce fijas. No ejecutarlo
sin adaptar destino/alcance, para no sobrescribir evidencia anterior ni etiquetar
un contrato054 como053. Se generaron artefactos nuevos fuera de Git en
../sql054-verification-20261027, con manifiesto SHA256 y escrituras exclusivas.
Los archivos antiguos quedaron intactos. Dos modelos hasta053/hasta054 difieren
únicamente en auth EXECUTE de preparar_operacion_fiscal_homologacion true→false;
126funciones/41tablas/41triggers iguales. Checks incorporan owner postgres y
search_path exacto, además de hash/carácter definer/grants/RLS/triggers existentes.
SQL de verificación y conteos BEGIN REPEATABLE READ READ ONLY/ROLLBACK; sólo
metadatos/conteos, no contenido de filas ni mutaciones.

Prueba real de los verificadores contra el contenedor sintético retenido del
ensayo183: label/estado/puerto localhost verificados, inicio local y posterior
stop propio, datos conservados. Post054=0problemas/read_only on, pre053 detecta
exactamente function_contract:preparar_operacion_fiscal_homologacion y ningún
otro cambio; conteos iguales antes/después. No JWT hospedado ni Supabase/ARCA.
Primer arranque del comprobador falló antes de Docker por ruta local incorrecta;
se copió al directorio correcto sin borrar el borrador y luego pasó. No reintento
remoto ni cambio de SQL por ese fallo de lanzamiento.

Hashes:53-verify.sql 67d1af4601cdc9e78cfd622b7b18c05471cce2a871af1bc763d78485b9cc1cea;
54-verify.sql 48e91ad090e1a462fd572f624b336093d20428c6c26e9ff6a62a6e680e341b4f;
local-verifier-proof.json e12efcfd452224bbeaf714c08fa04206e768c68041400f16f1ce27092c4438dd.
No fuentes de aplicación/SQL054/paquete Edge modificadas en esta preparación.
Después del GO, verificar destino real por UI/host antes de ejecutar cualquier
artefacto: los comentarios/ref del archivo no prueban por sí solos ese destino.
No convertir esta prueba local en verificación hospedada. Master/Production
intactos en este bloque. Se conserva pendiente la autorización ya solicitada,
sin duplicarla ni inferirla de una continuación automática del objetivo.

### GO ejecutado: SQL054 y Edge cerrado en Staging — 27/10/2026

El titular aprobó revisión y autorizó únicamente SQL054, verificación DB/permisos,
actualización arca-homologacion cerrada/JWT ON y gateway/CORS/bloqueos en
acoyfwwmhaeruciyedri. No incluye cargar secretos, activar flags, Vercel,
Production, consultas ARCA o emisiones. Se ejecuta ese alcance, sin ampliarlo.
HEAD local847a4cc limpio; SQL054 SHA96a12b2f4738993af429c11deb539ff144b6dc04c2f381fee5fae3966e35b066
revalidado y hash del dump previo054 coincide con contexto. Destino real verificado
por URL y título kioskopos-staging (etiqueta main PRODUCTION es rama del proyecto,
no el proyecto productivo). No se leyó ninguna contraseña/token del navegador.

Antes: verificador053 READ ONLY/ROLLBACK=0problemas,126funciones/41tablas/41triggers,
owner/search_path/hash/SECURITY DEFINER/grants/RLS coincidentes.41conteos fiscales:
una fila de parámetros, las otras40tablas vacías. SQL054 pegado/copiado íntegro y
cotejado con fuente/hash antes de Run. Una sola ejecución; Success sin filas.
Después: verificador054 independiente READ ONLY/ROLLBACK=0problemas, mismos126/41/41.
Detalle: legacy EXECUTE false en anon/authenticated/service_role; ruta privada012
EXECUTE sólo service_role; ACL legacy sin ejecutores distintos de owner DB.
Conteos41 iguales, catálogo habilitado0 y emisores0. No afirmar comparación de
contenido completo de filas a partir de conteos; la migración no contiene DML.

Edge previo leído desde editor: hash LF10dc48715527c3e1a1daa230e1945d862814aa8726e83b85928839348f1c40c2,
341976bytes, coincide con paquete instalado histórico. Clipboard Windows añade
CRLF; se normaliza para comparar, sin cambiar fuente. Settings JWT ON antes.
Candidato aafb32ce71093ed14e1b547fd36f7dcf9487c3ab revalidado9casos cerrados PASS,
0red/0lecturas privadas; source completo pegado/copiado y cotejado. Deploy updates
confirmado una vez para arca-homologacion existente; sin otros endpoints.
Tras reload desde servidor:342453bytes y SHA
37db174616cde300cb04aed47e5609c39841c569d99f4d26576171730ebf6c9b,
coincidencia íntegra con paquete74módulos/4imports fijados. JWT sigue ON.
No se abrieron valores de claves, cargaron credenciales ARCA ni cambiaron flags.

HTTP hospedado posterior: POSTsinJWT401; POSTJWTficticio401; OPTIONS origen
Staging204/allow-origin exacto; OPTIONSajeno403/sin allow-origin. Gateway401
agrega CORS* propio, no se confunde con política del handler. Probador oficial
POST{} sin header permitido403 ORIGEN_NO_PERMITIDO; con Origin exactoStaging
503 HOMOLOGACION_NO_HABILITADA. No se relajó CORS para el probador ni introdujeron
claves en sus campos. Prueba base cerrado, no aceptación positiva Auth/Owner ni
prueba independiente del nuevo gate de datos con base abierto. No activar flags
para ampliar este GO. Comprobación SQL final después de HTTP repite detalle y
coincide exactamente; catálogo0habilitados, emisor/TA/operaciones/NC/CAE0.

Artefactos fuera de Git, SHA256:
- sql054-staging-verification-20261027.json:1805fa27bd46af59f7990041ab00eb413b42b713d35114a0cbd22a7b191dfa72
- sql054-staging-final-after-http-20261027.json:80e4508da5655c81aaecc0a09b2b8504256545f47646e1ae2365b0b59f34b724
- edge054-staging-deployed-20261027.json:f5ce1a353fac95f753ef7e5726fa9103f1f63ef918a5d316587b667104366afd
- edge054-staging-gateway-20261027.json:20d9d8d3ff76e57a2cd508f9f85bc092c5f7d4702ff335d82d1c116ec8dbab8b
Capturas sql054-staging-installed-20261027.png, edge054-staging-jwt-on-20261027.png,
edge054-staging-closed-20261027.png; consultas SQL read-only y pruebas HTTP locales
conservadas. Paneles SQL/Edge marcados handoff. Fallos de extracción DOM previos a
aplicar sólo fueron lectura de gridcell vs cell; no provocaron SQL repetido.

Este incremento no modifica código de aplicación: no nueva suite/build local;
4885/313,183PostgreSQL y build689 conservan alcance/fechas anteriores. Evidencia
nueva es hospedada de instalación/cierre, no aceptación fiscal E2E. PR03 parcial,
PR02 sin CAE; PR10/11 y demás gates no cerrados. Siguiente dependencia: preparar
alcance coordinado de emisor/catálogo vigente/custodia/keyring/TA para aceptación
positiva bajo autorizaciones propias. No reautenticar WSAA durante vigencia
conocida del TA descartado ni prolongar catálogo como atajo. No merge/master/
Production, Vercel, impresora/cajón o Point. GO SQL054/Edge consumido.

### Próximo bloque local: preflight de custodia antes de provisión — 27/10/2026

Dependencia de aceptación positiva: compatibilidad del material original con el
lector privado desplegado, no sólo con C# diagnóstico. Preparar asistente local
sin red/persistencia que invoque createPrivateFiscalCustody y prepareWsaaRequest
reales, compare pin y CUIT del sujeto y mantenga clave no exportable. Wrapper
Windows con modo -Preparar sin leer secretos; -Comprobar requiere GO específico
para lectura DPAPI/clave original. Datos privados sólo por stdin de proceso propio,
no argv/env/log/archivos nuevos. Sin uploads/secretos Supabase/flags/WSAA/WSFE.
Contraseña histórica que no cumpla mínimo16 debe fallar, nunca reproteger/rotar
por inferencia. Probar con material sintético y negativos antes de pedir GO.
Este bloque no resuelve refresco de parámetros ni cache real: preparar después
alcance coordinado sin LoginCms aislados que descarten TA. Conservar catálogo1
inactivo y su vencimiento; no prolongarlo como atajo. No usar material original
para desarrollar/testear este asistente. No nuevos workers/SQL/Edge remotos.

### Asistente de custodia local preparado, sin uso original — 27/10/2026

Se implementaron scripts/comprobar-custodia-arca-local.ps1 y
scripts/arca/check-private-custody-local.mjs. -Preparar (también modo predeterminado)
sólo revisa existencia/tamaño/rutas/ACL y Node24; no lee contenidos privados.
-Comprobar requiere autorización específica para DPAPI/clave originales. Reutiliza
createPrivateFiscalCustody y prepareWsaaRequest, no una implementación paralela:
PBES2/KDF mínimos vigentes, huella pinneada, issuer Test/fechas, correspondencia
clave-certificado por firma CMS verificada y CUIT del sujeto. No acredita cadena
ARCA, representación de otro CUIT, PV, WSAA/WSFE ni permiso fiscal SQL. IDs internos
son efímeros para el adaptador, no identidades provisionadas ni datos de venta.

Datos privados sólo stdin UTF8 de proceso Node propio con límite220KB; no argv,
env, stdout, archivo nuevo, upload o .env. Se rechazan NODE_OPTIONS/NODE_PATH,
se limita tiempo, se controla proceso hijo y salida cerrada. Fetch bloqueado en
el comprobador; no llamadas de red en el flujo. Clave importada no exportable;
password/buffers se liberan al cerrar proceso (strings JS no tienen borrado
verificable y no se promete). Archivos de entrada no se escriben. No reproteger,
rotar, corregir material ni relajar mínimo16 por un fallo. Diagnóstico de etapa
sin excepción externa/PEM/frase/DN/CUIT. -Preparar y -Comprobar juntos fallan.

Historia de verificación:13casos core PASS. Primera extensión Windows21casos
13PASS/8FAIL: fixture no propagaba exit y selección Node devolvía dos rutas.
Tras corregir fixture:18PASS/3FAIL, NODE_VERSION; observado Get-Command con dos
aplicaciones y node24.19.0. Se selecciona explícitamente primera aplicación,
sin asumir array escalar. Siguiente17PASS/4FAIL en DPAPI: serialización sintética
con newline; se recorta espacio exterior del blob cifrado antes de ConvertTo-
SecureString. No cambio de cifrado ni de contraseña. Después21/21PASS. Negativas
Windows ahora exigen etapa exacta; no aprobar un rechazo por la razón equivocada.

Final:71PASS/0FAIL/0skip en5archivos, incluidos22casos nuevos y contratos de
custodia factura/NC/.NET. VarianteUnicode real DPAPI→stdin→Node, key/cert
incompatibles, pin/frase/CUIT, política mínima, tipos/extra/JSON/tamaño y ACL/ruta/
Node-config rechazados; archivos sintéticos permanecen iguales. Fixture compartida
sólo agrega frase optativa conservando orden y generación aleatoria anteriores.
Reporte ../fiscal-local-custody-preflight-final-20261027.json/.log, SHA256
96a58dbc79e162250ba59538d72a3647731255dd6cac040a1ff543513d54481d.
Build689 PASS; oxlint enfocado/node check/diff sin diagnósticos; asistente ausente
del bundle público. No nueva suite global ni concurrencia nativa por este bloque
de tooling local; resultados anteriores conservan su alcance.

Consulta pública de uso confirmó servicio restablecido tras el fallo del control
de aprobación por límite; no se eludió esa revisión. La acción antes denegada no
había aplicado el último patch ni corrido tests; se inspeccionó el árbol antes de
retomar y se corrigió sin usar material original. Estado privado real: sólo
-Preparar ejecutado, READY por rutas/ACL/Node24, sin leer clave/DPAPI. Certificado
PÚBLICO revisado con X509: Test, huella DER
bbcaffebce0f62e1d626e9f6f425dfa70a2de22031df12536a3876d2193af9d0,
vigente hasta19/10/2028. No se infiere compatibilidad de la clave original.

Siguiente autorización concreta: una comprobación LOCAL de original con este
asistente, lectura DPAPI/frase sólo en memoria, pin público anterior y CUIT del
certificado ya autorizado. Sin red/WSAA/WSFE, exportación/persistencia de material,
Supabase/flags/SQL/Vercel/Production ni emisiones. Si política histórica falla,
registrar y detener; no rotación/reprotección implícita. Ese GO aún no recibido.
Custodia/keyring hospedados y catálogo/TA coordinados siguen posteriores; no
cargar secretos por aprobar el diagnóstico local. Staging permanece51ad94d/cerrado.

### GO local original consumido: compatibilidad de custodia PASS — 27/10/2026

El titular autorizó una única comprobación exclusivamente local del certificado,
clave cifrada y protección DPAPI originales con lector backend; frase sólo en
memoria, sin red/WSAA/WSFE/exportación/rotación/provisión/flags/Vercel/emisiones.
Se verificó HEADccddbfa limpio y ausencia de drift de asistente/lector/firmador
antes de ejecutar. Una invocación -Comprobar, sin retries: salida0,
CUSTODY_LOCAL_PASS nonexportable=true cms_verified=true cuit_matches=true
network=0 provisioned=false. Se importó y usó en memoria el original sólo dentro
de este GO. Frase y clave no impresas ni persistidas, archivos originales no
escritos por el asistente. No nueva autenticación WSAA, Token/Sign ni operación
fiscal. Pin DER público bbcaffebce0f62e1d626e9f6f425dfa70a2de22031df12536a3876d2193af9d0.

Evidencia segura ../fiscal-local-custody-original-20261027.log, SHA256
13b03c5ec21d4afe163da3974766644ee195fe23bc105cd490589208f65d1d75.
Incluye una línea técnica no sensible System.Threading.Tasks.VoidTaskResult
antes del PASS: PowerShell imprimía retorno de WriteAsync.GetResult. Se conserva
el log original; no limpiarlo ni simular una ejecución nueva. Corrección limitada
posterior suprime ese retorno con $null y exige salida exacta en tests Windows.
22/22casos sintéticos PASS/0skip, ../fiscal-local-custody-output-20261027.json/.log;
lint enfocado/diff PASS. No repetición del material original para probar formato.
No nueva suite/build por ese ajuste exclusivo de salida PowerShell;71relacionados
y build689 previos conservan su alcance/fecha. La validación original corresponde
al asistente ccddbfa, previo a esa corrección inocua de formato.

LOCAL_ORIGINAL_CUSTODY_COMPATIBILITY=PASS: clave importable no exportable, CMS
verificado con certificado/identidad pinneados y política vigente satisfecha.
No acredita cadena ARCA, representación/PV, credenciales instaladas en Supabase,
keyring/cache TA compartidos o aceptación hospedada positiva. No hace falta
reproteger/rotar como consecuencia de este resultado. Los6valores ARCA de custodia/
keyring aún no provisionados; este GO no se puede reutilizar para copiarlos,
exportarlos o leer originales otra vez. Siguiente trabajo local: alcance y
transporte privado revisables para esa provisión cerrada, seguido de catálogo/TA
coordinados y aceptación positiva con GO propios. Staging/SQL/Edge/flags y Vercel/
Production sin cambios por este bloque; PR03 parcial, sin nuevo CAE/merge.

### Plan local de provisión cerrada, gate original sin repetir — 27/10/2026

El titular revisó b11e660 y cerró explícitamente compatibilidad original PASS:
no nuevas pruebas CMS ni rotación/reprotección. Sólo preparar mecanismo; aún
NO autorizado copiar seis valores a Supabase. Diseñar plan público con destino
Staging exacto,6nombres y huella/IDs/revisión, hash/vigencia y precondición de
nombres ausentes/13flags privados false o ausentes. Sin emisor/SQL/activación.

Transporte previsto sólo en memoria bajo GO futuro: módulo Node controlador
captura pipe privado de PowerShell, verifica DTO cerrado y no serializa valores.
Lector reutiliza únicamente -Preparar (metadatos) y lee original una vez para
copiarlo, sin importar RSA, probar CMS, llamar WSAA/WSFE o crear archivo privado.
La frase DPAPI se obtiene sólo para la copia autorizada; keyring aleatorio32bytes
se genera sólo en esa carga. Ningún valor en argv/env/log ni errores externos.
No ejecutar lector original/desencriptar DPAPI durante desarrollo. Tests con
material sintético; después preparar propuesta pública revisable y pedir GO.

Luego sólo presencia/digests comparados en memoria, nombres previos sin cambios,
flags cerrados y Edge503. Eso acredita provisión cerrada/metadatos; no función
criptográfica desde Edge ni TA/cache compartidos. Ante colisión/drift/resultado
parcial detener sin sobrescribir/borrar/reintentar. No LoginCms/WSFE/CAE por este
bloque. Catálogo vigente, emisor/representación y aceptación positiva posteriores.

#### Cierre de preparación local del transporte — 27/10/2026

Implementados plan público JS-only, lector PS interno y entrega privada con tipos
.d.mts. 95PASS/0FAIL/0skip,7archivos en
../fiscal-custody-provision-final-20261027.json/.log; SHA256 JSON
3fbe707a6d59410e1ab701f92a3bb2d8809eb663d36d27b3eea5acf0c37a2199.
46casos del primer cierre también PASS. Sintéticos Unicode/DPAPI/ACL/pin y
archivos intactos; equivalencia de checksum CUIT con servidor en2000candidatos.
Entrega oculta a JSON, TA32bytes con loader real no exportable, rechazo de
colisión/hash/flags/parciales/digests/dispose. Sin contenidos originales.

Fallos preservados: primer test pipe rechazó sintaxis PS por operadores booleanos
al principio de línea; corregidos sin relajar validación. Primer import UI rechazó
dependencia TS: plan público pasó a JS-only con equivalencia probada. Primer build
rechazó falta de declaraciones .mjs: añadidos tipos .d.mts, sin any/supresión.
Build final PASS689; lint enfocado sin diagnósticos, PS AST/node check/diff y
ausencia de símbolos nuevos privados en dist PASS. No nueva suite global/SQL
por estas herramientas locales; evidencias previas conservan alcance.

Import real del controlador en CUA PASS (typeof function), sin invocarlo con
originales. Lectura UI Staging muestra6customsecrets anteriores, único flag fiscal
presente BACKEND=false por digest; otros12ausentes, sin custodia/keyring.
No valores revelados ni form cambiado. Revalidar inventario fresco antes del GO.

Propuesta pública fuera de Git ../fiscal-custody-public-proposal-20261027.json,
hash canónico9c59757ef3592ced0e198ac6b9fc91f12a30dfa905d14059aa88897bc9f99344,
vigencia hasta28/10/2026 20:46:25.601Z (17:46Argentina).
Credencial9a4916d1-b6b5-499f-98ef-9f6cf79510be; TAkeyb14101fb-ba80-4d3f-a102-d2f8c96f3072.
Seis nombres públicos derivados en propuesta; aún no valores privados preparados.
Próximo: revisión/GO de provisión cerrada únicamente. No confundir copia/metadata
con custodia funcional hospedada; no LoginCms/WSFE ni emisor/activación por este GO.


#### Entrega terminal ante drift — 27/10/2026
Revisión local posterior al cierre a210b42 detectó que verifyInventory rechazaba
parciales/drift pero conservaba entrega reutilizable hasta dispose del controlador.
Ahora cualquier rechazo de metadata elimina el mapa y deshabilita definitivamente
value/verifyInventory: no puede corregirse el inventario y reutilizar esa entrega.
49tests enfocados PASS/0skip (3nuevos para valor privado, configuración previa y
flag alterados), build689 y lint enfocado/diff PASS. Informe fuera de Git
../fiscal-custody-terminal-drift-20261027.json, SHA256
6f4fb0f6cbe13963cded64fd69286d4acab269a8e72406f7f6851672eaa92811.
95tests anteriores mantienen su alcance; no suite global nueva. Ningún original,
Supabase/flag/ARCA/CAE utilizado. GO de seis secretos sigue pendiente, propuesta
pública sin cambios: este endurecimiento no amplía la autorización solicitada.


#### GO de provisión recibido; ejecución privada impedida — 27/10/2026

El titular autorizó exclusivamente los6secretos de propuesta9c59757e, copia
mínima sin repetir CMS, verificación de metadatos/Edge cerrado. No falta ese GO.
A17:53Argentina, plan/hash/vigencia y destino UI exacto revalidados; baseline
6customsecrets,6nombres nuevos ausentes,13flags false/ausentes.

Un único intento de crear entrega en el controlador CUA falló READ_PIPE, sin
retornar valores ni tocar el formulario/Save. No repetir. Sonda posterior
EXCLUSIVAMENTE pública (pwsh imprime literal RUNTIME_READY, sin archivos privados)
retornó errorEPERM, exitnull/readyfalse: ese entorno impide lanzar el proceso
Windows. Importar módulo no acreditaba capacidad de spawn; los PASS sintéticos
en shell local tampoco prueban ese permiso del entorno UI. No es fallo de
compatibilidad criptográfica: b11e660 permanece PASS y no se repitió CMS.
No usar consola, argv, clipboard, archivo privado o servidor improvisado como
atajo de transporte. Resolver canal privado permitido antes de otro intento.

Inventario UI posterior idéntico por comparación en memoria:6previos intactos,
6nuevos ausentes;0Save. Una petición del probador oficial POST{} con OriginStaging
respondió503HOMOLOGACION_NO_HABILITADA. Sin cambios SQL/Edge/flags/Vercel/emisor,
WSAA/WSFE/CAE/Production o merge. Provisión/custodia hospedada NO CONFIRMADAS.

Evidencia fuera de Git:
- ../fiscal-custody-provision-blocked-20261027.json SHA256
77a7d7cf9c8299e3529e9825a4eae83a8781ed62e8a2614528bd0c9c8b881dfd.
- ../fiscal-custody-edge-still-closed-20261027.json SHA256
c847837cd95336f40f2f104e436c078b7e56063191519fc9f69d47817670a3f0.
- captura fiscal-custody-edge-still-closed-20261027.png muestra503sin valores.

Diagnóstico endurecido: spawn síncrono/asíncrono ahora sólo expone categorías
PROCESS_DENIED/PROCESS_MISSING/PROCESS_UNAVAILABLE, sin mensaje/path externo ni
retry.32tests PASS/0skip en3archivos,5nuevos cubren rechazo de proceso sin usar
archivos privados. Build689/lint enfocado/diff PASS. Informe
../fiscal-custody-runtime-denied-20261027.json SHA256
652ff9d64cfb3aab66e3e966c54c7e26aab0977f67165399dae47b67ed4e7690.
No se reejecutó entrega original para probar el nuevo diagnóstico.

#### Alternativa local interactiva al proceso CUA impedido — plan 27/10/2026
Preparar asistente que el titular ejecutará en PowerShell7.4, usando Management
API oficial Supabase (GET/POST /v1/projects/{ref}/secrets), sólo destino Staging.
PAT scoped se ingresa en prompt privado local: nunca pedirlo por chat, leerlo
desde navegador/CLI ni generarlo automáticamente. Sólo permisos Secrets Read/
Write del proyecto, no service_role/contraseñaDB. Sin uso real durante desarrollo.
Reutilizar entrega privada/plan, GET baseline antes de originales, segunda lectura
para detectar drift antes de POST único6valores, GET final/digests/dispose.
Sin redirect/retry/archivo secreto/clipboard/servidor local. Tras POST incierto,
reconciliar metadata antes de otra ejecución. API no acredita CAS remoto: exigir
ventana exclusiva sin editores concurrentes y declarar esa limitación, no prometer
atomicidad. Modo Preparar sin red/secretos prueba realmente spawn en contexto local.
Tests sintéticos y revisión antes de entregar instrucciones; GO de6valores ya
recibido, no confundir mecanismo alternativo preparado con provisión realizada.


#### Alternativa del operador preparada y probada — 27/10/2026

Implementados provisionar-custodia-staging-privado.ps1 y núcleo/CLI MJS privados.
Sólo proceso del titular, PAT scoped en Read-Host seguro/stdin, endpoint Management
API oficial fijo de Staging. Sin crear token, sesiones navegador/CLI ni ejecutar
provisión real. GET antes de originales, recheck, único POST6 y GET/digests/dispose.
Sin redirects/retries; write_attempted/reconcile_before_retry explícitos ante
incertidumbrePOST. Funcionalidad Edge/keyring/TA no acreditada por metadataPASS.
No CAS documentado: ventana exclusiva explícita, no prometer garantía concurrente
entre últimoGET y POST. Contrato real API todavía pendiente; sólo64hex en value.

Public wrapper -Preparar ejecutado realmente con propuesta vigente: READY/runtime
true/private_readfalse/network0. El proceso local sí inicia donde CUA daba EPERM;
no se cambió ni evadió su entorno restringido. No original ni PAT real para esta
prueba. -Provisionar interactivo queda a cargo del titular y requiere hash y
VentanaExclusiva. Mismo GO de6valores, no nueva autorización de flags/ARCA/emisor.

120PASS/0FAIL/0skip en9archivos, incluyendo17nuevos de API simulada/operador:
autenticación/metadatos rechazados antes de originales, drift/rechazo/ACK perdido/
partial sin retries y dispose; nativo Preparar con propuesta sintética. Informe
../fiscal-custody-operator-final-20261027.json/.log SHA256
d220d066e6b1f2a665b58b2bd2fce59f3da2de1a24270ec552bad2a7a44f8783.
Build689 PASS; lint enfocado sin diagnósticos tras mover guardia de cleanup a
helper (warning inicial conservado en salida), node/PS AST/diff/bundle PASS.
Sin nueva suite global/SQL nativo por herramienta del operador. Guía existente
incluye comando/alcance, fuentes oficiales y límites de autenticación/metadatos.

Siguiente: titular obtiene manualmente PAT scoped sólo Staging/SecretsReadWrite,
ejecuta asistente en consola propia y comparte únicamente marcador seguro;
verificar independientemente inventario/Edge después. No pedir contraseñaDB,
service_role ni PAT en chat. Si propuesta vence, preparar revisión pública nueva
antes de originales; no prolongar in situ. Staging/flags/ARCA/Production intactos.


#### Operador real: baseline rechazado, diagnóstico sólo lectura — 27/10/2026
El titular ejecutó el asistente: READY/runtime true y luego
CUSTODY_PROVISION_NOT_CONFIRMED stage=BASELINE write_attempted=false
reconcile_before_retry=false. Por orden del código no alcanzó PRIVATE_COPY ni
POST. No acredita Auth remoto200: puede ser permisos, transporte o forma del
inventario. Causa real aún desconocida; no atribuirla a clave/PAT sin evidencia.
No repetir provisión ni CMS original. GO6valores recibido permanece documentado.

Se añade -DiagnosticarInventario/CLI --inventory: un solo GET de metadata, sin
referencias de paths/fábrica privada en su DTO y sin POST, incluso en PASS.
Mismo PAT existente ingresado sólo en consola local; no crear otro ni ampliar
permisos para diagnosticar. Categorías cerradas HTTP401/403/404/429/5xx/OTHER,
NETWORK_OR_TLS, METADATA_SHAPE/FIELDS/DIGEST_FIELD/DIGEST_FORMAT/JSON_OR_SIZE,
INVENTORY_POLICY/INITIAL_STATE_REJECTED. No valores/hash/token/mensaje externo.
DIGEST_FIELD reconoce únicamente presencia de ese nombre de campo: no acepta
ni transforma automáticamente el contrato nuevo. Validación de provisión no
relajada. Wrapper/CLI aceptan sólo marcadores cerrados; hash/vigencia siguen
exigidos. Modos Preparar/Provisionar/Diagnosticar mutuamente excluyentes.

143PASS/0FAIL/0skip,9archivos;23nuevos incluyendo cuatro CLI nativos con HTTP
simulado antes de importación y diagnóstico GETúnico. Informe
../fiscal-custody-inventory-final-v2-20261027.json/.log SHA256
caa6e2563b373ae26d600b0c2da07c6f01d641d280e554b4896cb2f0aaa41b58.
Primer pase139PASS/4FAIL: --import Windows recibía path C: en fixture, corregido
a fileURL; no cambio de producción para ocultar fallo. Reporte previo preservado.
Build689/lint enfocado/node/PS AST/diff PASS. Preparar local real tras cambio READY
sin red/privados. Sin nuevas peticiones API reales, originales o cambios remotos
por este desarrollo. Primer resultado requerido: CUSTODY_BASELINE_* del titular,
sólo lectura; no repetir -Provisionar hasta resolver el motivo observado.


#### HTTP403 real y alcance PAT inspeccionado — 27/10/2026
Titular confirmó CUSTODY_BASELINE_NOT_CONFIRMED reason=HTTP_403
private_read=false/write_attempted=false. Diagnóstico GETúnico funcionó; API
rechazó acceso sin llegar a originales/POST. Inspección sólo UI account/tokens:
token reciente llamado27/10, proyecto kioskopos-staging, única capacidad Edge
Functions READ-WRITE/8endpoints de /functions; no Secrets. No se leyó su valor.
No vincular criptográficamente este token al ingresado en consola: identidad de
ese ingreso no fue compartida. Si corresponde al27/10, su alcance explica403.

La UI distingue Application services → Edge Function Secrets permissions, que
habilita GET/POST/DELETE /secrets. Formulario nuevo PREPARADO para revisión:
KioskoPOS custodia Staging,24hours, sólo kioskopos-staging y esa capacidad Read-write;
ninguna otra. Se llegó a Review access, NO Create token. UI informa acceso
inmutable después de creación: no se editó/revocó token anterior. Creación final/
valor quedan a cargo humano; no abrir captura/AX de un token recién creado.
Permiso proveedor incluyeDELETE y no restringe seis nombres; nuestro runner
sigue limitado a GET/POST y seis nombres exactos. No ampliar a Legacy/Production.

Evidencias JSON/capturas fuera de Git:
../fiscal-custody-pat-scope-20261027.json SHA256
42ff35b57df3e759ed99632bf11f5b925bec6cb4e18af8d72f9df70d777eb333.
../fiscal-custody-pat-correct-scope-review-20261027.json SHA256
78312efdedf8474ea5e949a403c0807759034637acb05874da45d4a477d010b7.
Tab4 marcado para traspaso. Siguiente: titular Create token y usa valor sólo
en prompt del diagnóstico; enviar únicamente CUSTODY_BASELINE_*. No repetir
Provisionar antes de PASS/revisión. Sin token creado, permisos persistidos,
secretos/flags/SQL/Edge/Vercel/ARCA/CAE/Production nuevos por este bloque.
Cambio sólo documental/inspección UI:143tests/build previos no repetidos.


#### Provisión cerrada real acreditada por metadatos — 27/10/2026
Titular creó el token correcto y confirmó:
CUSTODY_BASELINE_PASS count=13 flags_closed=true private_read=false
write_attempted=false. Después, bajo GO6valores ya otorgado, ejecutó el operador:
CUSTODY_PROVISION_METADATA_PASS count=6 flags_closed=true functional=false
edge_check=REQUIRED. El código publicado verifica todos los nuevos digests en
memoria contra su entrega privada y conserva el inventario previo antes de emitir
ese marcador. No conservar ni solicitar esos digests/valores en el chat.

Verificación UI independiente21:38:13.427Z: customsecrets12, seis nombres de la
propuesta presentes; seis previos coinciden con baseline anterior en memoria.
Digest público de revision1 y selector UUID TA coinciden;13flags cerrados por
validador estricto, sin valores revelados. No nueva lectura de originales ni CMS.
JWT del Edge ON (también reobservado tras reinicio del runtime navegador).
Probador oficial posterior a provisión: POST{} con OriginStaging devuelve
503HOMOLOGACION_NO_HABILITADA. No se activó backend/datos/send/consult/apply.

Un cambio de herramientas reinició el runtime y descartó bindings/tab5 antes de
persistir el informe. No se repitió provisión ni se reconstruyeron digests
privados. JSON conserva explícitamente la hora/fuente de las observaciones
anteriores reales; no presenta una medición recreada como nueva. JWT fue observado
nuevamente en sesión vigente; captura muestra el switch ON, no secretos.
../fiscal-custody-provision-closed-pass-20261027.json SHA256
358059c8ef75d8bf19787a4b8d5ea169e568483c0acaade2a2f7e8b01a279f56.
Captura ../fiscal-custody-provision-jwt-20261027.png, sin claves/digests privados.

CLOSED_CUSTODY_PROVISION_METADATA=PASS; GO6valores consumido. No volver a cargar,
leer/probar originales, sobrescribir ni generar otro keyring. Esto NO cierra
custodia funcional Edge, cache/TA compartido, emisor/representación, catálogo
activo/vigente, aceptación positiva hospedada o primer CAE. No WSAA/WSFE,
Token/Sign/CAE nuevos por este bloque, ni SQL/Edge/Vercel/Production/merge.
No pruebas/build nuevos: cambio documental con evidencia hospedada;143tests/
build del código73b8574 mantienen su alcance, no se simula suite nueva.

Primer trabajo local siguiente: propuesta de metadatos de emisor INACTIVO ligada
al comercio aislado/credencial/huella/revisión de esta provisión y PV explícito,
con precondiciones de identidad/estado/baseline y revisión humana antes de su GO.
Tabla005 existe; no inferir permiso INSERT/activación del GOsecretos. Coordinar
catálogo vigente y TA (vigencia conocida previa hasta28/10 02:49:53.999Z, TA
descartado; no LoginCms nuevo por inferencia). Catálogo1 inactivo vence27/10
21:59Z; no prolongarlo ni activarlo como atajo. Datos IVA fiscales explícitos y
casos envase descontado siguen con gates propios; PR03 parcial y PR02 sin CAE.

#### Plan: propuesta local de emisor inactivo — 27/10/2026
Preparar generador offline contra contrato005, sin conexión/ejecución SQL.
Vincular propuesta pública de custodia y evidencia de provisión cerrada por hash,
comercio/OwnerAuth/CUIT/PV explícitos; sin defaults IVA ni habilitación implícita.
SQL candidato sólo INSERT habilitado=false/revision1, con GO/hash/destino/vigencia
revalidados, perfil activo Dueño noSuperAdmin mismo comercio y comercio ACTIVO
bajo locks. Serializar altas y rechazar kiosco/credencial/huella ya vinculados;
no overwrite/upsert/replay. RLS/grants cerrados como precondición, sin cambiar
DDL/flags/catálogos/ventas. Probar con DDL005 real y fixtures locales/PGlite,
incluyendo cambio de identidad/rol/estado, duplicación, expiry y rollback.
Hashes/setting de target no prueban host ni autorización humana: lectura real,
respaldo apropiado/revisión y GO independiente siguen antes de cualquier INSERT.
Catálogo vencido y TA anterior no autorizan consultas; no WSAA/WSFE real en este
bloque. Mantener credenciales sólo en Supabase, sin nueva lectura de originales.

### 27/10/2026 — Propuesta local de emisor INACTIVO, sin instalación
Generador offline plan-fiscal-issuer vincula custodia pública y evidencia cerrada
por SHA256; exige comercio/OwnerAuth/CUIT/PV explícitos. Sólo INSERT revision1,
habilitado=false; locks de identidad/comercio/tabla, RLS y privilegios cerrados,
rechazo de duplicación y replay. search_path pg_catalog,public evita sombreado
accidental del reloj. No selecciona IVA ni acredita representación o emisión.
La evidencia histórica de custodia no exige releer originales al vencer su
propuesta de copia: el preflight remoto actual es un gate separado obligatorio.

Validación final: 173 PASS, 0 failed/skipped en 7 archivos; PostgreSQL17.11 local
187 PASS, incluidos 4 casos de alta concurrente/revocación. Sin red externa ni
comprobantes. Un intento anterior tuvo timeout PGlite durante carga simultánea;
se conserva evidencia y la repetición limitada a 2 workers pasó sin debilitar
aserciones. Informes públicos fuera de Git:
../fiscal-inactive-issuer-final-v3-20261027.json
../fiscal-inactive-issuer-native-v2-20261027.json

Candidato vigente local ../fiscal-inactive-issuer-proposal-v2-20261027/:
plan SHA256 e7ee5798ca35784bbfbd236979e7dcd0022761183eb364fab102fbfcf7132501
SQL SHA256 f2e7c944eea081e688c139f7b88bb6fc0621f381a6932b1c1dd4d5628e8c2809
Vence 29/10/2026 01:33:55.603Z (28/10 22:33:55 Argentina). Primer candidato
conservado como supersedido, no ejecutado. SQL_EXECUTED=false.

Respaldo privado agrega -AntesEmisorInactivo (excluyente con -FiscalInstalado053),
con expectativa SQL054 explícita y manifiesto que no acredita equivalencia de
esquema por TOC ni incluye secretos Management. Preparación local PASS, respaldo
real nuevo PENDIENTE. Snapshot pre-SQL054 no se presenta como snapshot actual.
Siguiente gate: respaldo nuevo, preflight real de DB/SQL054/roles/destino y
revisión/GO independiente antes de insertar emisor. Catálogo1 vencido/inactivo;
renovación y TA requieren coordinación/autorización propia. Custodia funcional,
aceptación hospedada y primer CAE pendientes. Sin SQL/Edge/flags/Vercel/ARCA,
secretos originales, master, Production o merge en este bloque.

Build final PASS; lint enfocado sin errores (advertencia preexistente no-unsafe-finally en cleanup del harness). AST PowerShell, node --check, diff --check, SHA SQL y ausencia de símbolos del generador privado en dist PASS.


#### Auditoría de dependencias de aceptación — 27/10/2026, posterior 256a377
Lectura de SQL012 cargar_datos_preparacion_homologacion: requiere venta
COMPLETADA elegible, emisor habilitado y catálogo habilitado/no vencido antes de
preparación. fiscalSharedTickets.ts solicita TA con operacion_id mediante RPC006;
fiscalHttp.ts compone ese loader para flujos de comprobantes, sin acción pública
FEParamGet. No confundir provisión cerrada de secretos con bootstrap de TA.
La ruta existente de catálogo público es el diagnóstico local autorizado y el
planificador offline scripts/plan-fiscal-parameters.mjs, no el worker de emisión.
Por tanto, antes de aceptación positiva se debe revisar un cronograma conjunto:
consulta pública autorizada y propuesta/importación inactiva de revisión nueva;
GO separado para emisor/catálogo y gates de datos; preparación elegible; luego
TA compartido/consulta hospedada autorizada. Una consulta local descarta TA y
puede impedir LoginCms inmediato desde Edge: coordinar vencimiento observado,
no forzar login/reintento ni exportar Token/Sign como atajo. Esto identifica una
dependencia operativa, no acredita bootstrap hospedado ni autoriza implementarlo
o ejecutarlo. Sin cambios remotos ni nuevas consultas ARCA durante auditoría.
Respaldo actual antes de emisor sigue pendiente de ejecución privada del titular.

### 27/10/2026 — Vigencia revalidada después de locks del emisor
Revisión local posterior detectó que SQL candidato comprobaba expiry antes de
esperar locks, permitiendo alta tras vencimiento. Corregido: segunda comprobación
de reloj inmediatamente antes de INSERT, después de todos los locks. Caso real
PostgreSQL retiene tabla, observa waiter, cruza deadline y libera: rechazo
ISSUER_PROPOSAL_EXPIRED y cero filas. Suite nativa 188 PASS (5 del emisor), cero
ARCA/emisiones; 63 tests relacionados PASS; build PASS, lint sin errores con
advertencia histórica de cleanup. Informes ../fiscal-inactive-issuer-expiry-20261027.json
 y ../fiscal-inactive-issuer-expiry-tests-20261027.json. No credenciales ni red externa.
Candidato v3 reemplaza v1/v2, conservados y nunca ejecutados:
../fiscal-inactive-issuer-proposal-v3-20261027/
plan SHA256 f1f8ef656ba5f2ced2cc52a8e2b99d83c2cf624d0dbaaa39c98c95c72a7912b7
SQL SHA256 2cd371db17034db2c271f052f3741e54797183001808e43baa763076bea00a9e
Misma expiración 29/10 01:33:55.603Z. SQL_EXECUTED=false; respaldo actualizado,
preflight remoto y revisión/GO propios siguen pendientes. No instalación/flags,
ARCA, secretos originales, master, Production o merge.

### 27/10/2026 — Respaldo previo y preflight hospedado del emisor
Titular completó pre-emisor-inactivo-20261027-225250-be795028397e4da68441c4b914a0e240.
Verificación independiente SHA256 de dump y roles PASS, sin exponer contenidos.
Dump SHA256 2226e7c699df412a2ac59ff1df5c089ed7e06c1a897b53ed21d0d73a1ec9d7c3.
Contexto BEFORE_INITIAL_INACTIVE_ISSUER, Staging acoyfwwmhaeruciyedri,
expected_revision054, roles sin passwords, 41 tablas/ACL TOC. No restauración,
Storage físico ni secretos Management: PR07 integral sigue pendiente.
Verificador054 existente ejecutado READ ONLY/ROLLBACK en Dashboard Staging:
126 funciones/41 tablas/41 triggers, problem_count=0, read_only=on.
Preflight separado READ ONLY/ROLLBACK: OwnerAuth único/elegible, comercio aislado
ACTIVO, emisores0, operaciones0, TA0, catálogo habilitado0. Ningún estado reparado.
Evidencia pública ../inactive-issuer-sql054-preflight-20261027.json y
../inactive-issuer-identity-preflight-20261027.json; capturas homónimas PNG.
Demora al teclear consulta dejó texto parcial NO ejecutado; sustituido por paste
y contenido exacto verificado antes de Run. No SQL DML/DDL/flags/ARCA/secretos.
Propuesta v3/fe1ddc2 sigue candidata sin instalar; requiere GO propio para insertar
una sola fila revision1/habilitado=false, con validación nuevamente bajo locks.
Este preflight no acredita emisor habilitado, representación, custodia funcional,
catálogo vigente, aceptación positiva ni CAE. master/Production/merge intactos.

### 27/10/2026 — GO emisor INACTIVO ejecutado y verificado
GO específico del titular: sólo emisor inactivo y verificación. Propuesta v3
f1f8ef656ba5f2ced2cc52a8e2b99d83c2cf624d0dbaaa39c98c95c72a7912b7,
SQL SHA256 2cd371db17034db2c271f052f3741e54797183001808e43baa763076bea00a9e.
Destino Dashboard verificado acoyfwwmhaeruciyedri; respaldo actualizado validado.
Un solo intento de escritura: SQL revisado byte-equivalente, precedido únicamente
por set_config destino/hash aprobados. Guards revalidan identidad/estado/locks/
vigencia/RLS/grants. Sin reintento del INSERT ni upsert/activación.
SELECT independiente READ ONLY/ROLLBACK posterior: issuer_rows=1,
exact_inactive_rows=1 (comercio aislado, CUIT20415005963, PV2, credencial/huella
revisados, revision1, habilitado=false); enabled_issuers=0, enabled_catalogs=0,
operations=0, ta_rows=0. SQL054 posterior READ ONLY/ROLLBACK:126/41/41,
problem_count=0. GO consumido: no volver a insertar ni habilitar por inferencia.
Evidencia ../inactive-issuer-installed-20261027.json y PNG; cierre completo en
../inactive-issuer-installed-postcheck-20261027.json. Sin acceso a originales o
secretos, flags, WSAA/WSFE/CAE, SQL nuevo/Edge/Vercel, master/Production/merge.
No suite/build nuevos por cambio exclusivamente documental y ejecución ya
ensayada: 188 PostgreSQL/63 relacionados/build previos mantienen su alcance local.
INACTIVE_ISSUER_INSTALLED=PASS, no emisor funcional/representación/aceptación.
Siguiente gate pendiente: renovar catálogo público vencido mediante propuesta y
consultas autorizadas, coordinar TA y activación controlada; no autenticar local
ni descartar TA sin plan de ventana para aceptación hospedada. PR03 parcial,
primer CAE PR02 pendiente. El permiso de alta inactiva no autoriza esos pasos.

## Bloque autorizado 27/10: catálogo revisión2 y preparación de aceptación (en curso)
Fuente: instrucción adjunta posterior a861f2fd. GO existente para consultas públicas
frescas dentro de ventana coordinada e instalación revision2 INACTIVA; no activar
emisor/catálogos/flags ni emitir. El apartado A del adjunto conserva un fallo
BASELINE antiguo: evidencia real posterior ya cerró provisión6secretos. No repetir
POST, claves ni CMS de compatibilidad ni pedir nuevamente ese GO. Metadata PASS
no prueba custodia funcional. HTTP403 fue PAT con permiso Edge Functions, no
Edge Function Secrets; posterior PAT scoped correcto dio BASELINE_PASS y POST PASS.
Revisión oficial API: GET /v1/projects/{ref}/secrets permisos
edge_functions_secrets_read,200/401/403/429/500; schema name/value/updated_at.
POST mismoendpoint edge_functions_secrets_write,201{}; sin corregir parser por
una hipótesis contradicha por operación real/digests verificados. Referencias:
https://supabase.com/docs/reference/api/v1-list-all-secrets
https://supabase.com/docs/reference/api/v1-bulk-create-secrets
El schema genérico string no demuestra por sí solo semántica digest: no convertir
un response arbitrario en prueba de plaintext/hash; contrato cerrado actual rechaza
value no64hex. No cambio al provisionador sin drift demostrado.

Dependencia técnica verificada: SQL012 exige catálogo vigente+emisor habilitado
antes de preparación; loader006 necesita operacion_id para TA. Edge desplegado
no expone consulta pública de parámetros ni bootstrap TA sin operación. No crear
operación artificial, activar flags, instalar endpoint nuevo ni exportar TA para
sortearlo. La excepción local permitida en el adjunto es técnicamente necesaria
para renovar con la interfaz actual: una autenticación después del TA previo
(vence28/10 02:49:53.999Z), exactamente2consultas, evidencia pública; TA descartado
por diagnóstico existente, nunca transferido al browser/archivos. Consecuencia:
aceptación Edge deberá esperar también expiración NUEVA documentada; no afirmar
que esta autenticación sirve al cache hospedado. Alternativa compartida requiere
otro diseño/SQL/Edge y GO propio, no incluido en alcance remoto actual. No hubo
LoginCms/consultas nuevas durante esta preparación local. Ventana aún no abierta.

## Ventana de catálogo2 y borrador de activación positiva — 27/10/2026
Estado: PREPARACIÓN LOCAL; NO ACTIVADO. Esta sección amplía el plan existente,
no sustituye decisiones/historia. GO del adjunto cubre renovación e INSERT2
INACTIVO con evidencia fresca, no activar tablas ni flags. Custodia metadata ya
PASS; no repetir provisión/original CMS. Presencia no prueba uso funcional Edge.

### Renovación autorizada: ventana todavía pendiente de apertura
No ejecutar antes de28/10 02:49:53.999Z (27/10 23:49:53 Argentina), vencimiento
conocido del TA anterior descartado. Una única invocación de
scripts/probar-wsaa-homologacion.ps1 -Conectar -CatalogosPreparacion
-Servicio wsfe -CuitRepresentado20415005963, con los tres paths originales ya
revisados y un directorio público NUEVO. Internamente firma TRA para autenticación,
no repite el ensayo de compatibilidad CMS cerrado. Exactamente LoginCms1,
FEParamGetTiposIva1, FEParamGetCondicionIvaReceptor1; sin ConsultarUltimo/PtosVenta/
TiposCbte, sin retries. Si falla LoginCms incierto: STOP, no nueva invocación.
Si sólo una consulta terminó: conservar evidencia parcial, no repetir ventana
por inferencia. Registrar vencimiento nuevo seguro, jamás Token/Sign/XML crudo.

Excepción técnica inevitable del diagnóstico local: TA se descarta al finalizar.
No existe bootstrap público de catálogo en Edge sin operación, y operación exige
catálogo vigente. No exportar/trasladar TA ni inventar operación. El siguiente
login Edge deberá esperar vencimiento del TA NUEVO, no el anterior. Si se necesita
reutilización de TA hospedado en esta misma ventana, este paquete NO la acredita:
requiere diseño/instalación/autorización distintos. No ampliar alcance remoto.

Antes de INSERT2: leer fila1 pública en READ ONLY/ROLLBACK; guardar baseline
exacto y SHA256. Invocar plan-fiscal-parameters con revision2 explícita,
baselinePath/baselineSha256, evidencepaths y ambos SHA256, expiresAt explícita
que no cruce día comercial y sea <=24h de consulta más antigua. Revisar clases
A1/B6/C11 y exclusión ALEY/49, sin defaults. Manifest incluye sql_sha256.
Comprobar bytes y propuesta. Si cambió baseline, reloj o vigencia: STOP, no UPDATE
histórico. Bajo GO vigente ejecutar SQL exacto una vez con setting destino/hash;
tras resultado incierto SELECT antes de cualquier retry. Verificar row-equivalence
fila1, fila2 exacta/única/inactiva, enabled_catalogs0, issuer1inactivo,
operaciones/CAE0. TA DB debe seguir0 (el diagnóstico no lo persiste), SQL054 sin
drift por cambio nuevo. Esto NO es aceptación positiva.

### Próximo GO positivo: diseño condicionado, aún NO listo para ejecutar
Destino único acoyfwwmhaeruciyedri; OwnerAuth
0e90b9a7-36d2-4762-ab1a-4982996cf9aa; comercio
b7254826-c767-4098-94b8-71013c12021d; emisor revision1, CUIT20415005963/PV2,
credencial9a4916d1-b6b5-499f-98ef-9f6cf79510be, huella ya pinneada; catálogo2
vigente. Confirmar nuevamente actor activo/pertenencia durante ventana.
Venta exacta/UUID operación/IVA/condición receptor: PENDIENTES de elegir y revisar
explícitamente con Owner; no tomar defaults de configuración legacy. Venta
COMPLETADA positiva, sin CAE/devoluciones/envase reconocido, sin dinero real y sin
recrear cobro por conveniencia. No afirmar que este borrador es un paquete GO
completo hasta incluir esos IDs, datos fiscales y hashes, vigencia nueva y reloj.

Orden propuesto para aprobación futura, ventana máxima15min controlada por operador:
1. Preflight privado metadata/keyring presentes, Edge cerrado y JWT; catálogo2
vigente con margen>15min, nuevo TA local expirado. Confirmar snapshot baseline
para poder cerrar exclusivamente cambios de esta ventana sin borrar historia.
2. GO independiente habilita sólo filaemisor1/fila catálogo2 seleccionadas; no
alterar contenido/revisión. Flags de emisión/consulta/aplicación siguen cerrados.
3. Habilitar ARCA_HOMO_BACKEND_ENABLED y ARCA_HOMO_DATA_PREPARATION_ENABLED sólo
con GO. OwnerJWT real por terminal privada; RESOLVER_VENTA/DATOS_FISCALES_VENTA/
GUARDAR_DATOS_FISCALES con IDs/IVA/receptor revisados. Verificar recuperación
reload/ACK, no navegador→RPC privadas, no browser Token/Sign/service_role.
4. ARCA_HOMO_PREPARATION_ENABLED exige GO propio con WSAA/FECompUltimoAutorizado:
PREPARAR_COMPROBANTE usa TA durable cifrado, consulta último y reserva/cuerpo.
Sólo entonces custodia/keyring/TA funcionales pueden obtener PASS real. Guardar
sólo body público/hash/revisión y estados, nunca TA. REVISAR_COMPROBANTE y revisión
Owner exacta; no confundir borrador/cuerpo/reserva con factura autorizada.
5. FRONTERA antes de emisión: NO llamar ENVIAR/ENVIAR_NC ni habilitar
ARCA_HOMO_EMISSION_ENABLED / ARCA_HOMO_CREDIT_SEND_ENABLED. PREPARAR_COMPROBANTE
no llama FECAESolicitar. No crear intención042 sólo para probar: esa RPC pertenece
al envío NC y conserva incertidumbre; no hay NC elegible antes de facturaCAE.
Creación de intención y permiso privados se prueban sintéticamente en este bloque,
no remotamente sin GO posterior de emisión. La revisión Owner vence10min; no
reutilizarla para autorizar cuerpo distinto ni prolongarla automáticamente.
6. Cerrar ARCA_HOMO_PREPARATION_ENABLED y DATA_PREPARATION, después BACKEND;
restaurar habilitado de emisor/catálogo al baseline sólo con plan CAS/revisión
requeridos. No borrar operación/cuerpo/número/TA, no liberar reservas por timeout,
no modificar SQL/credenciales. Verificar503/gates y conservar historial. Si hubo
respuesta incierta, desactivar mutaciones y consultar estado durable; no reenviar.
Si hubiera intención remota inesperada: STOP y reconciliación, no limpieza.

Controles a mantener false/ausentes: ARCA_HOMO_EMISSION_ENABLED,
ARCA_HOMO_RECONCILIATION_ENABLED, ARCA_HOMO_REJECTION_RECOVERY_ENABLED,
ARCA_HOMO_CREDIT_DRAFTS_ENABLED, CREDIT_PREPARATION_ENABLED,
CREDIT_NUMBERING_ENABLED, CREDIT_REVIEW_ENABLED, CREDIT_SEND_ENABLED,
CREDIT_CONSULT_ENABLED, CREDIT_APPLY_ENABLED (todos con prefijo ARCA_HOMO_).
Nombres SEND_ENABLED/QUERY_ENABLED/APPLY_ENABLED genéricos no gobiernan el worker:
no usarlos como evidencia de cierre. Ningún flag frontend es autoridad.

### Emisión/recuperación/aplicación: sólo diseño para GO posterior
Una intención042 existente nunca permite segundo FECAESolicitar. Receipt049 es
candidato, no CAE. Después de autorización específica de consulta privada
(ARCA_HOMO_RECONCILIATION_ENABLED o CREDIT_CONSULT según flujo), FECompConsultar,
journal durable y resolución concordante de emisor/serie/número/body prueban CAE;
conflicto/rechazo/incertidumbre mantienen número y bloquean aplicación. Timeout
HTTP/ACK perdido: mismoUUID, recuperarestado antes deactuar; jamás nuevoticket,
UUID sustituto, resend automático o aplicación por respuesta candidata.
NC con CAE confirmado/resuelto, sin conflicto y plan051 elegible puede aplicar052
una sola vez, sólo con GO CREDIT_APPLY y caja/productos válidos revalidados bajo
locks. Efectivo/stock/reposición después de CAE, nunca antes. MismoUUID devuelve
resultado durable sin segundo efecto. No emision/NC/caja/stock/refund en ventana
positiva de preparación. Cierre PR03/PR02 sigue pendiente de aceptación real.

### 27/10/2026 — Preparación renovación catálogo2; límite temporal explícito
Adjunto posterior a861f2fd autoriza consultas frescas y catálogo2 INACTIVO, no
activaciones. Se resolvió contradicción del apartadoA con evidencia más reciente:
CUSTODY_PROVISION_METADATA_PASS ya verificado; no repetir secretos/originalCMS.
API oficial GET name/value/updated_at (200) y POST201/permisos secrets_read/write
revisados; HTTP403 anterior fue permiso PAT. Tests existentes cubren updated_at,
201,403 y rechazo de plaintext/campo digest alternativo; no debilitar parser por
suposición. No nuevo acceso real Management ni originales en este bloque.
Planificador agrega sql_sha256, search_path explícito pg_catalog,public y rechazo
de baseline con >1 habilitado. Mantiene INSERT inactivo/locks/vigencia postlock/
revisión siguiente/historial exacto/noUPSERT; sin nuevos defaults.
PostgreSQL17.11:192 PASS,4casos nuevos catálogo canónico: dos instaladores una
rev2, replay, drift habilitado durante espera y vencimiento esperando lock;
historial1 equivalente. Fixture en DB local nueva; reset de datos sólo allí,
no alterar esquema real. Cero peticiones externas/emisiones, contenedor propio
detenido/datos conservados. ../catalog-renewal-block-native-final-20261027.json.
96tests/3archivos PASS,0omitidos: ../catalog-renewal-block-final-tests-20261027.json.
Build final PASS; lint sin errores (warning histórico unsafe-finally del harness),
node/diff y símbolos privados ausentes de dist PASS. No suite global nueva.
Plan de aceptación detallado en docs/arca-homologacion.md y ExecPlan: flags reales,
orden,15min,rollback conservando historia, fronteras preparación/envío/consulta/
aplicación. No afirmar GO-ready: venta/operación/IVA/receptor deben identificarse
explícitamente y catálogo2 todavía no existe. SQL052 sólo trasCAE confirmado.

CATALOGO_REVISION_2_INSTALADO=PENDIENTE, no falsePASS. V1 vencida intacta.
Ventana actual WSAA anterior hasta28/10 02:49:53.999Z (27/10 23:49:53 Argentina).
No LoginCms anticipado ni retry. Código actual exige operación para cacheTA y
catálogo vigente para crear preparación: excepción local prevista en adjunto
requiere documentar TA descartado y esperar NUEVO vencimiento antes de Edge.
No inventar reutilización hospedada ni ampliar SQL/Edge para bootstrap por atajo.
Consultas autorizadas aún NO ejecutadas; GO renovación sigue disponible, no pedirlo
otra vez. Emisor inactivo/flags/Edge cerrados conservan último estado verificado;
no se reabren gates cerrados. Master/Production/merge intactos.

### 28/10/2026 — Renovación real autorizada y catálogo revisión2 instalado INACTIVO
Retomado después de vencimiento TA anterior. Una sola invocación real del diagnóstico
aprobado: LoginCms1 PASS, FEParamGetTiposIva1 PASS (6),
FEParamGetCondicionIvaReceptor1 PASS (11), sin retries/otros métodos ni emisiones.
FirmaTRA necesaria para LoginCms; no repetir ensayo criptográfico de compatibilidad.
TA sólo memoria/descartado; vencimiento nuevo28/10 15:06:15.411Z =12:06:15 Argentina.
No LoginCms Edge antes de esa hora por inferencia ni afirmar cache hospedado probado.
Originales sólo lectura mínima para autenticación autorizada, sin rotación/provisión.
Evidencia pública ../arca-catalogo2-20261028-eaf29218286f4e089f23639fb3a3f29a/.
IVA archivo SHA2563914b70e4ae5e539c5cb814af8a0cc05827a1d34ebc11c33a6886945050a5a7c;
condiciones449476904996e192a5e6d02c4038e7a66c7f9f9efe365b12a50b0539f9f675f3.
Sin Token/Sign/XML crudo almacenados. ClasesA1/B6/C11, ALEY/49 excluidas.

Baseline real catálogo1 leído READ ONLY/ROLLBACK y capturado como JSON público,
SHA25698eb938b15ecd6ff97fd15ecbbdea759275ca5be5c7f0bbbf2e6a63455cde896.
Propuesta ../catalogo2-propuesta-20261028/, revision2/habilitado=false,
planSHA2569dc10970bf2436aba7e354c6591864996125e5982a8c9919d12def81cc3685e3,
SQLSHA25686f2c75f4c198aa854727fa38ff03a28d0073909bc38cd8335766a6e72192095.
Vence29/10 02:59Z =28/10 23:59 Argentina; no vigencia prolongada de1.
Propuesta con evidencia real ejecutada primero en PGlite/DDL canónico/trigger:
historia equivalente,2inactivo y replay rechazado PASS; informe
../catalogo2-propuesta-validada-local-20261028.json. Suite192PostgreSQL/96tests/build
cerrada en58d5b11 conserva alcance; no suite global nueva por operación remota.

GO del adjunto consumido: SQL exacto un solo intento de instalación en Staging,
con settingdestino/hash verificados, sin UPSERT/UPDATE1 ni nuevas activaciones.
Verificación independiente READ ONLY/ROLLBACK: revision1_unchanged=true,
revision2_exact=1, catalog_rows2, enabled_catalogs0, issuer_inactive1,
enabled_issuers0, operations0, CAE0, NC_CAE0, TA_DB0. No confundir TA local conDB.
SQL054 posterior126/41/41,problem_count0. Evidencias
../catalogo2-staging-installed-20261028.json/.png y
../catalogo2-staging-postchecks-20261028.json. V1 intacta,2no volver a insertar.

Metadatos Dashboard posteriores:13flags cerrados (BACKENDfalse,12ausentes),
JWT ON. Test oficial POST{}+Origin sinAuth devolvió401UNAUTHORIZED_NO_AUTH_HEADER,
NO503: no afirmar nuevo cierre funcional observado. Showanon entrega publishable,
noJWTanon legacy; no usar Addsecretkey ni service_role enbrowser. Se conserva503
histórico previo, no se reabre gate sólo por acumulación. Flags metadata verifica
cierre actual, no reemplaza prueba funcional503 conJWTválido si siguienteGO la exige.
Error transitorio Dashboard failedfetch resolvió al cargar metadata; no cambiarJWT
por switchvacío duranteloading. No secretos/PAT/claveprivada vistos ni agregados.

CATALOGO_REVISION_2_INSTALADO=PASS; habilitado=false, emisorfalse,
FLAGS_POSITIVOS cerrados; aceptación positiva/CUSTODIA_FUNCIONAL/CAE pendientes.
Paquete positivo existente aún requiere fijar venta/operación eIVA/receptor por
Owner y GO separado para habilitación/consultas específicas. Propuesta de ventana
no ejecutada; EMISSION/RECONCILIATION/CREDIT_SEND/CONSULT/APPLY cerrados.
SinFECAESolicitar/stock/caja/refund/reposición/SQLnuevo/Edge/Vercel/master/
Production/merge. FechaTAycatálogo nuevas reemplazan sólo pendientes de ventana,
no borran decisiones ni evidencia histórica.

### 28/10/2026 — Objetivo persistente y selección fiscal confirmada
Titular confirmó emisor MONOTRIBUTO, Factura C11 y receptor Consumidor Final5.
Registrar como decisión explícita, no como GO para activar/emitir. Se creó objetivo
activo de hilo manteniendo alcance completoPR01–PR11/P01–P24. Seguimiento detallado
con criterios de cierre en .agent/PLANS.md, sección28/10; no nuevo plan paralelo.
Próximo pendiente: identificar venta elegible/UUID y DTO fiscal completo; preparar
paquete exacto de habilitación/cierre verificable y pedir GO sólo al estar listo.
No ejecución de flags/SQL/ARCA/operaciones comerciales por esta confirmación.
TA descartado vence28/10 15:06:15.411Z; catálogo2 vence29/10 02:59Z. Custodia
funcional/aceptación positiva/primerCAE siguen pendientes, no marcar como PASS.

### 28/10/2026 — Venta/UUID/DTO propuestos, no activación
SELECT READ ONLY/ROLLBACK en comercio aislado encontró4ventas elegibles. Candidata
más reciente08a0c5c1-974a-4219-98fe-c66b9f3cfe4d, total200.00,1línea/1unidad entera,
sin envase reconocido/devoluciones/CAE/op fiscal. Contexto mínimo público capturado
../positive-window-context-20261028.json, SHA256
34376ae48301e21e693f5a136955c2a51c12a3055a4b89c65de09e67616f2ef2.
Dueño activo noSuperAdmin/mismo comercioACTIVO; emisor1/catálogo2 inactivos. Es una
lectura administrativa de elegibilidad, no aceptación JWT positiva ni autorización
para reutilizar cobro. No venta nueva ni efectos caja/stock.

scripts/plan-fiscal-positive-acceptance.mjs prepara sólo artefactos públicos offline,
reutiliza prepareFiscalData del backend. Inputs exactos/hash, actor/kiosco/venta,
unidades enteras/no envase/no retornos/operaciones, importes conciliados, IVA/fecha/
receptor explícitos, ventana<=15min posterior alTA y anterior al vencimiento de2.
No defaults legacy; no SQL/RPC/HTTP, ninguna aprobación automática ni número fiscal.
UUID durable propuesto c7416ffb-65aa-47df-94a5-de8d9592989f generado una sola vez en
configfueraGit. CLI crea directorio nuevo y archivoswx; reload no sobrescribe ni
crea otroUUID. Error sanitario genérico, sin contenido de snapshots/token.
Una primera generación rechazó detalleUUIDv8: fixturesv4 no detectaban contratoDB.
Corregido formatoUUID existente conforme backend/PostgreSQL, prueba específica;
config original preservada con MISMO UUID, ningún intento remoto. No aflojar
validación de forma/inputs/alcance para pasar pruebas.

Propuesta ../positive-window-data-proposal-20261028/:
planSHA256 cbe964ee139eb1d943e6a3d70b9ae1cd7921da8268e484eee6f213392db11349
preparaciónSHA256 2b12d151d086dd0d35bff61dcf8b2a61df958747fb099dddca7af10c7a0b0eae
requestsSHA256 a092df7b6cbd8fd30f525cae72c15a75397d322e83f1b4a9d619791fcf26d817.
MONOTRIBUTO/C11/CF5 confirmados por titular. DTO adicional propuesto, aún sujeto a
revisiónGO: productos1, Doc99/0, fecha20261028, PES/cotización1, neto200.00, IVA/
noGravado/exento/tributos0.00, sin desgloseIVA ni servicios. No denominarlo factura.
Ventana propuesta28/10 15:10–15:25Z (12:10–12:25 Argentina), NO agenda/automatización
ni GO. TA descartado vence15:06:15.411Z; catálogo2 vence29/10 02:59Z. Si ventana
vence, revisar propuesta pública conservando UUID si sigue misma operación; no
nuevo LoginCms, prórroga de catálogo o reset de identidad por conveniencia.

Validación62PASS/2archivos,0omitidos; después de mover guardcleanup fuera de finally,
prueba enfocada finalPASS y lint0errores/0warnings nuevos. BuildPASS, node/diffPASS,
símbolos del planificador ausentes en dist. Informes ../positive-window-data-closure-tests-20261028.json,
../positive-window-data-final-cleanup-tests-20261028.json y buildclosure.log.
CLI real produjo candidato válido y sintético comprueba nooverwrite/UUID estable;
no prueba autoridad de un snapshot ni aceptación fiscal hospedada.

GO_READY=false/rollbackPackageReady=false explícitos. Próximo pendiente real:
SQL habilitación/CAS+cierre con recibo de activación, verificadorespre/post y
asistente privado con JWT Owner y acciones cerradas, luego ensayo PostgreSQL/
concurrencia. No pedir GO de un paquete que aún no tiene cierre probado. Nunca
incluir ENVIAR/FECAESolicitar/CONCILIAR/APLICAR ni autoaprobar body en este paquete.
Custodia funcional/TAcompartido/aceptación positiva siguen pendientes. No cambio
SQL/flags/secretos/ARCA/Edge/Vercel/master/Production/merge en este bloque.

### 28/10/2026 — SQL candidato de apertura/cierre validado localmente
plan-fiscal-preparation-toggle.mjs deriva el mismo snapshot/plan de datos validado,
sin nueva identidad, conexión ni ejecución. Apertura exigepostgres, GO/hash/destino,
Owner/kiosco/venta/detalles vigentes bajo locks, sin devoluciones/preparación previa,
emisor/catálogo exactos e inactivos, RLS/owner/grants privados cerrados y ningún
habilitado ajeno. Tiempo se revalida después de TODOS los locks. Sólo actualiza
habilitado de las2filas. No crea permisos, TA, número, operación o flags privados.
Cierre exige mismoGO/binding completo; revocación delOwner o vencimiento NO impiden
cerrar. Repetible, no elimina operaciones/cuerpos/TA/reservas ni actualiza revisión.
Drift de metadatos => STOP/revisión, no sobreescritura. FlagsPREPARATION/DATA/BACKEND
se deben cerrar PRIMERO por asistente aún pendiente. No afirmar cierre funcional
si el operador no ejecutó esa secuencia. No existe leasepersistente: requiere
ventana exclusiva de administración (invariante operativo explícito), no suplantar
una protección inexistente con settings o hash. GO settings no pruebanhost/humano.

Propuesta ../positive-window-sql-proposal-20261028/ conserva plan de datos
cbe964ee139eb1d943e6a3d70b9ae1cd7921da8268e484eee6f213392db11349.
activate.sql SHA256d3d962324270e3e48e6b1ed45850dc163ec7633f89c6c3e6885662c96ac30955
close.sql SHA2569a15bd9ae4339264fcc8706d176cc1763e57653ae9ff5e0221524b257e609471
verify.sql SHA256bef8f72343dabe981209ab68844965d71902d3bb7252d278819fd7580a8b70fa.
Bytes comparados con generador final PASS. SQL_EXECUTED=false/readyForGo=false/
operatorAssistantReady=false. No pedir GO de paquete incompleto.

50tests PGlite/contrato PASS (15SQL+35datos),0omitidos: permisos/RLS,Actor/kiosco/
venta/detalles,GO,replay,vigencia,cierre despuésexpiry,operación conservada y drift.
DDL canónico para tablas principales; stubs de devoluciones/operaciones sólo para
checks de existencia: no afirmar aceptación del esquema fiscal completo allí.
PostgreSQL17.11 nativo195PASS (192previos+3ventana),0redexterna/0comprobantes,
contenedor propio detenido/datos conservados; pruebas nuevas DB locales aisladas.
Primer intento fallóSTEP0 Docker cerrado: informe preservado, ningún test nuevo
acreditado allí. Se inició instalación existente y segundo pase PASS.
../positive-window-toggle-native-v2-20261028.json; ../positive-window-toggle-final-tests-20261028.json.
Build finalPASS, lint0errores con warningfinally histórico del harness, diff/node
PASS, símbolos privados ausentesbundle. Sin suiteglobal nueva. Fixture de datos
sintética extraída para reutilizar contrato en PGlite/nativo, no datos realesGit.

Pendiente inmediato: asistente privado con Auth/JWTdelOwner, acciones allowlist,
paquete/hash/ventana fijados, no redirects/retries ni credenciales argv/env/archivos;
probar ACK/errores y cierre con flagsverificadosantesSQL. Después integraciónlocal
completa y revisión específicaGO; nada positivo remoto por este trabajo. Mantener
TA28/10 15:06:15.411Z, catálogo29/10 02:59Z y ventana propuesta15:10–15:25Z honestos.
Si vencerel material público, revisar conservaUUID antes de continuar, no retry
LoginCms ni extenderfechas. No SQL/flags/ARCA/secretos/Edge/Vercel/master/Production/
merge en este bloque. ObjetivoPR01–PR11 activo y no completado.

### 28/10/2026 — Corrección de replay tras cierre (supera candidato cf36b4b)
Revisión posterior detectó que habilitado=false restauraba exactamente baseline y
permitía reabrir el MISMO plan después de cerrar si no existía operación. Candidato
anterior nunca se instaló. Se conserva como histórico/supersedido, NO usar.
Apertura ahora captura opened_at=clock_timestamp UNA sola vez tras todos los locks,
valida ventana y avance estricto sobre actualizado_en previo y guarda ese valor
en actualizado_en del emisor junto con habilitado=true. No tabla/columna nueva.
Cierre exige kioskopos.window_opened_at igual al timestamp de apertura observado
independientemente y dentro de la ventana aprobada; revalida resto del binding
completo. Conserva la marca al poner habilitado=false: baseline del plan viejo ya
no coincide, ni tras reload ni con otra sesión/sin operación. Cierre sigue siendo
repetible con el mismo recibo y no requiere reloj actual dentro de ventana.
No es lease automático ni TTL de backend: ventana exclusiva/supervisión/flags
cerrados primero siguen obligatorios. No prometer que una flagtrue vence sola.

Recibo debe obtenerse con verify.sql READ ONLY DESPUÉS de confirmar/conciliar la
apertura, persistir sólo metadata pública y conservar precisión microsegundos del
texto timestamp PostgreSQL (no convertir a DateISO que trunque el recibo). Si se
pierde ACK no repetir apertura: recuperar estado/recibo con lectura y comparar
binding/hash antes del cierre. Recibo ausente/distinto => no UPDATE; drift =>STOP.
No resetear marca para facilitar retry. Un plan nuevo requiere baseline/hash/revisión
GO nuevos, conservando UUID si sigue la misma operación, no reprovisión/WSAA extra.

Propuesta v2 ../positive-window-sql-proposal-v2-20261028/ (v1 supersedida):
activateSHA25648ec3a63e34aaba5cbf568b5b0dfb5924a2dd7b20e01fe7cb7827312886cea0a
closeSHA256781341e6596fa6799ecf3317e8c0bcab5c3a7449aa3b9f4cdcb4a8e2456bbfbc
verifySHA25602b5640d1019ea123b2c9322b96d61154c322d2e565ba705792fb2275ac7f1f9.
Mismo dataPlanSHA cbe964ee139eb1d943e6a3d70b9ae1cd7921da8268e484eee6f213392db11349.
readyForGo=false/assistantReady=false/SQL_EXECUTED=false; no autorización solicitada.
52pruebas enfocadas PASS (17SQL/35datos),0omitidos; incluye fallo tardío del segundo
UPDATE que revierte primero, recibo ausente/incorrecto y replay SIN operación.
Build finalPASS, lint0errores (warningfinally histórico harness), diffPASS.
Un build intermedio falló por tipo unknown de resultado PGlite en test nuevo;
corregido con tipo explícito, sin cambiar aserción, build finalPASS. Artefactos
fallidos conservados. Ensayo nativo con reloj real de cierre expirado y otra sesión
está en curso; no usar pase anterior como prueba final del nuevo código.

Cierre de evidencia nativa FINAL: PostgreSQL17.11,196PASS (4ventana), cero solicitudes fiscales externas/emisiones. Reloj real confirma cierre tras expiry, recibo conserva precisión, replay de otra sesión SIN operación rechazado. Contenedor propio detenido/datos conservados. ../positive-window-toggle-native-openstamp-final-20261028.json SHA256 9e74d7ab48ed3ad4f9373c72da868a57d7bf5a32d3f84bbfff88a56b0366179a. Este pase corresponde al código final de marca única y supera los pases previos. Asistente privado/paqueteGO completo pendientes; ninguna operación remota en este bloque.


### 28/10/2026 — Segundo intento incierto: diagnóstico Management posterior
El operador informó WINDOW_OPERATOR_NOT_CONFIRMED stage=WINDOW
cleanup_confirmed=false reconcile=true para el paquete inmediato v5. No repetir
apertura. El journal privado inspeccionado contiene sólo HEADER y BASELINE;
no contiene OPEN_ATTEMPT. Esto no sustituye conciliación independiente hospedada.
Los cinco comandos públicos derivados del paquete tienen 77/83/527/87/86
caracteres: no exceden el límite 4096 de autenticación; esa hipótesis se descarta.
Tras reemplazar su PAT perdido, el usuario ejecutó únicamente el diagnóstico GET:
MGMT_READONLY_PASS status=200 names=6 flags_closed=true original_read=false
write_attempted=false. Acredita acceso Management actual, seis metadatos de
custodia y flags cerrados; no acredita autenticación Owner, cierre SQL ni causa
histórica del fallo. No se leyó el token en el chat ni material original.
Consulta SQL independiente bloqueada en esta sesión por indisponibilidad del
control del navegador; no afirmar cierre SQL nuevo. Próximo diagnóstico: asistente
JWT existente en modo predeterminado (sin switches), sólo login de ensayo,
probe fiscal cerrado y logout local. Sin apertura, flags, SQL ni ARCA. No emitir,
reintentar ventana ni declarar aceptación positiva hasta conciliar y diagnosticar.

### 28/10/2026 — Auth/gateway cerrado confirmado, diagnóstico exacto separado
El titular aportó JWT_GATEWAY_PASS_BACKEND_CLOSED alg=ES256 status=503 y
TEST_SESSION_LOGOUT_LOCAL_CONFIRMED. Acredita login y backend cerrado actuales,
no perfil exacto del operador, causa histórica, cierre SQL ni aceptación positiva.
Se preparó diagnosticar-dueno-fiscal-cerrado.ps1 / diagnose-fiscal-owner-closed.mjs:
usa authenticatePrivateOwner original con Auth/kiosco pinneados, sin comandos de
preparación, SQL, Management, flags ni ARCA. Entrada privada stdin, salida de
categorías allowlist y logout local. No modifica runtime/paquetes aprobados ni
reabre ventana. 45 pruebas enfocadas PASS (3 archivos; 6 nuevas), sin red real.
Primer intento de tests bloqueado por spawn EPERM antes de ejecutar; reejecución
local autorizada PASS. Parser PowerShell y node --check PASS. Build en curso.
No commit/push intermedio ni nuevo GO solicitado; conciliación SQL independiente
sigue pendiente por control de navegador no disponible.
Cierre local del diagnóstico: build PASS (689 módulos), lint del proyecto
oxlint enfocado PASS, parser PowerShell/node --check/diff PASS. Intento previo
npx eslint no ejecutó lint (ENOTCACHED; herramienta ajena al script del proyecto);
no se instaló dependencia, corregido usando npm run lint/oxlint existente.
La suite global histórica no se presenta como ejecutada sobre estos cambios.

Evidencia hospedada 29/10 SHA256:
positive-window-reconciled-20261029.json =
12238fd88ddc1ab9bab9e49fc54cb31f02e28215b2a174265af50d81728072fc.
Build final PASS 689 módulos (tras corrección de tipo del test); lint enfocado
PASS, PowerShell parser/node --check/diff PASS. Bundle final: 36 assets JS,
cero coincidencias de símbolos privados examinados; no equivale a escaneo total
arbitrario de secretos. Suite global viva: proceso nativo confirmado, no reiniciar
por silencio. El pase previo de 5221 no se atribuye a estos cambios.

Validación global 29/10: informe fiscal-diagnostic-closure-global-20261029.json
SHA256956ad94bfd23e966c33f8d74d3e2ba84e9c470ea8e6202c2c6fa88ef1fb17ace:
5193 PASS,0 aserciones FAIL,1 skipped,331 archivos, pero proceso exit1. Comparación
con pase anterior detecta FiscalDocumentModal.test.tsx ausente (58 casos). El JSON
success=true no basta para aceptar el gate. Causa de omisión no confirmada; no
atribuirla a memoria sin evidencia. Reejecución de ese archivo y los dos del
operador con maxWorkers=1 en curso. Sin commit ni publicación del bloque aún.

Recheck aislado posterior: fiscal-diagnostic-missing-and-final-20261029.json,
104 PASS/0 FAIL/3 archivos (58 pantalla fiscal,16 operador,30 paquete), exit0.
Esto resuelve cobertura específica omitida; NO convierte el exit1 global en PASS.
Suite global final iniciada con maxWorkers=2 y log preservado en
../fiscal-diagnostic-global-final-20261029.log; informe JSON previsto homónimo.
Sesión de ejecución 28389 confirmada viva en esta ejecución; no reiniciar por
silencio, comprobar el mismo handle. No commit/push mientras ese gate siga abierto.
Renovación del catálogo requiere consultas públicas nuevas con GO propio; coordinar
el TA resultante y su vencimiento antes del posterior LoginCms desde Edge. No
hacer autenticación local y hospedada consecutivas ni conservar TA en texto claro.
