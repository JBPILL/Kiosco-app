# KioskoPOS — revisión del plan operativo y comercial

**Estado actualizado: 21/10/2026.** Implementación en curso. El registro siguiente
es el resumen vigente; la evaluación original del 05/10 y las notas de avance
del final se conservan como historial. Sus conteos y menciones de publicación
pendiente describen aquella ejecución, no el estado actual.

## Production Readiness — gates permanentes (20/10/2026)

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
