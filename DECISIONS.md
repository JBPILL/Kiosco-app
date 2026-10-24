Este documento registra decisiones arquitectónicas o de dominio que sean no triviales, junto con su contexto y justificación.

## Límite de administración comercial (16/10/2026)

Se agrega una capacidad VITE_ADMIN_COMERCIAL_HABILITADO independiente del strict
pilot, false por defecto. Controla visibilidad, no privilegios ni instalación.
La autorización real pertenece a RPCs/Edge con perfil activo de DB; se eliminan
escrituras privilegiadas browser-side y el alta de Dueño mediante signUp.

El módulo SQL es una extensión incremental y canónica opcional instalada después
del baseline endurecido; sus checksums se verifican en optionalModules del manifest.
No se cambia la ventana F6 ni se insertan tablas comerciales en un import/cutover
histórico automáticamente. Para datos existentes se exige preflight y resolución
de suscripciones ambiguas; no se inventan planes ni coberturas. Esto evita reinterpretar
el historial migratorio y permite instalar comercial sin habilitar módulos excluidos.

La fuente de autoridad es el estado efectivo calculado en DB: suspensión administrativa
domina; falta de suscripción o vencimiento implica SOLO_LECTURA; renovación válida
reactiva sólo si no hay suspensión manual. Vencimiento inclusivo en fecha argentina,
sin gracia; meses calendario 1..12. Triggers con lock del kiosco protegen escrituras
de venta, stock, caja y crédito incluso desde SECURITY DEFINER. Login, consultas,
soporte y exportación de backups mantienen su alcance. El replay sin nueva mutación
recupera resultado cuando el contrato original lo permite; no se usa un rollback
del frontend como sustituto de autorización.

Se usa un libro privado equivalente a operaciones_escritura que admite operaciones
globales sin tenant (planes/config). Cada UUID queda ligado a actor, tipo, tenant,
solicitud y resultado; renovación/pago/auditoría son atómicos. No se guardan passwords
en navegador ni en el libro. Provision-commerce reserva antes de Auth Admin, finaliza
datos en una transacción y reclama compensación bajo lock sólo ante rollback inequívoco.
Incertidumbre o compensación fallida requiere conciliación/TAINTED, sin borrado ni
retry destructivo automático. Funciones de saga sólo service_role; RPCs de usuario
sólo authenticated con verificación interna. Ninguna de estas decisiones instala
la extensión ni autoriza deploy/SQL remoto.

## Checkout transaccional

### Decisión

1. **Un único cierre online server-side.** La venta, pagos y efectos financieros/de stock deben confirmarse en una transacción del servidor. Evita que escrituras REST separadas dejen venta, stock o deuda desalineados.
2. **Outbox durable e identidad estable.** Guardar la solicitud original en IndexedDB antes de la llamada de red y conservar el mismo ID y cuerpo para cada reintento. La RPC compara la solicitud y devuelve el resultado previo ante repetición idéntica; un cuerpo distinto con el mismo ID requiere rechazo y conciliación.
3. **Sin fallback directo ante ambigüedad.** Un timeout o error de `checkout-manual` deja el intento pendiente y recuperable; volver a escribir venta/pagos desde el navegador podría duplicar una operación cuyo commit ya ocurrió.
4. **Cobros offline provisionales.** El comprobante local no equivale a una venta confirmada. Stock y deuda remotos cambian únicamente después de la aceptación del servidor, que vuelve a validar disponibilidad al sincronizar.
5. **Envases compartidos por kiosco con autoridad remota.** El estado local por terminal no puede ofrecer una cantidad común fiable entre cajas. La fuente remota compartida y su coordinación transaccional quedan como requisito de diseño para la fase que implemente el flujo de envases.

### Evidencia y alcance

La auditoría de esta fase verificó la cadena JWT → Edge Function → identidad autenticada → RPC, el guard de doble envío, la persistencia previa a la red, la recuperación del mismo ID y la semántica idempotente de la función SQL local. La evidencia remota aportada confirma Edge Function activa con JWT requerido, permisos restringidos y tablas de checkout con RLS; también reporta dos operaciones confirmadas y ninguna pendiente. No confirma el flag del frontend desplegado ni las colas locales de los terminales. Estas decisiones definen el destino; no activan el flag ni retiran todavía la ruta directa.

## Identidad inicial del backend productivo

### Decisión

1. El primer perfil global nuevo usa `rol='VISOR'`, `es_superadmin=true` y `kiosco_id=NULL`. `VISOR` es el rol permitido de menor privilegio; no se inventa un rol `SUPERADMIN`. El primer propietario usa `DUEÑO`, flag false y el kiosco nuevo.
2. El schema destino permite kiosco nulo únicamente para perfiles SuperAdmin y exige kiosco para cualquier perfil ordinario.
3. El bootstrap inicial es operador/local-only, separado de `provision-user`. Usa Auth Admin server-side, un advisory lock de sesión y una transacción única para kiosco/perfiles. El proceso registra `IN_PROGRESS/READY/PASS/TAINTED` en una tabla privada para bloquear concurrencia y reuso después de PASS.
4. Auth y PostgreSQL no comparten transacción; ante fallo se eliminan filas insertadas y Auth users creados. Si no se puede confirmar limpieza, se marca TAINTED y se detiene sin retry automático.

### Evidencia y alcance

El login/UI ya reconocían el SuperAdmin global sin kiosco, pero `001_domain.sql` lo impedía con `kiosco_id NOT NULL`. `auth_es_superadmin()` lee el flag del perfil en DB, no metadata del usuario. Las policies actuales permiten lectura global al SuperAdmin donde lo declaran explícitamente; no se amplía esa superficie. `provision-user` conserva sólo CAJERO/VISOR y perfiles con `es_superadmin=false`. El rehearsal real sobre Supabase local terminó PASS el 14/10/2026, incluidos Auth/GoTrue, login, RLS, separación de privilegios y checkout; ese resultado no valida Production hospedado. La validación hosted sigue diferida.

## Distribución corregida de SheetJS para la importación de catálogos

Se conserva SheetJS CE y la API de importación XLS/XLSX, actualizando desde npm
0.18.5 al tarball oficial 0.20.3 fijado con integridad en el lockfile. Los dos
avisos HIGH conocidos afectan versiones anteriores; el paquete npm antiguo no
publica sus correcciones. Cambiar a read-excel-file retiraría XLS, por lo que se
descarta esa alternativa. Se valida con archivos binarios reales y audit, sin
supresiones, audit fix ni scripts de instalación. El origen CDN queda como
requisito de instalación reproducible y deberá revisarse en futuras actualizaciones.


## Detalle del sensor en lectura de barras iOS
Se conserva html5-qrcode como cámara y lector principal. Para evitar que el
ancho CSS descarte barras finas se reutiliza ZXing ya incluido en 2.3.8 mediante
un adaptador aislado, con carga diferida y canvas nativo acotado. No se agrega
otro SDK ni se procesa en un servidor. La clase está en un submódulo de esa
versión; una actualización del paquete debe pasar build y la prueba óptica real
del adaptador, además de aceptación física. Se descartan ampliar artificialmente
píxeles y nuevos cambios cosméticos del visor como sustituto de conservar detalle.
La lectura auxiliar es limitada a dos intentos/s y respeta cierre y guards del
lector compartido; los QR conservan la ruta principal.

