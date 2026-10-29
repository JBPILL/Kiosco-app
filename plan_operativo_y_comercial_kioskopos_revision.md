# KioskoPOS — revisión del plan operativo y comercial

**Estado actualizado: 21/10/2026.** Implementación en curso. El registro siguiente
es el resumen vigente; la evaluación original del 05/10 y las notas de avance
del final se conservan como historial. Sus conteos y menciones de publicación
pendiente describen aquella ejecución, no el estado actual.

## Production Readiness — gates permanentes (20/10/2026)

Actualización PR06/P02 del29/10: diagnóstico de costos exige Cajero activo sin
privilegio global explícitamente (es_superadmin=false). 71 pruebas enfocadas y
build PASS, sin nueva aceptación JWT. Lectura independiente confirma7 filas
privadas de productos y17 de movimientos en el comercio de ensayo; no son tablas
vacías. Asistente Visor preparado en ad86d59; perfil existente inactivo por cierre
del ensayo18/10 y límite del plan, no reactivar por conveniencia. Aceptaciones
históricas de módulos comerciales conservadas; faltan matriz fiscal y DML reales.
Evidencias/hashes en ExecPlan fiscal, sin cerrar PR06 ni repetir gates sin drift.

Actualización PR03 del 29/10/2026: conciliación READ ONLY de Staging confirmó
emisor/catálogo inactivos, 37 contadores fiscales en cero, sin operación ni TA y
hashes de historia/comercio conservados. Auth/perfil exactos y gateway cerrado
confirmados separadamente. Esto cierra incertidumbre de cambios del intento,
no aceptación positiva ni primer CAE. Catálogo2 y ventanas del 28/10 vencidos;
renovar evidencia/propuesta con sus GO y coordinar TA antes de otra ventana.
Ver `.agent/execplans/arca-homologation.md`; PR02 pendiente y PR03 parcial.

Consulta de renovación autorizada posteriormente: WSAA PASS, primera consulta
WSFE falla con error local/transporte; sin parámetros nuevos ni importación.
TA descartado vence29/10 22:00:42.630Z. GO consumido, no retry ni LoginCms antes
de su expiración. Evidencia anónima adicional de fallo de conexión al WSDL; no
atribuye una causa definitiva. Catálogo2 inactivo/vencido y gate positivo pendiente.

Preparación LOCAL de revisión3: configuración/manifiesto/SQL/observador requieren
pin explícito y verifican todas las revisiones históricas. 170 pruebas enfocadas
y14 escenarios PostgreSQL/HTTP con Auth/ARCA sintéticos PASS; no catálogo3 real,
no importación ni aceptación positiva. Coordinar consulta/TA/ventana dentro de
la vigencia del catálogo, sin asumir duración fija o ampliar fechas. Evidencia
detallada en ExecPlan fiscal: global final5273 PASS/0 FAIL/1skip/332archivos,
exit0 y sin archivos ausentes. PR03 no cambia a PASS por aceptación sólo local.

Actualización de orden del 28/10/2026: el operador de preparación fiscal se
cierra primero como bloque local único; después preflight hospedado y GO
independiente para ventana positiva SIN emisión. Consultar el ExecPlan fiscal
y el protocolo existente en `docs/arca-homologacion.md`. PR03 sigue parcial
hasta aceptación real; PR02 requiere primer CAE y otro GO. Los controles
locales/sintéticos no acreditan esos gates. No nuevas migraciones por
conveniencia, provisión repetida, emisión, Production ni merge. El objetivo
PR01–PR11/P01–P24 y los diferimientos de impresora/Point siguen vigentes.

Este registro es la fuente canónica de las puertas de aceptación del piloto y de
su futura salida productiva. Se incorpora por instrucción expresa del titular.
Complementa P01–P24 y los ExecPlans existentes; no elimina decisiones, resultados
ni pausas históricas. Un PASS local, un deploy o WSAA PASS no cierran por sí solos
un gate hospedado, fiscal ni comercial. No duplicar esta matriz en otros planes:
referenciar sus IDs y registrar allí únicamente la evidencia del módulo.

**Orden vigente:** PR01 completado; continuar PR02 (CAE homologación), preparando
primero su dependencia obligatoria PR03 (backend seguro e idempotencia fiscal). Los demás gates pueden
prepararse en paralelo cuando no dependan de su aceptación; ninguna preparación
autoriza emisión, instalación SQL, transición productiva ni uso de datos reales
fuera del alcance ya autorizado. Impresora/cajón físicos y Point siguen diferidos
por el titular hasta contar con cliente; no se consideran probados ni aprobados.

| Gate | Alcance y evidencia necesaria para cerrar | Estado comprobado y siguiente acción | Dependencia / vínculo |
|---|---|---|---|
| PR01 | WSAA/WSFE homologación: certificado/par original y vigencia; autorización del servicio; TRA/CMS válidos; Token/Sign y expiración reales sin exposición; consulta autenticada no transaccional a WSFE con CUIT representado; errores SOAP/negocio explícitos. | PASS de diagnóstico real el 20/10: certificado/par, WSASS, WSAA y consulta FEParamGetTiposCbte autenticada devolviendo 36 tipos; cero comprobantes emitidos. FEParamGetPtosVenta respondió antes 602 (sin datos), conservado como evidencia. No acredita disponibilidad del punto 2 ni CAE; esos requisitos siguen en PR02. Evidencia: diagnóstico cc199d5, ejecución autorizada, credenciales sólo en memoria. | ExecPlan arca-homologation; docs/arca-homologacion. |
| PR02 | CAE real de homologación: respuesta autorizada de WSFE, número, tipo, punto de venta, importes, vencimiento y QR coherentes; persistencia y recuperación por FECompConsultar; rechazo no presentado como autorizado; ninguna simulación de CAE. | PENDIENTE. Preparar la prueba reproducible y pedir la autorización requerida antes de emitir un comprobante, incluso de homologación. | PR01 y contrato seguro de PR03. |
| PR03 | Idempotencia y robustez fiscal: operación durable por venta/entorno, cuerpo inmutable y control de permisos; reserva/lock de numeración por CUIT/punto/tipo; mismo reintento no duplica; respuesta incierta se reconcilia antes de reenviar; importes/IVA/fechas/XML y caché/renovación de TA validados. | PARCIAL LOCAL: registro durable, reserva global por serie e intento único preparados, 57 pruebas SQL y seis carreras PostgreSQL 17.11 locales PASS. SQL no instalado. Contrato completo v1/SHA-256 y comparación SOAP preparados: 90 casos y Edge local sintético PASS. Cuerpo/hash ligado a venta/reserva preparado: 168 pruebas fiscales enfocadas y build PASS; SQL 003 no instalado. CAS de reconciliación, estados finales y recuperación preparados en SQL 004/orquestador privado: 196 pruebas fiscales y nueve carreras PostgreSQL locales PASS. SQL 001–004 no instalados. Gate privado de actor/comercio/emisor y caché TA por proceso preparados (SQL 005), composición/replay Edge local PASS. SQL 005 tampoco instalado. Coordinación TA entre procesos y sobre cifrado preparados localmente (SQL 006 no instalado): doce casos PostgreSQL y Edge sintético PASS. Proveedor CMS/WSAA preparado con CryptoKey y transporte fijo: CMS sintético verificado por .NET y Edge mock PASS. Lector privado de PKCS8 cifrado y keyring preparado; interoperabilidad sintética .NET y Edge local PASS. Preparación TA cancelable y permiso único de envío preparados (SQL 007 no instalado): 118 pruebas enfocadas, quince carreras PostgreSQL y Edge local sintético PASS. La incertidumbre posterior a intención continúa bloqueada. Endpoint HTTP de consulta/recuperación preparado y deshabilitado: 150 casos enfocados y Edge local PASS, con Auth/SQL, CORS y SDK privado limitados. SQL 008 liga recuperación TA a la operación origen y oculta intentos ajenos; dieciséis carreras PostgreSQL locales PASS. Sin instalación. Trabajador de último número/envío preparado con SQL 009 (sin instalar): permiso exacto por hash, un envío y conciliación posterior; 153 enfocadas, 18 carreras PostgreSQL y Edge local PASS. SQL 010 prepara exclusión con devoluciones mediante lock de venta y READ COMMITTED: 195 enfocadas y 20 carreras PostgreSQL PASS, sin instalación. SQL 011 prepara revisión humana por hash/Auth/binding con vencimiento, endpoint de consulta/aprobación y doble validación antes de TA/al consumir permiso: 155 enfocadas, 24 carreras PostgreSQL y Edge 3+9 PASS, sin instalación. Faltan preparación fiscal/revisión UI, resolución de rechazos y notas de crédito, provisión/configuración autorizada, instalación y aceptación hospedada. Activar almacenamiento cifrado y claves exige autorización específica. Emisión sigue bloqueada; no es una pasarela fiscal aceptada. | PR01; debe satisfacer invariantes antes de PR02 end-to-end. |
| PR04 | Contingencias ARCA/Internet: caída de WSAA/WSFE, timeout antes/después del commit, vencimiento de TA, reconexión y reintento controlado; estado comercial separado del fiscal; ticket pendiente claramente identificado, sin CAE inventado ni doble cobro. Definir operación, responsables y límites de contingencia. | PARCIAL: existe evidencia de recuperación de cobros comerciales; falta circuito fiscal real y aceptación del operador. No asumir que ticket interno sustituye un comprobante fiscal. | PR03, PR08; P08/P09/P17. |
| PR05 | Integridad venta-stock-caja: venta/pagos/detalles/stock/kardex/costos/lotes/envases y caja coherentes; descuentos, cambio/devolución, anulación y caja cerrada; una solicitud produce un solo efecto y una reversa. Conciliar datos de ensayo e historia sin borrar/redondear movimientos. | PARCIAL: checkout, envases/devoluciones y ajuste de unidad cuentan con ensayos; completar matriz pendiente y revisar hallazgos de anulación antes de afirmar cierre. | P05/P06/P08/P18/P19; PR09. |
| PR06 | Seguridad: JWT reales de Dueño/Cajero/Visor y otro comercio, DML directo rechazado, RLS/ACL efectivas, supervisor ligado a operación y límites de intentos, auditoría y retención; secretos/certificados sólo bajo custodia privada apropiada, nunca en frontend/logs/commits; dependencias y cambios revisados. | PARCIAL: auditoría npm 0 alertas tras parches Vite/source-map-js al 21/10. Contratos/pruebas locales no cierran la matriz hospedada; custodia y autorización fiscal de la futura pasarela pendientes. | P02/P03/P04/P07; ExecPlans F5/F6, supervisor y administración. |
| PR07 | Backup/restore: copia operativa cifrada y restauración representativa con saldos/relaciones/lotes/configuración, repetición y verificación de origen/destino; además pg_dump/pg_restore + Storage/historia, destino externo, retención, alertas y restauración medida según RPO/RTO acordados. Ninguna copia local sola acredita recuperación de desastre. | PARCIAL: catálogo/promociones/combos aceptados en Staging. Contratos ampliados preparados y probados localmente; SQL nuevo y ensayo hospedado pendientes. UI integral sigue bloqueada. No se cerraron PostgreSQL/Storage ni política externa. | P13–P17; ExecPlans backup-recovery-acceptance y backup-promotions-relations. |
| PR08 | Recuperación ante fallos: cierre/crash del puesto o backend, cuota/perfil perdido, ACK descartado, solicitud preparada sin copia local; conservar identidad, operador, caja y cuerpo; recuperación sin volver a cobrar; procedimiento de soporte y restauración ensayado. | PARCIAL: sesión persistente y recuperación backend específicas verificadas; falta completar aceptación UI, operador/caja distintos, cancelación concurrente y pérdida de perfil/almacenamiento. | P08/P09/P17/P22–P24; PR07/PR09. |
| PR09 | Concurrencia/E2E: dos actores/terminales, solicitudes idénticas y distintas, último stock/lote/envase, supervisor, anulación/devolución, cancelar contra confirmar y numeración fiscal; inyección de fallos y aserciones de DB + UI con datos aislados. Automatización local/HTTP no sustituye aceptación con JWT/entorno y actores correspondientes. | PARCIAL: reintentos HTTP y seis carreras fiscales PostgreSQL reales locales comprobados; no está cerrada la matriz hospedada comercial/fiscal ni dos terminales de operador. | PR03–PR08; P04/P05/P08/P18/P20/P21. |
| PR10 | Transición controlada a ARCA Producción: gates previos aceptados, titular/CUIT/punto/certificado/servicios productivos correctos, custodia y accesos, versión/configuración revisadas, respaldo y conciliación previos, ventana/cutover/rollback/monitoreo/soporte y aprobación explícita de cambio. Emisión productiva requiere su autorización específica. | NO INICIADO. Homologación, commits, Staging o este plan no autorizan Production, master, credenciales productivas ni comprobantes reales. No regenerar material privado como solución automática. | PR01–PR09 cerrados, decisión del titular. |
| PR11 | Piloto comercial: comercio/operadores elegidos, formación y soporte, alcance de rubro, turnos/cierre/reportes, criterios medibles y responsables, seguimiento de incidencias y conciliación, aceptación y decisión de ampliar/retroceder. Validar impresora/cajón y Point al final cuando el titular aporte cliente/medios. | PENDIENTE. Entrega operativa/comercial y aceptación real no se sustituyen con datos ficticios, un HTTP 200 o un mock. Mantener los periféricos diferidos visibles hasta su ensayo autorizado. | P01/P10–P12/P20–P24 y gates técnicos aplicables; PR10 para alcance fiscal productivo. |

### Evidencia, revisión y reglas de cierre

- Cada cierre debe identificar entorno/ref, versión/commit, caso y resultado
  reproducible, fecha, responsable, límites y enlace a evidencia sanitizada.
  Distinguir preparación local, PGlite/mock, JWT hospedado, operador y hardware.
- Usar estados PENDIENTE, PARCIAL, EN VALIDACIÓN, PASS o DIFERIDO; un DIFERIDO no
  equivale a PASS. No marcar el piloto o Production listos con gates requeridos abiertos.
- Preservar solicitudes, diarios y datos del ensayo; no borrar historia ni cambiar
  IDs/saldos para hacer pasar una comprobación. Registrar decisiones y rollback.
- No exponer claves/Token/Sign/CMS privados, passwords ni conexiones. Autorización
  de acceso/consulta no implica autorización para emisión, credenciales nuevas,
  instalación SQL o despliegue productivo. Aplicar las autorizaciones de la sesión
  a su alcance concreto sin pedir de nuevo las ya concedidas.
- Estado local conjunto al 21/10: 2324 PASS / 1 skipped / 227 archivos; build
  634 módulos PASS. Incluye 90 casos nuevos de contrato/XML/transporte fiscal.
  Edge local: dos casos sintéticos PASS. Se conservan seis carreras PostgreSQL
  17.11 locales PASS del bloque anterior (SQL sin cambios en este bloque). Acredita ese árbol local, no la instalación hospedada de los
  SQL nuevos, CAE, Production ni el piloto comercial.

### Siguiente acción autorizada

