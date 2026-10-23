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

22/10/2026 — F08/PR03: auditoría privada de recepción de emisión preparada en SQL 015 y worker. Conserva clasificación/códigos y Auth original con permiso/revisión consumidos; replay/ACK perdido recuperan el mismo registro y contradicción no sobrescribe. Siempre se concilia antes de cerrar; fallo de auditoría se informa, sin impedir esa consulta ni inventar rechazo ante timeout. 202 pruebas dirigidas y 38 escenarios PostgreSQL locales PASS; build 646 PASS; suite global actual en curso. NO resuelve aún rechazo definitivo/corrección/cancelación/NC ni diagnóstico público. SQL 001–015/Edge sin instalar, sin tráfico ARCA real, flags apagados y sin deploy. Gates de Production Readiness se mantienen parciales.
Cierre de auditoría de recepción: suite 2979 PASS / 1 skipped / 249 archivos, única omitida fixture F6 preexistente; 202 dirigidas, 38 PostgreSQL y build 646 PASS. Sustituye suite en curso anterior. PR03 sigue parcial por diagnóstico/resolución/corrección/cancelación/NC y gates hospedados; no instalación remota ni emisión real.

22/10/2026 — F08/PR03: diagnóstico visible del Dueño preparado con getter activo SQL 016, HTTP/cliente/modal. Distingue recepción y última consulta, ausencia de respuesta y aprobación recibida; no habilita reenvío/cancelación. Auth original/rol/comercio se validan en DB; auditoría histórica 015 no es gate de UI. 295 pruebas dirigidas, 40 PostgreSQL locales y build 649 PASS; suite global actual en curso. SQL 001–016/Edge sin instalar remotamente, flags apagados, ningún deploy/CAE real o llamada ARCA autenticada nueva. Resolución/corrección/cancelación/NC y gates hospedados permanecen pendientes.
Cierre de diagnóstico F08: suite completa 3031 PASS / 1 skipped / 250 archivos, única omitida fixture F6 preexistente; 295 dirigidas, 40 PostgreSQL y build 649 PASS. Reemplaza suite en curso anterior. Diagnóstico preparado, sin activación remota. PR03/PR02 siguen parciales por resolución/corrección/cancelación/NC y aceptación hospedada; gates y diferidos se conservan.

22/10/2026 — F08: backend SQL 017 de cancelación previa a cuerpo/número preparado. Conserva UUID/auditoría/hechos, bloquea guardados tardíos y permite otra preparación activa para corregir, sin liberar reservas. Requiere funciones actualizadas 001/002/012 de la misma revisión; no instalar 017 aislado sobre versiones previas. 289 pruebas dirigidas, 47 escenarios PostgreSQL y build 649 PASS; suite global actual en curso. Falta servicio/HTTP/cliente/modal y retiro seguro del pendiente local: flujo aún no completo. SQL 001–017/Edge sin instalar remotamente, ningún deploy/consulta ARCA real; emisión incierta, rechazo definitivo y NC siguen pendientes.
Cierre SQL recuperado: informe global 3048 PASS / 1 skipped / 250 archivos, success=true; única omitida fixture F6. Handle terminado/no disponible después de interrupción de revisión automática por uso; resultado recuperado del archivo, sin atribuir código de salida no observado. 289 dirigidas, 47 PostgreSQL y build 649 PASS. Integración HTTP/cliente/modal de cancelación aún pendiente, gates remotos cerrados.

22/10/2026 — F08: cancelación previa a numeración integrada en servicio/HTTP/cliente/modal, lectura durable tras ACK perdido/falso y retiro del pendiente bajo exclusión Auth/comercio/venta. Web Locks requerido en navegador; confirmación explícita para intento sin cuerpo/número y corrección con otro UUID. 322 dirigidas PASS, backend PostgreSQL 47 previo sin cambios, build final 651 PASS; suite global actual en curso. Escaneo 49 candidatos, único delta token sintético de fixture revisado no real. Aceptación real de dos pestañas/versiones compatibles/JWT/RLS/visual pendiente. SQL 001–017/Edge sin instalar/activar remotamente, ningún deploy/consulta ARCA real. Resolución posterior a número/envío, rechazo definitivo y NC siguen pendientes.
Cierre de integración local de cancelación/corrección anterior a número: 3086 PASS / 1 skipped / 251 archivos, única omitida fixture F6, salida 0; 322 dirigidas y build 651 PASS, evidencia backend PostgreSQL 47 previa sin cambios. Reemplaza suite en curso anterior. Flujo local integrado; aceptación real Web Locks/versiones/JWT/RLS/visual y gates remotos siguen pendientes. PR03/PR02 parciales por resolución posterior a número/envío, rechazo definitivo/NC y demás dependencias.

### 22/10/2026 — Sustitución de preparación reservada (incremento local)