## Balance con fuentes completas
El informe contable pasa a consultar sus seis fuentes completas y publicar el
resultado conjuntamente. Se descarta paginar sólo ventas y conservar el store
operativo de proveedores como fuente, porque ese store puede recurrir a caché
sin propagar el error y truncar compras/pagos. Sus otros consumidores conservan
su comportamiento; sólo Balance prescinde de ese fallback. Errores de una fuente
ocultan cifras y bloquean exportaciones, sin convertirlos en colecciones vacías.
Se mantienen fórmulas y alcance del período. Son lecturas de análisis que pueden
observar cambios concurrentes, no una copia transaccional/restaurable de la base.

## Envases compartidos y devoluciones en efectivo del piloto

### Regla vigente: devolver efectivo pagado y vacíos al cliente
El usuario corrigió la decisión anterior: los envases entregados pertenecen al
cliente. Las solicitudes nuevas sólo admiten ENTREGAR_ENVASES y reintegran el
efectivo neto pagado, manteniendo descuentos históricos. Sin saldo suficiente de
vacíos, toda la operación se rechaza antes de confirmar caja o stock. Se retira
el selector del formulario y la RPC impide eludirlo con una solicitud manual.
Los ACK ya confirmados conservan cuerpo, importe y resultado originales para no
duplicar pagos ni reescribir historia; CONSERVAR_ENVASES queda sólo para recuperar
esos registros anteriores. Un intento antiguo no confirmado será rechazado,
nunca convertido silenciosamente a otro importe/modalidad.

### Elección del Dueño anterior (sustituida)
El usuario autorizó inicialmente elegir por operación entre conservar los vacíos/reintegrar
el valor de la mercadería y entregar los vacíos/reintegrar el efectivo neto.
La primera ampliación exige devolución completa, sin devoluciones previas: el
snapshot no vincula cada crédito de envase con una línea concreta de mercadería.
Se descarta prorratear vacíos entre devoluciones parciales sin una regla acordada.
Sólo el Dueño activo puede iniciar este contrato v2; el v1 sigue vigente para
devoluciones sin envases y conserva sus ACK. Ambos importes salen del checkout
inmutable, con los descuentos ya aplicados, sin usar precios actuales. La salida
de vacíos valida saldo bajo lock y comparte transacción con stock y efectivo.
La modalidad y cantidades se guardan en el ACK durable para verificar la entrega
física incluso al recuperar una respuesta perdida. No se habilita anulación,
refund electrónico, devolución fiscal ni cuenta corriente.

El usuario amplió el piloto para recibir envases mediante descuento en ticket o
efectivo, entregar vacíos al distribuidor y devolver artículos en caja abierta.
Eligió resolver cambios con reintegro en efectivo y nueva venta normal; cuenta
corriente queda para otro bloque. El almacenamiento local de vacíos y las
escrituras separadas de la devolución heredada no ofrecen atomicidad compartida.

Se agregan módulos SQL incrementales fuera de los 43 archivos históricos. Una
capacidad privada por comercio, falsa por defecto, separa instalación de
habilitación. Las banderas de frontend y Edge no sustituyen esa autorización ni
el gate comercial. Se descartan habilitar el store heredado quitando strict y
sumar automáticamente los saldos locales de distintas cajas.

La recepción en ticket queda provisional hasta el ACK de checkout; venta y vacíos
se confirman en una transacción. Se conserva completo el reconocimiento del
envase al distribuir ajustes comerciales. Checkout v1 exige pesos enteros; el
reintegro de envases por caja admite centavos. La devolución usa el detalle y
receta originales, cálculo histórico neto, lotes/costo de salida y efectivo en
una transacción. Inicialmente sólo admite ventas originales íntegramente en
efectivo, sin comprobante fiscal ni recepción de envases. Estos últimos tickets
también rechazan la anulación heredada hasta conciliar vacíos/crédito.

Ambos circuitos guardan identidad y solicitud en IndexedDB antes de la red;
recuperan el mismo ACK y no generan una compensación o un pago nuevo por timeout.
La llamada vincula el JWT al actor capturado y oculta respuestas si cambia la
sesión. El ACK financiero se distingue de la entrega humana: ésta requiere una
marca local posterior, no implica coordinación física entre dispositivos. El
cierre de caja consulta las operaciones recuperables del dispositivo, incluso
confirmadas pendientes de verificar entrega. Las pruebas locales no autorizan
instalar SQL, desplegar Edge ni producir movimientos reales; Staging y luego
Production mantienen sus gates separados. ARCA/WSFE y Point no se habilitan.


## Pendientes de envases por tipo (19/10/2026)
El usuario elige un total pendiente por tipo, sin identificación del cliente.
Es una declaración explícita del Dueño sobre envases prestados sin cobrar, no una
inferencia de ventas ni una deuda monetaria. Registrar/corregir exige saldo esperado
y nota; recibir pendientes reduce ese saldo y suma vacíos en una transacción, sin
reintegro, crédito de ticket ni caja. Se conserva auditoría y solicitud idempotente.
No se descuenta stock de vacíos al declarar: el envase salió lleno con mercadería,
y no se puede suponer que salió del depósito de vacíos. Valores anteriores se
concilian manualmente; cero inicial no certifica que no existan préstamos previos.


## Observaciones opcionales al registrar pendientes (19/10/2026)
El usuario solicita no exigir un motivo en cada registro. El frontend permite
dejar las observaciones vacías y envía «Sin observaciones adicionales» como
descripción neutral de esa ausencia. No se atribuye una razón inventada al
operador. Se conserva el contrato remoto y la auditoría de actor, saldo anterior,
saldo nuevo e ID/cuerpo para recuperación. No requiere SQL ni amplía permisos.

## Presentación heredada y baja reversible de tipos (19/10/2026)
Se reutilizan Modal (ancho 2xl y pie fijo), Button e Input del programa migrado,
y la tabla de existencias de PreciosEnvasesModal como referencia de presentación.
Se conservan las operaciones compartidas autenticadas; no se reactivan escrituras
locales heredadas ni la entrega al distribuidor en esta ventana.
El Dueño puede desactivar/reactivar un tipo desde Tipos y precios, previa
confirmación. Es una baja reversible mediante CONFIGURAR_TIPO existente, no un
DELETE: conserva identidad, movimientos, vacíos y pendientes, visibles incluso
inactivo. No permite nuevos cobros/descuentos; recibir pendientes sin pagar sigue
permitido. El cambio usa nombre/precio confirmados, no ediciones sin guardar.
No requiere SQL, permisos adicionales ni elimina datos remotos automáticamente.

## Depósito compacto y selección por fila (19/10/2026)
A pedido del usuario, el ancho de administración baja de 896 a 672 px máximos;
el control de cantidad se limita a 320 px y se retiran saldos duplicados del
formulario. La fila completa selecciona al hacer clic, conserva botón accesible
por teclado y resaltado persistente. El hover sólo destaca, no cambia el tipo.
El manejador de fila respeta carga/bloqueo durable aunque tr no herede disabled.


## Arranque de puesto Windows persistente (19/10/2026)
El usuario acepta el diseño de Envases y pide continuar el plan. Se avanza P22/P23:
--kiosk usa InPrivate y no es apropiado para prometer conservación de la outbox
local entre sesiones. El lanzador usa --app y un user-data-dir estable por origen
HTTPS y nombre de puesto, bajo LOCALAPPDATA del usuario Windows. No usa el perfil
personal ni copia/borra perfiles, operaciones o credenciales. -Preparar es sólo
lectura: devuelve el arranque propuesto sin abrir Edge ni escribir archivos.