PR01 completado mediante WSAA y FEParamGetTiposCbte reales. Continuar PR02
preparando primero PR03: custodia privada y permisos por comercio, operación
fiscal durable con cuerpo inmutable, reserva de numeración y reconciliación
FECompConsultar antes de reintentar respuestas inciertas. Probar localmente
contratos y fallos, luego pedir la autorización específica de instalación y
ensayo hospedado que corresponda. No activar la Edge legacy ni emitir un
comprobante sin autorización de emisión. La disponibilidad del punto 2 sigue
sin acreditarse; no crear puntos en Producción como atajo para homologación.


## Registro de tareas pendientes

**Seguimiento del registro: 20/10/2026.** Envases/Devoluciones se implementaron
con módulos transaccionales y aceptación backend en Staging; el usuario da por
aceptados los ajustes visuales. Se continúa P22/P23 con preparación de puesto
persistente. El operador confirma sesión conservada tras cerrar y reabrir Staging.
Cobro ficticio inválido cancelado sin cobro y remanente del artículo de ensayo
conciliado a 1 unidad mediante ajuste auditado autorizado. Evidencia actual:
`.agent/execplans/pilot-envases-returns.md`,
`.agent/execplans/pilot-unit-stock-checkout.md` y
`.agent/execplans/pilot-windows-persistent-station.md`. Las notas históricas del
final conservan los estados y conteos de sus ejecuciones.

Una tarea pendiente puede requerir desarrollo, aplicación SQL, aceptación
remota o prueba física. Una implementación local no cierra su fase hasta
cumplir la puerta de aceptación correspondiente.

Por decisión del usuario, impresora/cajón físicos y Point quedan diferidos al
final, cuando exista un cliente para ensayarlos; no forman parte del bloque
actual. Recuperación de cobros: 117 pruebas locales PASS y ensayo JWT en Staging
de reintento secuencial/concurrente de venta confirmada sin cambios en sus
efectos. Alcance y límites: `.agent/execplans/pilot-checkout-recovery-acceptance.md`.

| ID | Fase | Tarea pendiente | Qué falta para cerrarla |
| --- | --- | --- | --- |
| P01 | 0 · Producto | Definir entrega comercial y puestos soportados | Registrar SaaS/licencia, versiones de Windows/navegador, modelos de periféricos y responsables de soporte/credenciales. |
| P02 | 1 · Seguridad | Comprobar permisos con sesiones reales | Probar API/PostgREST con JWT de cajero, dueño y otro comercio: costos privados, cambios/anulación de ventas y escritura directa. No ampliar permisos para obtener un resultado verde. |
| P03 | 1 · Seguridad | Aceptar operativamente el paso 52 | Catálogo remoto confirmado; falta demostrar INSERT directo rechazado para cajero y checkout por backend funcionando después de instalarlo. |
| P04 | 1 · Seguridad | Completar pruebas de supervisor | Rechazo de PIN incorrecto y venta con PIN correcto ya informados; faltan concurrencia, espera/límites de intentos, permiso ligado a solicitud original y usos restantes en el piloto. |
| P05 | 1 · Seguridad | Cerrar aceptación de anulación atómica | Diagnóstico remoto confirma trigger antiguo que duplicó reposición: aplicar fase actualizada y conciliar la unidad extra antes de aceptar el caso efectivo. También faltan pago mixto, fiado, caja original cerrada, lotes y reintento concurrente en Supabase real. |
| P06 | 1 · Seguridad | Aceptar devoluciones transaccionales y conciliar historia | Backend/formulario atómicos e idempotentes implementados y ensayados en Staging. Interfaz aceptada por el usuario. Quedan conciliación de tickets/saldos antiguos y aceptación operativa; integración/Production mantienen gate separado. Cuenta corriente y pagos mixtos diferidos; tickets con envases sólo completos y Dueño. |
| P07 | 1 · Auditoría | Definir retención y operación de auditorías | Establecer responsables, acceso, conservación y comprobación remota de precio, descuento, anulación y apertura manual del cajón. |
| P08 | Checkout | Validar pérdida de conexión y dos equipos | Staging/JWT real: corte controlado de socket tras primer commit, recuperación y reintentos simultáneos con una venta/pago/detalle; stock físico conservado. Faltan cancelación concurrente y dos terminales físicas; peticiones HTTP no sustituyen esa prueba. Evidencia en pilot-checkout-recovery-acceptance.md. |
| P09 | Checkout | Aceptar recuperación sin copia local | RPC Staging/JWT Dueño recupera preparado sin cola IndexedDB y confirma conservando cuerpo, ID, operador/caja originales; reintento sin duplicados. Pendiente aceptación UI del operador, cambio de operador/caja y cancelación concurrente. No crear otra venta ni volver a cobrar. |
| P10 | 2 · Periféricos | Validar impresoras y cajón físicos | Diferido al final por el usuario, hasta contar con cliente para pruebas. Matriz por modelo/COM/USB: permiso denegado, desconexión, reimpresión, pago mixto y pulso único sólo tras efectivo confirmado. |
| P11 | 2 · Periféricos | Completar canal por driver de Windows | Diálogo del navegador ya disponible con window.print y ajuste de contenedores para ticket largo. Configurar despliegue controlado y comprobar driver, márgenes, paginación y salida real; no hay confirmación ni impresión silenciosa. |
| P12 | 2 · Periféricos | Probar lector, balanza y cámara móvil | Ensayar dispositivos reales, Safari/iOS, cancelar/reabrir, permisos y entrada manual de peso. |
| P13 | 3 · Respaldo | Confirmar migraciones de respaldo vigentes | Snapshot 4.0 disponible y conteos coherentes con JWT Dueño real en Staging; 113 pruebas locales de respaldo PASS. Falta verificar configuración/relaciones/recetas con datos representativos y equivalencia SQL de pasos 49–50; colecciones vacías no acreditan esos casos. Git push no aplica SQL. |
| P14 | 3 · Respaldo | Restaurar una copia real en entorno aislado | Catálogo y promociones strict ensayados con JWT Dueño en Staging: exportar/cifrar/descifrar y restaurar 10 productos, 1 categoría, 4 tipos de promoción y 1 receta con pesable; repetición sin duplicar. Origen interactivo intacto y fixtures suspendidos. UI integral sigue bloqueada; faltan clientes/saldos/proveedores/lotes/asociaciones y configuración representativa. Ver pilot-backup-promotions-relations.md. |
| P15 | 3 · Respaldo | Completar respaldo de base y recuperación | Probar pg_dump/pg_restore real y Storage; cubrir historial de ventas/caja y módulos excluidos del JSON operativo. |
| P16 | 3 · Respaldo | Automatizar copias externas y retención | Definir destino, cifrado, programación, rotación y alertas; copia IndexedDB y recordatorio no sustituyen esta estrategia. |
| P17 | 3 · Respaldo | Comprobar fallos de almacenamiento y cierre | Piloto con cuota agotada, perfil borrado, descarga fallida y cierre pendiente; el respaldo no debe alterar la caja. |
| P18 | 4 · Mermas | Validar operaciones remotas concurrentes | Comprobar FEFO, lote específico, costos históricos, idempotencia, cancelación y conciliación de stock contra kardex. |
| P19 | 4 · Mermas | Aceptar reporte de bajas completo | Comparar período argentino y costos conocidos/desconocidos con datos reales; conservar distinción de estimación a costo frente a contabilidad fiscal. |
| P20 | 5 · Multirrubro | Pilotar capacidades por rubro | Cambio de rubro con datos existentes y combinaciones de pesables, envases, lotes y servicios sin pérdida de atributos. |
| P21 | 5 · Multirrubro | Aceptar circuitos comerciales especializados | Verificar servicios, dietética/bazar y electrónica con usuarios reales, importación, reportes y continuidad offline. |
| P22 | 7 · Escritorio/quiosco | Completar entrega de instalación lista para usar | Preparación de arranque persistente por puesto implementada; faltan acceso directo/instalación autorizados, actualización, soporte y aceptación en terminal real. No instala ni bloquea Windows automáticamente. |
| P23 | 7 · Escritorio/quiosco | Aceptar perfil persistente y recuperación del puesto | Lanzador con perfil por origen/puesto, sin kiosk/InPrivate y con rechazo de políticas incompatibles. Operador confirma login y sesión conservada al cerrar/reabrir el mismo puesto en Staging. Faltan perfil efectivo, preferencias, permisos y recuperación de solicitudes originales tras respuesta perdida/cierre inesperado. No copiar ni borrar perfiles con pendientes. |
| P24 | 7 · Escritorio/quiosco | Probar Windows administrado en piloto | Assigned Access/salida de emergencia, cierre inesperado, reconexión, pantalla y recuperación. El lanzador no bloquea Windows ni relanza Edge. |

### Trabajo pausado por decisión del usuario

- **Point y QR integrados (fase 6):** no activar ni desplegar como parte del
  trabajo actual. Si se retoma, requiere cuenta/terminal elegible, sandbox,
  backend, secretos, webhook, conciliación y aceptación de estados inciertos.
  El cobro manual con posnet continúa siendo una ruta independiente.

## Registro de tareas realizadas

- [x] P22/P23: lanzador de puesto con perfil persistente por origen/puesto,
  preparación sin abrir Edge ni crear archivos, rechazo de políticas incompatibles
  y guía de adopción/recuperación. 25 pruebas PowerShell aprobadas, preparación
  real de sólo lectura para Staging PASS. Suite final 2085 PASS / 1 skipped /
  217 archivos; build 631 módulos PASS. No instalado: persisten aceptación física,
  cierre/reinicio, periféricos, soporte y configuración administrada del puesto.
- [x] Envases: usuario acepta los ajustes visuales y solicita continuar el plan.
  No equivale a conciliación de ensayos, impresión física ni autorización de merge.

- [x] Diagnóstico de anulación detecta protección contra reposición adicional
  y ausencia del trigger legado, incluso deshabilitado. 109 pruebas SQL de
  anulación/checkout/conciliación aprobadas. Resultado remoto todavía pendiente.

- [x] Causa remota del duplicado identificada: trigger legado de reposición
  coexistía con RPC atómica. Migración retira sólo el trigger conocido y se
  preparó conciliación específica, compensatoria/auditada y repetible sin doble
  descuento. 100 pruebas de anulación y ocho de conciliación aprobadas;
  aplicación remota y aceptación del stock corregido aún pendientes (P05).

- [x] Protección de anulación detecta reposición adicional durante el cambio
  de estado y revierte la transacción. Regresión con trigger antiguo que duplica
  stock o sólo movimiento: 98 pruebas SQL aprobadas, incluido diagnóstico de
  movimientos/triggers de sólo lectura. Aplicación remota y
  conciliación del duplicado informado por el usuario todavía pendientes (P05).

- [x] Catálogo remoto de devoluciones recibido: RLS habilitado y políticas
  FOR ALL para authenticated por comercio; grants de escritura anon/authenticated.
  Sin política anon en el resultado: no prueba escritura anónima efectiva.
  Revocación de ruta directa e integración backend siguen abiertas (P06).

- [x] Base privada de confirmaciones de devolución con solicitud/resultado,
  identidad coherente, venta/comercio y UUID único preparada. Nueve pruebas
  PostgreSQL aprobadas. No aplicada ni conectada: no cierra atomicidad (P06).

- [x] Cálculo privado de reintegros por detalle original integra importe neto
  histórico y cantidades previas; mantiene separadas líneas del mismo producto.
  29 pruebas PostgreSQL aprobadas. Bloqueos, persistencia y efectos atómicos
  siguen pendientes de integración en P06.

- [x] Diagnóstico de permisos de devolución parcial preparado: tablas, RLS,
  permisos efectivos por tabla/columna y políticas completas. Prueba PostgreSQL
  aprobada; ejecución remota y reemplazo transaccional pendientes (P06).

- [x] Comprobación global de `95f71ba`: build aprobado; 1.510 pruebas aprobadas
  y siete agotaron el tiempo de arranque PostgreSQL. El diagnóstico ahora usa
  entorno Node y límite explícito de 30 segundos; ocho casos dirigidos aprobaron
  en 15,78 segundos. Repetición global con este ajuste: **1.517 pruebas en 158
  archivos aprobadas**, 173,79 segundos, código 0; build también código 0.
  P25 cerrado para esta revisión local. No acredita aceptación remota ni física.

- [x] Contrato compartido de devolución por detalle original y UUID estable,
  sin precios/importe/actor enviados por cliente. Catorce pruebas del parser
  aprobadas. Ruta backend y conexión al formulario todavía pendientes (P06).

- [x] Distribución SQL privada del importe neto histórico por detalle, con
  redondeo acumulado, conservación del total y orden estable. Dieciocho pruebas
  locales de cálculo aprobadas; integración transaccional pendiente (P06).

- [x] Base SQL privada para cálculo acumulado de reintegro histórico sin exceso
  por redondeo. Doce pruebas PostgreSQL aprobadas. Falta integrar autorización,
  importes netos históricos, bloqueos y efectos atómicos: P06 sigue abierto.

- [x] Devolución parcial bloquea entrada inválida/duplicada y falla de lectura
  de devoluciones anteriores antes de escribir. Doce pruebas del store aprobadas;
  atomicidad, cálculo autoritativo y permisos backend siguen pendientes (P06).

- [x] Auditoría de devolución parcial identifica límites de validación,
  persistencia, reintegro y compensación. [Hallazgos](docs/auditoria-devolucion-parcial.md).
  Implementación transaccional y permisos remotos permanecen pendientes (P06).

- [x] Respaldo PostgreSQL conserva manifiesto SHA256 y comprobador local antes
  del ensayo de recuperación. 14 pruebas Windows aprobadas; no sustituye
  dump/restore real, cifrado ni almacenamiento externo confiable (P15–P16).

- [x] Impresión manual libera límites de altura/recorte de la vista previa y
  máximo de ancho del ticket, restaurando contenedores al finalizar. Dos pruebas
  DOM aprobadas; impresión de tickets largos con driver real pendiente (P11).

- [x] Diagnóstico paso 53 contrastado con la migración real y su reaplicación:
  permiso PUBLIC por columna detectado y eliminado. 77 pruebas SQL aprobadas;
  aceptación remota de instalación y recuperación sigue abierta (P09).

- [x] Diagnóstico de catálogo del paso 53, sólo lectura: objetos, RLS, contexto,
  permisos por tabla/columna, roles y políticas adicionales. Ocho pruebas PostgreSQL locales y build
  aprobados; resultado remoto aún pendiente y no sustituye recuperación JWT.

- [x] Verificador de recetas rechaza duplicados y cantidades esperadas inválidas,
  incluso si coinciden con la respuesta. 76 pruebas dirigidas aprobadas.

- [x] Resumen de restauración muestra las colecciones comprobadas en servidor
  (productos, lotes, promociones y recetas), sin afirmar comprobaciones omitidas
  o fallidas. 43 pruebas dirigidas aprobadas. Suite global anterior: `eafbdd9`.

- [x] Validación global sobre `eafbdd9`: 1.448 pruebas/151 archivos aprobados
  en 141,44 segundos y build con código 0. Incluye las nuevas comprobaciones de
  restauración; no sustituye aceptación JWT, ensayo aislado ni hardware.

