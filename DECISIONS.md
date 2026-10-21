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
