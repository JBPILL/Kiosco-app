# Completar módulos pendientes del piloto

## Objetivo
Completar y verificar el registro vivo del plan operativo y comercial, con evidencia local y de Staging diferenciada.
Los gates permanentes PR01–PR11 del [plan canónico](../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026)
definen la aceptación de Production Readiness. No sustituirlos por conteos de tests
ni duplicar su matriz. Los resultados históricos de este plan se conservan.

## Contexto actual
La rama feat/pilot-envases-returns conserva los módulos ya implementados. La restauración estricta de catálogo, categorías, promociones y combos cuenta con ensayo representativo en Staging; la restauración integral de la interfaz continúa bloqueada.

## Alcance
- Completar contratos de clientes, proveedores, saldos iniciales, lotes y asociación de proveedores.
- Continuar P01–P24 del plan operativo según dependencias y evidencia existente.
- Publicar commits temáticos sin fusionar PR #3.

## Fuera de alcance
Impresora/cajón físicos, Point y emisión ARCA; master y Production sin nueva
autorización. El titular reabrió expresamente la autenticación WSAA homologación
y pidió el control de fecha ARCA, implementados en este bloque.

## Componentes afectados
Restauración JSON, contratos SQL aditivos, verificadores, pruebas y documentación del piloto.

## Dependencias
El registro vivo en plan_operativo_y_comercial_kioskopos_revision.md define pendientes. Las nuevas instalaciones SQL requieren un artefacto revisado y probado antes de solicitar el gate correspondiente.

## Decisiones importantes
Conservar saldos de contactos existentes; inicializar la foto de saldo sólo en registros nuevos. No generar movimientos financieros ficticios. No habilitar la interfaz integral mientras falte un contrato requerido. Mantener intactos los 43 SQL históricos.

## Riesgos
Duplicados, asociaciones entre comercios, pérdida de ACK y sobrescritura de saldos. Usar identidad estable, operaciones idempotentes y comprobación del resultado persistido. Rechazar campos sin soporte antes de escribir.

## Criterios de aceptación
Cada módulo tiene pruebas de comportamiento y permisos, build cuando corresponde y evidencia hospedada donde sea necesaria. Los pendientes externos quedan identificados sin considerarlos aprobados.

## Plan de implementación
0. Por instrucción del titular del 20/10, actualizar planes existentes y retomar
   PR02: CAE homologación, preparando primero PR03 (backend seguro e
   idempotencia fiscal); sin emisión sin autorización ni cambios en Production.
1. Contratos SQL locales para contactos y saldos, con pruebas de autorización, idempotencia y conservación.
2. Completar lotes y asociaciones; integrar preflight de capacidades antes de cualquier escritura.
3. Validar instalación preparada y ensayo aislado de Staging con el gate necesario.
4. Continuar seguridad, recuperación, reportes y entrega operativa del registro vivo.

## Validación
Pruebas dirigidas, suite completa al cerrar cada bloque, build, diff y manifiesto histórico; ensayos hospedados aislados conservando sus registros.

## Progreso
- [x] Objetivo continuo registrado; exclusiones confirmadas.
- [x] Restauración representativa de catálogo/promociones/combos validada en Staging.
- [x] Contratos de contactos y saldos preparados y probados localmente.
- [x] Lotes y asociaciones preparados e integrados al motor con preflight de capacidad.
- [x] Suite final: 2177 PASS / 1 skipped / 224 archivos; build PASS (634 módulos).
- [x] Publicación de commits temáticos y frontend sólo en Staging autorizada.
- [ ] Instalación de SQL nuevos en Staging: autorización específica pendiente.
- [ ] Integración y aceptación hospedada del respaldo completo.
- [ ] Resto del registro vivo.
- [x] Gates permanentes PR01–PR11 incorporados al plan operativo y reglas ExecPlan.
- [x] PR01: WSAA y FEParamGetTiposCbte reales PASS (36 tipos, cero emisiones),
      20/10/2026 con diagnóstico cc199d5. Consulta previa de puntos 602 conservada.
- [ ] PR02: CAE pendiente; primero completar dependencia PR03 de backend seguro
      e idempotencia. Punto 2 todavía sin disponibilidad acreditada en ARCA.

## Resultado final
En curso. No se declara completado el piloto por terminar un bloque individual.
Instalación y ensayo hospedado de la restauración ampliada preparados en
restauracion-modulos-staging.md; la interfaz integral continúa bloqueada.


## Objetivo activo detallado — 20/10/2026