- [x] Comparación final de recetas de combos recuperados: IDs destino,
  cantidades y eliminación de receta al convertir a físico. 69 pruebas
  dirigidas aprobadas; aceptación de restauración real pendiente (P14).

- [x] Verificación persistida de promociones 4.0: condiciones, descuentos,
  relaciones y componentes JSON. Incluye copias sólo de promociones.
  60 pruebas dirigidas aprobadas; restauración real aún pendiente (P14).

- [x] Verificación persistida de lotes en respaldos 4.0: producto destino,
  vencimiento, número, cantidades y actividad. Una diferencia evita la
  desactivación del modo Reemplazo. 51 pruebas dirigidas y build aprobados.
  Las escrituras anteriores no se revierten: el ensayo aislado sigue pendiente.

Las casillas marcadas indican entregables implementados o evidencia recibida,
no aceptación completa de toda la fase. Los enlaces llevan al detalle de
alcance, instalación y limitaciones.

| Hecho | Entregable realizado | Evidencia y alcance |
| --- | --- | --- |
| [x] | Costos privados y protección de perfiles | Migraciones/consultas que separan costos del acceso de cajeros y protegen rol e identidad. [Guía de seguridad](docs/verificacion-seguridad-postgresql.md). API con JWT real pendiente (P02). |
| [x] | Herramienta de lectura de costos por API | GET con identidad Auth verificada, perfil CAJERO/comercio esperado, control de filas privadas y paginación del costo público. [Guía](docs/comprobar-costos-api-cajero.md). Pruebas HTTP simuladas; ejecución real pendiente (P02). |
| [x] | Auditoría de precios y motivo de cambio | Funciones, guardado y consulta de auditoría implementados. [Motivo de precio](docs/motivo-cambio-precio.md), [consulta comercial](docs/auditoria-comercial-consulta.md). |
| [x] | PIN de supervisor y umbral configurable | Backend, espera progresiva, auditoría y política congelada en checkout. [Política](docs/supervisor-politica-descuento.md), [espera](docs/supervisor-pin-espera.md). |
| [x] | Venta de Lucía autorizada en caja compartida | Evidencia del usuario: ef754442…, $2.240, umbral 15, requiere supervisor y cierre confirmado, pagos $2.240. PIN incorrecto rechazado; correcto aceptado. [Aceptación remota](docs/aceptacion-remota-checkout-2026-10-08.md). |
| [x] | Recuperación del pendiente EBF2345B | Evidencia recibida: $3.020, COMPLETADA, cierre confirmado y sin cancelación; conservar identificador, no volver a cobrar. [Registro](docs/aceptacion-remota-checkout-2026-10-08.md). |
| [x] | Checkout transaccional y cola de solicitudes | Preparación/cierre idempotente, caja compartida, recuperación y cancelación implementados y probados localmente. [Servidor](docs/checkout-manual-servidor.md), [cola](docs/checkout-manual-cola-local.md). |
| [x] | Restricciones de escritura de ventas, pasos 47–48 | Protección de tickets preparados y revocación de escritura anónima, incluidos permisos por columna. Diagnósticos remotos aportados por el usuario; aceptación JWT pendiente. [Inmutabilidad](docs/checkout-manual-inmutabilidad.md). |
| [x] | Bloqueo de INSERT directo del cajero, paso 52 | Migración y diagnóstico publicados. Usuario confirmó `paso_52_instalado=true`, RLS y política correcta en ventas/detalles/pagos. [Guía](docs/ventas-cajero-solo-backend.md). |
| [x] | Anulación atómica, paso 51 | Restitución histórica de stock/lotes/costos, cuenta corriente, reintegro e idempotencia con auditoría única. [Detalle](docs/anulacion-venta-atomica.md). |
| [x] | Anulación remota de EF754442 | Usuario confirmó ANULADA, registro atómico, una auditoría, pagos $2.240 conservados, cantidades restituidas y cero egresos adicionales en caja original abierta. No acredita los demás casos (P05). |
| [x] | Diseño de tickets interno y ARCA | Estructura de supermercado compartida, cantidad/precio/importe y promociones; botones Facturar/Ver/Reimprimir/Devolución separados. [Comprobantes](docs/redisenio-comprobantes-2026-10-08.md). Impresión física pendiente. |
| [x] | Panel de pendientes remotos discreto | Revisión plegada en Caja para dueño; aviso de cobros locales sólo cuando existen pendientes. Recuperación conectada; aceptación remota pendiente (P09). |
| [x] | Identidad estable al recuperar entradas remotas | Rechaza dueño sin identidad de autenticación y descarta respuesta si cambian identidad, perfil, rol, actividad o comercio durante la consulta. Seis regresiones cubren la lectura. |
| [x] | Base SQL de recuperación por dueño comprobada | Preparación del cajero → recuperación por dueño → cierre backend → reintento: conserva vendedor y aplica stock/fiado una vez. 76 pruebas SQL aprobadas; aceptación JWT pendiente (P09). |
| [x] | Recuperar cobro original desde Caja y Turno | Formulario del dueño con pagos originales y declaración de cobro/fiado recibido, reenvío de la misma entrada, bloqueo ante cancelación local y reintento sin nuevo cobro. 92 pruebas dirigidas/3 archivos y build aprobados; piloto remoto pendiente. |
| [x] | Auditoría transaccional de recuperación por dueño | Paso 53 y adaptador backend guardan identidad del dueño separada del vendedor original, distinguen cierre previo y evitan auditorías duplicadas. Fallo de auditoría revierte venta/stock/fiado. Aplicación SQL y despliegue Edge pendientes. |
| [x] | Selección de impresora y cajón separados | Prueba sin pulso, apertura automática opt-in tras efectivo confirmado y apertura manual auditada. [Cajón](docs/apertura-manual-cajon.md). Hardware pendiente. |
| [x] | Mejoras del lector por cámara | Implementación y regresiones locales de apertura/cierre y fallback. [Lector móvil](docs/lector-camara-movil.md). Dispositivos reales pendientes. |
| [x] | Respaldo operativo 4.0 y cifrado | Snapshot, configuración pública, validación, compatibilidad 2/3 y cifrado; excluye secretos y no incluye todo el historial. [Alcance](docs/respaldo-ampliado.md). |
| [x] | Restauración de relaciones y combos | Snapshot de componentes y recuperación validada, reglas de cantidad, verificación final de productos antes de reemplazo. [Combos](docs/respaldo-relaciones-y-combos.md), [productos](docs/verificacion-productos-restaurados.md). Ensayo real pendiente. |
| [x] | Respaldo local al cierre y recordatorio externo | Copia por sesión en IndexedDB y marca de exportación externa. [Cierre](docs/respaldo-arqueo-cierre-local.md), [recordatorio](docs/recordatorio-respaldo-externo.md). No sustituye copia externa. |
| [x] | Script de respaldo PostgreSQL Windows | Archivo custom, comprobación pg_restore, SHA256 y manejo de credenciales/errores; pruebas con comandos simulados. [Guía](docs/respaldo-postgresql-windows.md). Dump/restore real pendiente. |
| [x] | Mermas, FEFO e idempotencia de stock | Operaciones transaccionales, motivos, lote y costo histórico privado; pendientes consultables/reintentables. [Verificación](docs/verificacion-mermas-postgresql.md). |
| [x] | Reporte de bajas por período | Agregación SQL autorizada, costos desconocidos diferenciados y fechas argentinas. [Reporte](docs/verificacion-resumen-bajas-stock.md). |
| [x] | Capacidades multirrubro y pesables | Preferencias independientes y preservación de atributos; ingreso de peso aunque balanza esté desactivada. [Pesables](docs/verificacion-multirrubro-pesables.md). |
| [x] | Servicios y pantallas por rubro | Circuitos y catálogos implementados; servicios offline conservan concepto. [Servicios](docs/verificacion-servicios-y-diseno-reportes.md), [offline](docs/verificacion-servicios-offline.md), [electrónica](docs/electronica-comercial.md). Piloto pendiente. |
| [x] | Lanzador HTTPS para Edge y guía de quiosco | Validación de URL y parámetros; rechazo de localhost/puerto Vite/credenciales con diez pruebas Windows sin abrir Edge. [Guía](docs/despliegue-kiosco-windows.md). Instalación física pendiente. |
| [x] | Publicación de entregables en Git | Cambios anteriores publicados en `origin/master`; cada commit conserva su evidencia local. Publicación Git no aplica SQL ni prueba el despliegue Vercel. |
| [x] | P25 · Validación global sobre e9079de | `npm run test`: 1.386 pruebas/148 archivos aprobados en 120,76 s; `npm run build`: código 0. Se mantiene el aviso de chunks mayores a 500 kB. No acredita pruebas remotas ni físicas. |

### Registro de verificaciones

- **Última suite completa registrada:** 1.448 pruebas aprobadas en 151 archivos
  sobre `eafbdd9`, en 141,44 segundos; compilación aprobada. Incluye recuperación
  desde Caja, auditoría del paso 53, comprobador API de costos y controles finales
  de lotes, promociones y recetas. Repetir al introducir cambios de código.
- **Suite anterior:** 1.386 pruebas/148 archivos sobre `e9079de`, 120,76 segundos.
- **Comprobador API de costos:** 13 pruebas con HTTP simulado y build aprobados;
  la ejecución con JWT real sigue pendiente.
- **Auditoría de recuperación (paso 53):** 113 pruebas dirigidas en dos archivos
  y build aprobados; aplicación SQL y despliegue Edge todavía sin confirmar.
- **Suite completa anterior:** 1.372 pruebas/147 archivos en `6bcffab`,
  conservada como evidencia histórica.
- **Anulación/checkout:** 116 pruebas dirigidas y build aprobados antes de
  publicar `686fa24`.
- **Diagnóstico paso 52:** 17 pruebas dirigidas y build aprobados antes de
  publicar `fda6ca4`; resultado remoto positivo recibido del usuario después.
- **Lanzador Windows:** diez pruebas de PowerShell aprobadas sin abrir un
  navegador real. No equivalen a una prueba de kiosk o periféricos.
- **Recuperación remota:** 13 pruebas dirigidas en tres archivos aprobadas
  después de la suite completa, incluidas seis de cambio de sesión. Repetir
  validación global cuando se complete el siguiente circuito de recuperación.
- **Límite general:** el plan sigue abierto. Las migraciones confirmadas por
  catálogo no sustituyen JWT/API, restauración aislada, concurrencia ni hardware.

## Evaluación original — 05/10/2026

El plan original cubre problemas reales del mostrador y tiene una buena intención de activación voluntaria. Sin embargo, mezcla mejoras de UX con cambios de seguridad y pagos que requieren backend, da por existentes capacidades no verificadas, y pone tareas grandes en plazos de 1–3 días sin contemplar migraciones, pruebas en hardware ni despliegue.

El repositorio ya contiene (baseline verificado en esta ejecución):

- `src/lib/escposPrinter.ts`: impresión ESC/POS por Web Serial y pulso de cajón. Esto no equivale a una configuración silenciosa ya lista: todavía solicita puerto y tiene que validarse el flujo de permisos, dispositivos y errores.
- `src/lib/backupUtils.ts`: respaldo/restauración JSON con productos, categorías, clientes, proveedores, promociones y lotes. No es un backup integral: no incluye historial contable completo ni una estrategia de copia local al cierre.
- `src/hooks/useTenantConfig.ts`: capacidades por rubro, hoy limitadas a KIOSCO, FOTOCOPIADORA_LIBRERIA y GENERAL. Balanza, vencimientos y envases se habilitan actualmente solo para KIOSCO.
- `public/manifest.json`: PWA existente, configurada en `fullscreen`; no es un modo de bloqueo de Windows.
- La anulación de venta, movimientos de stock/caja, devoluciones, `ROTURA` y `VENCIMIENTO` ya aparecen en la aplicación/modelos. Antes de crear módulos, hay que cerrar brechas y auditar las reglas SQL.

La suite local terminó con **325 tests pasando en 15 archivos**. Por lo tanto, la afirmación de 352 tests del plan original no coincide con el checkout revisado. `npm run build` también terminó correctamente; mostró únicamente el aviso existente de bundle principal >500 kB. La compatibilidad de cada impresora/terminal todavía requiere hardware real.

## Cambios imprescindibles al diseño original

1. **PIN no es una frontera de seguridad.** Ocultar costo en React solo mejora la interfaz; si el cajero puede consultar `productos.precio_costo`, el dato sigue expuesto. Aplicar autorización en PostgreSQL/RLS o mediante funciones backend con identidad verificada. Para aprobar una acción sensible, preferir reautenticación del dueño/supervisor o PIN con hash, salt, límite de intentos, espera progresiva y auditoría. Nunca guardar PIN en texto plano ni confiar en un `rol` enviado desde el cliente.
2. **Mercado Pago no debe llamarse desde el navegador con Access Token.** Un token de cuenta en frontend queda expuesto. Point/QR requieren un servicio backend/Edge Function que almacene secretos, cree la operación con referencia idempotente, valide notificaciones firmadas y consulte el estado del proveedor. La venta no se confirma por una respuesta visual del cliente. Documentar requisitos por modelo de terminal y cuenta antes de comprometer alcance.
3. **Impresión y cajón son canales separados.** Web Serial necesita gesto del usuario, origen seguro y permisos; no garantiza conexión silenciosa persistente en todos los equipos. ESC/POS por puerto COM no equivale a imprimir a través del driver de Windows. `--kiosk-printing` es una configuración del navegador/launcher, no una API de la PWA. Probar por modelo de impresora, sistema operativo y transporte; mantener ticket en pantalla e impresión manual como fallback. No pedir permisos de puerto durante el cobro.
4. **No interceptar Ctrl+W, Alt+F4 ni prometer impedir F11/F5 desde la web.** El navegador/Windows conserva esos atajos. El modo quiosco requiere política y configuración del dispositivo (Edge/Assigned Access o shell administrado); documentar salida de soporte y recuperación. La web solo puede avisar sobre cambios/recarga cuando el navegador lo permita.
5. **No eliminar productos del catálogo maestro según rubro.** Presentar sugerencias/categorías por rubro y permitir personalización. Un negocio multirrubro puede vender cerveza, alimento por peso y artículos no perecederos. Configurar capacidades independientes por comercio y por producto, no inferir reglas rígidas del nombre del rubro.
6. **La merma es movimiento de inventario, no automáticamente asiento contable.** Guardar tipo, cantidad, lote, costo congelado al registrar, usuario, fecha, motivo y evidencia/notas. Exponerla en reportes de gestión; rotular “estimación a costo” y validar con contador antes de llamarla pérdida contable o modificar resultado fiscal. Diferenciar merma, robo, consumo interno y ajuste de conteo.
7. **El backup local en IndexedDB no es respaldo seguro por sí solo.** Puede perderse junto con el disco, borrado del navegador o perfil. Definir exportación externa/copia cifrada, retención, versión de esquema, restauración comprobada e indicador de última copia. Excluir secretos, tokens y sesiones; proteger datos personales y verificar permisos. Respaldo del frontend no sustituye backup administrado de PostgreSQL.

