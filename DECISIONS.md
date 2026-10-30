Este documento registra decisiones arquitectónicas o de dominio que sean no triviales, junto con su contexto y justificación.

## Exclusión del asistente de ventana y propiedad tras ACK perdido (28/10/2026)

Contexto: el SQL v2 impide reabrir después del cierre, pero un binding activo
coincidente no identifica qué asistente ganó una apertura si se perdió la
respuesta. Un mutex de archivo local tampoco excluye operadores de otra máquina.

Decisión local, todavía sin ejecutar en Staging: el futuro asistente privado
mantendrá una conexión PostgreSQL dedicada, sin reconexión ni pool transaccional,
con advisory lock de sesión común a todos los planes del proyecto. Verifica PID,
inicio de backend y posesión del lock antes/después de reconciliar una apertura.
SQL v2 no cambia. La reconciliación sólo admite lectura independiente bajo la
misma sesión todavía propietaria. Si ésta termina/cambia/pierde el lock, queda
invalidada permanentemente: no se adquiere otra sesión para apropiarse de una
ventana coincidente ni cerrarla. Se requiere conciliación operativa explícita.
El lock no reemplaza el GO, binding completo, supervisión exclusiva ni cierre
de flags; tampoco es un TTL ni garantiza cierre automático tras un crash.

La prueba nativa incorpora dos asistentes de planes distintos, respuesta perdida
con sesión conservada, precisión del recibo y corte de sesión sin cierre ajeno.
Una comprobación de cleanup fallida mantiene la exclusión mientras viva la
sesión; no se declara PASS ni se libera como si el entorno estuviera cerrado.

Autenticación privada: JWT en memoria, rechazo de claims incompatibles seguido
siempre de Auth `/user` y perfil Dueño exacto/activo del comercio. Decodificar
claims no acredita su firma; `/user` sí debe confirmar la identidad. Sólo claves
API públicas publishable o anon del Staging exacto, logout `scope=local` y sin
refresh automático. Los tres flags permitidos se verifican con sus digests;
cualquier cambio ajeno de metadata o flag fiscal no permitido bloquea avance.
La fase de cierre no depende de que el Owner revocado recupere privilegios,
pero sí de conservar la exclusión del operador. Nada de esto acredita aún el
asistente integrado, JWT hospedado positivo, custodia funcional ni ventana real.

El flujo privado registra durablemente el intento ANTES del POST, con operación
y hash aprobados. Si el guardado o la preparación pierde ACK, sólo lee resolución
y revisión; un nuevo proceso no repite PREPARAR porque no aparezca todavía un
cuerpo. El journal append-only usa esquemas cerrados y fsync; conserva texto de
recibo/identidad de cuerpo y rechaza corrupción sin borrar nada. Su hash chain
detecta corrupción, no autentica frente a un editor con acceso al filesystem ni
demuestra propiedad de una ventana previa. Se descartaron un journal sólo en
memoria (pierde intentos tras restart) y reintentos automáticos (podrían repetir
WSAA). La pertenencia y quiescencia deben verificarse por el operador completo.

El orquestador privado consume sólo el SQL y los comandos exactos del paquete.
Usa dos conexiones dedicadas: writer propietario del advisory lock y observador
RRO independiente. Los hashes de historial/comercio se fijan con timezone UTC.
Una lectura no acredita estado si su ROLLBACK no fue confirmado; el observador
queda inutilizable para evitar reutilizar una transacción/snapshot incierta.
Management queda limitado a metadata y tres flags booleanos, nunca secretos
nuevos ni credenciales. La entrada pública/terminal y la aceptación nativa de
estas piezas siguen pendientes, por lo que todavía no forman un paquete GO-ready.

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

### 23/10/2026 — Unidades congeladas al preparar checkout, no inferidas al devolver
Se elige captura privada opcional por comercio, apagada por defecto, para entradas nuevas; se liga evidencia inmutable al snapshot y al actor que preparó. Primer cierre revalida metadata y revierte si cambió; replay confirmado conserva historia aun con catálogo posterior distinto. Entradas antiguas quedan sin registro: no backfill automático. Captura no prohíbe cantidades de combos pesables que el checkout ya admite; decidir devolución es una política independiente. Getter NC separado valida factura/Auth original antes de entregar canónico/hash, sin habilitar dinero/stock. Integración tipada/conciliación histórica aún pendientes. Incluir evidencia y configuración privadas en dump/restore integral; instalación/activación remota requiere gate específico.

### 24/10/2026 — Fuente de unidades NC acreditada separada del permiso de devolución
El transporte de SQL031 revalida factura026 y fuente030, hash/canónico y metadata exacta; Auth se captura una vez y se verifica en cada consulta SQL. Ausencia es explícita y ningún error equivale a NO_REGISTRADAS. Fuente030 conserva hechos de combos pesables fraccionados admitidos por checkout: no impone retrospectivamente una política de devolución. CAPTURADAS no autoriza saldo, emisión ni efectos comerciales; el formulario y la intención deberán aplicar elegibilidad propia y revalidar bajo locks. No backfill desde catálogo actual. Se mantiene efectivo/stock sólo después de CAE NC confirmado; integración remota requiere autorización específica.

### 24/10/2026 — Captura de caso NC y resultado incierto
Se integra formulario sin inferencia de IVA ni reposición automática. Las comprobaciones históricas del navegador no conceden elegibilidad final: debe ligarse/verificarse comercialmente bajo locks antes de intención/aplicación NC. Un intento conserva UUID y contenido desde primer envío; resultado incierto se recupera o cancela mediante el panel, no se edita para reemplazarlo. ACK confirmado y actualización de historial son resultados separados: fallo posterior no convierte un guardado confirmado en ausencia. No se habilita emisión ni devolución comercial; se mantiene CAE NC confirmado como requisito previo a efectivo/stock.

### 24/10/2026 — Caso nuevo NC ligado atómicamente a hechos comerciales
Se exige captura comercial/unidades al insertar todo borrador nuevo mediante trigger servidor032, no sólo un check de UI o un flag opcional de elegibilidad. Si falla, caso/saldo/evidencia revierten juntos. Borradores anteriores no se recapturan ni reinterpretan: consulta/replay/cancelación preservan historia, pero no acreditan elegibilidad futura. El vínculo inmutable representa hechos al guardar, no permiso actual; toda intención/aplicación NC deberá exigirlo y revalidar fuente/políticas bajo locks. Dinero/stock sólo tras CAE NC confirmado. Conservar tabla en dump/restore y, ante rollback de rollout, deshabilitar guardado sin retirar guard para abrir ruta antigua.

### 24/10/2026 — Catálogo específico NC y contexto sin permiso
Se separa catálogo NC del de facturas012 para no heredar comprobantes/condiciones/IVA por defecto. Revisiones privadas sin filas habilitadas; vigencias/tipos y correspondencia NC explícitos. Contexto revalida caso/vínculo/hechos y emisor, pero no reserva serie ni concede permiso o CAE. Catálogo real exige consulta/provisión autorizada; DTO puro y pruebas sintéticas no acreditan esos datos ni PV/padrón/custodia. Factura v1 permanece limitada a su contrato y el cuerpo NC debe ser separado. Conservar catálogo en dump/restore integral privado.

### 24/10/2026 — Consulta NC por identidad mínima y fuente durable privada
El navegador envía sólo venta/operación/caso/hash, manteniendo límite de consulta2KiB. Backend obtiene canónico del caso mediante puente034 y revalida contra factura/contexto; no reenviar canónicos grandes/PII ni ampliar límites de otras acciones. Sólo contexto mínimo llega al panel, sin storage ni permiso implícito. Auth se verifica una vez y se captura por valor. Cambiar/cancelar selección retira resultados; contexto histórico consultado no reemplaza guard de preparación/envío ni CAE NC confirmado para dinero/stock.