Se rechaza el arranque si hay política administrada UserDataDir, InPrivate
forzado o limpieza al salir; no se intenta sobreescribir seguridad de Windows.
Otras políticas y persistencia real requieren aceptación del puesto. Cambiar
perfil/URL/puesto no cancela solicitudes: revisar la cola anterior y recuperar
la operación original antes de adoptar otra configuración. No se realiza la
adopción, instalación, Assigned Access ni prueba financiera en esta sesión.

## Restauración técnica del catálogo estricto (20/10/2026)
El ensayo real de exportar/cifrar/descifrar/restaurar en un comercio nuevo de
Staging confirmó que el DML directo del restaurador legacy es rechazado por las
protecciones del piloto. No se amplían permisos ni se usa service-role para
restaurar productos: el Dueño utiliza guardar_producto_transaccional y
guardar_categoria_transaccional. Los IDs se remapean de forma reproducible por
origen/destino/tabla/ID; la descripción no identifica un producto de forma única.

Cada escritura conserva una operación local durable hasta recibir ACK del ID y
comercio correctos con sesión original vigente. Un fallo de almacenamiento o una
solicitud pendiente distinta detiene el envío. Se verifican los productos desde
un snapshot posterior; repetir la restauración no debe crear nuevas identidades.

Esta implementación cubre catálogo/categorías en Fusión. Copias con proveedores,
clientes, promociones, lotes, asociación a proveedor o modo Reemplazo se rechazan
antes de escribir: requieren completar sus contratos de restauración estricta.
El bloqueo existente de restauración integral en la interfaz se conserva. La
prueba técnica no autoriza activarla ni declara P14 completo. El destino de ensayo
queda suspendido; origen, master y Production permanecen intactos.

## Promociones y relaciones en restauración estricta (20/10/2026)
Se amplía el motor preparado del catálogo con guardar_promocion_transaccional,
conservando operación pendiente, ID reproducible y ACK de la sesión/comercio
originales. Las relaciones se remapean sólo a productos/categorías restaurados y
la composición, días, fechas e inactividad se verifican desde el snapshot final.

El ensayo representativo con JWT Dueño de Staging conserva cuatro tipos de
promoción y una receta de combo con componente pesable, incluida su repetición.
No se necesita SQL nuevo ni habilitar escritura directa. Esto sustituye sólo la
restricción de promociones del bloque anterior; clientes, saldos de proveedores,
lotes, asociación producto-proveedor, REEMPLAZO e interfaz integral mantienen
sus gates. No simular saldos iniciales mediante cargos/abonos nuevos.

## Diagnóstico WSAA aislado de homologación (20/10/2026)
El certificado recibido corresponde a la clave original cifrada. Se prepara un
diagnóstico local PowerShell/.NET con endpoint fijo de Testing, firma CMS
verificada y Token/Sign sólo en memoria; no se reutiliza la Edge legacy que mezcla
autenticación y emisión. No se regenera material criptográfico ni se publica este
bloque sin autorización. La única solicitud autorizada devolvió coe.notAuthorized;
se detienen reintentos hasta verificar la autorización WSASS del servicio wsfe.
El certificado público personal y los artefactos privados permanecen fuera de Git.
Tras la autorización WSASS confirmada por el titular, un único reintento obtuvo
Token/Sign y vencimiento reales (WSAA homologación PASS). El ticket permanece sólo
en memoria y no se persiste para reutilizarlo desde la interfaz. La consulta WSFE
preparada es exclusivamente FEParamGetPtosVenta; su ejecución y la pasarela fiscal
segura siguen pendientes. No confundir WSAA PASS con facturación habilitada.

## Restauración estricta de contactos e inventario (20/10/2026, preparación local)
Se agregan contratos SQL fuera del manifiesto histórico, sin habilitar DML directo.
La identidad reproducible de clientes/proveedores evita fusionar contactos por
nombre. Los saldos sólo se inicializan en registros nuevos; registros existentes
conservan su saldo vigente y no generan movimientos financieros artificiales.
Se rechazan puntos de fidelidad no soportados en vez de descartarlos.

La asociación producto/proveedor envuelve el RPC de catálogo en una transacción;
una asociación fallida revierte producto, costos, stock y operación. Los lotes
restauran cantidades/ingreso FEFO sin volver a aumentar stock. La validación del
servidor limita lotes activos al stock físico y rechaza fracciones en unidades.
El motor exige capacidad instalada antes de cualquier escritura de una copia que
requiera estos módulos y verifica el snapshot final. El pendiente conserva sólo
UUID y huella, sin datos personales en localStorage. La interfaz integral permanece
bloqueada: local/PGlite no demuestra JWT, red ni concurrencia de Staging.

## Gates permanentes de Production Readiness (20/10/2026)
Por instrucción expresa del titular se amplía el plan operativo existente con los
gates PR01–PR11: WSAA/WSFE homologación, CAE, robustez/idempotencia fiscal,
contingencias, integridad comercial, seguridad, backup/restore, recuperación,
concurrencia/E2E, transición productiva controlada y piloto comercial. Esa matriz
es canónica; los ExecPlans existentes la referencian y conservan su historia en
adendas fechadas, sin crear otro plan equivalente ni copiar gates en cada archivo.
Los estados locales/hospedados/productivos siguen diferenciados y la documentación
no amplía autorizaciones. Se continúa PR01 (consulta real WSFE homologación);
WSAA real ya pasó, CAE/Producción no están aceptados. Impresora/cajón y Point
siguen diferidos hasta cliente, sin convertir esa decisión en aprobación técnica.


## 20/10/2026 — PR03: registro fiscal preparatorio separado del cierre comercial

Contexto: PR01 de autenticación homologada está PASS; el esquema comercial tiene
ventas COMPLETADA/ANULADA y un checkout durable, pero carece del diario fiscal.
La Edge legacy no cumple custodia ni idempotencia. Alternativas: reutilizar el
resultado comercial como autorización fiscal o habilitar el legacy; se descartan
porque confunden efectos comerciales con una autorización externa incierta.

Decisión: módulo SQL aditivo de preparación de homologación con identidad estable
por venta, contexto cerrado y snapshot derivado de DB; permisos mínimos y sin
credenciales/numeración/envío. Se devuelve el UUID original en reintentos con otro
UUID y mismo contenido; cualquier cambio de contenido requiere resolver la
operación existente, no crear otra silenciosamente. Preparación no valida todavía
el emisor/punto ni representa el cuerpo WSFE completo. Sólo el Dueño ordinario
puede preparar en esta primera etapa; permisos de cajero y trabajador deberán
definirse y probarse antes de habilitarlos.

Consecuencias: entrega incremental local comprobable; no permite emisión hasta
completar reservas, estados, autorización/custodia, reconciliación y coordinación
con anulación comercial. No se altera el manifiesto histórico ni se instala el
módulo por esta decisión. PR03 y aceptación hospedada continúan pendientes.


## 20/10/2026 — PR03: serie global y un solo intento incierto

Contexto: dos comercios configurados con el mismo CUIT/punto/tipo comparten la
numeración externa. Un contador por tenant o un lock sólo del proceso permite
colisiones. Una concesión con vencimiento permite que un trabajador tardío envíe
mientras el reemplazo reintenta. Alternativas descartadas: incrementar sin
conciliar, liberar reserva por timeout o confiar en un mutex de Edge.