## Plan de implementación recomendado

### Fase 0 — Descubrimiento y decisiones de producto

- Confirmar cliente objetivo y despliegue: web multi-tenant actual, terminales Windows soportadas, periféricos y si el producto se venderá como SaaS o licencia instalada.
- Inventariar tablas, políticas RLS, migraciones aplicadas, permisos por rol, pruebas existentes y caminos offline. Auditar expresamente lectura de costo y actualización/anulación de ventas.
- Definir responsables de credenciales, soporte, recuperación de cuenta, retención de datos y versión mínima de navegador.
- Aceptación: matriz de capacidades por rubro/producto; matriz de rol × acción; lista de hardware real; estados actuales de build y tests medidos.

### Fase 1 — Seguridad y auditoría de acciones (prioridad alta)

- Aplicar menor privilegio para costos, márgenes y acciones críticas en RLS/backend; revisar consultas de Catálogo, Stock y Reportes además de la UI.
- Registrar actor, autorización, motivo, entidad y marca temporal para anulaciones, cambios de precio, descuentos excepcionales y apertura manual de cajón. Preservar el historial; evitar borrados físicos.
- Reutilizar el flujo de anulación/devolución existente. Introducir umbral de descuento configurable con permiso del dueño y registrar el valor aprobado.
- Criterio: las pruebas de API/RLS demuestran que un cajero no obtiene costos ni modifica/anula ventas sin autorización, incluso llamando directamente a Supabase.

### Fase 2 — Mostrador y periféricos (prioridad alta)

- Aprovechar `escposPrinter.ts`; separar selección/permiso del dispositivo, configuración por puesto y envío de ticket/pulso. Persistir solo preferencias no sensibles; usar `getPorts()` únicamente para dispositivos autorizados.
- Agregar prueba de hardware en Configuración y estado claro: listo, sin permiso, desconectado o error. En pago, fallo de impresora nunca revierte ni bloquea una venta confirmada.
- Apertura automática solo después de confirmar pago en efectivo (o componente en efectivo), con protección anti doble-disparo. Nunca disparar al reintentar impresión.
- Añadir canal de impresión por driver solo como despliegue controlado con Edge/Chromium kiosk printing; no presentarlo como Web Serial.
- Criterio: matriz de prueba en modelos objetivo, permiso denegado, desconexión, reintento, pago mixto, venta offline y venta sin hardware.

### Fase 3 — Respaldo y recuperación (prioridad alta)

- Extender backup versionado con configuración no secreta y datos necesarios para restaurar; decidir explícitamente inclusión de ventas y movimientos por tamaño/privacidad.
- Definir exportación, cifrado opcional/obligatorio según datos, retención, detección de backup externo descargado y flujo de restauración con vista previa y validación.
- Snapshot local al cierre es best-effort y no debe retrasar ni impedir cerrar caja. Cola/reintento y cuota de almacenamiento explícitos.
- Criterio: restaurar en comercio de prueba, comparar conteos/saldos y verificar que un fallo de almacenamiento no altera cierre ni ventas.

### Fase 4 — Mermas y fidelidad de stock

- Ampliar el modelo/migración de movimientos con motivos inequívocos sin invalidar registros antiguos. Asociar lote cuando aplique y registrar costo unitario de referencia al momento del movimiento.
- Integrar el flujo en Stock y reportes. No mezclar mermas con faltantes de efectivo o ventas; cualquier asiento contable queda sujeto a definición contable.
- Criterio: stock y lote FEFO se actualizan atómicamente; historial auditable; costo histórico permanece aunque luego cambie el costo del producto.

### Fase 5 — Capacidades multirrubro

- Expandir `RubroComercio` mediante migración compatible y valores por defecto para comercios existentes. Capacidades configurables: envases, pesables, lotes/vencimientos, servicios rápidos.
- Mantener atributos por producto como fuente de verdad operativa; capacidades del rubro guían UI y configuración inicial, sin ocultar inventario ni borrar datos.
- Actualizar menú lateral, POS, importadores, reportes y tests para cada combinación. Probar cambio de rubro en un comercio con datos existentes.

### Fase 6 — Pagos integrados (iniciativa separada)

- Primero prototipo técnico con sandbox y terminal/cuenta elegibles. Diseñar Edge Function/backend, secretos, idempotencia, webhook verificado, conciliación, cancelación y estados inciertos.
- Mantener el flujo manual actual siempre disponible; no confirmar venta integrada hasta resultado verificado y conciliable. Si el proveedor queda en estado desconocido, bloquear doble cobro y ofrecer consulta/reintento seguro.
- QR dinámico y Point se estiman y aceptan por separado; no asumir que comparten endpoints ni disponibilidad.
- Criterio: pruebas sandbox de aprobado, rechazado, timeout, webhook duplicado/tardío, cancelación y recuperación sin duplicar ventas/cargos.

### Fase 7 — Despliegue quiosco Windows

- Documentar instalación/actualización, acceso directo, arranque, perfil de navegador, impresión y salida de emergencia. No incluir launcher que abra `localhost:5173` como producto final; eso es servidor de desarrollo. Apuntar a URL de producción o instalador/runtime soportado.
- Mantener PWA como instalación cómoda, pero describir límites frente al modo kiosk administrado. Verificar pantalla, reconexión, actualización y restauración tras cierre inesperado.

## Secuencia y estimación

Orden sugerido: Fase 0 → Seguridad → Periféricos → Backup/recuperación → Mermas → Multirrubro → despliegue por piloto. Mercado Pago se ejecuta como proyecto paralelo solo tras validar backend, cuenta y terminal.

No fijar días calendario todavía. Estimar cada fase después de descubrir migraciones y probar hardware; reservar tiempo de piloto con comercios, correcciones y despliegue. El cronograma original de 13 días omite aprobaciones de proveedor, RLS/migraciones, QA de dispositivos, restauración y soporte.

## Puerta de salida por fase

- Build y suite existentes medidos antes/después; agregar pruebas para reglas nuevas y de regresión. No asumir el conteo de tests del documento original.
- SQL/migraciones revisadas y aplicables a datos existentes, con fallback/rollback documentado cuando corresponda.
- Flujos críticos verificados online y offline sin duplicar venta, stock, pago, impresión ni apertura de cajón.
- Permisos verificados en base de datos/backend, no solo por ocultamiento de componentes.
- Piloto controlado y criterios de soporte antes de activar por defecto. Integraciones nuevas permanecen opt-in hasta completar validación.

## Veredicto

La dirección general es buena, pero el plan original no debe ejecutarse tal cual. Recomiendo aprobar primero descubrimiento y seguridad; aprovechar los módulos existentes; corregir el diseño de MP, PIN, quiosco y backups; y dividir el alcance por puertas de aceptación verificables. El orden pone primero protección de datos y continuidad de caja, deja pagos integrados como iniciativa dependiente de backend/proveedor y pospone multirrubro hasta tener un modelo flexible de capacidades.

## Historial de implementación secuencial

Estas notas conservan las verificaciones y pendientes de cada momento. Para el
estado vigente, consultar los dos registros del inicio del documento.

El trabajo posterior sobre el checkout añadió estas piezas, sin afirmar que ya estén activas en producción:

- **Seguridad y auditoría (parcial):** frontend deja de pedir costos en consultas de cajeros; costos privados se cargan solo para dueño/superadmin; caché pública se limpia y exportaciones propietarias usan la tabla privada. La migración de costos corrige el alta con FK diferida y permite guardar costo cero. `supabase_fase_seguridad_perfiles.sql` impide elevar rol/privilegios desde un perfil ordinario y asociar una identidad de autenticación a dos perfiles. La anulación exige motivo, conserva identidad de sesión en auditoría y protege actor/fecha frente a cambios posteriores. `supabase_fase_auditoria_precios.sql` restringe cambios de precio de catálogo y registra valores anterior/nuevo. El guardado del catálogo deja de presentar rechazos de permisos como éxito o modificar su caché ante esos rechazos. Las pruebas SQL ejecutan funciones/políticas reales sobre PostgreSQL local en memoria. Requiere aplicar SQL en orden y validar con usuarios reales/PostgREST; siguen pendientes descuentos excepcionales, justificación específica de precios, apertura manual del cajón y consulta de auditoría desde UI. Ver alcance y orden en `docs/verificacion-seguridad-postgresql.md`.
- **Periféricos (parcial):** selección de impresora en Ajustes, prueba de impresión sin abrir cajón, evita seleccionar el primer puerto de forma arbitraria y agrega apertura automática opt-in después de pagos confirmados con efectivo. Faltan las pruebas en cada modelo de impresora/cajón y no está implementado canal por driver de Windows.
- **Backup (parcial):** formato 3.0 declara su alcance, sigue aceptando 2.0 y rechaza versiones futuras. `supabase_fase_backup_integral.sql` obtiene las seis colecciones y los costos privados en un único snapshot SQL STABLE, autorizado por rol y comercio; sustituye consultas que podían truncarse por límites de filas. La descarga verifica formato, conteos, comercio y alcance antes de guardar/cifrar; ante errores o función no instalada no genera una copia parcial. Incluye catálogo, categorías, clientes, proveedores, promociones, lotes y costos; excluye ventas, movimientos de caja y credenciales. Permite cifrado AES-GCM con clave derivada PBKDF2 y exige contraseña para validar/restaurar. Excel maestro sigue siendo una exportación legible sensible. Requiere aplicar la nueva migración para generar copias. Faltan configuración no secreta, revisión de relaciones entre módulos, copias externas automáticas, retención y restauración comprobada con el esquema completo. Ver `docs/verificacion-respaldo-snapshot.md`.
- **Mermas (parcial):** motivos diferenciados en UI y migración `supabase_fase_mermas_trazables.sql` para congelar costo unitario desde nuevos movimientos y asociar lote en bajas por vencimiento. Una RPC combina en transacción el movimiento manual, el stock y los lotes (FEFO/baja identificada). Los registros históricos conservan costo NULL cuando no existe evidencia; falta validación en una base de prueba real.
- **Multirrubro (parcial):** configuración independiente de envases, balanza, vencimientos y servicios rápidos con defaults compatibles por rubro. Requiere `supabase_fase_capacidades_multirrubro.sql` antes del despliegue.
- **Quiosco Windows (parcial):** se agregó un lanzador HTTPS de Edge y una guía de piloto. Assigned Access, recuperación/reinicio de Edge y validación de permisos Web Serial quedan a cargo del despliegue de cada dispositivo; el modo kiosco Edge usa una sesión InPrivate, así que hay que confirmar persistencia de login/periféricos tras reinicios.

Última verificación registrada durante estos cambios: **473 tests pasando en 32 archivos** y build exitoso (`tsc -b && vite build`), con el aviso existente de chunk principal mayor a 500 kB. Incluye 28 pruebas SQL de seguridad, 9 SQL de respaldo, 8 de descarga del snapshot, 21 de restauración, 3 de identidad reproducible y 3 de paginación, 3 del guardado del catálogo y 3 de cifrado. Las pruebas SQL usan esquema mínimo y emulación de identidad; falta validar JWT/PostgREST y el esquema completo de Supabase. El lanzador PowerShell pasó análisis sintáctico; no se verificó hardware real ni se aplicaron las migraciones SQL remotas. Pagos integrados (fase 6) sigue pendiente; para pagos se necesita decidir Point/QR, una cuenta/terminal sandbox elegible y backend Edge Function desplegable. El objetivo completo y las fases siguen abiertos hasta cumplir sus puertas de aceptación.

La restauración ahora muestra los errores parciales en el modal, conserva el resumen de cambios ya aplicados y omite la desactivación del modo reemplazo si la recuperación previa falla. No garantiza todavía una transacción ni recuperación idempotente; la fase permanece abierta. Los detalles y límites están en docs/verificacion-respaldo-snapshot.md.

Promociones y lotes usan identidad estable para reintentos y confirmación de ID. La promoción restaura campos del esquema vigente y remapea sus referencias. Falta comprobar este flujo en PostgreSQL/PostgREST real y cubrir combos, concurrencia y recuperación completa.

Se integraron los cambios vigentes de origin/master (ARCA, realtime y rotación), se conservó Vitest 5 del remoto y se adaptó RotacionTab a costos privados. Guía de aplicación SQL: docs/aplicar-migraciones-supabase.md. La publicación Git no aplica migraciones a la base remota; el objetivo completo sigue abierto.

Mermas: 15 pruebas SQL locales validan FEFO, lote específico, costo histórico, ajustes, permisos y rollback ante fallas de kardex. Se corrigieron lotes en ajustes negativos, precisión de cantidades y ejecución del backend de servicio. Reaplicar supabase_fase_mermas_trazables.sql si se instaló una versión anterior; ver docs/verificacion-mermas-postgresql.md. Falta concurrencia, idempotencia, revisión de permisos y validación remota.

Stock: nueva RPC registrar_movimiento_stock_idempotente y tabla de operaciones protegida. Reintentar exactamente la solicitud pendiente conserva el UUID local y devuelve el movimiento original. Requiere supabase_fase_stock_idempotente.sql después de mermas. 17 pruebas SQL de stock y 3 de identidad local; faltan concurrencia real, conciliación de pendientes y permisos de costos históricos. Estos cambios todavía no se publicaron ni se aplicaron en Supabase.

Solicitudes de stock pendientes: se bloquean cambios de parámetros del mismo producto mientras la identidad siga abierta, la firma no depende del orden de campos y las fallas de almacenamiento/corrupción detienen el envío con mensajes claros. Cuatro casos reprodujeron fallas antes de la corrección. Falta la vista de conciliación y consulta remota; estos cambios continúan locales a la espera de la autorización de publicación pendiente.

Stock pendiente: pantalla para consultar, reenviar solicitud original y cancelar con reserva atómica de identidad en servidor. La ausencia de operación no elimina el registro local; cancelar una operación aplicada devuelve su resultado sin revertirla. 20 pruebas SQL de stock y 5 de componente de pendientes. Reaplicar supabase_fase_stock_idempotente.sql para agregar resolver_operacion_stock; falta validación remota y concurrencia real. 473 pruebas y build aprobados; publicación aún pendiente de autorización.

Actualización: 480 pruebas en 33 archivos y build aprobados. Costos históricos de movimientos trasladados a una tabla privada con lectura RLS para dueño/superadmin; los cajeros no consultan esa relación ni reciben la columna pública con costos. La migración preserva snapshots conocidos y deja desconocidos como NULL. Stock presenta estimación a costo por movimiento para roles autorizados. Requiere aplicar supabase_fase_costos_movimientos_privados.sql después de mermas; la aplicación remota de esta nueva migración no está confirmada. Se mantienen pendientes reportes agregados, concurrencia real y validación con JWT/PostgREST.

Corrección de Reportes en b922db7: consultas de ventas seleccionan usuario:usuarios!usuario_id(nombre) para evitar ambigüedad tras agregar anulada_por. Comprende historial diario, balance, devoluciones y exportaciones. No modifica ventas guardadas ni requiere otra migración; falta publicar y verificar en producción. El usuario informó haber aplicado los SQL anteriores, sin lista de versiones ni validación remota de políticas.