### 24/10/2026 — Preparación NC inmutable, aún sin número ni permiso
Se separan datos NC de factura v1 y se guarda una preparación por caso con contexto declarado/hash y asociación original exacta. Servidor construye datos desde fuentes verificadas, no acepta cuerpo arbitrario. Períodos para servicios/mixtos requieren declaración explícita; no heredar los de factura. Replay conserva contenido y recupera antes de requerir parámetros actuales; cancelación conserva historial y no reactiva caso. Contexto guardado es histórico y no permiso vigente. Corrección requiere cerrar caso/nueva identidad. Numeración, revisión, intención y aplicación comercial siguen separadas, con revalidación final y CAE NC previo a efectivo/stock. Incluir preparación/contexto histórico en dump/restore privado.

### 24/10/2026 — Cuerpo numerado NC separado del contrato de facturas
Contexto: factura v1 valida sólo tipos1/6/11 y no contiene comprobantes asociados; ampliar su aceptación silenciosamente arriesga que revisión/worker/conciliación de facturas trate una NC sin comprobar su caso y preparación.
Decisión: contrato FiscalCreditRequest propio (clase NOTA_CREDITO), ligado a caso/propuesta, preparación035 y reserva_id. Conserva importes/receptor/períodos y asociación original; añade sólo número propio procedente de futura reserva privada. Factura v1 permanece cerrada. Alternativa descartada: reutilizar cuerpo de factura quitando campos o aceptar cualquier tipo fiscal en el validador existente.
Consecuencias: hacen falta persistencia/serie/revisión/worker/conciliación NC explícitos; el contrato puro no prueba reserva SQL ni autoriza enviar. Ninguna instalación/activación/emisión se deriva de tests sintéticos. No se decide aquí un esquema remoto ni se habilita un permiso.

### 24/10/2026 — Reserva y serie NC privadas, conservadoras hasta resolución
Se prepara SQL036 con fiscal_nc_series_homologacion y fiscal_nc_reservas_homologacion separadas del diario de facturas v1. Reserva inmutable por caso/UUID, serie CUIT/PV/tipo3/8/13 y número único. El backend futuro debe aportar una consulta WSFE auténtica reciente; validar un timestamp/último en SQL no autentica por sí solo esa consulta. Replay recupera identidad original antes de exigir catálogo/consulta actuales. Nuevo guardado revalida contexto/caso/hechos y vigencia después de bloquear la serie.
Decisión de seguridad incremental: una reserva existente mantiene cerrada toda su serie; no se incrementa basándose sólo en memoria ni se borra un cuerpo numerado para liberar un hueco. SQL036 no incluye resolución/worker, por lo que no puede producir una secuencia comercial completa por sí solo. La futura resolución privada debe acreditar el resultado fiscal/conciliación antes de permitir siguiente número. Cancelación simple del borrador bloqueada desde que existe reserva; necesita flujo fiscal dedicado antes de habilitar numeración remota. Cancelación previa impide reservar tardíamente; guardia transaccional por caso comparte orden con la cancelación existente. No habilitar endpoint/flags/operación remota hasta completar estos gates.
Alternativa descartada: permitir varios números en una serie mientras el anterior sigue incierto o ampliar silenciosamente las series de factura v1. Tablas nuevas deben entrar en dump/restore fiscal autorizado; backup JSON app no cubre esta evidencia.

### 24/10/2026 — Identidad privada NC distinta de operación de factura para TA
Contexto: el cargador TA compartido existente usa operacion_id de FiscalWorkerBinding para RPC de lease/envío/confirmación ligadas al diario de facturas. Un caso NC tiene identidad propia, aunque referencia una factura autorizada.
Decisión: metadata FiscalCreditNumberBinding/SQL038 con finalidad NUMERACION_NC y venta/operación_origen/caso/Auth/preparación explícitos; no se asigna un operacion_id ficticio ni se convierte al binding de factura mediante cast. La fuente revalida Dueño/caso/preparación/contexto/emisor actuales y sólo prepara metadata. El estado AUTORIZADA de la factura no concede permiso de consulta/emisión NC.
Consecuencia: antes de worker nuevo hace falta autorización/lease TA específico NC y coordinación compatible con reutilizar el TA vigente/cifrado del mismo certificado, sin renovaciones paralelas. Ni metadata ni callback sustituyen esos gates. No provisionar/usar secretos o consultar ARCA real por disponer de SQL038. Alternativas descartadas: pasar UUID NC a RPC de factura, o prestar la autorización de factura original para el circuito NC.

### 24/10/2026 — TA NC comparte certificado, no propiedad del intento de factura
Se agrega vínculo privado de intento TA a caso/Auth/binding NC. La exclusión y sobre cifrado siguen en tablas globales por certificado; no se abre un pool paralelo que renueve dos TA. Los intentos NC tienen origen de factura NULL y vínculo separado, sin inferir ni reescribir propiedad histórica. RPC039 valida autoridad038 antes de preparar/iniciar y conserva permiso único/incertidumbre. Un TA vigente compartido no transfiere propiedad del intento.
Para confirmar un TA ya recibido o cancelar una preparación que nunca inició envío se valida el binding histórico del mismo Auth/caso, aunque se haya cancelado la NC o revocado emisor: guardar el sobre no autoriza una consulta nueva. Esto evita perder una respuesta válida e iniciar luego renovaciones paralelas. Cambio/pérdida de Auth original no habilita a otro actor; requiere recuperación privada controlada. Envío incierto nunca se libera automáticamente. Futuro loader debe usar callback antes del transporte, cifrado con contexto y gate específico; SQL039 por sí solo no solicita WSAA ni usa claves.

### 24/10/2026 — recuperación cifrada de TA NC y pérdida de respuestas
El cargador NC exige guard antes de claves y callback previo al transporte autorizado por039. Desde que se intenta INICIAR, una pérdida de respuesta conserva incertidumbre y prohíbe liberar/reintentar automáticamente. Un TA recibido incluso tras aborto del consumidor se cifra y confirma para recuperación posterior sin nueva autenticación. Fallos antes de intentar INICIAR sólo cancelan preparación propia. No se reutiliza binding de factura ni se publica Token/Sign en JSON/logs. La autoridad vigente y propiedad siguen verificándose en SQL, no por la validación de forma TypeScript. Custodia/CMS reales y worker NC siguen pendientes/gated.

### 24/10/2026 — custodia NC explícita sin conversión de permiso de factura
Custodia y fuente WSAA NC reciben FiscalCreditNumberBinding cerrado; usan credencial/huella/revision_emisor autorizadas por038/039. El descifrado PKCS8 privado común recibe parámetros explícitos, no un binding ficticio de factura. La firma se prepara antes del callback de permiso durable y el transporte sólo ocurre después de su ACK. Reutilizar primitivas de firma/transporte no concede autoridad ni habilita operación pública. Provisionamiento/uso real permanecen pendientes de autorización.

### 24/10/2026 — recuperación NC antes de numerar y Auth único
El proceso de numeración conserva Auth verificado originalmente y revalida autoridad por SQL038/039/036; no vuelve a inferir identidad desde perfil ni acepta binding del navegador. El cuerpo037 existente prevalece sobre gates de trabajo nuevo y sobre otro intento de reserva; gate backend/proyecto/actor permanecen obligatorios. Tras consulta/escritura incierta sólo se recupera por GET, sin repetir consulta/POST automáticamente. Otro trabajador puede ganar antes de fuente038: su cuerpo durable se recupera sin apropiación de reserva. Un cuerpo reservado es evidencia histórica y no factura/NC autorizada ni permiso de reintegro/reposición.