Decisión: reserva serializada en DB por serie global de homologación, una única
operación pendiente, sin avance/liberación automática. Registrar intento antes
de red y conservar identidad ante ACK perdido; otra identidad exige conciliación.
Coordinar reserva con modificaciones/anulación de venta mediante locks de fila
y triggers. El trabajador futuro debe acreditar emisor y observación real del
último autorizado antes de llamar la RPC privada; ésta no autentica una respuesta
ARCA por sí misma. Todas las respuestas siguen con emisión deshabilitada.

Consecuencias: preserva número y detiene nuevas solicitudes hasta resolver la
incertidumbre; falta implementar resolución segura y estados finales. No instalar
ni activar como pasarela completa. Concurrencia local y hospedada son evidencias
distintas; una caída del Docker de ensayo no equivale a un PASS.


## 21/10/2026 — F02/F05/F06: comparación fiscal completa y XML de servidor

Contexto: reservar un número no resuelve un envío incierto. El resultado de la
consulta hereda importes y datos de FEDetRequest; comparar sólo CAE/total deja
pasar diferencias de receptor, IVA, moneda o número. El legacy usa regex XML y
no tiene un cuerpo fiscal durable ligado a la operación.

Decisión: helpers puros de servidor con contrato cerrado/versionado, decimales
exactos y SHA-256; comparar todo el cuerpo, no sólo total/CAE. Parser DOM con
namespace/jerarquía directa y rechazo de ambigüedad/DTD, límites y errores
sanitizados. @xmldom/xmldom 0.9.12 mantenido y fijado para Node/Edge; no regex para
extraer XML. Transporte único de consulta homologada y sin redirecciones; timeout
incluye el cuerpo. Capturar una copia inmutable antes de esperar red.

Consecuencias: sólo devuelve una coincidencia candidata; falta CAS/persistencia
privada antes de confirmar el estado final. No habilita reenvío ni emisión. Datos
no soportados se rechazan en lugar de descartarlos. La legalidad del régimen,
parámetros actuales y vínculo de emisor/venta se deben verificar en el worker.
Node y Edge local sintéticos no sustituyen JWT/RLS ni ARCA hospedados.

## 21/10/2026 — PR06: parches de dependencias encontrados al revisar el parser

La auditoría informó dos paquetes existentes con severidad alta: source-map-js
1.2.1 y Vite 8.3.0 (avisos launch-editor). Se aplicaron parches compatibles:
Vite 8.3.4 y source-map-js 1.2.2, con sus dependencias de compilación relacionadas;
no actualización mayor ni scripts de instalación. Auditoría posterior: 0 alertas.
La incorporación del parser quedó fijada a 0.9.12; no era el paquete afectado.
Suite y build finales incluyen ambos cambios. Esto no cierra PR06 hospedado.
Fuentes primarias de avisos: https://github.com/advisories/GHSA-68fv-2mgg-jv7q y
https://github.com/advisories/GHSA-698v-4r3x-3vcv .

## 21/10/2026 — Conciliación durable conserva historia y respuesta original

Se eligió conservar reservas fiscales autorizadas, con índice único de número
histórico y otro parcial de pendiente por serie. Borrar la reserva al resolver
habría quitado el bloqueo de cambios/anulación de la venta y perdido trazabilidad.
El cierre confirma autorización, revisión y avance de numeración atómicamente.
Una observación inconclusa mantiene la serie bloqueada; no autoriza reenvío.

Cada observación tiene identidad y resultado inmutables. Recuperar su ACK no
repite consulta; una consulta nueva de pendiente usa otra identidad. Esto permite
reconstruir lo ocurrido sin transformar un error de red en nuevo cobro/factura.
La verificación de SOAP pertenece al trabajador privado y las RPC sólo aceptan
su servicio; la exposición de un endpoint exige todavía permisos y custodia.

## 21/10/2026 — Emisor privado y TA con carga perezosa

La configuración pública propone CUIT/PV pero no concede uso de credenciales.
Se requiere metadata privada provisionada, deshabilitada por defecto, asociada
al comercio y a una referencia/huella/revisión de credencial. Sólo el servicio
consulta el gate después de verificar Auth y actor Dueño original en DB.

El TA se carga después de recuperar resultados durables: reintentar un ACK
confirmado no renueva WSAA ni consulta WSFE. La caché de proceso no serializa
Token/Sign en operaciones habituales, no usa TA vencido y no solapa renovaciones
si una fuente ignora abort. No basta para varios procesos: custodia real y
coordinación distribuida siguen pendientes antes de habilitar el worker.

## 21/10/2026 — Compartir TA cifrado y no renovar mientras siga vigente

WSAA documenta reutilizar el TA vigente antes de solicitar otro. Se reemplaza
la renovación anticipada por espera en el margen final de seguridad de envío.
La coordinación usa certificado+homologación+wsfe, porque el TA corresponde al
CEE y servicio, no al alias local del comercio.

Se prepara persistir sólo un sobre AES-GCM privado para compartir entre procesos;
la clave proviene de custodia externa al DB/backup. Token/Sign descifrados quedan
en memoria y no se serializan en salidas habituales. La activación requiere gate
de instalación y provisión de claves; no se utilizó TA ni clave reales.
Se conserva la intención ante respuesta incierta: un timeout no autoriza otra
llamada a WSAA. Recuperación operativa explícita pendiente antes de habilitar
servicio hospedado. Rotación y DR deben preservar claves vigentes y detener el
worker hasta revalidar el estado restaurado. No usar cifrado como sustituto de
Auth/tenant: el gate privado se aplica antes de recuperar el sobre.

## 21/10/2026 — CMS con clave CryptoKey y proveedor WSAA privado

Se eligió PKI.js/asn1js fijados sobre WebCrypto para CMS/X.509, evitando construir
ASN.1 de firma a mano. El diagnóstico .NET existente ya usaba RSA/SHA-256; el
nuevo código conserva ese algoritmo y se verificó por .NET independientemente.
No se exporta clave privada; la fuente de custodia debe entregarla como CryptoKey
no exportable junto a certificado público, huella y referencia privadas.

WSAA se consulta sólo por transporte privado fijo de homologación. El TA se liga
al identificador del TRA y al DN del certificado, con reloj/namespace/XML acotados.
El contrato de DN inicial es explícitamente simple y falla ante formato no
soportado; no se normaliza aproximadamente un DN complejo. Huella pinneada y
issuer Test no sustituyen validación de cadena/autorización remota. Configurar
custodia y ejecutar contra ARCA siguen sus gates; no se usó material real aquí.

## 21/10/2026 — Custodia PKCS8 y keyring sólo servidor

Se implementa un lector inyectado de secretos, con proyecto Staging fijo y nombres
privados derivados de UUID. Acepta el formato cifrado que genera el preparador
.NET, no PEM privado plano ni valores del browser. Importa claves no exportables;
la passphrase y el PKCS8 descifrado sólo transitan en memoria. Límites previos a
PBKDF2 evitan parámetros inesperados o trabajo desmedido de una configuración
errónea. No sustituye un administrador de secretos ni autoriza provisionarlos.

La rotación AES conserva IDs antiguos durante vigencia de los sobres; si falta
la clave correcta se falla, no se usa otra. Se verificó formato .NET con material
sintético y UTF-8. Los adaptadores no se instalan ni reciben material real hasta
el gate autorizado. El frontend no contiene prefijos de este lector/keyring.

## 21/10/2026 — Separar preparación TA de intención de envío