Bajas de stock: el historial presenta al dueño/superadmin un resumen por motivo de los movimientos cargados y filtrados, con estimaciones históricas conocidas y conteo de costos faltantes. No mezcla ventas, compras, devoluciones ni ajustes; advierte carga parcial. Ajustes históricos se presentan como cantidad registrada para no confundir conteos absolutos con variaciones. Validación: 492 pruebas en 36 archivos y build aprobados. Ver docs/verificacion-resumen-bajas-stock.md. No requiere SQL adicional; sigue pendiente el reporte del período completo en servidor, la publicación de esta UI y el piloto real. La fase y el objetivo completo permanecen abiertos.

Reporte completo de bajas: nueva pestaña en Reportes con rango Desde/Hasta y cálculo SQL autorizado para dueño/superadmin. La función resumir_bajas_stock agrega todas las bajas del período sin límite REST de filas; usa días argentinos y snapshots privados, distingue costos faltantes y cero real, excluye ajustes/ventas y no modifica el resultado fiscal. Nueva migración supabase_fase_reporte_bajas_stock.sql (paso 11). Las pruebas SQL verifican 1202 bajas, límites del día, snapshot conservado, permisos y cifras inválidas. UI descarta respuestas tardías, permite reintentar errores y no presenta ceros cuando falla. Publicación y validación remota pendientes; el objetivo completo permanece abierto.

Multirrubro/pesables: corregidas tres entradas del POS que agregaban una unidad entera al desactivar balanza. Los productos es_pesable siempre solicitan peso; la capacidad controla lectura USB/Serial y etiquetas de peso. El modal conserva ingreso manual y oculta USB si está desactivado. Ajustes aclara esta regla. Cinco regresiones nuevas; 515 pruebas en 39 archivos y build aprobados. No requiere SQL nuevo; falta publicación y piloto. Ver docs/verificacion-multirrubro-pesables.md. La fase completa y el objetivo permanecen abiertos.

Catálogo/multirrubro: corregido el guardado que borraba atributos de peso, envase y vencimiento al desactivar módulos. Dos regresiones reprodujeron pérdida de KG/PLU, depósito y alerta; ahora conserva atributos y cantidades fraccionarias. 517 pruebas en 40 archivos y build aprobados. Sin SQL adicional. Publicación y piloto pendientes. Servicios rápidos actualmente solo persiste la preferencia: aún no hay panel operativo conectado a tieneServiciosRapidos; su implementación sigue pendiente.

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
22/10/2026 — Evidencia local adicional PR03/F08: recuperación de constancia por getter privado SQL 014 y acción HTTP/cliente/modal, con Auth original y ledger/cuerpo/CAE coherentes. 249 pruebas dirigidas y 36 escenarios PostgreSQL locales PASS, build 646 módulos PASS. No acredita JWT/RLS/ARCA hospedados ni primera emisión: SQL fiscal 001–014 y Edge NO instalados/activados. Suite global en curso; gates permanecen parciales por rechazos/cancelación/NC, representación fiscal final, provisión/PV y aceptación. Envases descontados pendientes del contador, impresora/cajón y Point diferidos, restauración integral bloqueada. No modifica gates de transición Production ni autoriza consultas/emisiones por tener código preparado.
Cierre local del incremento de constancia: 2926 PASS / 1 skipped / 248 archivos, omitida sólo fixture F6 preexistente, además de 249 dirigidas, 36 escenarios PostgreSQL y build 646 PASS. Sustituye suite en curso anterior sin cambiar gates PR03/PR02 ni autorizar instalación/emisión. Evidencia íntegra y restricciones en el ExecPlan existente.

22/10/2026 — Evidencia local adicional F08: SQL 015/worker conservan recepción de emisión de forma privada e inmutable, ligada a intento/hash/Auth original de permiso consumido. 202 pruebas dirigidas y 38 escenarios PostgreSQL locales PASS, build 646 PASS; suite global en curso. No cambia estado PR03 a PASS: falta resolución/corrección/cancelación/NC, representación fiscal final, provisión/PV y aceptación hospedada. SQL 001–015/Edge sin instalar/activar, cero nuevas consultas/emisiones reales o deploy. Un rechazo recibido no libera número ni habilita reenvío; impresora/cajón/Point diferidos, restauración integral bloqueada y envases descontados pendientes del contador.
Cierre local del incremento de auditoría fiscal: 2979 PASS / 1 skipped / 249 archivos, única omitida fixture F6 no configurada; 202 dirigidas, 38 PostgreSQL y build 646 PASS. Sustituye estado de suite en curso anterior sin cerrar PR03/PR02 ni habilitar instalaciones/emisiones. SQL 001–015/Edge siguen sólo preparados para instalación remota autorizada. Diagnóstico y resolución definitiva de rechazo/corrección/cancelación/NC siguen pendientes.

22/10/2026 — F08 diagnóstico: SQL 016/HTTP/cliente/modal hacen visible recepción y última consulta con gate activo de Dueño/comercio/venta y Auth original. Sólo lectura, sin TA/red fiscal, mensajes libres ni permiso de reenvío. 295 pruebas dirigidas, 40 PostgreSQL y build 649 PASS; suite global actual en curso. No cierra PR03/PR02: resolución/corrección/cancelación/NC, representación final, provisión/PV y aceptación hospedada pendientes. SQL 001–016/Edge sin instalar/activar remotamente, flags apagados, cero consultas/emisiones ARCA nuevas o deploy. Continúan los diferidos y dependencias del titular.
Cierre local de diagnóstico: 3031 PASS / 1 skipped / 250 archivos, única omitida fixture F6 no configurada; 295 dirigidas, 40 PostgreSQL y build 649 PASS. Sustituye suite en curso anterior; evidencia sintética no acredita aceptación hospedada ni CAE real. SQL 001–016/Edge siguen preparados sin instalación/activación remota; resolución/corrección/cancelación/NC y gates comerciales permanecen pendientes.

22/10/2026 — Avance local F08: cancelación SQL previa a numeración con historial inmutable e identidad global que bloquea POST tardío, una sola preparación activa y Auth original. 289 dirigidas, 47 PostgreSQL y build 649 PASS; suite global en curso. No acredita flujo completo: faltan servicio/HTTP/cliente/modal y aceptación. Exige funciones 001/002/012 de esta revisión antes de 017; instalación remota sigue cerrada. Cuerpo/reserva/envío/CAE no son cancelables por esta vía. PR03/PR02 continúan parciales y los demás gates/diferidos se mantienen.
Cierre local de SQL de cancelación: informe 3048 PASS / 1 skipped / 250 archivos, success=true; 289 dirigidas, 47 PostgreSQL y build 649 PASS. Sustituye suite en curso anterior; integración servicio/HTTP/cliente/modal continúa pendiente. No se instaló SQL/Edge ni se ejecutó consulta/emisión fiscal real. Detalle de recuperación tras interrupción de revisión automática conservado en el ExecPlan.

22/10/2026 — Integración local F08 de cancelación sin número: Auth original durante escritura/recuperación, DTO cerrado, confirmación UI y retiro exclusivo del pendiente sólo tras cierre durable; corrección con UUID nuevo. 322 dirigidas, backend PostgreSQL 47 previo sin cambios y build 651 PASS; suite global en curso. No acredita Web Locks en dos ventanas reales ni JWT/RLS/visual hospedados; versiones/pestañas compatibles forman parte de aceptación. SQL 001–017/Edge aún sin instalar/activar remotamente. PR03/PR02 permanecen parciales y los diferidos/dependencias del titular siguen vigentes.
Cierre local de integración: suite 3086 PASS / 1 skipped / 251 archivos, única omitida fixture F6, salida 0; 322 dirigidas, build 651 PASS y backend PostgreSQL 47 previo sin cambios. Sustituye suite en curso anterior para este incremento. Cancelación/corrección antes de número integrada, sin instalación/activación remota ni CAE real. Aceptación Web Locks/versiones/JWT/RLS/visual y resolución posterior a reserva/envío/NC permanecen abiertas.

### 22/10/2026 — PR03/F08: corrección reservada anterior a intención

Backend SQL 018 preparado localmente: conserva cuerpo/historia original y transfiere la misma reserva a una preparación sucesora, sin liberar número, consultar ARCA ni heredar revisión/permiso. Corrige sólo la misma serie antes de intento; incertidumbre/rechazos/NC continúan pendientes. 51 escenarios PostgreSQL locales PASS con carreras de intención revisada/sustitución y rollback, sin solicitudes externas ni emisión. Integración de servicio/HTTP/cliente/UI, suite global/build y aceptación hospedada aún pendientes de cierre del incremento. No instalar SQL 018 aislado ni reintroducir funciones antiguas: requiere familia 001–017 de la revisión compatible. Sin instalación fiscal remota/activación, deploy, merge ni cambios master/Production. Gate contador para envases y diferidos físicos conservados.

Cierre de validación local de SQL 018: 3103 PASS / 1 skipped / 251 archivos, salida 0 observada (pilot-reserved-replacement-suite-results.json). Única omitida fixture F6_C3A_CANDIDATES_PATH sin configurar; ninguna fiscal nueva omitida. Después de esa suite sólo se corrigieron anotaciones TypeScript de filas de fixtures: 160 dirigidas / 4 archivos PASS posteriores y build final PASS 651 módulos (pilot-reserved-replacement-build-typed-final.log). Los primeros errores de ambigüedad SQL y de fixtures/tipado quedaron corregidos; el build anterior fallido no cuenta como PASS. 51 escenarios PostgreSQL 17.11 PASS finales con intención revisada y contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL y diff PASS; oxlint sin nuevos hallazgos, conserva warning preexistente no-unsafe-finally del runner. Escaneo 1255 archivos/49 candidatos, sin nuevos candidatos frente al cierre anterior. El incremento cierra sólo la transacción SQL local; siguen pendientes servicio/HTTP/cliente/UI con recuperación durable y revisión de la sucesora, resolución posterior a intención/rechazo/NC, representación fiscal final y gates hospedados. No instalación remota SQL 001–018/Edge, activación, deploy, nuevas consultas ARCA autenticadas, CAE real, merge o cambio master/Production. Restauración integral bloqueada; contador/envases y diferidos físicos conservados.

### 22/10/2026 — PR03/F08: sustitución reservada integrada localmente

Servicio/HTTP/cliente/modal permiten corregir RESERVADA con nueva identidad, confirmación y revisión, conservando número/historia. Recuperación sólo por cierre durable; descarte cierra únicamente UUID sucesor no creado y bloquea POST tardío, o recupera la sustitución si ganó. No hay herencia de permiso ni acción EMITIR. Se corrigió incompatibilidad de canónico JSONB::text detectada al integrar revisión real; SQL 018 serializa igual que el verificador TypeScript y rechaza historia incompatible sin reescritura. 338 dirigidas PASS / 8 archivos; 53 escenarios PostgreSQL del primer pase integrado PASS. Suite/build y pase SQL final en curso. Pendientes: rechazo/incertidumbre posterior a intención/NC, representación final y aceptación hospedada con PV/custodia/parámetros acreditados. Sin instalación remota, activación o deploy; contador/envases y diferidos físicos conservados, restauración integral bloqueada. Historial de gates/evidencia anterior no se sustituye por PASS hospedado.

Cierre integrado de sustitución reservada y recuperación entre equipos: 3166 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-replacement-two-terminals-suite-results.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 341 dirigidas / 8 archivos PASS y 54 escenarios PostgreSQL 17.11 PASS finales (fiscal-replacement-two-terminals-concurrency-20261022.json), incluidos propuestas distintas, ambos órdenes sustitución/intención y descarte/sustitución, rollback y ACK recuperable. Dos almacenes independientes cliente→HTTP→SQL recuperan la ganadora sin cancelar su cuerpo/número. Build final PASS 653 módulos, manifiesto histórico 43 SQL, diff y bundle privado (cero coincidencias) PASS; oxlint sin nuevos hallazgos, warning preexistente del finally del runner conservado. Escaneo 1258 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos, datos conservados, cero solicitudes ARCA autenticadas o emisiones reales. Sustituye las notas de suite en curso para esta integración; el pase previo 3163 se conserva con su alcance anterior.

El flujo reservado anterior a intención queda integrado localmente, incluida la corrección de canónico y el rechazo de instalación sobre historia incompatible. No acredita navegador/visual/Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados. SQL fiscal 001–018 y Edge sin instalar/habilitar remotamente; flag nuevo sin activar, ningún deploy, CAE real, merge o modificación de master/Production. Siguiente bloque local: resolución/corrección posterior a intención/rechazo definitivo y notas de crédito, junto con representación fiscal final. Provisión privada, punto de venta y parámetros reales, aceptación aislada/hospedada y primera emisión homologada expresamente autorizada conservan sus gates. Envases descontados bloqueados hasta criterio del contador; restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales, sin declarar Production Readiness.

### 22/10/2026 — PR03/F08: rechazo recibido, archivo de intento y sucesora (privado/local)

SQL 019 y trabajador privado preparados para R explícito con detalle: ausencia estricta FECompConsultar/602 y numeración posterior N−1 frescas, misma serie/número, Auth original y datos nuevos. Se archivan sin borrar reserva/intento/recepción/consultas y sus FKs; sucesora sin permiso/revisión heredados. Gate nuevo cerrado; no ruta HTTP ni UI de esta clase todavía. 280 dirigidas / 5 archivos y 61 escenarios PostgreSQL PASS, incluido vencimiento después de lock de catálogo y exclusión global. Build/suite final en curso. No instalación/activación SQL 001–019/Edge, tráfico ARCA autenticado o emisión real, deploy, merge o cambio master/Production. Siguen UI/aceptación de rechazo, incertidumbre sin R, NC, representación final y gates de provisión/PV/parámetros. Contador/envases, restauración bloqueada y diferidos físicos conservados.

### 23/10/2026 — Cierre recuperado del incremento privado de rechazo

Suite completa 3227 PASS / 1 skipped / 252 archivos, salida 0 observada al recuperar el mismo handle (pilot-fiscal-rejected-correction-suite-results.json). No se reinició por el cambio de turno/fecha. Única omitida fixture histórica F6_C3A_CANDIDATES_PATH sin configurar, ninguna fiscal nueva omitida. 280 dirigidas / 5 archivos PASS y 61 escenarios PostgreSQL 17.11 PASS finales (fiscal-rejected-correction-final-v2-concurrency-20261022.json). Build final PASS 653 módulos; manifiesto histórico 43 SQL, diff y bundle privado PASS (cero coincidencias de trabajador/gate/RPC privados). SDK limitado a 29 RPC. Oxlint sin nuevos hallazgos; warning preexistente del finally del runner conservado. Scan 1260 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos/datos conservados; cero solicitudes externas/emisiones reales. El fallo de sintaxis inicial del runner quedó corregido y su log conservado; no produjo un contenedor ni se contó como PASS.