### 24/10/2026 — revisión NC histórica no es permiso de envío
SQL040 guarda una aprobación humana específica ligada al cuerpo numerado/reserva/caso/Auth/preparación/contexto; no reutiliza aprobación ni binding de factura. Vigencia original de diez minutos, sin extender por replay o cambiar identidad después. Leer un ACK histórico tras revocar emisor preserva evidencia; no autoriza una nueva consulta/emisión. Futuro permiso deberá revalidar vencimiento, autoridad/contexto y cuerpo exactos bajo exclusión antes de enviar. La revisión por sí sola no modifica caja/stock ni acredita CAE. Esta tabla privada requiere cobertura de respaldo/restore autorizados; no basta JSON de aplicación.

### 24/10/2026 — transporte de aprobación NC y ACK durable
HTTP de aprobación NC recibe sólo UUID/caso/hash esperados, no cuerpos fiscales alternativos. Servicio conserva Auth verificado originalmente y valida el cuerpo durable antes de escribir. ACK de escritura no confirma éxito: siempre leer el mismo UUID y validar cuerpo/preparación/hash. Gate de escritura cerrado conserva acceso histórico autorizado para recuperación; una aprobación histórica no acredita vigencia ni permiso de envío. Cliente futuro debe guardar UUID/hash antes de POST y recuperar antes de repetir, sin almacenar canónico/PII ni presentar aprobación como CAE.

### 24/10/2026 — revisión NC pendiente aislada y recuperación antes de repetir
El cliente guarda únicamente identidad y hashes de la aprobación, bajo Auth/comercio/venta y exclusión compartida. Confirma por lectura del mismo UUID/cuerpo/preparación; un ACK ajeno/ausencia/fallo mantiene pendiente. Una nueva llamada con pendiente recupera sin POST ni identidad nueva. Cambios de caso/preparación/cancelación quedan bloqueados hasta resolver esa evidencia, evitando abandonar la revisión incierta. El wire se reconstruye contra preparación explícita conocida; validación de forma/canónico no concede permiso vigente ni sustituye SQL/Auth. Pantalla posterior debe distinguir aprobación histórica/expirada de NC autorizada.

### 24/10/2026 — pantalla NC distingue aprobación de emisión
Revisión visible sólo tras preparación verificada y consulta explícita del cuerpo reservado. Confirmar guarda aprobación, no emite ni entrega dinero/stock. El vencimiento se presenta como dato histórico que el servidor debe revalidar al conceder un futuro permiso; no se infiere vigencia/CAE por mostrar una constancia. Un error conserva bloqueo y recuperación por GET. Falta un reintento manual del mismo UUID cuando no hubo escritura: no crear otra identidad ni reintentar automáticamente por ausencia/error de lectura. Debe resolverse antes de aceptación/activación hospedada.

### 24/10/2026 — reintento manual NC idempotente sin extender aprobación
GET fallido nunca acredita rollback; se conserva pendiente. El Dueño puede revisar nuevamente el cuerpo y decidir un reintento explícito del mismo UUID/hash, después de intentar recuperar y validar fuente/preparación actuales. No se crea otra identidad ni hay retry automático al consultar. SQL040 devuelve la aprobación histórica original cuando existe: repetir no renueva sus diez minutos ni concede permiso actual. Ausencia/cambio de Auth/cuerpo no autoriza sustituir el pendiente. No hay envío ARCA ni efectos comerciales en esta acción.

### 24/10/2026 — numeración NC privada recupera antes de claves
CUERPO_NC consulta037 sin TA; sólo null confirmado es ausencia. NUMERAR_NC recibe identidad/preparaciónSHA/reservaUUID, no montos/catálogos/CUIT/PV desde navegador. Worker conserva Auth original y fuente038, recupera cuerpo existente antes de claves/gate de numeración, y sólo entonces puede consultar numeración con custodia privada/gates. Respuesta es cuerpo reservado para revisión, no autorización/CAE. Cliente siguiente debe conservar UUID y preparaciónSHA antes de POST; ante carrera, cuerpo durable del mismo caso/preparación prevalece aunque otro trabajador haya reservado. No inventar otra identidad ni repetir trabajo nuevo automáticamente por un error/ausencia de respuesta.

### 24/10/2026 — numeración NC pendiente: ausencia confirmada, identidad original y ganador durable
Cliente conserva UUID de reserva/preparaciónSHA antes de POST y no repite automáticamente ante ACK incierto. Sólo GET null confirmado permite reintento explícito del mismo UUID; error mantiene pendiente. Confirmación se hace contra fuente/propuesta/preparación canónicas y cuerpo durable, no ACK de escritura. Si otro trabajador ganó primero, el cuerpo del mismo caso/preparación prevalece: el UUID solicitado localmente no permite sobrescribir ni rechazar una reserva durable válida. Pendiente se retira sólo tras verificar ese cuerpo y la identidad local aún igual. Aprobaciones/cambios de caso/preparación/cancelaciones quedan bloqueados mientras numeración incierta; recuperar no concede emisión/CAE.

### 24/10/2026 — reserva NC visible separada de revisión y emisión
La pantalla consulta primero; no interpreta error como ausencia ni numera al abrir. Sólo null confirmado y confirmación humana habilitan reservar/reintentar con identidad durable existente del cliente. El usuario ve que fijar número/cuerpo impide editar/cancelar como borrador; no es CAE ni habilita dinero/stock. Revisión del Dueño aparece después de cuerpo verificado y requiere otra acción explícita. El resumen previo se reconstruye desde preparación canónica validada, no campos derivados sin validar. Permiso vigente/intención/envío siguen pendientes y sujetos a sus gates.

### 24/10/2026 — permiso NC privado separado de aprobación e intención
Aprobación humana no provisiona permiso privado. SQL041 crea tablas vacías/default deshabilitado y verificador cerrado al navegador; permisos/revocaciones conservan historia inmutable. Permiso exacto liga cuerpo/reserva/revisión/Auth/emisor y vence como máximo con la aprobación. Revocación se agrega, no borra ni cancela un envío incierto. Verificación retorna emisión=false y NO consume ni permite transporte; intención futura debe consumir/excluir de forma atómica bajo los mismos locks. Recuperación posterior no puede depender de un permiso aún vigente ni cambiar Auth original. Provisión real de permiso requiere autorización específica y no se ejecutó. Futuro TA de emisión/consulta NC debe tener finalidad/binding propios; no prestar permiso de factura ni alias del flujo de numeración.

### 24/10/2026 — intención NC consume autoridad en la misma transacción
SQL042 liga intención inmutable/caso único/UUID global/permiso único al cuerpo y revisión originales, verificando041 antes y después del INSERT bajo lock de serie. La segunda verificación evita usar autoridad vencida mientras se espera por unicidad global. Recuperación histórica del mismo intento precede a verificar vigencia actual: un permiso vencido/revocado no borra incertidumbre ni habilita repetir envío. Otro UUID se rechaza; resultados y conciliación futuros deben agregarse sin modificar esta historia. Ningún transporte usa todavía esta autoridad. Custodia, binding/TA específico NC, instalación remota y emisión siguen gates separados.