Reservar un certificado no significa haber contactado WSAA. La nueva preparación
se puede cancelar con auditoría y CAS antes de registrar intención. El permiso de
envío se concede una sola vez, después de validar custodia y firmar; ACK perdido
mantiene incertidumbre. Una cancelación antigua no libera una reserva nueva.
No se libera por reloj una solicitud que pudo llegar a ARCA. SQL 007 y proveedor
preparados localmente; el gate de instalación/custodia real no se amplía.

## 21/10/2026 — Frontera HTTP fiscal cerrada e instalada por gate separado

La nueva función sólo consulta/reconcilia operaciones existentes o recupera una
preparación TA. CORS exacto, JSON acotado/cerrado y Auth.getUser + gate SQL preceden
custodia. El SDK privado sólo accede a Auth y RPC fiscales del host Staging, sin
reintentos, sesión persistente, redirecciones ni exposición de respuestas privadas.
La configuración de gateway mantiene verify_jwt=true; nunca se reemplaza por
claims locales. El flag privado está cerrado por defecto; autorizar publicación
de código o deploy no habilita consultas ARCA reales ni emisión. Primero preparar
y revisar, después instalar/provisionar/pruebas hospedadas con sus autorizaciones.

La recuperación HTTP de TA se limita además a la operación que creó el intento.
Compartir certificado/TA entre comercios no autoriza a un Dueño a cancelar ni
identificar la preparación de otro. SQL 008 conserva el origen de nuevos intentos
y falla ante orígenes históricos desconocidos; no se backfillea una atribución
sin evidencia. La reutilización privada del TA ya confirmado continúa permitida.

## 21/10/2026 — Envío homologado único con permiso por hash

El nuevo worker sólo consume un cuerpo previamente persistido y un permiso
privado exacto de vigencia acotada. Registrar intención y consumir permiso es
atómico; ACK perdido o repetido nunca habilita otro FECAESolicitar. Una respuesta
con CAE sólo es una recepción: se confirma mediante consulta completa y CAS.
No se inventan IVA, tributos o importes desde defaults, ni se atribuye una
numeración ocupada sin intento propio. El flag de emisión es separado y cerrado.
La devolución fiscal debe reconocer el ledger nuevo antes de activar usuarios;
el circuito de nota de crédito conserva su decisión externa pendiente.

## 21/10/2026 — Devoluciones y reserva fiscal comparten exclusión por venta

El registro antiguo afip_cae no reconoce la nueva autorización privada. Se elige
proteger la tabla padre de devoluciones y la reserva fiscal con la misma fila de
venta, en lugar de duplicar CAE o confiar en un bloqueo del modal. Se conserva la
preparación sin reserva y el replay de devoluciones ya confirmadas. Una devolución
previa no se descuenta/infiere fiscalmente: bloquea facturar el total original.
La implementación exige READ COMMITTED para ver commits tras esperar el lock;
rechaza snapshots fijas explícitamente y no muta ventas para forzar conflictos.
SQL 010 preparado, sin instalación. Notas de crédito requieren todavía su contrato
fiscal externo y aceptación; estos guards no lo sustituyen.

## 22/10/2026 UTC — Revisión humana separada del permiso de emisión

La aprobación del Dueño se liga a cuerpo/hash/revisión, usuario/Auth originales y
binding privado, vence en diez minutos y conserva auditoría/ACK inmutables. No
extiende vigencia al reintentar ni reemplaza el permiso privado de ensayo. El worker
la exige antes de TA y DB la revalida al consumir permiso, después de cualquier
espera de lock. Reasignar Auth o rotar emisor invalida la aprobación vigente. No se
infiere IVA ni se habilita emisión por aprobar. Backend preparado; UI, provisión e
instalación requieren aún integración/aceptación y sus gates correspondientes.

La identidad de Auth verificada acompaña cada RPC de revisión y la intención de envío. No se vuelve a inferir desde usuario_id entre peticiones. La entrada de envío sin actor queda revocada al rol de servicio; el wrapper valida y mantiene locks hasta consumir. Reasignar un perfil no puede atribuir a su cuenta nueva una confirmación iniciada por la anterior.

## 22/10/2026 — Datos fiscales explícitos y envases pendientes de criterio contable

Se descarta reutilizar punto de venta, IVA global, receptor o fechas predeterminados del adaptador fiscal heredado. La preparación debe combinar identidad/total/snapshot de servidor con datos declarados expresamente por Dueño y parámetros acreditados/versionados. Su hash previo a numeración no sustituye el cuerpo final, la revisión SQL 011 ni el permiso privado. Los componentes visuales preparados no acreditan persistencia ni aceptación hospedada hasta integrar esos contratos.

El titular confirmó que consultará con el contador cómo deben figurar los envases recibidos y descontados del ticket. Hasta disponer de ese criterio, bloquear esas ventas para preparación fiscal, preservando sus datos comerciales. No inferir tratamiento IVA ni cambiar el total. Las demás ventas pueden avanzar en desarrollo local. Se conserva la prohibición actual de instalar SQL/Edge fiscal remoto antes de resolver preparación y revisión; ningún componente habilita emisión.
## 22/10/2026 — Preparación durable antes de cuerpo y numeración

Conservar datos fiscales declarados y canónico/hash en una preparación privada inmutable, creada atómicamente con la operación/snapshot y ligada al Auth verificado y emisor originales. Reutilizar el validador SQL final para no duplicar sus reglas, sin persistir ni reservar el número estructural. El cuerpo final sólo puede enlazarse por el nuevo adaptador si coincide exactamente con esa preparación, agregando el número observado por el servidor. Replay conserva UUID y ACK; un cambio requiere resolución explícita, no renumerar ni reemplazar datos silenciosamente.

El catálogo privado se provisionará con fuente/revisión/vigencia explícitas, sin valores habilitados por defecto. Su SHA de fuente no equivale a autenticación ni consulta ARCA real. No reutilizar IVA global heredado ni habilitar remotamente por disponer de estas tablas. La adaptación HTTP/UI y el gate de consulta de numeración permanecen pendientes.
## 22/10/2026 — Recuperar desde venta antes de preparar otra solicitud

El flujo público recupera la operación/estado originales por venta, sin exigir emisor o catálogo activo sólo para leer ese estado. Registro fiscal heredado no vacío impide nueva preparación y requiere constancia original; no equivale por sí solo a CAE válido. Auth no probado o snapshot cambiado conduce a revisión, sin atribuir el intento a una cuenta nueva.

Persistir UUID y datos exactos en el equipo antes de POST, con aislamiento por Auth/comercio/venta; mantenerlos ante ACK perdido y retirar datos del receptor cuando el servidor confirme ese mismo guardado. No crear otro UUID ni sustituir datos al reintentar. Aprobación visual conserva identidad propia y nunca implica emisión. Integración de historial detrás de flag explícito inicialmente apagado; no fallback al adaptador fiscal heredado. Consulta privada de numeración y unión al cuerpo final siguen siendo gate pendiente antes de activar.
## 22/10/2026 — Auth original también en revisión y consumo, no sólo en resolución visual

Una preparación 012 no se revisa/aprueba ni consume con el Auth nuevo de un perfil reasignado, aun con UUID conocido o revisión histórica ajena. Guard privado SQL compartido en getter y envío/consumo; compatibilidad de 011 anterior a tabla opcional preservada. Evaluar expiraciones después de completar guards/locks.

Fijar además el header de sesión verificada en el cliente para que la selección posterior del SDK no cambie la cuenta del envío. Es un control de consistencia cliente; Auth.getUser y DB siguen autorizando cada petición. No persistir ese token. La suite anterior al refuerzo se conserva y no se atribuye al código posterior.
## 22/10/2026 — Validar antes del pendiente y separar numeración de emisión