El titular pidió crear un objetivo para seguir con detalle el trabajo pendiente.
Se registró como objetivo activo completar los módulos y gates del piloto,
priorizando PR03 antes del CAE de PR02. El desglose fiscal F01–F09, entregables,
pruebas y autorizaciones está en el [ExecPlan ARCA existente](../.agent/execplans/arca-homologation.md#objetivo-de-continuidad-detallado--20102026).
El inventario inicial ya comenzó; no se instalaron SQL/Edge ni se emitieron
comprobantes por este nuevo objetivo. El resto del registro canónico sigue
vigente, con impresora/cajón físicos y Point diferidos y Production separada.


## Avance fiscal y seguridad — 21/10/2026

Contrato final v1 normalizado/SHA-256, lectura SOAP estricta y transporte de
consulta preparados y probados localmente; candidato de autorización no se
persiste todavía. Suite 2324 PASS / 1 skipped / 227 archivos, build PASS;
90 casos fiscales nuevos y dos pruebas Edge locales con fixtures PASS.
Dependencias parcheadas y audit npm 0 alertas. Siguiente paso: ligar cuerpo/hash
a operación/reserva y persistir la reconciliación con CAS, luego custodia/worker
e instalación/aceptación hospedada. Ver el ExecPlan ARCA existente; PR03/PR02
siguen abiertos y no se autoriza emisión por este avance.

Actualización 21/10: cuerpo/hash ligado a operación y reserva preparado en SQL
003, intención exige persistencia previa; 168 pruebas fiscales y build PASS.
Reintento no cambia el cuerpo ni habilita otro envío. Aún falta persistir el CAE
conciliado con CAS, el worker privado y aceptación hospedada. El nuevo SQL no
está instalado. Evidencia y límites en el ExecPlan ARCA existente.
Resultado posterior: suite integrada 2345 PASS / 1 skipped / 228 archivos y seis
carreras PostgreSQL 17.11 con SQL 001–003 PASS; contenedor propio detenido.

Avance posterior 21/10: SQL 004 y orquestador privado preparados para guardar
CAE conciliado, cerrar reserva con avance único y recuperar ACK sin otra
consulta. 196 pruebas fiscales y nueve carreras PostgreSQL PASS; build PASS.
Falta custodia/caché de TA, autorización del worker y aceptación hospedada; no
hay nueva instalación ni emisión. El ExecPlan conserva evidencia y próximos gates.
Verificación final: suite integrada 2373 PASS / 1 skipped / 228 archivos;
Edge Runtime local con autorización simulada y replay PASS (una consulta mock),
sin SQL ni llamadas fiscales. Contenedores propios detenidos.

Avance F04 21/10: gate privado de actor/comercio/emisor y caché TA en memoria
preparados, con carga perezosa al conciliar. 192 pruebas enfocadas y diez casos
PostgreSQL locales PASS. Falta custodia real, renovación entre procesos y
endpoint/hospedado; no se instalaron SQL/Edge ni se usaron credenciales reales.
Resultado posterior: suite integrada 2426 PASS / 1 skipped / 230 archivos;
corrección de fixture readonly verificada con 102 pruebas afectadas y build
final PASS. Edge local composición/replay PASS con una carga y consulta mock.
No se instala SQL/Edge ni se autoriza emisión por esta verificación local.

Avance F04 compartido 21/10: SQL 006 y sobre AES-GCM preparados con datos y claves
efímeros sintéticos; coordinación por certificado/wsfe y recuperación de ACK.
105 pruebas enfocadas y doce casos PostgreSQL PASS. TA vigente se reutiliza;
se espera su vencimiento en el margen final. No hay activación ni custodia real;
seguir con proveedor CMS/WSAA y recuperación operativa antes del endpoint.
Resultado final del incremento: 2447 PASS / 1 skipped / 231 archivos, build PASS,
doce casos PostgreSQL y tres aserciones Edge con cifrado real y servicios mock
PASS. No hay TA/claves reales ni instalación remota. Custodia real y recuperación
operativa siguen pendientes antes de habilitar el worker.

Avance WSAA 21/10: proveedor CMS RSA/SHA256, lector de TA y transporte fijo
preparados con custodia inyectada. Certificados efímeros en pruebas; .NET verificó
CMS y rechazó alteración. 148 casos enfocados y recorrido DB con WSAA/WSFE mock
PASS; Edge local con CMS/cifrado reales y servicios mock PASS. Falta lector real
de custodia, recuperación operativa y endpoint antes de instalación autorizada.
Verificación final: 2492 PASS / 1 skipped / 233 archivos; build PASS, auditoría
npm 0 alertas; CMS contrastado por .NET y recorrido Edge mock PASS. Sin cambios
de lógica posteriores, llamadas fiscales reales ni nuevas instalaciones.

Avance de custodia 21/10: lector privado PKCS8 cifrado y keyring implementados,
con bloqueo de proyecto antes de leer secretos, importación no exportable y
rotación de IDs. 93 pruebas enfocadas, interoperabilidad .NET UTF-8 y Edge con
material sintético PASS; build PASS y lector ausente del frontend. Provisión
real, recuperación operativa y endpoint siguen pendientes de sus gates.
Verificación posterior de custodia y corrección de conteo Envases: 2514 PASS /
1 skipped / 234 archivos, con dos trabajadores y mismos timeouts, build final
PASS. Se conservan los fallos previos de timeout y la regresión real del conteo.
Nuevo lector sin instalación SQL/Edge, provisión real ni llamadas fiscales.

Recuperación TA previa a red preparada en SQL 007: PREPARADA cancelable con
historial, permiso único de envío y recuperación de metadata tras ACK perdido.
118 pruebas enfocadas y quince carreras PostgreSQL locales PASS; build PASS.
La incertidumbre posterior al permiso no se libera por timeout. Sin instalación
ni llamada ARCA real; endpoint y aceptación hospedada aún pendientes.
Cierre posterior: suite completa 2532 PASS / 1 skipped / 234 archivos, build PASS;
Edge local cuatro aserciones PASS. Incremento de recuperación TA listo para revisión
en rama del piloto; no se instaló SQL 007 ni se activó un endpoint fiscal.

Frontera HTTP fiscal preparada: consultas/replay y recuperación TA por IDs, sin
emisión, CORS Staging cerrado y doble gate Auth/SQL antes de custodia. SDK privado
sin reintentos ni sesión persistente, host y RPC limitados. 146 pruebas enfocadas,
build y Edge local PASS (entrypoint deshabilitado + integración sintética).
Sin instalación SQL/Edge ni llamadas reales; pruebas JWT/RLS/E2E hospedadas siguen
pendientes y el flag privado permanece sin activar. Suite completa en ejecución.
Revisión de aislamiento: SQL 008 restringe recuperación TA a su operación origen;
no expone ni cancela intentos de otro comercio aunque comparta certificado. 150
casos enfocados, dieciséis carreras PostgreSQL, build y Edge local finales PASS.
Suite completa final en curso; la anterior de 2589 PASS precede este guard.
Cierre final HTTP + aislamiento: 2593 PASS / 1 skipped / 236 archivos, build,
150 dirigidas, 16 carreras PostgreSQL y Edge local 3+5 PASS. Sin instalación ni
activación remotas. Sigue pendiente el trabajador de último número/emisión y la
integración UI antes de aceptar PR03/PR02, además de los gates hospedados.

Worker de último autorizado/emisión preparado localmente: cuerpo durable,
permiso privado por hash, intención/consumo atómicos, un envío y conciliación
completa antes de confirmar CAE. 152 casos enfocados, build, 18 carreras PostgreSQL
y Edge sintético PASS. SQL 009 sin instalar, sin permisos/flags reales nuevos.
Falta cerrar suite integrada, preparación/UI, rechazos y guard de devolución
contra el nuevo ledger antes de habilitar facturación a usuarios.

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

Cierre integrado SQL 010: 2666 PASS / 1 skipped / 238 archivos, salida 0,
registrado en pilot-fiscal-return-exclusion-suite-results.json. La omitida sigue
siendo la fixture F6 sin configurar; ninguna prueba fiscal nueva omitida. 195
casos enfocados, 20 carreras PostgreSQL v3, build 634 módulos, oxlint dirigido,
manifest 43 y diff PASS. Escaneo 1211 archivos/47 candidatos/delta 0. Este cierre
sustituye el estado anterior de suite en curso. Sin instalación SQL/Edge, sin
emisión real, sin frontend/deploy nuevo ni cambios en master/Production. Próximo:
preparación fiscal explícita y revisión UI, con resolución de rechazos y los
gates hospedados pendientes; no reutilizar defaults de punto/IVA del legado.

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
22/10/2026 — Continuación F08/PR03: contrato puro de constancia cerrado y validado localmente (88 pruebas dirigidas, build y lint PASS). Vincula operación/venta/hash, CAE y vencimiento; no toma aprobación como emisión ni acredita autenticidad ARCA. Getter privado, HTTP/cliente/modal y aceptación siguen pendientes; detalle y evidencia en ExecPlan arca-homologation. No SQL nuevo, instalación, deploy ni emisión. Envases descontados continúan pendientes de criterio del contador. El gate no cambia a PASS por este avance parcial.

22/10/2026 — F08/PR03 avanza con constancia de homologación desde ledger privado (SQL 014), ligada a Auth original, operación/venta/hash y CAE durable. Modal distingue aprobación y autorización, conserva estado ante error y no repite preparación. 249 pruebas dirigidas, 36 escenarios PostgreSQL local, build 646 módulos PASS; suite global actual en curso. Es vista de autorización sintética, sin CAE real ni representación fiscal final/PDF/QR acreditada. SQL 001–014/Edge sin instalar, flags apagados, ningún deploy ni llamada fiscal real. Rechazos/cancelación/NC, provisión/PV y aceptación hospedada siguen pendientes; no cerrar PR03 ni PR02.
Cierre del incremento de constancia F08: suite completa 2926 PASS / 1 skipped / 248 archivos, única omitida fixture F6 no configurada; 249 dirigidas, 36 PostgreSQL y build 646 PASS. Reemplaza estado de suite en curso de la entrada anterior. PR03 sigue parcial y los gates remotos permanecen cerrados; próximo trabajo local en resolución auditable de rechazos/incertidumbre.