### 24/10/2026 — envío NC tiene fuente propia previa a intención
SQL043 entrega binding ENVIO_NC sólo con permiso041 exacto y sin intención042 bajo lock de serie. Numeración y emisión tienen distintas finalidades y contratos; no convertir binding de factura ni reutilizar038. Fuente no consume autoridad ni habilita transporte. Tras intención, recuperar/conciliar requiere fuente de consulta independiente, no volver a obtener autorización de envío. Futuro worker debe revalidar antes de custodia/red y consumir042 antes del transporte, sin inferir permiso de una aprobación histórica.

### 25/10/2026 — custodia ENVIO_NC no hereda permisos de numeración
Adaptador separado valida finalidad y requiere guard obligatorio antes de leer secretos y después del trabajo criptográfico. Sólo reutiliza helper de descifrado, no binding/autoridad de factura o NUMERACION_NC. Validar forma no concede custodia; futuro worker debe comprobar fuente043 exacta y041/042 con AbortSignal acotado. Cambio de autoridad durante descifrado impide entregar firmante. Este adaptador no obtiene TA ni transmite a ARCA.

### 25/10/2026 — TA ENVIO_NC comparte certificado, no autoridad
SQL044 conserva exclusión global del diario TA y vínculo inmutable existente, pero separa coordinador/finalidad de039. Renovar/iniciar requiere043 vigente y revalidación tras espera; confirmar respuesta recibida usa cuerpo/permiso/Auth históricos sin reautorizar WSAA. Separar historial de vigencia evita perder TA recibido tras revocación. Una intención042 exige conciliación y no obtiene autorización de nueva renovación por esta fuente. No ampliar039 a finalidades arbitrarias ni instalar extensiones HTTP PostgreSQL. Loader/custodia/envío/consulta y aceptación hospedada siguen pendientes.

### 25/10/2026 — consulta NC independiente del permiso de envío
SQL045 exige intención/cuerpo/Auth originales y finalidad CONSULTA_NC; no reutiliza autorización ENVIO_NC ni exige permiso de envío aún vigente para conciliar. Deshabilitar emisión por revocar su permiso no destruye incertidumbre. La custodia global habilitada/credencial/certificado/revisión deben seguir coincidiendo con la historia: una rotación/deshabilitación no adopta material privado nuevo ni borra intento. Recuperación administrativa autorizada tras cambio de custodia queda pendiente; se prefiere bloquear antes de acceder otra clave sin política explícita. Consulta no habilita reenvío ni efectos comerciales.

### 25/10/2026 — custodia de consulta no acepta permiso de envío
CONSULTA_NC tiene binding/validador propios y cruza intención durable con cuerpo reconstruido. Custodia requiere guard045 actual antes y después de descifrar; sólo mecánica criptográfica común mediante helper genérico interno, sin convertir bindings a ENVIO_NC o numeración. Fechas o permisos históricos de envío no habilitan acceso por sí solos. No se obtiene TA ni se consulta ARCA con este cambio; futura coordinación/worker deben revalidar y respetar incertidumbre.

### 25/10/2026 — TA de consulta conserva intención, no permiso de envío
SQL046 sólo renueva/inicia desde045 actual, compartiendo exclusión global por certificado y conservando finalidad/intención en vínculo privado. Confirmar respuesta recibida usa reconstrucción histórica explícita del cuerpo/permiso/intención/Auth, sin renovar autoridad. Loader/WSAA CONSULTA_NC tienen factories y tipos propios; sólo cifrado/CMS/ACK común. Una renovación WSAA no registra intento comercial nuevo ni concede FECAESolicitar. Activos inciertos no se liberan por timeout ni por cancelar un consumidor.

### 25/10/2026 — consulta NC no inventa asociación ni origen
Parser NC separado de tipos factura, compara asociación además de contrato fiscal completo. Campos de CbteAsoc ausentes se conservan desconocidos, no se copian del esperado para fabricar coincidencia. Una respuesta incompleta requiere evidencia adicional/aceptación antes de autorizar efectos;602 no habilita reenvío. FchProceso se conserva con precisión8/14 recibida y validada. El comparador puro no autentica ARCA ni acredita recepción: futuro worker/transporte/diario deben ligar guard045, TA y cuerpo original antes de persistir clasificación.

### 25/10/2026 — transporte de consulta no amplía emisión
Wrapper de consulta privado admite sólo FECompConsultar; export de envío conserva su allowlist anterior. Comparten stream/deadline/cancelación internos, no autoridad. Consulta NC exige fuente045 y TA exactos, guard privado antes/después de red y resultado ligado a intento/cuerpo; no se persistirá CAE desde XML sin pasar comparador/diario. Cancelación o timeout no se transforma en reenvío. El trabajador futuro debe ligar Auth/flags/TA046 y persistir resultados con exclusión antes de confirmar efectos.

### 25/10/2026 — observación NC durable separada de aplicación comercial
SQL047 agrega consultas y un registro de CAE por caso bajo lock de serie, con identidad/cuerpo originales y tablas inmutables. Reintento exacto recupera ACK; otro CAE no reemplaza historia. Una consulta CONCILIAR posterior no degrada autorización previa y recuperación por caso evita depender de UUID local. Es evidencia privada aportada por worker, no autenticación ARCA desde SQL. No libera numeración ni aplica efectivo/stock: aplicación exactly-once y resolución de serie requieren módulos/guardas separados. Incluir nuevos diarios en restore privado autorizado; aplicación JSON no los cubre.

### 25/10/2026 — conciliación NC recupera antes de permiso de trabajo/TA
Trabajador privado conserva Auth original, recupera047 antes de guard045/TA046 y sólo acepta GET durable como confirmación. Nuevo flag privado de consulta default cerrado no impide recuperar hechos ya guardados; backend/proyecto deben permanecer autorizados. SDK habilita sólo seis RPC de consulta/diario, sin ampliar emisión NC. Contradicción de respuesta nueva con ganador concurrente produce no confirmado, nunca éxito aparente ni reemplazo. Gestión durable de conflicto/resolución y bloqueo de aplicación siguen pendientes antes de negocio; no hay endpoint/CAE/instalación implícitos.


### 25/10/2026 — NC: conflicto durable antes de aplicar caja/stock
Contexto:047 rechazaba un CAE contradictorio revirtiendo la segunda observación; el trabajador no devolvía éxito falso, pero faltaba evidencia durable que bloqueara una aplicación futura. No es suficiente conservar sólo el primer CAE ni borrar el conflicto mediante una consulta posterior coincidente.
Decisión:048 registra la observación y una incidencia privada/inmutable en la misma transacción, sin reemplazar la autorización original. DATOS_DISTINTOS también crea incidencia aun sin autorización previa. Recuperación por caso prioriza estado CONFLICTO_NC_NO_APLICAR, sin permiso de reintegro/reposición/emisión. No hay resolución automática: la futura resolución requerirá evidencia y contrato explícitos; hoy el conflicto persiste.
Consecuencias:gate privado exigir_nc_sin_conflictos_homologacion serializa con el registro mediante lock de serie y revalida Auth tras esperar. La futura aplicación debe usarlo dentro de su propia transacción y mantener el lock; ausencia de incidencia no acredita CAE ni permiso comercial. GET histórico conserva observaciones originales; getter de autorización por caso ahora puede devolver conflicto y no debe interpretarse como permiso. No libera series ni cambia caja/stock. Dump/restore privado autorizado debe incluir fiscal_nc_conflictos_homologacion y observaciones/autorizaciones047; JSON de aplicación sigue insuficiente. SQL048 no instalado remotamente; PR03/PR02 y aceptación hospedada pendientes.