El contrato SQL 019 y trabajador privado de R con detalle quedan preparados localmente; no se cierra el flujo de usuario de esa clase todavía. Siguiente: integrar elegibilidad/confirmación/recuperación HTTP–cliente–modal, sin permitir R automático desde timeout/Errors sin detalle, y exigir nueva revisión/permiso para la sucesora. Incertidumbre sin R, notas de crédito, representación fiscal final, provisión/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual continúan pendientes. SQL 001–019 y Edge sin instalación/activación remota por nosotros; no activación de flags, deploy, consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. Se conservan contador/envases, restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales; este cierre no acredita Production Readiness.

### 23/10/2026 — Avance PR03/F08: corrección R con propuesta y confirmación

Integración local HTTP/cliente/modal: propuesta explícita v2/RECHAZO, compatibilidad v1 de reserva, recuperación de mismo UUID, descarte de sucesora local no creada y revisión nueva sin permiso heredado. No convertir incertidumbre en R. 361 dirigidas PASS/5 archivos y build 654 módulos PASS; regresión completa en curso. Evidencia detallada en .agent/execplans/arca-homologation.md. PR03/PR02 permanecen parciales: incertidumbre sin R, NC, representación final y aceptación hospedada/provisión/PV/parámetros/CAE pendientes. Sin instalación/activación fiscal remota, deploy, consultas ARCA autenticadas, emisión, merge o cambios master/Production. Contador/envases pendiente, restauración integral bloqueada, impresora/cajón/Point diferidos.

### 23/10/2026 — Cierre local de propuesta y formulario R