SQL 018 conserva los cuerpos históricos y el mismo número al sustituir una reserva sin intención por otra preparación. No libera/reasigna número a otra venta o serie ni reutiliza la aprobación original. 51 escenarios nativos locales PASS; integración de servicio/HTTP/UI y cierre de suite/build pendientes. SQL 001–018/Edge sin instalar/habilitar remotamente; corrección después de intención, rechazo definitivo/NC y aceptación hospedada siguen abiertos. Envases descontados pendientes del contador; impresora/Point diferidos.

Cierre de validación local de SQL 018: 3103 PASS / 1 skipped / 251 archivos, salida 0 observada (pilot-reserved-replacement-suite-results.json). Única omitida fixture F6_C3A_CANDIDATES_PATH sin configurar; ninguna fiscal nueva omitida. Después de esa suite sólo se corrigieron anotaciones TypeScript de filas de fixtures: 160 dirigidas / 4 archivos PASS posteriores y build final PASS 651 módulos (pilot-reserved-replacement-build-typed-final.log). Los primeros errores de ambigüedad SQL y de fixtures/tipado quedaron corregidos; el build anterior fallido no cuenta como PASS. 51 escenarios PostgreSQL 17.11 PASS finales con intención revisada y contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL y diff PASS; oxlint sin nuevos hallazgos, conserva warning preexistente no-unsafe-finally del runner. Escaneo 1255 archivos/49 candidatos, sin nuevos candidatos frente al cierre anterior. El incremento cierra sólo la transacción SQL local; siguen pendientes servicio/HTTP/cliente/UI con recuperación durable y revisión de la sucesora, resolución posterior a intención/rechazo/NC, representación fiscal final y gates hospedados. No instalación remota SQL 001–018/Edge, activación, deploy, nuevas consultas ARCA autenticadas, CAE real, merge o cambio master/Production. Restauración integral bloqueada; contador/envases y diferidos físicos conservados.

### 22/10/2026 — Corrección reservada con recuperación integrada (local)

El modal conecta nueva propuesta→servicio/HTTP→SQL 018→nueva revisión, conservando número y cuerpo original; identidad/propuesta se guardan antes de POST y se retiran sólo tras lectura durable. Descartar propuesta no confirmada cierra únicamente UUID sucesor sin cuerpo, nunca número. Si la sustitución ganó, recupera la sucesora. Web Locks, confirmación explícita, rechazo de serie distinta y protección de respuestas tardías. Corregido el hash canónico SQL para que la revisión real sea verificable; no se reescribe historia incompatible. 338 pruebas dirigidas PASS / 8 archivos y primer pase 53 PostgreSQL PASS; cierre global/build/SQL final en curso. No hay aceptación hospedada ni instalación/activación SQL 001–018/Edge, deploy o emisión. Rechazos posteriores a intención/NC, representación fiscal final, PV/custodia/parámetros y JWT/RLS/visual/E2E siguen pendientes. Contador/envases, restauración bloqueada y físicos/Point diferidos conservados.

Cierre integrado de sustitución reservada y recuperación entre equipos: 3166 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-replacement-two-terminals-suite-results.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 341 dirigidas / 8 archivos PASS y 54 escenarios PostgreSQL 17.11 PASS finales (fiscal-replacement-two-terminals-concurrency-20261022.json), incluidos propuestas distintas, ambos órdenes sustitución/intención y descarte/sustitución, rollback y ACK recuperable. Dos almacenes independientes cliente→HTTP→SQL recuperan la ganadora sin cancelar su cuerpo/número. Build final PASS 653 módulos, manifiesto histórico 43 SQL, diff y bundle privado (cero coincidencias) PASS; oxlint sin nuevos hallazgos, warning preexistente del finally del runner conservado. Escaneo 1258 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos, datos conservados, cero solicitudes ARCA autenticadas o emisiones reales. Sustituye las notas de suite en curso para esta integración; el pase previo 3163 se conserva con su alcance anterior.

El flujo reservado anterior a intención queda integrado localmente, incluida la corrección de canónico y el rechazo de instalación sobre historia incompatible. No acredita navegador/visual/Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados. SQL fiscal 001–018 y Edge sin instalar/habilitar remotamente; flag nuevo sin activar, ningún deploy, CAE real, merge o modificación de master/Production. Siguiente bloque local: resolución/corrección posterior a intención/rechazo definitivo y notas de crédito, junto con representación fiscal final. Provisión privada, punto de venta y parámetros reales, aceptación aislada/hospedada y primera emisión homologada expresamente autorizada conservan sus gates. Envases descontados bloqueados hasta criterio del contador; restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales, sin declarar Production Readiness.

### 22/10/2026 — Rechazo recibido: contrato privado preparado