### 25/10/2026 — Envío NC sólo con ACK original042 y serialización PES corregida
El transporte privado NC exige consumo042 ligado al cuerpo exacto con nuevo_envio=true antes de un único fetch; nunca reconstruye ese permiso desde GET ni reintenta tras ACK incierto. El callback es dependencia privada cuya procedencia debe garantizar el futuro worker, no autoridad derivada del navegador. Respuesta FECAESolicitar es candidata sin CAE devuelto ni efectos: confirmación mediante FECompConsultar/diario y resolución comercial siguen separadas.
Factura y NC comparten sólo serialización pura/decodificación SOAP; cada entrada conserva su propio validador/identidad. Se omite CanMisMonExt en PES por manual ARCA v4.0 p68/error10241, corrigiendo el N previo prohibido. No se amplían monedas admitidas ni se cambian hashes históricos. No hay habilitación de envío remoto ni autorización de emisión real.


### 25/10/2026 — Envío NC privado: recuperación previa y Auth encadenado restringido
El trabajador nuevo reutiliza consulta existente tras intención; no reconstruye permiso desde historia. Intención existente siempre impide otra emisión; flag de envío sólo abre trabajo nuevo. Consulta verifica Auth como fase separada, exigida idéntica al actor original capturado antes de await; no se suministra un Auth fabricado para evitar la segunda verificación. Abort padre acota ambas fases. Si consulta/GET falla, sólo intención histórica pendiente, nunca éxito comercial. SDK se amplía sólo a fuente043/TA044/POST042 requeridos; ningún endpoint de emisión NC se habilita. El candidato FECAESolicitar todavía no tiene diario durable: siguiente blocker explícito, junto a resolución/aplicación, antes del gate de instalación.


### 25/10/2026 — Respuesta de envío NC durable separada de autorización
049 conserva un candidato inmutable por intención real de envío, con estado/códigos y fecha, sin XML/CAE/credenciales. No genera confirmación fiscal: sólo consulta completa047 puede acreditar autorización; rechazo/SIN_CONFIRMACION no libera serie ni habilita reenvío. No se reconstruyen respuestas ausentes después de crash/red. Worker guarda una vez, recupera por GET y valida historia antes de conciliación; corrupción bloquea recuperación. Candidato ausente no prueba ausencia de emisión: intención durable siempre impide otro envío. Se conserva autorización/consulta previa sin degradarla por un candidato R. Copia privada futura debe incluir049, sin declarar cobertura de JSON de aplicación ni habilitar restore integral.


### 25/10/2026 — Resolución de numeración NC sólo con autorización confirmada
Se reemplaza el cierre permanente de serie de036 por resolución privada050 de casos autorizados047 y sin conflicto de toda la serie. No basta candidato049, rechazo, timeout ni602. Nueva reserva requiere que todas las anteriores estén resueltas y consulta vigente no anterior al máximo confirmado, conservando unicidad e historia; no se borra/reutiliza un número. Un conflicto histórico bloquea nuevas reservas, permisos041 y gate048 aunque exista resolución previa. El marcador es histórico, no permiso actual ni aplicación comercial. Corrección/reuso tras rechazo requiere contrato auditado aparte; no se debilita UNIQUE para resolverlo. Caja/stock siguen sin cambios, y futura aplicación deberá revalidar dentro de su transacción todos los gates actuales además del marcador/CAE.


### 25/10/2026 — Preparación comercial NC sin permiso fuera de transacción
051 valida autoridad actual y deriva importe/receta/unidades desde hechos030/031/032 ligados al cuerpo aprobado; sólo usa catálogo actual para comprobar compatibilidad física, no para revalorizar devolución ni reconstruir receta. Conserva gates de comercio/capacidad/caja y Auth original explícito, sin fabricar una sesión de usuario. PLAN_NC_SIN_APLICAR no es permiso durable: futura mutación debe ejecutar de nuevo051 dentro de su misma transacción. Mantener exclusión de devoluciones comunes de ventas fiscalizadas; futura excepción debe depender de diario fiscal privado/verificable en la misma transacción, con relectura histórica de casos parciales y reposición de costos/lotes originales. No se considera completado el efecto exactamente una vez con esta preparación.


### 26/10/2026 — Aplicación NC durable separada de elegibilidad nueva
SQL052 conserva un ACK inmutable por caso/cuerpo/Auth/caja; recuperación verifica el Dueño original activo sin exigir comercio/capacidad/caja abiertos. Una aplicación nueva siempre recalcula051 y registra caja/stock/costos/lotes/cabecera/journal en una transacción. Sólo el diario privado enlazado permite la cabecera fiscal; no flags/GUC/Auth suplantado ni bypass genérico de service_role. Costo histórico ausente bloquea. Evidencia y pendientes en ExecPlan ARCA; sin autoridad remota nueva.


### 26/10/2026 — Servicio comercial NC sin transporte fiscal
Separar aplicación SQL052 de emisión/consulta ARCA. Recuperar ACK durable antes de flag nuevo ARCA_HOMO_CREDIT_APPLY_ENABLED, manteniendo Auth original y backend/proyecto; trabajo nuevo debe verificar CAE/cuerpo/intención/resolución y confirmar efectos sólo mediante GET. ACK perdido no autoriza nuevo efectivo. SDK69 permite sólo4RPC050/052 adicionales; no exponer acción HTTP todavía. Evidencia en ExecPlan ARCA.


### 26/10/2026 — Lectura de aplicación NC independiente de caja actual
APLICACION_NC identifica caso/hash y devuelve caja histórica del diario; no exige seleccionar caja ni activa mutación por ausencia. APLICAR_NC exige caja explícita e invariantes privados. Pendiente del cliente conserva caja/caso/hash, sólo GET confirma y retry requiere decisión explícita; otras mutaciones NC se bloquean hasta resolver pendiente. Sin autoridad remota nueva ni acción de envío fiscal.


### 26/10/2026 — Estado NC visible y recuperación sin repetir efectos
Un borrador histórico no acredita ausencia de emisión: la UI muestra estado sin consultar hasta evidencia durable de aplicación. Nueva solicitud requiere caja del comercio y confirmación explícita; recuperación conserva caja original y no requiere caja actual/historial cargado. Pendiente ilegible bloquea escrituras. Después de confirmar sólo refrescar lecturas de productos/caja/historial; fallo de refresco no revierte confirmación ni habilita reintegro nuevo. UI bajo VITE_KIOSKO_ARCA_APLICACION_NC_HOMO y gates subordinados, default cerrado; autoridad fiscal sigue en servicio/SQL.

### 26/10/2026 — Permiso NC descubierto por servidor y autoridades separadas
Contexto: cerrar el envío HTTP requiere identificar un permiso041 existente para la revisión/cuerpo exactos. El navegador no conoce ni debe seleccionar permisos privados. Se descarta aceptar un permiso arbitrario del cliente, exponer la tabla o crear permisos por efecto de un flag.
Decisión: SQL053 selecciona una única fila vigente de ese cuerpo/revisión/actor y ejecuta el verificador existente; ausencia devuelve null y ambigüedad bloquea. No crea ni activa permisos. HTTP ENVIAR_NC recibe únicamente identidades de caso/revisión/intento/consulta;042persistido impide cualquier reemisión. Estado histórico, consulta nueva y aplicación comercial mantienen autoridades independientes y flags separados. Cliente durable conserva IDs/hash; POST nunca se interpreta como éxito. Renovar revisión sólo puede conservar el mismo cuerpo e identidades originales de intento/consulta.
Consecuencias: el inventario candidato pasa de052a053; se requiere provisionamiento privado autorizado independiente. Rechazo/incertidumbre/conflicto no liberan números ni autorizan reintegro/reenvío. Se muestran como incidencias pendientes; una corrección fiscal requiere su contrato/auditoría, no borrar diarios. Ninguna instalación/activación remota ni secreto real se deriva de este cambio.