Suite completa 3271 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-rejection-ui-suite-results-20261023.json); única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 361 dirigidas PASS / 5 archivos, build final PASS 654 módulos (pilot-fiscal-rejection-ui-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS; scan 1262 archivos/49 candidatos sin nuevos pares ruta/tipo y backend privado ausente del bundle. El aviso de sourcemap html5-qrcode y el tamaño de chunks no son errores de prueba/build. SQL 001–019 y transacciones no cambiaron: no se repitió PostgreSQL nativo; los 61 escenarios anteriores son historia, no una aceptación nueva. La propuesta R, confirmación, recuperación/descarte y vuelta a revisión quedan integradas localmente. Falta aceptación real visual/JWT/RLS/Edge/Web Locks y comportamiento externo con custodia/PV/parámetros acreditados; no hay CAE real ni Production Readiness. Continúan incertidumbre sin R, NC y representación fiscal final. Sin consultas ARCA autenticadas, instalación/habilitación fiscal remota, flags, deploy, merge o cambio master/Production. Contador/envases bloqueado, restauración integral bloqueada y físicos/Point diferidos.

### 23/10/2026 — PR03: conciliación ligada a identidad y ACK durable

Se prepara SQL 020 y ruta privada de conciliación con binding exacto bajo locks, Auth original acreditado por los hechos existentes y recuperación por getter después de ACK perdido. Gate de consultas nuevas cerrado, replay sin TA/red. 479 dirigidas y 64 escenarios PostgreSQL locales PASS; build 654 módulos PASS, suite completa en curso. No aceptación hospedada ni emisión/CAE real. Ver ExecPlan arca-homologation; faltan UI/observación persistente y encadenamiento de conciliación interna, NC/representación final, custodia/PV/parámetros y JWT/RLS/Edge/E2E. SQL 001–020/Edge sin instalar/habilitar, flags/deploy/master/Production intactos. PR03/PR02 parciales, restauración bloqueada, contador/envases pendiente y físicos/Point diferidos.

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

### 24/10/2026 — PR03: transporte verificado de unidades históricas NC
Se incorporó por fast-forward c7dbacd (objetivo común de .agent/PLANS.md), preservando cambios locales. Este incremento reduce el blocker de elegibilidad NC de PR #3/PR03 y la dependencia de PR02; no cierra esos gates.
Contrato031 cerrado ligado a factura026 y fuente comercial030: canónico/hash recomputado, IDs/receta/cantidades exactas, unidades literales y metadata profundamente congelada. CAPTURADAS conserva hechos, NO_REGISTRADAS requiere null explícito; errores nunca se convierten en ausencia. Ningún estado concede emisión, reintegro o reposición. Fuente030 conserva combos pesables fraccionados admitidos por checkout; la política de devolución sigue separada. No se infieren unidades del catálogo actual.
Servicio verifica Auth una vez y transmite ese mismo actor a las tres RPC; SQL vuelve a comprobar autorización. HTTP UNIDADES_NC sólo lectura, objeto cerrado/2KiB y gates existentes; SDK44→45RPC. Cliente captura entradas antes de esperar, revalida y no usa storage. Pruebas cruzan checkout real local → factura sintética → SQL030/031 → HTTP, incluidos combo pesable, ausencia y reasignación Auth entre consultas.
Evidencia local: selección432 PASS/7archivos (pilot-credit-units-targeted-v2-20261024.log); buildv2 PASS, oxlint dirigido limpio, manifiesto43/diff PASS. PostgreSQL17.11:108 escenarios PASS (credit-units-transport-concurrency-v1-20261024.json), fases73antes025,14después025/026,8después027,5después028/029,4después030,4después031; cero solicitudes externas/emisiones, contenedor propio detenido/datos conservados. Escáner1320archivos/49candidatos, sin nuevos pares ruta/tipo. Suite global anterior es histórica y no prueba este HEAD. Primer build falló por tipos de fixtures; corregidos y verificados sin relajar validación. Intento ESLint no aplicaba al proyecto (sin configuración); se usó oxlint declarado en package.json.
SQL001–031/Edge/flags no instalados ni activados remotamente; sin secretos, ARCA autenticada nueva, CAE, merge o cambios master/Production. Aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual pendiente; no confundir esta evidencia con Staging. Restauración integral bloqueada; incluir tablas privadas en futuro dump/restore autorizado. Impresora/cajón/Point diferidos.
Siguiente blocker local: elegibilidad explícita y formulario de caso NC usando fuente comercial y unidades acreditadas, sin autorizar automáticamente ventas históricas sin registro ni tratamiento de envases pendiente del contador; después catálogo/cuerpo/revisión/serie/worker/conciliación NC y aplicación única sólo tras CAE NC confirmado. Al cierre técnico definitivo de PR #3 ejecutar suite global y controles sobre ese HEAD antes de aceptación hospedada autorizada.

### 24/10/2026 — PR03: hechos originales visibles para preparar NC
Panel NC incorpora consulta explícita/revalidada de pagos, receta y unidades históricas030/031, con ausencia y errores diferenciados, fuentes ajenas/respuestas tardías rechazadas y sin efectos de caja/stock.132 PASS/5archivos, buildv1/oxlint/manifiesto43/diff PASS; escáner1322/49 sin nuevos pares ruta/tipo. Evidencia completa en .agent/execplans/arca-homologation.md (consulta visible de hechos originales). Formulario/guardado, elegibilidad final, catálogo/cuerpo/worker NC y aceptación hospedada siguen pendientes. No se cierra PR03/PR02; sin instalación/activación remota, CAE, merge o cambios master/Production. Restore integral bloqueado; impresora/cajón/Point diferidos.

### 24/10/2026 — PR03: formulario de caso NC preparado localmente
Captura explícita sin defaults/IVA proporcional, precomprobación contra unidades/receta originales y guardado mediante cliente durable. Confirmación humana y UUID estable; contenido congelado tras primer envío, ACK exacto, pendiente recuperable y fallo de historial separado de resultado confirmado.413 PASS/8archivos, buildv3/oxlint/manifiesto43/diff PASS; escáner1325/49 sin nuevos pares ruta/tipo. Evidencia y límites en ExecPlan ARCA. Elegibilidad comercial final bajo locks, catálogo/cuerpo/worker NC y aceptación hospedada siguen pendientes; no cierra PR03/PR02. Sin SQL/Edge/flags remotos, CAE, merge ni master/Production; restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: vínculo comercial NC preparado (SQL032)
Todo caso nuevo exige y conserva fuente comercial030 y unidades031 verificadas en la misma transacción de reserva; ausencia/cantidad/receta incompatible revierte caso/saldo/vínculo. Historia antigua se conserva sin backfill y sin acreditar elegibilidad por replay. Tabla privada inmutable, no concede emisión ni dinero/stock.331 PASS/5archivos, buildv3/manifiesto43/diff PASS, lint sin hallazgos nuevos; PostgreSQL17.11:112 PASS (4después032), cero solicitudes/emisiones externas; escáner1326/49 sin nuevos pares ruta/tipo. Evidencia y fases en ExecPlan ARCA. No instalado/habilitado remotamente; incluir vínculo en futuro dump/restore autorizado. Catálogo/preparación/revisión/worker/conciliación NC y aplicación única con CAE confirmado siguen pendientes; PR03/PR02 parciales, Production/master intactos, restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: catálogo/contexto NC preparado (SQL033)
Catálogo separado sin filas/activación, tipos/condiciones/IVA y vigencias explícitos. Contexto sólo lectura exige caso activo/vínculo, fuente/unidades actuales coincidentes, emisor capturado y parámetros NC vigentes después de locks. DTO ligado/cerrado/congelado sin permiso.358 PASS/4archivos, buildv2/manifiesto43/diff PASS; PostgreSQL17.11:116 PASS (4después033), cero solicitudes/emisiones externas; escáner1329/49 sin nuevos pares ruta/tipo. Detalles/fases/límites en ExecPlan ARCA. SDK45 sin ampliación: pendientes transporte/UI, preparación/cuerpo/revisión/worker NC, provisión real y aceptación hospedada. SQL001–033/Edge sin instalación/activación remota; sin CAE, merge ni master/Production. Incluir catálogo privado en futuro dump/restore autorizado; restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: contexto NC conectado al panel
Consulta manual ligada a caso/factura/hash, Auth único, petición cerrada2KiB con ID/hash y fuente privada034 del canónico durable. SDK46RPC; cliente sin storage y panel descarta respuestas ajenas/tardías, no ofrece emisión ni dinero/stock.448 PASS/7archivos, buildv4/manifiesto43/diff PASS, lint sin hallazgos nuevos; PostgreSQL17.11:118 PASS (2después034), cero solicitudes/emisiones externas; escáner1334/49 sin nuevos pares ruta/tipo. Evidencia/fases/límites en ExecPlan ARCA. Pendiente preparación durable/cuerpo/revisión/worker NC y aceptación hospedada; PR03/PR02 parciales. SQL001–034/Edge/flags sin instalación/activación remota, sin CAE/merge/master/Production. Restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: preparación NC durable sin numeración (SQL035)
Datos canónicos/hash separados de factura v1, ligados a caso/contexto/fuente/unidades y asociación original exacta. Períodos de servicios/mixtos explícitos, sin copiar defaults. Una preparación inmutable por caso, replay/lectura histórica/rollback/cancelación sin número ni permiso.387 PASS/6archivos, buildv2/manifiesto43/diff PASS, lint sin nuevos hallazgos; PostgreSQL17.11:123 PASS (5después035), cero solicitudes/emisiones; escáner1337/49 sin nuevos pares ruta/tipo. Fases/evidencia/límites en ExecPlan ARCA. SDK46/HTTP/UI aún sin035: pendientes transporte/lectura validada/captura/revisión, cuerpo numerado y worker/conciliación NC, aplicación única con CAE y aceptación hospedada. Sin instalación/activación remota SQL001–035/Edge/flags, CAE, merge o cambios master/Production. Tabla nueva debe incluirse en dump/restore privado futuro; restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: cargador TA NC cifrado integrado con SQL039
Cargador privado específico NC, sin convertir binding/permiso de factura. AES-GCM real con claves efímeras sintéticas; coordinación global por certificado y vínculo NC propio. Integración PGlite con039 instalado dos veces prueba reutilización entre instancias, ACK CONFIRMAR perdido recuperable, ACK INICIAR perdido sin cancelar/reenviar y fallo de clave previo que libera sólo preparación. No alteración de venta/stock/caja. Selección538 PASS/5archivos (credit-loader-final-tests.log), incluyendo367 SQL embebidos y98 persistencia heredada; no suite global ni aceptación hospedada. Build PASS (credit-loader-final-build.log), lint sin hallazgos, manifiesto bootstrap43/diff PASS; símbolos privados ausentes del bundle. Prueba filtrada previa4PASS/363omitidos sólo diagnóstica, no sumar como cobertura adicional. Sin cambios SQL: concurrencia nativa137 previa permanece evidencia de039, no prueba nueva del cargador.
Pendientes: custodia/CMS NC específico, worker numeración con recuperación037 y reserva036, revisión/permiso/intención/envío/conciliación/resolución NC y aplicación comercial única después de CAE. ACK SOLICITAR perdido conserva preparación y requiere recuperación controlada; no renovación automática. SDK incluye coordinación privada039, sin HTTP/UI ni activación nueva. SQL001–039/Edge/flags no instalados/activados remotamente por nosotros, sin secretos reales, consultas ARCA autenticadas nuevas, CAE, merge, master o Production. PR03/PR02 parciales; restore integral bloqueado; impresora/cajón y Point diferidos. Este bloque se publica en rama del PR3 conservando historial.

### 24/10/2026 — PR03: numeración/recuperación NC privada preparada
Worker nuevo captura Auth original una sola vez, recupera cuerpo037 antes de TA, revalida fuente038 antes de claves/consultas y coordina TA039; reserva036 una vez y acredita cuerpo/hash por GET037. Gate privado ARCA_HOMO_CREDIT_NUMBERING_ENABLED apagado por ausencia, sin endpoint/UI nuevos. Recuperación de cuerpo existente admite gate de numeración cerrado; gate backend/proyecto y autorización siguen exigidos. Otro trabajador ganador prevalece incluso entre lectura inicial y fuente vigente. No emisión/CAE ni efectos comerciales.
Evidencia:477 PASS/5archivos antes del último ajuste;9 escenarios integrados finales PASS/367omitidos por filtro, buildv2/lint/manifiesto43/diff PASS. Intercalaciones sintéticas PGlite, no nueva concurrencia nativa ni aceptación hospedada. Detalle/logs/historial en ExecPlan ARCA. Pendientes transporte/identidad durable de reserva cliente, revisión/permiso/intención/envío/conciliación/resolución NC y devolución/reposición sólo tras CAE. SQL001–039/Edge/flags sin instalación/activación remota por nosotros; sin secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: revisión humana NC durable preparada (SQL040)
Revisión específica de cuerpo numerado NC, separada de factura y de permiso de envío. Tabla privada/inmutable liga UUID de revisión, caso/reserva, Auth original, cuerpoSHA/preparaciónSHA y contexto de emisor/catálogo/hechos comerciales. Vencimiento fijado a diez minutos, replay histórico no lo extiende ni acredita vigencia actual. Nueva aprobación exige Dueño activo único/no SuperAdmin, cuerpo exacto y contexto033 vigente igual al conservado en035. Getter histórico ligado a037; no permite aportar un cuerpo alternativo ni borra historia al revocar emisor. Revalidación tras INSERT/espera evita acreditar aprobación nueva con contexto vencido/cambiado. Contrato TypeScript reconstruye cuerpo/hash y rechaza aprobaciones ajenas/extra/alteradas; es evidencia histórica, no autoridad/permiso.
Evidencia:415 PASS/2archivos (385 SQL embebidos +30 contrato/cuerpo NC, credit-owner-review-final-tests.log). Nueve escenarios040 y alteraciones de DTO; instalación/reaplicación040 explícitas por fixture con ROLLBACK, baseline histórico por fases se conserva. PostgreSQL17.11 nativo140 PASS:137 anteriores,3 después040 instalado dos veces (credit-owner-review-native-v1.json/.log): dos trabajadores misma revisión un ACK/vencimiento, emisor revocado y Auth reasignado esperando bloquean aprobación. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-e460972f detenido/datos conservados. Build PASS, lint del cambio sin hallazgos; runner conserva warning no-unsafe-finally previo. Manifiesto bootstrap43/diff PASS no valida opcional040; símbolos privados ausentes del bundle.
Pendientes: conectar transporte/SDK privado y captura/revisión visible con UUID durable, separar aprobación histórica de vigencia al conceder futuro permiso, intención/envío/FECompConsultar/resolución NC y aplicación comercial única sólo tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, llamadas ARCA autenticadas nuevas, CAE, merge/master/Production. PR03/PR02 y aceptación hospedada siguen parciales. Dump/restore privado futuro debe incluir revisiones NC además de diario/TA/unidades/reservas; JSON app no lo cubre y restore integral permanece bloqueado. Impresora/cajón/Point diferidos. Se publica incremento probado en rama del PR3.

### 24/10/2026 — PR03: revisión NC conectada al servicio/HTTP privado
Auth único/scope original, cuerpo/caso/hash reconstruidos, un POST de aprobación y confirmación sólo por GET durable ante ACK perdido. HTTP REVISION_NC y APROBAR_REVISION_NC cerrados2KiB, UUID/hash estrictos y gate privado de escritura ARCA_HOMO_CREDIT_REVIEW_ENABLED apagado por ausencia. Recuperación histórica con gate de escritura cerrado mantiene autorización backend/origen/actor. DTO explícito sin contexto/custodia; no emite ni concede permiso. SDK54RPC.565 pruebas/3archivos PASS, build/lint/manifiesto43/diff PASS y símbolos privados ausentes del bundle. Detalle y límites en ExecPlan fiscal; SQL040 sin cambios,140 nativas previas no sustituyen aceptación hospedada HTTP/JWT/RLS.
Pendientes cliente/pantalla con identidad durable y recuperación previa, transporte de numeración, permiso/intención/envío/conciliación/resolución NC y aplicación única tras CAE. Sin instalación/activación remota SQL001–040/Edge/flags, secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 siguen parciales, restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — PR03: cliente durable de revisión NC preparado
Cliente de revisión integrado a credits del cliente fiscal y exclusión compartida existente por venta. Reconstruye el wire canónico/hash contra fuente/propuesta/preparación explícitas verificadas, sin confiar en datos fiscales recibidos ni en campos extra. Antes de POST persiste y relee sólo7campos (version/operación/caso/propuestaSHA/preparaciónSHA/cuerpoSHA/revisiónUUID), aislados por Auth/comercio/venta; no guarda canónico/PII. Un POST y GET del mismo UUID, ACK perdido recuperable. Pendiente incierto sobrevive recarga y approve con pendiente sólo recupera, sin nuevo POST/UUID; hash/ACK ajenos no lo retiran. Fallo storage impide POST. Guardado de casos/preparación y cancelación se bloquean mientras hay revisión incierta; recuperar sigue disponible. API cliente permite leer/revisar/recuperar pero pantalla de aprobación todavía pendiente.
Evidencia:511 PASS/5archivos cliente/contrato/SQL (credit-review-client-final-tests.log),75 PASS/2pantallas existentes (credit-review-client-ui-tests.log). Tras corrección de tipado en prueba de respuesta ajena39 PASS del archivo afectado repetidos (credit-review-client-post-types-tests.log); no sumar como pruebas únicas extra. Buildv1/v2 detectó fixtures y tipado de prueba desactualizados; se corrigieron sin casts ni relajar tipos y buildv3 PASS. Lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS. Validadores puros/acciones HTTP entran al navegador por diseño; RPC SQL/custodia privada y prefijos de secretos ausentes del bundle. SQL/HTTP sin cambios,140 nativas y565 transporte previas no acreditan navegador/Web Locks/aceptación hospedada actuales.
Pendientes: pantalla NC con recuperación antes de confirmar, transporte controlado de numeración y UUID durable correspondiente, permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación comercial sólo tras CAE. Aprobar/reconstruir un cuerpo no acredita vigencia actual, Auth/RLS hospedado ni permiso de emisión. SQL001–040/Edge/flags sin instalación/activación remota por nosotros, sin provisión/uso de secretos reales, nuevas consultas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos. Se publica incremento probado en rama del PR3.

### 24/10/2026 — PR03: pantalla de revisión NC integrada
Panel del Dueño integrado dentro de preparación activa verificada, en el historial NC existente y detrás de sus gates actuales. Consulta manual, sin red/aprobación al abrir. Recupera pendiente antes de consultar revisión nueva; valida nuevamente wire/cuerpo/hash/preparación. Muestra numeración reservada sin emitir, emisor/receptor/asociación, fecha/períodos dd/mm/aaaa, líneas/importes/IVA/tributos y referencia hash. Checkbox explícito antes de guardar; guard de operación simultánea, bloqueo tras respuesta incierta y descarte de respuestas tardías al cambiar cuerpo. Aprobación se presenta como constancia con vencimiento registrado, nunca CAE ni permiso vigente. No botón de emisión, efectivo ni reposición. Se elimina contradicción del panel de preparación que decía sin número al poder existir reserva.
Evidencia:124 PASS/5archivos UI/contrato (credit-review-panel-final-tests.log); después se agregaron fechas de servicios/integración y12 PASS/2paneles (credit-review-panel-integration-tests.log), no sumar repetidas como suite única. Primera selección2fallos por matcher no configurado, corregido con aserción nativa sin dependencia nueva. Buildv3 PASS, lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS. RPC SQL/custodia/prefijos de secretos privados ausentes del bundle; validadores puros/acciones HTTP públicos esperados. No aceptación visual hospedada, Web Locks/JWT/RLS/Edge ni CAE nuevos; SQL/HTTP sin cambios.
Pendientes prioritarios: recuperación con reintento EXPLÍCITO del mismo UUID ante aprobación cuyo primer POST no se ejecutó (por ejemplo gate cerrado), sin reemplazar identidad ni renovar una aprobación ya persistida; transporte de numeración y su identidad durable; permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única después de CAE. La recuperación actual sólo hace GET: ausencia/error no prueban rollback y no retiran el pendiente. No activar este circuito remotamente antes de resolver esos pendientes y aceptación hospedada. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros, sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado, físicos/Point diferidos. Se publica incremento probado en rama del PR3.

### 24/10/2026 — PR03: reintento explícito NC conserva UUID y vencimiento
retryReview y pantalla permiten confirmar un reintento sólo sobre pendiente existente y cuerpo/hash/preparación originales. Recuperar primero; fallo de GET no prueba ausencia. Tras releer cuerpo autorizado, un único POST con el mismo UUID/hash; sin generar identidad ni retirar pendiente por error. Si la aprobación ya está confirmada, recuperar evita POST. Integración cliente→HTTP→SQL040 prueba gate cerrado sin escritura y ACK/lectura perdidos tras aprobación; replay conserva vencimiento exacto sin renovar. Checkbox explícito y ninguna escritura al consultar.524 PASS/6archivos, build/lint/manifiesto43/diff PASS, privado SQL/custodia ausente del bundle. SQL/HTTP sin cambios,140 nativas previas no equivalen a navegador/Web Locks/JWT/RLS/visual hospedados.
Queda implementado localmente el bloqueo documentado en dd8a3be. Pendientes: transporte/cliente de numeración con UUID durable; permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única tras CAE; aceptación hospedada. SQL001–040/Edge/flags sin instalación/activación remota por nosotros, sin secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos. Detalle/historial en ExecPlan fiscal.

### 24/10/2026 — PR03: transporte privado de numeración NC integrado
HTTP CUERPO_NC cerrado5campos y NUMERAR_NC cerrado7campos, máximo2KiB, IDs/hash estrictos y proyecto/origen/Auth/backend existentes. NUMERAR conecta worker NC con keyring/custodia/CMS/TA cifrado específicos; recupera037 antes de gates de trabajo nuevo/claves/consultas. Gate privado de numeración apagado por ausencia; sin activación implícita. CUERPO devuelve null sólo ante ausencia confirmada por037; errores no significan ausencia. DTO explícito canónico/hash/aprobaciónnull/emisiónfalse, sin contexto/custodia ni permiso de envío. Cuerpo existente prevalece incluso con gate de numeración cerrado; preparaciónSHA incompatible se rechaza. Sin acciones CAE.
Evidencia final578 PASS/5archivos (credit-number-http-final-v2.log), buildv3 PASS, lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS; RPC SQL/custodia/prefijos secretos ausentes del bundle. Siete escenarios HTTP integrados: ausencia, lectura histórica, recuperación, preparación distinta, gate cerrado, custodia ausente cancela preparación TA sin envío y flujo positivo de PKCS8 cifrado sintético→CMS firmado→WSAA/WSFE simulados→reserva036/GET037. Recuperación posterior no lee claves ni repite WSAA/WSFE. Primer ensayo positivo falló porque fixture de factura usaba permiso con huella fija; se corrigió fixture para copiar metadata del emisor sintético del ensayo, sin cambiar guard/ACL. Siete filtrados PASS/394omitidos (credit-number-http-positive-v2.log), incluidos en578, no sumar. Sin certificados/claves reales ni solicitudes externas. SQL sin cambios,140 nativas anteriores no son aceptación hospedada del transporte/JWT/RLS/Edge.
Siguiente: cliente de numeración con identidad durable antes de POST, recuperación037/CUERPO antes de repetir, reintento explícito mismo UUID y bloqueo de mutaciones mientras incierto; interfaz de reserva antes de revisión. Luego permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, nuevas consultas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales; restore integral bloqueado y físicos/Point diferidos. Se publica incremento probado en rama PR3.

### 24/10/2026 — PR03: identidad durable y recuperación de numeración NC en cliente
GET antes de POST, UUID/preparaciónSHA persistidos/releídos antes de NUMERAR_NC, ACK perdido confirmado sólo por cuerpo durable. Sólo6campos de identidad/hashes en storage Auth/comercio/venta, sin PII/canónico. Pendiente sobrevive recarga y bloquea mutaciones/aprobación; recuperación no repite POST. Reintento explícito con mismo UUID sólo tras ausencia confirmada; error de lectura no acredita ausencia. Reserva durable de otro trabajador del mismo caso/preparación prevalece sin adoptar otra identidad de solicitud.541 PASS/6archivos, buildv2/lint/manifiesto43/diff PASS. Integración cliente→HTTP→custodia/CMS sintéticos→WSAA/WSFE simulados→SQL demuestra ACK perdido y recuperación sin otra consulta/clave. No aceptación hospedada/Web Locks/JWT/RLS/visual nuevos, SQL/HTTP sin cambios.
Pendientes: interfaz de reservar/recuperar/reintentar antes de revisión; permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación única tras CAE. SQL001–040/Edge/flags sin instalación/activación remota por nosotros, sin secretos reales, llamadas ARCA autenticadas nuevas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado, físicos/Point diferidos. Ver historial/evidencia en ExecPlan fiscal.

### 24/10/2026 — PR03: interfaz de numeración antes de revisión NC
Preparación activa verificada integra consulta/recuperación de cuerpo; sólo ausencia confirmada ofrece reservar. Checkbox explícito informa número/datos inmutables y ausencia de emisión/CAE. Pendiente con ausencia confirmada ofrece reintento original; error/ACK perdido bloquea y conserva recuperación, sin nueva reserva automática. Cuerpo validado habilita revisión del Dueño como paso posterior, sin aprobar al abrir; respuestas tardías descartadas y resumen derivado de preparación canónica validada.143 PASS/6archivos UI/contrato, después14 PASS/2paneles de integración; buildv3/lint/manifiesto43/diff PASS y símbolos privados ausentes del bundle. No nueva aceptación visual hospedada/JWT/RLS/Edge/Web Locks; SQL/HTTP/clientes sin cambios.
Siguiente: permiso vigente ligado a cuerpo/aprobación/Auth/emisor y exclusión de intención/envío NC, luego FECompConsultar/resolución/aplicación única tras CAE. SQL001–040/Edge/flags sin instalación/activación remota por nosotros; sin secretos reales, consultas ARCA autenticadas nuevas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado, físicos/Point diferidos. Evidencia/historial en ExecPlan fiscal.

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


### 25/10/2026 — PR03: consulta NC conectada al endpoint privado, sin activación
Acción CONCILIAR_NC admite únicamente seis campos: acción, venta, operación original, caso, hash de propuesta y UUID de consulta; límite2KiB, sin actor/URL/credenciales/cuerpo enviados por cliente. Ensamblado con trabajador existente, custodia CONSULTA_NC bajo guard045 y WSAA específico. Recupera primero evidencia047 incluso con flag de consulta cerrado/custodia deshabilitada; nuevas consultas exigen flag privado existente. No agrega emisión ni efectos comerciales. Backend/proyecto/Auth vigentes siguen obligatorios.
Evidencia local:129 PASS HTTP (credit-consult-http-tests-v1.log),2 PASS SQL047 HTTP/509 omitidos por filtro (credit-consult-http-sql-v1.log). Recuperación por caso sin UUID original, ausencia de evidencia conserva409, cero acceso a claves/red en recuperación o gate cerrado, saldos intactos. Entradas extras/actor/URL/hash/UUID/límite rechazadas antes de Auth; error Auth sanitizado. Build/lint/diff/manifiesto bootstrap43 PASS; warning previo de chunks permanece. No nueva concurrencia ni suite SQL global511 acreditada. Sin secretos reales/ARCA autenticado/CAE real.
Siguiente: incidencias/conflictos durables y resolución de serie; completar envío NC042→FECAESolicitar y efecto comercial EXACTLY ONCE sólo después de CAE confirmado. SQL001–047/Edge/flags no instalados/activados remotamente por nosotros. CODE REVIEW y GO/NO-GO explícito con inventarios finales antes de instalación. PR03/PR02 parciales; master/Production sin cambios por este bloque, restore integral bloqueado y físicos/Point diferidos.


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

### 26/10/2026 — Candidato de cierre local en curso (sin GO remoto)
Integración controlada de envío/estado/conciliación NC, cliente durable e incidencias/recuperación en interfaz bajo flags independientes. SQL053 añade descubrimiento privado de permiso existente ligado a revisión/cuerpo, sin crearlo ni habilitarlo. Inventario candidato001–053, Edge, nombres de secrets/flags, prerrequisitos y orden/rollback en docs/arca-homologacion.md; evidencia y checklist vigentes en .agent/execplans/arca-homologation.md. PostgreSQL local180escenarios PASS,0peticiones externas/0CAE; no sustituye aceptación hospedada. Suite global final, revisión y publicación consolidada todavía pendientes. No nuevos commits parciales ni instalación/activación remota, secretos reales, ARCA/CAE, merge/master/Production. PR02/PR03 y Production Readiness siguen abiertos; restore integral bloqueado y físicos/Point diferidos.

### 26/10/2026 — Cierre local preparado para revisión única
Integración NC/recuperación/incidencias y aplicación comercial preparadas y verificadas localmente. Suite completa segmentada4747PASS/1skip/306archivos; PostgreSQL180PASS; build689módulos/salida0; lint0errores/137avisos previos; manifiesto43/diff/bundle/inventario53SQL PASS. Evidencia, fallos previos conservados y límites en Resultado final de .agent/execplans/arca-homologation.md; inventario/orden en docs/arca-homologacion.md. No GO ni instalación remota, flags/secretos reales, ARCA/CAE, merge/master/Production. PR03/PR02 y Production Readiness continúan pendientes de sus gates hospedados/reales; no cerrar objetivo global. Siguiente: CODE REVIEW final y GO/NO-GO explícito; restauración integral bloqueada y físicos/Point diferidos.

### Actualización de instalación fiscal — 26/10/2026

SQL001–053 del candidato9054cce instalados únicamente en Staging con GO explícito
y respaldo PostgreSQL privado verificado. Confirmación individual53/53; controles
hospedados de126funciones,41tablas/41triggers y70RPC privadas: PASS,0diferencias;
RLS activo, sin acceso directo y diarios fiscales vacíos. Evidencia y límites en
`.agent/execplans/arca-homologation.md` y `docs/arca-homologacion.md`.
PR03 sigue parcial: Edge/custodia/flags/JWT-RLS-E2E aún pendientes; PR02 sin CAE;
PR07 sin restore completo. Siguiente gate: autorización separada de Edge cerrado.
No cambios en Production/master; no merge ni comunicaciones ARCA.

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

### Aceptación parcial Dueño real y backend nuevamente cerrado — 26/10/2026

JWT ES256 real previamente aceptado. Ensayo8595c44: identidad/perfil OWNER
activo confirmado, tabla fiscal privada rechaza403 sin leer filas. Bajo GO
específico se abrió únicamente backend base durante32segundos y se retornó a
false; demás flags ausentes/cerrados. Registros hospedados corroboran Auth200
desde Edge, RPC de preparación403/PostgreSQL42501, devolución negativa409 y
logout local204. Verificación final503HOMOLOGACION_NO_HABILITADA/JWT ON.

PR03 sigue parcial: no acredita aceptación positiva, Cajero/otro comercio ni
E2E completo. No ARCA, CAE, provisión, otros flags, SQL/Edge nuevos, Vercel,
master/Production ni merge. El titular informa que no dispone de cuenta Cajero;
su preparación requiere alcance y autorización propios, no reasignar el Dueño.
Historial y evidencia detallados en el ExecPlan fiscal y guía ARCA existentes.

### Identidades reales y aislamiento SELECT de ventas — 26/10/2026

Dueño y Cajero reales acreditaron sus rechazos privados bajo backend base temporal,
con Auth200/RPC403/PostgreSQL42501, logout local y retorno del gate a false.
Posteriormente ambos observaron venta propia visible, venta ajena oculta y
relectura propia positiva con el mismo JWT, sin abrir backend. Verificación
independiente posterior confirmó existencia ajena en F4A activo, roles/scope y
RLS de ventas. PASS limitado a ese SELECT de ventas/actores/fixtures; no cubre
todas las tablas, escrituras, preparación fiscal positiva ni E2E completo.
PR03 parcial y PR02 sin CAE. Siguiente dependencia: alcance revisable de emisor/
catálogo y preparación positiva bajo nuevo GO, sin defaults fiscales antiguos.

27/10/2026: PR03 avanza con propuesta local de catálogo inactivo (6 alícuotas/11 condiciones) y validación PGlite; no importada ni activada. ALEY/49 excluidas del alcance 1/6/11. Punto WSFE aún sin acreditar; provisión/aceptación positiva/primer CAE requieren gates independientes. Evidencia, hash y vencimiento en ExecPlan ARCA. Production sin cambios en este bloque.

27/10/2026: catálogo público revisión1 instalado INACTIVO bajo GO específico y verificado por lectura independiente (6 IVA/11 condiciones, match exacto/RLS/acceso cerrado; emisores0). PR03 permanece parcial: falta acreditar PV y autorizar provisión/activación/aceptación positiva. Sin CAE ni cambios Production. Detalle y evidencia en ExecPlan fiscal.

27/10/2026: preparado diagnóstico local FECompUltimoAutorizado con punto/tipo explícitos y48 pruebas relacionadas PASS. No ejecutado contra ARCA. La lectura no acredita habilitación ni reserva. Titular confirmó que no dio de alta PV;602 de listado no demuestra necesidad de alta productiva. Acreditación específica WSFE/consulta autorizada/provisión permanecen pendientes; detalle en ExecPlan fiscal.

27/10/2026: PR03 elimina incompatibilidad de mínimo de contraseña entre preparador Windows y custodia (generación futura16, lector sin relajar). Interoperabilidad .NET→PKIJS/WebCrypto/CMS con material sintético acreditada,23 pruebas y build PASS; no claves reales/secretos remotos ni emisión. GO de diagnóstico de numeración recibido para después de07:04Argentina; aún no ejecutado. Custodia/provisión real y acreditación PV siguen pendientes.

27/10/2026: cierre local de renovación histórica de catálogos preparado (INSERT inactivo, baseline completo/hash, revisión siguiente y evidencia nueva; no sobrescribe ni activa). Suite integrada4853PASS/1skip históricoF6,311archivos/salida0; build689/oxlint enfocado/diff/bundle privado PASS. No nueva aceptación hospedada, renovación remota ni ARCA/CAE. GO de consulta PV2/tipo11 después de07:04 aún pendiente de ejecutar; PR03 y objetivo general siguen abiertos. Informe y SHA en ExecPlan fiscal.

27/10/2026 11:49Argentina: WSAA y lectura FECompUltimoAutorizado PV2/tipo11 PASS, último0, sin reserva/emisiones, GO consumido. Habilitación completa de emisión sigue no acreditada. Antes de contexto positivo se agrega localmente ARCA_HOMO_DATA_PREPARATION_ENABLED independiente de backend base, con revalidación antes de escritura;179pruebas dirigidas y build PASS, regresión integrada en curso. Runtime remoto anterior aún no tiene el control: nuevo despliegue cerrado necesita GO, sin provisión/activación por inferencia. Evidencia en ExecPlan fiscal.

27/10/2026: revisión de PR03 detectó EXECUTE autenticado sobre la preparación
heredada001, fuera de gates HTTP. SQL054 incremental preparado localmente para
retirar ejecutores externos, con guard de cuerpo/owner/seguridad y reemplazo
privado012 requerido;12 casos SQL y208 enfocados PASS. No instalado ni cubierto
por el GO001–053. Build689 PASS, lint0errores/137advertencias previas; regresión
integrada final pendiente de salida0. El siguiente ensayo positivo requiere
cerrar y verificar tanto SQL054 como el candidato Edge bajo GO nuevo. Conservar
los dos reportes globales FAIL por limpieza temporal F6 y su corrección acotada;
no convertir evidencia histórica o local en aceptación hospedada. PR03 parcial.

27/10/2026: cierre integrado local del incremento SQL054/gate independiente:
4885PASS/0FAIL/1skip históricoF6,313archivos,salida0; build689 PASS,
lint0errores/137advertencias previas y símbolos privados ausentes del bundle.
Evidencia/hash y fallos anteriores conservados en ExecPlan. SQL054 y nuevo
Edge cerrado sólo candidatos: revisión, respaldo actualizado y GO remoto
pendientes. Sin nuevas emisiones, provisión, flags, Vercel o Production.

27/10/2026: e21866d publicado en PR3 Draft. Asistente de respaldo previo054
preparado con verificación TOC explícita de41tablas fiscales+función/ACL heredadas,
15pruebas Windows PASS, build posterior689 PASS y preflight real PASS sin DB ni
secretos tras iniciar Docker Desktop. Copia actualizada real aún pendiente del
prompt privado local del titular; no acredita restore. GO054/Edge aún pendiente.
Detalle y límites de la suite anterior4885 en ExecPlan fiscal.

27/10/2026: respaldo actual previo054 confirmado por titular y verificado
independientemente (hashes, roles sin passwords, ACL privada y TOC48tablas +
función/ACL heredadas). No restore/Storage/copia externa/cifrado. Runner nativo
ampliado hasta054:183escenarios PostgreSQL17.11 PASS,0ARCA/0emisiones, contenedor
propio detenido. Reaplicación conserva datos/cuerpos/otros grants y preparación
privada concurrente sigue única. PR03 continúa parcial: próximo gate es GO nuevo
para SQL054 y Edge cerrado, después aceptación fiscal positiva autorizada.
Detalle, hashes y fallo previo de fixture comercial en ExecPlan fiscal.

27/10/2026: GO específico ejecutado para SQL054 y nuevo Edge cerrado en Staging.
Verificación hospedada126funciones/41tablas/41triggers sin diferencias; legacy
sin ejecución externa, preparación privada sólo service_role, conteos fiscales
sin cambios y catálogo inactivo. Paquete Edge íntegro comparado tras reload,
JWT ON y gateway/CORS/cierre503 PASS. No flags/secretos/Vercel/ARCA/CAE ni Production.
PR03 parcial: instalación cerrada no acredita provisión, preparación positiva,
roles/E2E completo o primer CAE. Siguiente alcance coordinado requiere sus GO;
no repetir WSAA ni prolongar catálogo como atajo. Evidencia en ExecPlan fiscal.

27/10/2026: preparado asistente local de custodia que reutiliza lector PKCS8 y
CMS desplegados; no red/exportación ni provisión.71pruebas sintéticas PASS,
build689/lint enfocado PASS y -Preparar real sólo metadatos READY. Uso de clave/
DPAPI originales aún requiere GO local específico; no autorizado por SQL054/Edge.
No se cargaron secretos ni abrieron flags. Compatibilidad original, custodia/
keyring hospedados y catálogo/TA coordinados siguen pendientes. ExecPlan fiscal
conserva fallos de fixtures/lanzador y su corrección; PR03 parcial, sin CAE.

27/10/2026: GO local original de custodia ejecutado una vez, PASS con lector y
firmador backend (clave no exportable, CMS/identidad verificados, red0,
provisiónfalse). Sin rotación/exportación ni cambios Supabase/flags/ARCA.22tests
sintéticos de ajuste posterior de salida PASS; no repetición original. Evidencia
conservada en ExecPlan. PR03 parcial: provisión/keyring/cache/catálogo y aceptación
hospedada positivos aún pendientes de alcances revisables y sus autorizaciones.

27/10/2026: titular cierra compatibilidad original b11e660 PASS, sin repetir CMS/
rotar/reproteger. Preparado mecanismo local para provisión inicial cerrada:
plan público exacto6nombres/IDs/revisión/hash/vigencia24h, baseline ausente y
13flagsfalse/ausentes; pipe privado en memoria sin nuevas pruebas originales.
95tests sintéticos/7archivos/0skip PASS, build689 y lint enfocado PASS. Controlador
UI importable sin lecturas privadas. Propuesta y límites en documentación fiscal/
ExecPlan; todavía NO autorizado cargar los6secretos ni leer originales para ello.
Provisión cerrada/metadatos tampoco acreditará keyring/TA funcional desde Edge.
PR03 parcial; catálogo vigente/emisor/aceptación positiva y primer CAE pendientes.
Sin SQL/Edge/Vercel/flags/Supabase/ARCA/Production nuevos ni merge.


27/10/2026: GO específico de6secretos Staging recibido. Provisión NO realizada:
entrega privada falló READ_PIPE y sonda pública sin originales acreditó pwsh
EPERM en entorno CUA. No valores introducidos/Save,6nombres nuevos ausentes y
6previos intactos; Edge503HOMOLOGACION_NO_HABILITADA. Clave original PASS no se
repite ni rota. Resolver canal privado permitido; no falta el GO ya otorgado.
Diagnóstico de runtime seguro32tests/build689/lint PASS, sin reintento original.
PR03 parcial y provisión/custodia hospedada aún pendientes. Evidencia en ExecPlan.


27/10/2026: alternativa al EPERM preparada para ejecución local del titular:
asistente PowerShell7.4 con PAT scoped ingresado privadamente, Management API
oficial Staging fija, GETbaseline/recheck, POSTúnico6valores y metadatos/dispose.
Modo Preparar nativo PASS sin red/originales;120tests/9archivos/0skip, build689,
lint enfocado/node/PS parse/bundle PASS. No POST real ni token solicitado.
GO6valores ya existe; falta ejecución local y aceptación de metadatos/Edge,
sin confundirlas con custodia/keyring/TA funcional hospedados. API sin CAS
documentado exige ventana exclusiva, sin retry ante ACK incierto. Detalle en
guía/ExecPlan fiscal; no cambios remotos/ARCA/CAE/Production/merge.


27/10/2026: ejecución real del operador READY pero provisión se detuvo en BASELINE,
write_attempted=false; no PRIVATE_COPY/POST. Causa remota aún desconocida.
Preparado modo diagnóstico GETúnico sin originales/carga, motivos seguros HTTP/
red/metadatos/política; mismo PAT local, no nuevo acceso ni respuesta API en chat.
143tests/9archivos/0skip, build689 y lint enfocado PASS. Esperar CUSTODY_BASELINE_*
antes de otra provisión. Custodia hospedada no instalada/acreditada por ese
resultado; PR03 parcial, sin ARCA/CAE/Production nuevos. Detalle en ExecPlan.


27/10/2026: diagnóstico real GET devuelve HTTP403, sin lectura original/escritura.
Inspección UI del token27/10 muestra Edge Functions/8endpoints, sin Secrets.
Preparada revisión (sin crear) de token sóloStaging/24h/Edge Function Secrets
Read-write. Valor y creación final a cargo titular; luego diagnóstico GET antes
de otra provisión. No se modificaron tokens existentes ni secretos/flags/ARCA.
PR03 sigue parcial. Evidencia/limitación de identidad PAT en ExecPlan.


27/10/2026: CLOSED_CUSTODY_PROVISION_METADATA PASS real. Operador confirmó6nuevos
digests contra valores en memoria, previos intactos/flags cerrados; UI independiente
confirma6nombres,12customsecrets/6previos iguales, revision/selector TA públicos
coincidentes. JWT ON y Edge503HOMOLOGACION_NO_HABILITADA posteriores. No valores
revelados ni CMS original repetido. GO6valores consumido; no repetir carga.
Custodia funcional Edge/cacheTA/emisor/catálogo/aceptación positiva/primer CAE
siguen pendientes. Próximo local: emisor inactivo revisable, luego catálogo/TA
coordinados y sus GO. No flags/ARCA/SQL/Edge/Vercel/Production/merge por este cierre.
Evidencia y límites en ExecPlan; PR03 parcial, sin nueva suite/build documental.

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