SQL 019 conserva intento rechazado/historia/FKs y crea sucesora con número/serie iguales sólo ante R explícito, consulta 602 estricta y último N−1 frescos. Worker privado con gate cerrado, Auth único/revalidación y getter durable, sin FECAESolicitar ni permiso heredado. 280 dirigidas y 61 PostgreSQL PASS; suite/build finales en curso. Falta integrar HTTP/cliente/modal y aceptación hospedada de esta clase, además de incertidumbre sin R, NC y representación final. Sin instalación remota, activación, deploy o CAE real. Dependencias del titular y diferidos se conservan.

### 23/10/2026 — Cierre recuperado del incremento privado de rechazo

Suite completa 3227 PASS / 1 skipped / 252 archivos, salida 0 observada al recuperar el mismo handle (pilot-fiscal-rejected-correction-suite-results.json). No se reinició por el cambio de turno/fecha. Única omitida fixture histórica F6_C3A_CANDIDATES_PATH sin configurar, ninguna fiscal nueva omitida. 280 dirigidas / 5 archivos PASS y 61 escenarios PostgreSQL 17.11 PASS finales (fiscal-rejected-correction-final-v2-concurrency-20261022.json). Build final PASS 653 módulos; manifiesto histórico 43 SQL, diff y bundle privado PASS (cero coincidencias de trabajador/gate/RPC privados). SDK limitado a 29 RPC. Oxlint sin nuevos hallazgos; warning preexistente del finally del runner conservado. Scan 1260 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos/datos conservados; cero solicitudes externas/emisiones reales. El fallo de sintaxis inicial del runner quedó corregido y su log conservado; no produjo un contenedor ni se contó como PASS.

El contrato SQL 019 y trabajador privado de R con detalle quedan preparados localmente; no se cierra el flujo de usuario de esa clase todavía. Siguiente: integrar elegibilidad/confirmación/recuperación HTTP–cliente–modal, sin permitir R automático desde timeout/Errors sin detalle, y exigir nueva revisión/permiso para la sucesora. Incertidumbre sin R, notas de crédito, representación fiscal final, provisión/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual continúan pendientes. SQL 001–019 y Edge sin instalación/activación remota por nosotros; no activación de flags, deploy, consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. Se conservan contador/envases, restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales; este cierre no acredita Production Readiness.

### 23/10/2026 — PR03/F08: propuesta de rechazo y revisión conectadas (local)

Se integra HTTP/cliente/modal de R con detalle: propuesta v2 sin reinterpretar v1, confirmación antes de consultas, recuperación durable y descarte sólo del UUID local no creado; revisión nueva sin herencia de permiso. 361 dirigidas PASS, build 654 módulos PASS; suite global en curso. Ver evidencia/alcance en .agent/execplans/arca-homologation.md. No SQL nuevo ni activación externa; no aceptación hospedada ni CAE real. PR03 y PR02 siguen parciales por incertidumbre sin R/NC/representación final y gates de custodia/PV/parámetros/JWT/RLS/Edge/visual. Contador/envases conserva bloqueo; restauración integral bloqueada y físicos/Point diferidos.

### 23/10/2026 — Cierre local de propuesta y formulario R

Suite completa 3271 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-rejection-ui-suite-results-20261023.json); única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 361 dirigidas PASS / 5 archivos, build final PASS 654 módulos (pilot-fiscal-rejection-ui-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS; scan 1262 archivos/49 candidatos sin nuevos pares ruta/tipo y backend privado ausente del bundle. El aviso de sourcemap html5-qrcode y el tamaño de chunks no son errores de prueba/build. SQL 001–019 y transacciones no cambiaron: no se repitió PostgreSQL nativo; los 61 escenarios anteriores son historia, no una aceptación nueva. La propuesta R, confirmación, recuperación/descarte y vuelta a revisión quedan integradas localmente. Falta aceptación real visual/JWT/RLS/Edge/Web Locks y comportamiento externo con custodia/PV/parámetros acreditados; no hay CAE real ni Production Readiness. Continúan incertidumbre sin R, NC y representación fiscal final. Sin consultas ARCA autenticadas, instalación/habilitación fiscal remota, flags, deploy, merge o cambio master/Production. Contador/envases bloqueado, restauración integral bloqueada y físicos/Point diferidos.

### 23/10/2026 — PR03/F08: autoridad transaccional de conciliación preparada

SQL 020 liga el registro de conciliación al actor/binding privado, tras revalidación antes de TA/fetch. Sólo getter durable confirma ACK; replay no consulta ARCA. Gate nuevo de consultas HTTP cerrado por defecto. 479 dirigidas/6 archivos y 64 escenarios PostgreSQL 17.11 PASS; build 654 módulos PASS, suite global en curso. Evidencia y límites en .agent/execplans/arca-homologation.md. Sigue pendiente UI/observación durable y encadenamiento de conciliación interna del worker, además de NC/representación final y gates hospedados. SQL 001–020/Edge sin instalar/activar, sin consultas/emisión/CAE reales, deploy, merge o cambio master/Production. PR03/PR02 parciales; contador/envases/restauración bloqueados y físicos/Point diferidos.

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