### 26/10/2026 — Evidencia de parámetros WSFE separada de su provisión
Contexto: la aceptación positiva requiere catálogos vigentes; tipos de comprobante o valores heredados de IVA/PV no los sustituyen. Se descarta cargar defaults o inventar filas habilitadas sólo para obtener una respuesta positiva.
Decisión: obtener, bajo GO específico, TiposIva y CondicionIvaReceptor con un TA privado común; exportar únicamente campos públicos validados, clases/fechas originales, origen, instante y hash de respuesta. No exportar SOAP ni credenciales ni sobrescribir archivos. La consulta conjunta sin retries sólo confirma éxito cuando ambos pasos terminan; una evidencia parcial no constituye catálogo completo.
Consecuencias: exportar no autoriza normalizar clases, elegir condición fiscal, importar catálogo/emisor, activar flags o emitir. Esas operaciones conservan revisión/gates independientes. Token/Sign permanecen en memoria; no se escriben en los JSON. Sin cambios a SQL/Edge por preparar esta herramienta local.

### 27/10/2026 — Catálogo normalizado inactivo separado de activación fiscal
Contexto: los parámetros reales traen clases ALEY/49 además de A/B/C y fechas de vigencia. Cargar defaults o activar filas al generar SQL daría una falsa aceptación positiva.
Decisión: herramienta offline con hashes de archivos revisados, mapeo explícito sólo A/B/C, exclusiones auditables, revisión/vencimiento explícitos e INSERT único inactivo bajo baseline vacío. La propuesta caduca como máximo a las 24h de la consulta y dentro del día argentino de evaluación; es política operativa del ensayo, no una regla ARCA. GO/destino/hash se deben aprobar de forma independiente antes de instalar.
Consecuencias: generar no provisiona ni activa emisor, punto, credenciales o catálogo remoto. Baseline distinto/replay/vencimiento bloquean y requieren revisión nueva. El hash vincula la propuesta, pero los ajustes de sesión no prueban por sí mismos el host real. Primer CAE y aceptación hospedada positiva siguen pendientes.

### 27/10/2026 — Diagnóstico de serie no acredita habilitación fiscal
Separar FECompUltimoAutorizado del modo genérico de parámetros: alcance PV/tipo explícito, identidad de respuesta exacta, sin defaults/redondeo, sin retries y sin exportar credenciales. Reutilizar parser/transporte privado acotado. Un último observado válido, incluido0, no habilita emisor, reserva, permiso o CAE;602 tampoco equivale a número0 ni demuestra por sí solo un trámite productivo faltante. Mantener la acreditación de homologación pendiente de evidencia específica de WSFE, sin extrapolar WSCT. Nuevas consultas/custodia necesitan sus autorizaciones propias.

### 27/10/2026 — Contraseña mínima consistente entre generación y custodia
El generador Windows aceptaba12 caracteres y el lector privado exigía16; se alinea la generación futura a16 sin relajar custodia ni alterar claves existentes. Se prueba el formato cifrado real .NET contra PKIJS/WebCrypto con certificado/frase sintéticos, incluyendo Unicode, huella/revisión, RSA3072 no exportable y CMS. Material histórico potencialmente incompatible exige revisión privada y autorización de reprotección, no una rotación automática ni exposición de la contraseña. No confundir interoperabilidad local con aceptación real de secretos hospedados.

### 27/10/2026 — Renovación de parámetros ligada al baseline completo
La carga inicial inactiva ya existe y no puede repetirse sobre tabla vacía. La renovación se prepara offline contra snapshot completo/hash revisados, revisión máxima+1 y evidencia más reciente/no registrada. Dentro del mismo lock se comparan conteo y cada fila tipada contra el snapshot antes de INSERT inactivo; no UPDATE/DELETE/upsert ni autoactivación. Cambios concurrentes, incluso habilitado, bloquean en vez de sobrescribir una decisión ajena. Mantener lectura independiente del destino y GO por propuesta; los hashes no acreditan por sí solos el origen remoto. No instalar ni renovar por este cambio local.

### 27/10/2026 — Guardado fiscal separado del gate base
Con emisor/catálogo disponibles, backend base también permitía GUARDAR_DATOS_FISCALES. Se agrega ARCA_HOMO_DATA_PREPARATION_ENABLED apagado por defecto, en HTTP y servicio, con revalidación de proyecto/base/datos antes de RPC tras awaits. Contexto y resolución histórica no requieren escritura; no se vuelve a autenticar ni inferir otro actor. Así se puede preparar aceptación de lectura sin otorgar implícitamente creación de preparaciones. No convertir la API base entera en autoridad de sólo lectura por esta medida: las demás mutaciones conservan sus gates/guards. El runtime remoto anterior no incorpora el cambio hasta nuevo despliegue autorizado. Paquetes nuevos deben ligar fuentes a commit explícito y usar directorio nuevo; preservar el artefacto ya instalado y sus verificaciones históricas.

### 27/10/2026 — Retirar ejecución externa de preparación fiscal heredada
SQL001 conserva una entrada autenticada que crea contexto sin pasar por la API
privada. Ocultarla en UI o añadir sólo un flag HTTP deja ese camino disponible.
Se elige una migración incremental054 de permisos, sin reemplazar el cuerpo ni
alterar001 ya instalado: identidad/hash revisados, ruta012 privada requerida,
revocación de ejecutores externos y postcondición completa en una transacción.
No se elimina historial ni se bloquea la autoridad administrativa de PostgreSQL.
Mantener fixtures anteriores en su fase histórica y probar el cierre después
de054. Un rollback posterior no debe reabrir automáticamente la vulnerabilidad.
Requiere GO propio antes de instalación y verificación hospedada; el candidato
Edge y este cierre SQL deben estar aceptados antes del ensayo fiscal positivo.

### 27/10/2026 — Preflight privado con el lector real, separado de provisión
La firma .NET de diagnóstico no prueba por sí sola compatibilidad con custodia
del backend. Se añade asistente local que usa el lector/firmador desplegados,
con pin/CUIT de certificado explícitos y clave no exportable. Originales sólo
tras GO local, stdin privado/memoria y resultado acotado; sin red ni persistencia,
sin provisionar Supabase ni corregir frase/rotar archivos. READY de metadatos y
PASS sintético no habilitan claves reales. Mínimo16 se conserva. Una eventual
provisión hospedada y uso de WSAA/TA exigen gates propios coordinados con catálogo.

### 27/10/2026 — Provisión inicial cerrada separada de compatibilidad original
El titular cerró el gate original b11e660; no repetir prueba criptográfica ni
rotar/reproteger para probar transporte. La provisión requiere GO propio sobre
plan público limitado a seis nombres, destino Staging fijo, revisión/IDs/hash y
vigencia24h. Baseline ausente y13flags cerrados antes de leer originales.
Transporte local en memoria mediante pipe capturado, nunca salida de consola o
clipboard; lector sólo -Preparar y copia, sin CMS/RSA/ARCA. TA key nueva32bytes
sólo durante provisión autorizada. Comparar digests en memoria/preservar previos;
parcial o drift detienen sin overwrite/retry/borrado. Metadatos de provisión no
cierran funcionalidad hospedada, cache compartido ni aceptación fiscal positiva.
95pruebas sintéticas y build PASS; no carga remota ni lectura original nueva.