Reutilizar reglas puras, sin transporte/TA/custodia, antes del primer UUID/cuerpo persistido en el navegador: rechazo local permite corrección. Copiar antes de await y reconsultar identidad local al finalizar evita cambiar el cuerpo o crear UUID distintos en validaciones simultáneas. No borrar ni reemplazar intentos enviados que sigan inciertos.

Preparación de cuerpo requiere gate privado independiente ARCA_HOMO_PREPARATION_ENABLED, inicialmente cerrado y sin autorizar consultas reales por tener código listo. Recuperar cuerpo existente antes de TA/red; para uno nuevo, verificar fuente/Auth original, consultar último número, persistir inmutable y confirmar leyendo DB. Esa acción no emite ni aprueba. Una respuesta/ACK sin cuerpo durable no es éxito y una devolución previa impide siquiera la consulta de numeración. Claves y autorización remota siguen siendo gates distintos.
## 22/10/2026 — Constancia histórica desde ledger privado, separada de aprobación

Contexto: la revisión del cuerpo y el estado AUTORIZADA no bastan para presentar CAE/vencimiento. Se elige un getter privado específico por venta/operación con Auth original de preparación 012, ledger y cuerpo inmutable coherentes. La consulta no depende de certificado o catálogo actualmente habilitados y no renueva TA ni consulta ARCA. Se descarta construir constancia a partir de aprobación humana, respuesta candidata o campos heredados sin trazabilidad Auth. El servidor verifica Auth una vez por acción, conserva la identidad y devuelve sólo DTO cerrado. Cliente vuelve a validar identidad/hash/CAE/fechas y no guarda datos fiscales en localStorage. Operaciones heredadas sin preparación Auth acreditada requieren otro proceso de revisión, no atribución automática a un perfil reasignado. La vista actual se identifica como homologación sin validez fiscal y no sustituye representación fiscal final, primera emisión ni aceptación hospedada. Instalación SQL 014 conserva gate independiente.

## 22/10/2026 — Conservar recepción fiscal sin convertirla en resolución ni reenvío

El worker descartaba la recepción clasificada al conciliar. Se conserva en ledger append-only privado por operación/intento/hash/Auth original, validando permiso consumido y revisión histórica. La auditoría puede completarse después de revocación/rotación/expiración del acceso de emisión ya utilizado: no exige ni concede permiso nuevo, no toma Auth de un perfil reasignable. Se descarta exigir metadatos vigentes del emisor para escribir esa evidencia histórica porque podría perder un rechazo recibido tras el envío. El getter sólo sirve al trabajador privado; cualquier futura UI debe agregar gate de Dueño activo y comercio/venta.

Persistir significa recuperar el mismo registro durable después de la escritura, no creer un ACK. Contradicciones no sobrescriben; no se registran SOAP, mensajes libres, tokens ni CAE candidato. Fallo de auditoría no impide intentar reconciliación íntegra, pero se informa como falta de confirmación. Autorización conciliada conserva su validez de ledger aunque falte evidencia de recepción; no se reenvía para reconstruirla. Un timeout sin recepción no se etiqueta rechazo. Rechazo recibido no libera número, no cambia cuerpo ni resuelve corrección/cancelación/NC; esos gates siguen pendientes.

## 22/10/2026 — Separar diagnóstico visible del permiso histórico de auditoría

La auditoría 015 puede completar una recepción del trabajador después de revocaciones, por lo que no autoriza lectura pública. Se agrega getter 016 específico con Dueño activo ordinario, comercio/venta y Auth original de preparación. Muestra sólo estado/hash, clasificación/códigos y última decisión, sin permisos/TA/identidad privada/CAE candidato. Para declarar AUTORIZADA en diagnóstico exige constancia 014 coherente. Consulta negativa posterior y recepción previa no sobrescriben el estado autorizado del ledger.

La UI distingue evidencia recibida y autorización conciliada; falta de recepción no se etiqueta rechazo. No infiere significado de códigos ARCA ni ofrece corrección/reenvío/cancelación antes de resolver sus gates. Estado que avanza durante la lectura recupera constancia; respuesta atrasada no degrada autorización, hash distinto/revisión obsoleta no habilitan aprobar, y fallo parcial del diagnóstico no oculta constancia válida. Getter de auditoría histórica permanece sólo de worker. Sin consultas fiscales reales ni activación remota por tener esta pantalla preparada.

## 22/10/2026 — Cancelar antes de numeración sin borrar ni reactivar identidades

Para poder corregir una preparación se conserva cancelación durable del UUID original, incluso si el guardado aún no llegó. Se descarta borrar pendientes únicamente en el navegador: una petición tardía podría recrearlos. Operación sin cuerpo/reserva pasa a CANCELADA con hechos originales intactos; otra identidad puede ser la única activa PREPARADA de la venta. Índice parcial preserva historia y unicidad activa. Guard de creación bloquea UUID cancelado; helper final de reserva revalida estado después de locks. Lock transaccional por UUID global, adquirido antes de operación, serializa colisiones entre ventas, además del lock de venta.

Las RPC privadas exigen Dueño activo/comercio/venta y Auth original cuando existen hechos 012; preparación heredada sin identidad probada no se cancela. Cancelación no depende de catálogo/emisor vigentes y nunca admite cuerpo o reserva existentes, aunque no haya CAE. Confirmar significa leer estado/hechos y auditoría coherentes, no sólo contar filas afectadas. La familia debe incluir funciones actualizadas 001/002/012 antes de 017; no instalar 017 aislado sobre funciones previas. Servicio/UI y retiro seguro de pendiente local forman parte del alcance pendiente antes de activar; cancelación posterior a numeración/envío/CAE no se incorpora por inferencia a este flujo.

## 22/10/2026 — Retirar pendiente local sólo con cancelación recuperada y exclusión por puesto

La cancelación SQL necesita completar recuperación cliente sin borrar una identidad nueva ni datos a ciegas. Servicio conserva el Auth verificado una vez durante escritura/lectura; sólo registro durable vinculado al mismo UUID/venta confirma, incluso con ACK perdido. Cliente coordina mutaciones del scope Auth/comercio/venta con Web Locks en navegador (cola compartida por almacenamiento/scope para pruebas), revalida flag al adquirir y conserva original Auth por valor. Sin ese soporte, el flujo mutable falla antes de escribir/enviar.

El pendiente se retira bajo exclusión después de leer cierre confirmado y sólo si sigue siendo el mismo UUID; removeItem verificado en navegador conserva compatibilidad con formato v1 y otras claves. Resolver recupera cancelación tras reinicio/ACK perdido, permitiendo corrección con identidad nueva. Confirmación explícita en UI antes de número; ninguna reserva/envío/CAE se cancela por esta vía. Activación requiere pestañas/versiones compatibles y aceptación real Web Locks/JWT/RLS/E2E: el test de dos instancias y el adaptador de navegador simulado no sustituyen esa prueba hospedada.

## 22/10/2026 — Corregir cuerpo reservado sin intención de envío