### 27/10/2026 — Import del controlador no acredita ejecución privada disponible
Tras GO de seis secretos, la entrega CUA falló READ_PIPE y una sonda pública
sin archivos privados confirmó pwsh EPERM. No atribuirlo a la clave ni repetir
compatibilidad original, tampoco solicitar de nuevo el mismo GO. Mantener
provisión no confirmada y no improvisar transportes con clipboard/argv/archivo/
endpoint. Categorías cerradas de spawn y pruebas de rechazo síncrono/asíncrono
permiten diagnosticar sin exponer errores externos; no habilitan evasión del
entorno. Resolver un canal privado permitido antes de otro intento.


### 27/10/2026 — Provisión por operador local y Management API oficial
No eludir EPERM del controlador ni transportar privados por consola/clipboard/
archivos/endpoints locales. Preparar asistente que el titular ejecuta en consola
propia con PAT scoped ingresado mediante Read-Host -AsSecureString. GO de6valores
ya recibido; token adicional nunca se obtiene ni crea automáticamente. Sólo API
oficial Staging fija y GET/POST secretos, sin redirects/retries. GETbaseline antes
de originales y recheck antes de POST,6valores exactos, verificación/dispose.
No CAS remoto documentado: exigir ventana exclusiva y reconocer riesgo concurrente
residual. ACK perdido/partial obliga conciliación antes de cualquier repetición.
Preparar real sin red/secretos PASS;120tests/build PASS no sustituyen provisión ni
custodia funcional hospedada. No se usó PAT/original real en este desarrollo.


### 27/10/2026 — Diagnosticar inventario sin repetir copia
El operador falló BASELINE con write_attempted=false; no inferir Auth válido,
token incorrecto o formato real de API a partir de esa salida genérica. Agregar
acción exclusivamente GET de metadata, DTO sin paths/copia y categorías cerradas
sin respuesta/mensaje externo. Mantener esquema/flags estrictos; detectar campo
digest distinto no autoriza aceptarlo automáticamente. Usar PAT existente sólo
en consola local y no repetir provisión ni solicitar nuevos permisos por tanteo.


### 27/10/2026 — Distinguir capacidades PAT Edge Functions y Secrets
La UI acredita que Edge Functions autoriza /functions, no /secrets; el token
visible27/10 tiene sólo la primera. No interpretar HTTP403 como fallo de clave
ARCA ni corregir lector/custodia. Preparar revisión sóloStaging/24h/Edge Function
Secrets Read-write y dejar Create token/valor al titular. Sin editar/revocar
tokens existentes ni ampliar Legacy/Production. La capacidad proveedor incluye
DELETE, pero código conserva GET/POST y seis nombres exactos. Primero diagnóstico
readonly; no inferir éxito de provisión de la configuración de acceso preparada.


### 27/10/2026 — Cerrar sólo provisión por metadatos, no custodia funcional
Operador real y UI independiente acreditan6secretos, previos intactos, revision/
selector públicos y flags cerrados; JWT ON/Edge503 posteriores. Consumir el GO
de6valores, no repetir carga/prueba original o rotar. Denominar el resultado
CLOSED_CUSTODY_PROVISION_METADATA PASS: el backend cerrado no importó/probó la
clave ni acreditó TA/cache. Emisor/catálogo/activación/ARCA conservan sus gates.
Guardar sólo resultados públicos y fuente/hora exactas; no hashes de contraseña
ni reconstruir mediciones tras reinicio de herramientas. Siguiente propuesta
de emisor inactivo no instala datos sin revisión/GO propios.

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

## Baseline cerrado y cleanup tras revocación (28/10/2026)

El paquete privado admite dos políticas explícitas: hashes de historial/comercio
revisados, o captura única READ ONLY en el primer baseline cerrado que cumple
el binding revisado completo. En ambos casos se pinnean antes de abrir y se
comparan durante el cierre; no se recalculan ante drift. Se descarta asumir un
snapshot comercial antiguo como verdad o adaptar datos a mitad de la ventana.
El journal registra únicamente hashes y fecha segura, nunca filas comerciales.

Una prueba demostró que revocar al Owner inmediatamente después del COMMIT de
apertura impedía recuperar el recibo y cerrar emisor/catálogo. La lectura del
recibo para cleanup mantiene exclusión original, binding/contadores/estado y
timestamp exactos, pero no exige que la autorización comercial siga activa.
Las acciones positivas sí revalidan Owner/comercio/ventana. Así la revocación
detiene trabajo nuevo sin impedir cerrar cambios propios. La sesión perdida
no habilita esta excepción: no hay reacquisición, autoridad por journal ni
retry automático. SQL aprobado y permisos remotos no fueron modificados.

## Revisión de catálogo explícita en el operador de aceptación (29/10/2026)

La revisión2 vencida era un pin literal del planificador, SQL administrativo y
observador. Renovar a3 requiere sustituir ese literal por un dato revisado, sin
introducir selección de la última fila ni default heredado. Se exige
catalogRevision entero explícito en la configuración, igual al snapshot revisado,
y queda incorporado al manifiesto/hash, cuerpo preparado, SELECT/UPDATE y
validación posterior de la operación. Configuraciones anteriores sin ese campo
se rechazan; los paquetes ya consumidos/vencidos no se migran ni reinterpretan.

El observador usa un sexto parámetro SQL tipado para la revisión pinneada. Exige
la secuencia histórica completa1..revision-1, cantidad exacta de filas y hash
estable de TODAS las revisiones distintas de la elegida. No admite huecos,
revisiones futuras inesperadas ni recalcula baseline por drift. El cierre sólo
deshabilita la fila aprobada y conserva el recibo; no reescribe historia.
El emisor continúa explícitamente en revisión1, sin ampliar esa autoridad.

La vigencia del catálogo y el TA descartado son restricciones independientes:
no basta esperar un TA y consultar de noche si el siguiente TA vence después
del catálogo del día. Preparar la renovación en un horario con margen y decidir
con las expiraciones REALES (inicio posterior al TA y fin anterior al catálogo),
sin asumir que una nueva autenticación dura exactamente12h ni prorrogar datos.
No programar ni ejecutar automáticamente. Cambios locales no habilitan SQL,
flags, LoginCms, emisión ni nuevo acceso remoto; permanecen sus GO separados.

## Auth original en operaciones de restauración — 29/10/2026

Contexto: la UI exige el mismo Auth para recuperar una restauración, pero los
contratos SQL preparados sólo comparaban el perfil en operaciones_escritura.
Una reasignación administrativa de ese perfil permitía a otro Auth recuperar
el ACK anterior con el mismo UUID/cuerpo. Cuatro regresiones locales reprodujeron
el defecto en clientes, proveedores, producto y lote antes de corregirlo. Los
cuatro RPC todavía no están instalados en Staging; no se reasignó ningún perfil real.

Se conserva el registro idempotente existente, añadiendo actor_auth_id derivado
del servidor a solicitud para BACKUP_CONTACTO/PRODUCTO/LOTE. Cada RPC captura
auth.uid() al entrar, selecciona/bloquea el perfil por ese sujeto y compara el
cuerpo completo antes de devolver un resultado previo. No se recibe esa identidad
del navegador ni se vuelve a inferir desde el perfil después. El mismo Auth puede
reintentar; otro Auth o una solicitud histórica sin identidad acreditada se rechaza.

Alternativas descartadas: confiar sólo en el guard de la UI/perfil reasignable,
inferir el Auth de una operación antigua desde el vínculo actual, o introducir
una tabla/grants adicionales para un dato que cabe en el cuerpo durable existente.
No hay backfill, borrado de pendientes ni nuevo UUID automático para eludir el
rechazo. No se modifican saldos al reintentar ni el contrato de parámetros/ACK.
Campos/firmas/ACL de las tablas y el manifiesto bootstrap permanecen intactos.

Consecuencia: cambian los hashes de pilot-backup001/002 y cualquier propuesta
de instalación debe revisar estas fuentes nuevas. El backup privado verificado
del estado previo se conserva. El GO sólo de respaldo no autoriza instalar SQL,
restaurar datos o activar la UI integral; hacen falta los gates propios.



## 2026-10-30 — Lector HTTP del asistente JWT compatible con PS7 y PS5.1

Contexto: dos ensayos hospedados de capacidades no confirmados, logout local
confirmado; no reinterpretarlos como PASS. Reproduccion sintetica en pwsh7.6.5
muestra que HttpResponseMessage no ofrece GetResponseStream y reproduce la
misma salida. Ensayo HTTP loopback confirma el tipo real de Web Cmdlets.

Decision: Invoke-AccessProbe captura primero StatusCode y lee ErrorDetails
acotado o HttpResponseMessage.Content.ReadAsStreamAsync; usa GetResponseStream
solo cuando existe el metodo de la API legacy. Lectura de stream limitada a
4097 bytes para rechazar >4096; texto se mide en UTF8, no en caracteres.
Separar catch de transporte de validacion evita reclasificar exceso como red.
JSON de capacidades invalido recibe categoria segura propia; status se reinicia
por solicitud. Solo allowlist interna a consola, nunca cuerpo/excepcion privada.
No cambiar RPC/semantica de autorizacion, ni llamar restaurar_*.

Alternativas descartadas: interpretar toda respuesta HTTP no-2xx como error
sin cuerpo (impediria verificar42501), usar solo longitud en caracteres, exponer
excepcion cruda para diagnosticar, o repetir sesiones reales antes del cierre.
Compatibilidad5.1 conservada y comprobada, sin descargas/dependencias nuevas.
Limite: evidencia local no prueba respuesta remota previa ni RLS integral.
Repeticion futura: exactamente Dueno y Cajero, STOP sin retry ante discrepancia.


## 2026-10-30 — Journal de restore con STOP ante respuesta incierta

Contexto: el ensayo fijo exige idempotencia y no duplicar trabajo ante ACK perdido.
Decision: nucleo privado sin CLI/red, plan de21 acciones pinneado, INTENT fsync
previo a transporte y confirmacion durable solo con ACK validado/hashado; un
replay solo existe como paso explicito. UUID/cuerpo/actor no cambian. JSONL con
cadena para corrupcion y lock exclusivo; un crash puede dejar lock/intencion,
que no se quitan ni reintentan automaticamente. Conciliacion es lectura y
clasificacion; coincidencia no da permiso de continuar. Separa prueba automatica
de decision del operador y no usa ausencia como prueba de no ejecucion.
Alternativas descartadas: retry generico, UUID nuevo, borrar journal pendiente,
o aceptar el200 sin comprobar el ACK. No usar hash de cadena como autorizacion.
Consecuencias: se retiene incertidumbre hasta revision/recuperacion autorizada;
ACL Windows y transporte/Auth del operador son dependencias aun no implementadas.
No instalar backend nuevo ni habilitar restauracion de UI por esta preparacion.


## 2026-10-30 — Recuperacion administrativa sin exponer operaciones_escritura

Contexto: bootstrap revoca acceso directo a operaciones_escritura; no existe
lookup publico de restore. Una consulta403 no prueba que no exista operacion.
Decision: conservar grants/RLS/RPC y preparar query administrativa READ ONLY
separada, ligada al unico UUID/body/Auth original del journal. Solo devuelve
solicitud/ACK cuando coinciden contexto, tipo y cuerpo; conflicto oculta ambos.
Normalizador verifica modo lectura y bindings; no avanza journal ni reintenta.
Alternativas descartadas: GRANT SELECT al Dueno, service_role/public lookup,
nuevo RPC de conveniencia o interpretar permiso denegado como ausencia.
Consecuencias: el futuro envoltorio requiere lector PostgreSQL privado/TLS/ACL
ademas del transporte Auth del ensayo. No usar codigo/metadata local como GO.


### Dependencias reales y plan de ensayo v2 — 30/10/2026

Continuacion local desde 9072d63; PR07 PARCIAL, sin GO de restauracion.
Lectura administrativa hospedada READ ONLY/ROLLBACK (08:57:19Z), identidad
Staging acoyfwwmhaeruciyedri, PostgreSQL17.11: inventario acotado de16 tablas,
21 funciones,16 triggers,145 columnas y78 constraints coincide con el marco
local PGlite18.3. Evidencia ../restore-deps-hosted-expanded-20261030.json y
../restore-deps-comparison-verified-20261030.json. Alcance: callees public
explicitamente cualificados y metadata seleccionada; no certifica SQL dinamico,
RLS completo, datos vigentes, restore real ni equivalencia total PG17/PG18.
Los NOT NULL catalogados como constraints tipo n en PG18 se comparan mediante
attnotnull de columnas, no se declaran ausentes en PG17.

La base sintetica ahora incluye los contratos comerciales001/002 existentes:
kiosco ACTIVO no basta si la suscripcion vence. Regresion prueba rechazo sin
filas persistidas. Dos guards hospedados difieren de bootstrap historico solo
en mensajes/formato y search_path=pg_catalog,public; fixture LOCAL revisado
verifica hashes de cuerpo y tokens (salvo mensajes RAISE sin placeholders).
No se modifica bootstrap ni funciones/grants remotos. Bytes Base64 del servidor
verificados contra SHA256, evidencia ../restore-deps-guard-bytes-verified-20261030.json.
La primera captura textual de UI y el marco local intermedio NO son autoridad
de bytes; se conservan como intentos anteriores, no se convierten en PASS.

Plan v2 e4f92a19e2c4965a5a3dbfa847850954af2971f930b672346d9f11dc1a74c4ea
sustituye al plan717d6524 NO ejecutado/NO autorizado. Conserva UUID, cuerpos y
21 llamadas exactas; distingue14 filas operaciones_escritura,3 operaciones_stock
y3 movimientos_stock. Preflight incorpora colisiones de UUID derivados de stock.
Sin migracion automatica de journals ni permiso de reenviar tras incertidumbre.

Validacion final:111 pruebas enfocadas PASS/0FAIL, incluidos guards revisados,
adaptador remoto rechazado sin SQL, gate comercial vencido y contadores finales.
Reporte ../restore-deps-final-tests-20261030.json. No sesiones Auth nuevas ni
RPC restaurar_* en Staging. El arranque restringido fallo spawn EPERM; la corrida
local permitida posterior completo las111 pruebas. No extrapolar suite global.

FALTA antes de GO: envoltorio Windows privado/ACL/credenciales/logout, resolucion
durable del journal tras revision, fallos del envoltorio, comprobacion fresca de
dependencias/datos y respaldo posterior a contratos. Metadata historica no es
preflight vigente. Sin flags, Edge, Vercel, ARCA/CAE, master, merge o Production;
restauracion integral UI bloqueada. Objetivo PR01-PR11 permanece activo.

Cierre del incremento: build exit0 (aviso de chunks >500kB conservado), lint,
node --check, diff y manifiesto bootstrap43 PASS. Build previo detecto tipado
de fixture de test; corregido con interfaz explicita, seis casos revalidados PASS.
Bundle publico:36 JS sin cinco simbolos privados seleccionados; no auditoria
absoluta de secretos. Sin cambio al bootstrap historico ni despliegue remoto.