La corrección usa otra operación, preparación explícita y cuerpo inmutable. SQL 018 transfiere la reserva pendiente dentro de una única transacción, conservando serie, número y fecha original, sin simular una observación ARCA ni liberar numeración. El enlace auditado conserva ambos hashes y la reserva anterior completa; la operación original queda SUSTITUIDA. Sólo se admite la misma venta, Auth original vigente y serie exacta, con snapshot/emisor/parámetros válidos, antes de cualquier intención, respuesta o conciliación. Se revoca el permiso anterior conservando su registro; la sucesora requiere revisión y permiso nuevos. Reintentar el mismo contenido recupera el cierre durable. ENVIO_INCIERTO/AUTORIZADA y cambios de serie requieren sus flujos pendientes, no esta sustitución. SQL 018 es privado y local; servicio/HTTP/cliente/UI y aceptación hospedada aún deben integrarse antes de habilitarlo.

## 22/10/2026 — Sustitución reservada integrada y descarte sin cancelar número

La propuesta nueva se valida de forma pura, se conserva canónico/hash con UUID sucesor antes del POST y se confirma por lectura durable con Auth original. El servicio no toma defaults del adaptador heredado ni solicita TA/ARCA. SQL 018 decide la vigencia comercial/fiscal; la interfaz requiere confirmación y nueva revisión, sin heredar aprobación/permiso. Todas las mutaciones del cliente, incluida aprobar, comparten exclusión por venta. Un cierre tardío no pisa otra propuesta/identidad local.

Para abandonar una propuesta todavía no confirmada se cierra sólo su UUID sucesor mediante SQL 017. Si la sustitución ganó, ese cierre se rechaza por existir cuerpo/reserva y se recupera la sucesora; si ganó el descarte, el cierre bloquea cualquier petición tardía a SQL 018. La reserva original no se libera ni cancela. Se requiere confirmación explícita y lectura durable antes de retirar datos locales; fallos conservan propuesta/identidad para recuperar.

La integración detectó una carencia de 76ff310: construir el canónico sucesor mediante JSONB::text preservaba la transacción pero producía un hash incompatible con la revisión TypeScript. No se había probado ese enlace en el incremento SQL anterior. Se reemplaza por serialización compacta/ordenada compatible, verificada con revisión real y Unicode/escapes, y se bloquea la instalación sobre sustituciones históricas incompatibles en vez de reescribir cuerpos. SQL 018 nunca se instaló remotamente. El historial y evidencia anterior se conservan con su alcance transaccional; el nuevo pase debe cerrar esta corrección antes de publicar.

### 22/10/2026 — Recuperación entre terminales con propuestas diferentes

Si otra terminal ganó la sustitución, su ACK no confirma ni borra la propuesta local. Resolver conserva el panel de recuperación; descartar cierra únicamente el UUID sucesor local no creado y después se consulta/revisa la preparación ganadora, sin tocar su cuerpo o número. Errores de resolución también conservan acceso al pendiente local válido. Dos almacenes independientes cliente→HTTP→SQL y carrera PostgreSQL nativa cubren este caso; no se presenta como dos ventanas/JWT hospedados.

## 22/10/2026 — Corregir un rechazo recibido conserva la fila de intento

La corrección posterior a envío sólo se prepara para R con detalle validado y auditoría ligada al intento/hash/Auth/revisión/permiso consumido. Un timeout, SOAP Fault, Errors sin detalle, SIN_CONFIRMACION o aprobación candidata no se transforman en rechazo. Se exigen además consulta negativa estricta FECompConsultar/602 sin ResultGet contradictorio y último autorizado N−1 posterior, frescos al tomar locks y antes de confirmar la transacción. Referencia técnica: manual WSFEv1 v4.7, sección CAE/errores de comunicación (https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf); el diseño no toma el apartado CAEA como contrato CAE.

SQL 019 conserva fila de reserva/intento, recepción y conciliaciones originales. Sólo la transición auditada RECHAZO_CORREGIDO las archiva sin borrarlas; la sucesora usa la misma venta/serie/número y datos explícitos nuevos en la misma transacción. Unicidad global aplica a filas no archivadas, con guard irreversible del archivo e integridad de FKs; no hay intervalo de liberación de la serie ni avance de último observado. La preparación nueva no hereda revisión/permiso, y el intento antiguo no puede reactivarse. El lector privado de recepción sigue acreditando los vínculos históricos del intento consumido; leer historia no autoriza otro envío.

El trabajador privado verifica Auth una vez por acción y usa una fuente SQL de la venta original antes de TA. Gate ARCA_HOMO_REJECTION_RECOVERY_ENABLED cerrado por defecto, revalidación de fuente/binding antes de las dos consultas y del commit, recuperación por getter antes de TA si ya se confirmó y después de ACK perdido. No FECAESolicitar ni aprobación/permiso nuevos. La integración HTTP/cliente/UI de esta clase y su aceptación hospedada todavía faltan; incertidumbre sin R y NC conservan sus gates. No ejecutar consultas reales ni instalar SQL/Edge por esta decisión.

## 23/10/2026 — Propuesta de rechazo versionada y consultas sólo por acción explícita

Se reutilizan el lock y el almacenamiento de propuestas por Auth/comercio/venta, con dos formas cerradas: v1 conserva exactamente el contrato anterior de reserva; v2 exige kind RECHAZO y usa únicamente los getters/worker de SQL 019. No migrar ni reinterpretar una propuesta v1 como rechazo ni descartar variantes desconocidas. Una versión antigua del frontend falla cerrada ante v2; la aceptación de activación debe incluir recarga/versiones compatibles entre terminales.

El modal sólo ofrece corregir ante diagnóstico R recibido y mismo hash/estado incierto, sin evidencia DATOS_DISTINTOS/CONSULTA_DISTINTA. Esto mejora el flujo; la autoridad sigue en SQL/worker, que comprueban intento/Auth/recepción/serie y consultas externas. Confirmación humana explícita antes del formulario y del reintento guardado. Abrir, resolver o descartar sólo usa lecturas/cierre durable, sin TA ni WSFE. La acción CORREGIR_RECHAZO_FISCAL se mantiene detrás del gate privado cerrado; no concede permiso ni ejecuta FECAESolicitar.

Propuesta/UUID se conservan antes del POST y frente a fallos. Primero recuperar el cierre, luego ejecutar una nueva acción explícita sólo si no existe; las respuestas de reserva no confirman rechazo. Al descartar se cierra sólo la sucesora local no creada; si otra terminal ganó, recuperar su cuerpo/número y no atribuirle la propuesta perdedora. La sucesora exige otra revisión y permiso privado independiente. SQL 001–019 no cambia en esta integración; no amplía autorizaciones remotas. Contador/envases, custodia/PV, primera emisión/CAE, aceptación hospedada y restauración mantienen sus gates.

## 23/10/2026 — Conciliación: ACK durable y autoridad transaccional

El ACK de registrar no prueba por sí solo un commit: el orquestador ahora ignora esa respuesta y confirma con consultar_reconciliacion_homologacion del mismo UUID, cuerpo/hash/número, incluso si la escritura perdió su ACK. Replay recupera antes de TA/red; un ACK falso, getter fallido o resultado ajeno conserva incertidumbre y no concede reenvío.

La acción privada CONCILIAR captura Auth una vez, usa autorización de conciliación propia y revalida el mismo actor/binding antes de TA, justo antes de fetch y antes de guardar. No se adopta otra cuenta al reasignar un perfil. La lectura HTTP anterior al registro no cierra por sí sola el TOCTOU; SQL 020 compara el binding original y conserva los locks de autorización durante registrar, revalidando al finalizar. Reutiliza los contratos de SQL 004 sin alterar historial/numeración. Hechos 012 existentes exigen Auth original mediante el helper ya vigente; diario privado anterior sin tabla de hechos conserva autorización heredada, sin inventar una identidad de preparación. Esta compatibilidad no habilita el formulario heredado ni acredita un original inexistente.

ARCA_HOMO_RECONCILIATION_ENABLED queda cerrado por defecto en HTTP para una consulta nueva, revisado durante la espera. No afecta replay durable que no necesita TA. Leer/conciliar no permite FECAESolicitar ni cancelar números. SQL 020 y dos RPC nuevas se preparan para instalación fiscal compatible autorizada, no se instalan aquí. La UI y la observación persistente de conciliación siguen pendientes. También debe revisarse el encadenamiento de esta autoridad en la conciliación interna del worker de emisión antes de aceptación hospedada; el cambio durable de ACK sí aplica a sus llamadas del helper común.

## 23/10/2026 — Conciliación interna conserva el Auth ya verificado

HTTP y trabajador de emisión comparten reconcileVerifiedFiscalVoucher: recibe el actor/binding capturado por el llamador, sin otra lectura Auth ni reatribución desde perfil, pero SQL 020 acredita ambos antes de leer el cierre y antes de TA/fetch/registro. Cada escritura de conciliación usa el wrapper ligado; el helper genérico de persistencia queda como mecanismo, no como ruta de autoridad del trabajador. Una emisión nueva requiere también el gate de conciliación antes de TA/envío. Un resultado ya guardado puede recuperarse con gates de emisión/consulta cerrados, conservando la exigencia de autoridad vigente para esa ruta privada.

Si el perfil cambia después del POST, la recepción histórica se conserva con Auth original mediante SQL 015 y la conciliación no adopta la cuenta nueva: queda incierta para recuperación. La UI aún pendiente no puede interpretar esa recepción como CAE. Se valida también cambio durante espera TA, emisor rotado, ACK perdido del wrapper y replay sin red. No se modifican SQL 001–020 ni permisos de emisión, no se instala o activa fiscal remoto.

## 23/10/2026 — Observación fiscal recuperable sin nueva consulta al abrir

SQL 021 separa lectura histórica de una observación de CONCILIAR. Exige Dueño activo del mismo comercio/venta, preparación 012 con Auth original y vínculo a intento/cuerpo/número. Un pendiente histórico puede recuperarse después de archivar por corrección R y con emisor revocado, sin degradar la sucesora. Un resultado autorizado exige constancia 014 y coincidencia con ledger; no se devuelve respuesta SOAP ni binding/custodia. Preparaciones sin hechos originales no ganan acceso por esta lectura pública. El contrato de ACK es puro y compartido con persistencia, admite sólo campos cerrados y fechas válidas; importar el cliente no incorpora transporte fiscal privado.

La observación local contiene sólo UUID/hash/número por Auth/comercio/venta y se guarda antes del primer POST. Comparte Web Lock con acciones fiscales; mientras es incierta bloquea preparación/corrección/aprobación/cancelación incompatibles, sin bloquear el POS comercial. POST no confirma: GET del mismo ID es la autoridad. Reapertura sólo consulta lectura durable, no ARCA; ausencia sola o fallo conserva el intento y sólo una acción confirmada puede consultar con el mismo ID. Sin descarte a ciegas. Un ACK tardío no borra otra identidad local.

Si otra terminal ya autorizó exactamente el cuerpo, su constancia puede cerrar el pendiente local obsoleto sin decir que aquella observación se ejecutó. Una sustitución/corrección durable del mismo hash/número también lo vuelve obsoleto porque la operación antigua no admite escrituras tardías. Se recarga estado/diagnóstico/constancia actuales y no se degrada AUTORIZADA por un ACK histórico pendiente. La pantalla no muestra el ACK de consulta como factura/CAE emitido. Confirmación humana de sólo consultar homologación, guardas de doble clic y respuestas descartadas al cambiar de venta. Gate de consultas reales sigue cerrado; SQL 001–021/Edge no se instalan aquí.

### 23/10/2026 — Datos de representación fiscal históricos
No reconstruir comprobantes desde configuración o catálogo actuales. SQL 022 captura hechos explícitos inmutables por Auth/cuerpo/hash antes de revisión/intención; una corrección exige sucesora auditada, sin alterar historia ni heredar aprobación. El guardado no acredita vínculo a revisión/permiso hasta integrarlo y no habilita emisión. Envases descontados continúan bloqueados por tratamiento pendiente del contador.

### 23/10/2026 — Aprobación de representación exacta
Con hechos 022, la revisión requiere el hash de presentación que confirmó el Dueño además del cuerpo fiscal. Conservar vínculo inmutable y verificar el mismo ID al consumir permiso; no promover una aprobación antigua a aprobación de datos nuevos. Compatibilidad histórica sin hechos no acredita obligatoriedad para nuevas preparaciones: integrar captura/UI y guard obligatorio antes de activar.

### 23/10/2026 — Captura histórica antes de confirmar revisión
La pantalla usa IDs/importes del snapshot, pide datos explícitos de representación y muestra los hechos guardados antes de aprobar su hash. No reconstruye descripciones desde catálogo actual ni persiste PII en navegador; respuesta pública transmite canónico/hash y deriva datos verificados. Una sucesora vuelve a captura sin herencia. Obligación global en servidor antes de intención/TA sigue pendiente y bloquea activación.

### 23/10/2026 — Toda intención nueva requiere preparación y representación revisadas
Sin excepción heredada: SQL 025 valida preparación/hechos/revisión/Auth/cuerpo/emisor/parámetros antes de TA y dentro de la transición a intención. Revocar helper directo, preservar replay histórico sin reconstrucción y verificar vigencias después del último lock. Retirar localmente afip-wsfe con 410 y bloquear demostración CAE en piloto estricto; no suponer retirada remota ni autorizarla implícitamente. Producción/primera emisión y aceptación hospedada conservan sus gates.

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

### 23/10/2026 — Recuperación NC sin almacenar datos fiscales en el navegador
Contexto: una respuesta perdida no confirma ausencia y perder localStorage no debe hacer desaparecer los casos reservados. Decisión: metadatos mínimos locales e historial canónico privado validado; UUID estable explícito por intento y desistimiento durable mutuamente excluyente con su creación tardía. Se descarta borrar un pendiente por una lectura vacía o regenerar silenciosamente su identidad. La cancelación confirmada conserva historia y no es una NC emitida. Consecuencia: requiere SQL028/029 y aceptación hospedada autorizada antes de uso remoto. La devolución comercial permanece bloqueada hasta CAE NC confirmado, conforme elección del titular; no existe emisión NC en este incremento. Incluir desistimientos y resto del diario fiscal en prueba futura de restore integral.

### 23/10/2026 — Fuente comercial NC separada de autorización y catálogo actual
El snapshot fiscal no contiene pagos ni receta; para preparar NC se debe contrastar con ambos registros privados del checkout confirmado y sus salidas físicas. Se elige getter mínimo privado SQL030, no reconstrucción de combos/productos actuales ni exposición del snapshot completo. Hash de snapshot PostgreSQL se identifica como checksum comercial, separado del canónico fiscal. La lectura no concede permiso de envío ni habilita reintegro/stock: intención y aplicación deberán revalidar hechos y estado bajo locks. Unidades históricas ausentes se declaran NO_REGISTRADAS; capturarlas para ventas nuevas/conciliar antiguas es requisito pendiente, sin redondeo ni inferencia retroactiva desde catálogo. No se autoriza instalación o activación remota.
