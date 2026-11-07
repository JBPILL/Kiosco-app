# ExecPlans

Use an ExecPlan for complex features, architectural changes, significant refactors, migrations, work affecting multiple stores or modules, and tasks expected to span multiple sessions. Small, localized changes do not need an ExecPlan.

An ExecPlan is a living document: create it before implementation, update **Progreso** as work advances, and complete **Resultado final** before closing the work. Keep it in the project documentation/configuration area and link to it from the task when useful.

## Objetivo común vigente — cierre del desarrollo y Production Readiness

30/10 PR07: transporte privado fijo y recovery SQL administrativo preparados;
104 pruebas locales PASS/build689/lint. No SELECT directo de operaciones para
usuarios ni grants nuevos. Faltan envoltorio Windows/ACL/credenciales privadas,
resolucion de journal autorizada, dependencias hospedadas y respaldo/preflight.
No listo para GO de restores; no sesiones nuevas ni gates cerrados repetidos.

30/10 PR07: motor privado de journal preparado,62 pruebas locales PASS y build689.
INTENT fsync antes de transporte, pins de actor/cuerpo, locks y ACK hash;
incertidumbre bloquea reenvio y avance incluso si lectura coincide. Sin ejecutor
remoto: faltan envoltorio privado/ACL Windows/Auth/transporte y sus pruebas,
dependencias hospedadas y respaldo/preflight antes del GO. No repetir gates cerrados.

30/10 PR07: plan fijo de restore aislado y preflight READ ONLY preparados y
probados LOCALMENTE (39PASS, build689/lint). No ejecutor ni GO remoto todavia;
faltan journal/recuperacion, fallos del operador y pin de dependencias hospedadas.
No ejecutar JSON/SQL por inferencia, no repetir lectura OWNER/CASHIER cerrada.

30/10 posterior a a27d07e: operador y captura confirman lectura OWNER own200 /
other403 y CASHIER own403 / other403, mutation=false, ambos logout local.
Gate de lectura de capacidades OBSERVADO; no repetir sin drift. No acredita
restore/RLS integral/DR ni borra fallos previos. Siguiente: paquete aislado de
restore para revision y GO especifico, sin ejecutar mutaciones ni habilitar UI.

30/10:420cc5f tuvo dos ensayos reales no confirmados (Dueno/Cajero), ambos
logout local confirmado. No repetir durante diagnostico. Defecto del lector
HTTP reproducido en pwsh7.6.5/HttpResponseMessage, parche compatible PS7/5.1
probado82PASS/0FAIL/0skip, build689/lint/diff PASS. Detalle e historia fallida en
ExecPlan backup. Solo preparar DOS repeticiones posteriores, Dueno luego Cajero,
sin restore; cualquier marcador distinto => STOP, sin retry automatico.
Los resultados hospedados anteriores no pasan a PASS; RLS/DR siguen pendientes.

29/10 PR07: GO sólo de respaldo ejecutado una vez y copia privada verificada
independientemente (hashes/roles/ACL/TOC), sin restore ni instalación. En revisión
local previa a SQL se reprodujo replay bajo otro Auth del mismo perfil: corregido
en pilot-backup001/002 con Auth original capturado/guardado en solicitud; legados
sin identidad no se reinterpretan.58 pruebas enfocadas y12 escenarios PostgreSQL17
locales PASS, sin originales/red/backup real montado. Cierre global5310PASS/1skip y build689 PASS publicado en c0c0fef. GO de instalación/aceptación separado;
UI integral bloqueada y ARCA diferida. Detalle/decisión en ExecPlan backup y DECISIONS.

Preparación independiente PR07 del29/10: preflight hospedado READ ONLY confirma
ausentes las4RPC de supabase/pilot-backup/001–003 (no son SQL fiscal001–054).
Etapa de respaldo AntesContratosRestauracion preparada con controles actuales,
sin reutilizar rótulos pre054/pre-emisor ni heredar su GO. Sólo código/pruebas
locales; no backup real, instalación, restore ni habilitación integral autorizados
por este avance. Matriz corrige P15 (archivos reales verificados, DR pendiente)
y distingue anulación histórica Quilmes614a2e8c del artículo de ensayo b7254826.
43 pruebas enfocadas y preparación local sin conexión PASS; global5294 de f9fa861
conserva su alcance anterior, no se presenta como nueva suite de este incremento.

Cierre local PR06/dependencias29/10: dompurify3.4.17 y undici8.12.3, sólo lock,
sin cambios de rangos directos/scripts. Auditoría actual0; global final5294 PASS/
0 FAIL/1 omisión histórica/332 archivos y cobertura completa de testfiles.
Build689 y lint exit0 (138 advertencias en archivos no modificados). Se conserva
una caída CLR del primer intento y recheck22PASS; ver ExecPlan fiscal/hashes.
Parche local no despliega ni acredita RLS/custodia funcional o cierre PR06.
Titular difiere consultas ARCA a otra mañana sin fecha; propuesta30/10 sin GO,
sin ejecución ni programación. Replanificar sólo cuando indique disponibilidad.

29/10 PR06/P02: corregida omisión de es_superadmin en el diagnóstico de costos
Cajero (71 pruebas enfocadas/build PASS). Existencia de filas privadas confirmada
por lectura independiente; no aceptación JWT nueva. Visor inactivo por cierre
de ensayo/cupo documentado, sin reactivar. Conservar evidencia histórica y gates
pendientes; seguir dependencias fiscales sin reautenticar ni ampliar permisos.

Corrección de lectura29/10: las adendas históricas de ExecPlans que dicen
«primer gate pendiente (PR01)» no ordenan reabrir PR01, ya cerrado. Prevalece el
registro maestro vigente: PR03 aceptación positiva y PR02 primer CAE siguen
pendientes. Mientras el TA descartado no venza, avanzar sólo bloqueadores locales
independientes, sin repetir autenticación. Preparado asistente de lectura Visor
(53 pruebas/build PASS); perfil hospedado existente inactivo, sin reactivar.
Detalle y evidencia en ExecPlan fiscal; PR06 no queda cerrado por preparación local.

29/10/2026: el fallo de la ventana anterior quedó conciliado por lectura hospedada
(emisor/catálogo inactivos, 37 contadores cero, hashes de historial/comercio intactos).
Auth/perfil exactos y gateway cerrado acreditados por el operador privado. Sigue
pendiente aceptación positiva PR03; catálogo2 y ventanas del 28/10 vencidos, sin
prórroga manual. Cerrar diagnóstico local de etapas, luego renovar evidencia de
parámetros bajo GO y coordinar TA/paquete nuevo, sin LoginCms redundante. Detalle
y evidencia en el ExecPlan fiscal; no reutilizar paquetes anteriores ni repetir
gates sin drift. Meta PR01–PR11/P01–P24 sin cambios.

Resultado posterior del GO de parámetros: WSAA PASS; primera consulta WSFE falló
por error local/transporte, sin catálogo nuevo. GO consumido; TA descartado vence
29/10 22:00:42.630Z (19:00:42 Argentina). No LoginCms redundante ni reintentos.
Conservar catálogo2 inactivo/vencido y evidencia del ExecPlan; no abrir ventana.

Preparación local siguiente29/10: eliminar el pin literal2 exige catalogRevision
explícito revisado, con historia/hash completos; SQL local y observador ya
probados para3 sin instalarla. Transporte del asistente clasificado por tipos
sin revelar mensajes. 170 pruebas enfocadas y14 escenarios PostgreSQL17 locales
PASS; global ampliada final5273 PASS/0 FAIL/1skip/332archivos, exit0 y cobertura
de archivos completa. Se conserva el estado en curso como histórico del ExecPlan.
Ninguna nueva autoridad remota. Renovación y
ventana deben caber entre expiración REAL del TA descartado y vigencia del
catálogo, no simplemente consultar otra vez al llegar19:00.

Actualización de secuencia, 28/10/2026: completar y publicar primero el bloque
LOCAL único del operador privado de preparación; después revisar el paquete
y hacer preflight hospedado READ ONLY. La primera ventana positiva de Staging
SIN emisión requiere GO explícito separado; los permisos anteriores no sirven.
El ExecPlan fiscal y `docs/arca-homologacion.md` contienen el protocolo y sus
límites. Los pases locales no cierran aceptación hospedada ni PR02–PR11; el
objetivo común permanece activo. No crear planes paralelos para este cierre.

**Estado de referencia: 24/10/2026.** Este objetivo común gobierna el trabajo de Codex mientras el proyecto siga en la rama/PR activo del piloto y hasta completar la salida productiva. No reemplaza el registro canónico de gates; ordena prioridades para evitar abrir trabajo paralelo que no reduzca riesgo ni cierre aceptación.

Fuentes de verdad:

- `plan_operativo_y_comercial_kioskopos_revision.md` para PR01–PR11 y P01–P24.
- `.agent/execplans/arca-homologation.md` para el circuito fiscal.
- `docs/plan-completar-piloto.md` y ExecPlans específicos para evidencia de cada módulo.
- `DECISIONS.md` para decisiones de arquitectura/dominio ya tomadas.

Estado consolidado que debe respetarse:

- `master` está en `03a798f` y contiene el módulo comercial seguro mergeado mediante PR #2.
- PR #2 está cerrado/mergeado; no reconstruir administración comercial ya aceptada.
- PR #1 (`hardening/next-operational-block`) quedó obsoleto/divergido respecto de `master`; no intentar mergearlo completo. Auditar sólo si alguna pieza concreta no fue absorbida por trabajo posterior y cerrar/superseder cuando corresponda.
- PR #3 (`feat/pilot-envases-returns`) es el bloque activo principal: parte de `master`, sigue en draft y concentra operaciones del piloto, recuperación, backup ampliado y el circuito fiscal privado.
- PR01 está PASS: WSAA real y consulta autenticada `FEParamGetTiposCbte` ya fueron acreditados en homologación.
- PR02 sigue pendiente: primer CAE real de homologación.
- PR03–PR09 están parciales: existe mucha implementación local, pero falta aceptación hospedada/real suficiente.
- PR10 no está iniciado y PR11 sigue pendiente.
- Impresora/cajón físicos y Point permanecen diferidos hasta contar con cliente/medios para ensayo real.

### Meta única

Llevar KioskoPOS desde el estado actual de **implementación avanzada** hasta **Production Readiness verificable**, cerrando gates en orden y sin confundir tests locales, mocks o previews con aceptación hospedada/productiva.

El orden de trabajo obligatorio es:

1. **Cerrar técnicamente PR #3.**
   - Completar únicamente piezas que reduzcan PR02–PR09 o eliminen blockers reales.
   - Finalizar flujo fiscal/NC/representación/recuperación pendiente sin abrir features cosméticas nuevas.
   - Ejecutar suite global sobre el HEAD definitivo, build, lint/diff, secret scan y evidencia PostgreSQL aplicable.
   - Mantener PR #3 en draft hasta que el bloque esté coherente y revisable.

2. **Convertir preparación local en aceptación de Staging.**
   - Instalar SQL/Edge/flags sólo con autorización específica y con backup/rollback definidos.
   - Validar JWT/RLS/ACL reales con Dueño/Cajero/Visor/otro comercio.
   - Probar dos ventanas/terminales, Web Locks, respuestas perdidas, reintentos, concurrencia, cambio de actor, recuperación y estados inciertos.
   - No usar un HTTP 200, un preview o una prueba simulada como sustituto de aceptación hospedada.

3. **Cerrar PR03 y luego PR02.**
   - Antes de una emisión real de homologación, demostrar idempotencia, numeración, cuerpo inmutable, conciliación y custodia segura en entorno hospedado.
   - Confirmar punto de venta, catálogo/parámetros y emisor correctos.
   - Pedir autorización específica antes de ejecutar `FECAESolicitar`.
   - Obtener el primer CAE real de homologación y recuperarlo mediante `FECompConsultar` sin simulaciones.
   - Validar rechazo, timeout/respuesta incierta y nota de crédito antes de considerar cerrado el circuito fiscal.

4. **Cerrar PR04–PR09 con evidencia real.**
   - Contingencias ARCA/Internet.
   - Integridad venta-stock-caja-envases-devoluciones.
   - Seguridad JWT/RLS/secretos/auditoría.
   - Backup/restore y recuperación de desastre.
   - Crash/reinicio/pérdida de copia local.
   - Concurrencia/E2E con dos actores/terminales y fallos inyectados.

5. **Preparar PR10 — transición controlada a Production.**
   - Sólo después de PR01–PR09 cerrados.
   - Requiere autorización expresa del titular.
   - Definir backup, cutover, rollback, monitoreo, credenciales/certificados productivos y soporte.
   - No emitir comprobantes reales ni cambiar ARCA Production sin esa autorización.

6. **Cerrar PR11 — piloto comercial real.**
   - Comercio/operadores reales, formación, soporte, métricas y conciliación.
   - Ensayar impresora/cajón y Point cuando el titular aporte cliente/hardware/medios.
   - La aceptación del piloto real es el último gate antes de declarar desarrollo cerrado para operación comercial.

### Regla de priorización

Antes de comenzar cualquier tarea nueva, Codex debe responder internamente:

> ¿Este cambio cierra o reduce directamente un gate PR02–PR11 o un blocker necesario para cerrar PR #3?

Si la respuesta es **no**, posponerlo salvo que el titular lo pida expresamente.

Prioridad:

`seguridad e integridad > aceptación hospedada > recuperación/concurrencia > homologación fiscal > backup/operación > UX/cosmética`.

### Criterio de “terminado”

No declarar el desarrollo cerrado sólo porque el código esté implementado o la suite pase. El sistema se considera listo para cierre únicamente cuando:

- PR #3 esté integrado o sustituido por bloques equivalentes revisados.
- PR01–PR09 estén PASS con evidencia del entorno requerido.
- PR10 se ejecute con autorización explícita y rollback probado.
- PR11 tenga aceptación de piloto comercial real o quede formalmente diferido por decisión del titular con alcance comercial reducido.
- No existan blockers conocidos de seguridad, integridad, recuperación o fiscalidad sin una decisión explícita registrada.

### Reglas de autonomía de Codex

Codex puede continuar autónomamente con lectura, análisis, implementación local, pruebas, documentación y commits temáticos dentro de la rama activa.

Debe detenerse y pedir autorización sólo para:

- emitir un comprobante real, incluso en homologación si la acción crea un CAE;
- instalar SQL/Edge o activar flags en un entorno remoto cuando no exista autorización vigente para ese alcance;
- usar/rotar secretos, certificados, claves privadas o credenciales reales;
- modificar `master`/Production o hacer merge de un PR;
- ejecutar una operación destructiva o irreversible;
- tomar una decisión de negocio/fiscal que no esté resuelta en documentación.

Nunca:

- `git push --force` / `--force-with-lease`;
- `git reset --hard`;
- `git clean`;
- bypass de protecciones GitHub/secret scanning;
- `npm audit fix` automático;
- exponer JWT, Token/Sign, claves privadas, passwords, peppers o conexiones;
- debilitar tests para obtener PASS;
- declarar PASS hospedado/productivo usando sólo mocks, PGlite o pruebas locales.

### Política de evidencia

Cada cierre debe registrar como mínimo:

- fecha y commit/ref;
- entorno (`local`, PostgreSQL local, Staging, homologación ARCA, Production);
- actor/rol y alcance;
- caso probado y resultado;
- límites de lo que NO demuestra;
- rollback o recuperación cuando aplique.

Conservar evidencia histórica. No reescribir resultados anteriores para hacer coincidir el estado actual.

## Template

```markdown
# <Plan title>

## Objetivo
<Concrete outcome and user-visible behavior.>

## Contexto actual
<Relevant implementation, constraints, and evidence from the repository.>

## Problema
<What is missing, incorrect, or risky today.>

## Alcance
- <Included behavior or components.>

## Fuera de alcance
- <Explicit exclusions.>

## Componentes afectados
- <Pages, stores, services, persistence, database objects, tests, or docs.>

## Dependencias
- <Required components, data, external systems, or prerequisite work.>

## Decisiones importantes
- <Decision, rationale, and alternatives when consequential.>

## Riesgos
- <Business, data, compatibility, regression, rollout, and recovery risks.>
- <Rollback or recovery approach when relevant.>

## Criterios de aceptación
- <Observable outcomes that define completion.>

## Plan de implementación
1. <Small, ordered steps.>

## Validación
- <Relevant tests and checks, including affected business flows and possible regressions.>

## Progreso
- [ ] <Current implementation step.>

## Resultado final
<Completed outcome, validations and results, or remaining work.>
```

## Working rules

### Production Readiness del piloto

Los ExecPlans del repositorio deben vincular los gates aplicables del registro
canónico [Production Readiness](../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026),
PR01–PR11. Incluyen WSAA/WSFE homologación, CAE, idempotencia fiscal, contingencias,
integridad venta-stock-caja, seguridad, backup/restore, recuperación, concurrencia
E2E, transición productiva y piloto comercial. No duplicar esa matriz ni crear
otro plan equivalente; registrar sólo progreso/evidencia/limitaciones del módulo.

Antes de cerrar un ExecPlan o declarar un release listo, comprobar el gate
correspondiente con evidencia del entorno requerido, sin convertir un PASS local,
una simulación o un DIFERIDO en aceptación hospedada/productiva. Conservar
resultados históricos y añadir revisiones fechadas. Los gates no amplían permisos:
respetar autorizaciones para SQL, emisión fiscal, publicación y Production.
Impresora/cajón físicos y Point permanecen diferidos hasta ensayo con cliente por
decisión del titular. Al retomar, continuar por el primer gate pendiente del
registro: PR01 quedó PASS el 20/10/2026; sigue PR02 (CAE), cuya dependencia
PR03 (backend seguro e idempotencia fiscal) debe prepararse antes de emitir.

- Ground the plan in the current repository; do not fill gaps with invented architecture.
- Keep the scope and validation proportional to the change, and follow project instructions such as `AGENTS.md` and `RTK.md`.
- Update the plan when scope, decisions, risks, or implementation progress materially changes.
- Record non-trivial architectural or domain decisions in `DECISIONS.md` when applicable; the plan is not a substitute for that record.

## Seguimiento operativo del objetivo común — 28/10/2026

El titular pidió un objetivo persistente para seguir el plan sin cabos sueltos.
Se creó objetivo activo de hilo que conserva TODO PR01–PR11/P01–P24; no sustituye
ni reduce el objetivo común anterior a la próxima prueba fiscal. Este archivo
conserva prioridad/criterios; matriz canónica y ExecPlans conservan sus evidencias.

### Primer resultado requerido: candidato de aceptación positiva hospedada

Partir de4629a60. Custodia metadata, SQL001–054, emisor1 inactivo y catálogo2
inactivo son gates históricos acreditados: no repetirlos sin evidencia de drift.
El titular confirmó explícitamente MONOTRIBUTO, FacturaC tipo11 y ConsumidorFinal
condición5. No inferir de esto autorización de activación, consulta o emisión.

- [x] Registrar selección fiscal explícita del titular.
- [x] Catálogo2 inactivo instalado, revisión1 intacta, emisor1 inactivo.
- [x] Identificar venta exacta de ensayo completada/elegible, sin envase reconocido,
  sin CAE/devoluciones; fijar UUID durable antes de cualquier solicitud.
- [x] Completar DTO propuesto para revisión: concepto, documento, importes, fecha, moneda/cotización y
  ausencia explícita de desglose IVA/tributos para C; validar con contrato vigente.
  Cada valor propuesto debe quedar visible para revisión, no como default legacy.
- [ ] Paquete exacto: hashes/baselines, SQL habilitación y cierre CAS, verificadores,
  comandos privados, flags reales y orden, ventana máxima15min, responsables.
- [ ] Probar expiración postlocks, drift, duplicación, cierre/recuperación y
  preservación de historial con PostgreSQL canónico; tests/lint/build/bundle/diff
  pertinentes. No convertir un test local en aceptación hospedada.
- [ ] Revisión/GO específico del titular para ejecutar la ventana; mantener envío,
  conciliación/aplicación y operaciones comerciales fuera si no están autorizadas.
- [ ] Ejecución positiva hospedada con JWT Owner real, custodia/keyring/TA y
  preparación/revisión exacta; evidencia de reload/ACK perdido y cierre posterior.

Temporalidad verificada: TA del diagnóstico descartado vence28/10 15:06:15.411Z
(12:06:15 Argentina); catálogo2 vence29/10 02:59Z (28/10 23:59 Argentina).
No LoginCms Edge antes del vencimiento conocido, no extender catálogo manualmente.
Si una ventana/propuesta vence, revisar el material público y evidencia fresca
necesarios; no repetir secretos, compatibilidad CMS ni gates cerrados por rutina.

### Regla de cierre de cada bloque y del objetivo

Cada pendiente debe tener estado, evidencia/commit, límite de la prueba, siguiente
acción y dependencia (código, entorno, GO o dato del titular). Una casilla sólo se
cierra con evidencia del MISMO alcance. WRITE incierto => STOP/reconciliar, no retry.
No abandonar una prueba viva por timeout de observación; continuar su mismo handle.
No abrir trabajo cosmético/independiente para evitar un blocker de la ruta crítica.

Después de aceptación positiva: PR03 => PR02 primerCAE autorizado y recuperado;
luego PR04–PR09 con fallos/contingencias/integridad/seguridad/backup-restore/DR/
concurrencia/E2E reales. PR10 y PR11 requieren sus gates propios. Auditoría final
requisito por requisito sobre la matriz original, sin redefinir éxito por lo ya
implementado. Impresora/cajón/Point siguen diferidos hasta cliente/hardware; no
ocultar esos diferidos al evaluar preparación comercial. Objetivo permanece activo,
no completado por este registro. Master/Production/merge fuera del alcance actual.


### Cierre local y preflight de instalación — 29/10/2026 22:57Z

Validación final del incremento: 5310 PASS / 0 FAIL / 1 skip histórico,
332 archivos; sin archivos de pruebas omitidos del inventario. Evidencia
../backup-auth-closure-global-20261029.json, SHA256
3f94aaf4fc73f8944b60aef83f5765b3e7ba544af5d14a41b20f16f766bfbebe.
58 pruebas enfocadas y 12 escenarios PostgreSQL17.11 PASS. Build final689
exit0; lint y manifiesto bootstrap43 PASS. El primer build detectó un tipo
UUID demasiado amplio en el helper de prueba; corregido sin casts ni supresiones.
No se interpreta el skip histórico como PASS.

Propuesta de instalación v2 PREPARED_NOT_AUTHORIZED_NOT_EXECUTED:
../backup-contracts-install-proposal-v2-20261029.json SHA256
f3d91990358df5e516435fd601cdfad190007488bc3336b3bbd7cf6d6df40cfc.
Paquete atómico ../backup-contracts-install-candidate-v2-20261029.sql SHA256
25919ddaab7257ed25b4f24f1c43b18063e5e6d67f06786590ebc124093eaf82.
Incluye únicamente pilot-backup001–003, guard inicial de identidad/ausencia,
verificación de cuerpos/firmas/ACL antes de COMMIT y recuperación sólo lectura.
V1 se rechazó antes de ejecutar SQL por conversión LF/CRLF del generador;
se conservó y v2 usa bytes UTF8/LF verificados. No afectó el respaldo privado.
Seis comprobaciones del paquete v2 PASS en PostgreSQL aislado: identidad errónea
rechazada, creación/metadata, rollback a ausencia, cuerpos y filas originales
sin cambios, recovery READ ONLY; contenedor propio detenido. Evidencia
../backup-contracts-install-packet-local-v2-20261029.json.

Preflight hospedado22:57:17Z REPEATABLE READ READ ONLY/ROLLBACK:
identity_fuse=true, read_only=on, public_overloads=0, cuatro funciones ausentes.
Evidencia ../backup-contracts-install-preflight-v2-20261029.json.
No se ejecutó DDL, restore ni RPC comercial. El GO anterior cubrió sólo respaldo.
Próximo gate: revisión y GO específico para instalar este paquete exclusivamente
en Staging acoyfwwmhaeruciyedri. UI integral bloqueada, sin flags/Edge/Vercel,
ARCA/CAE, master, merge o Production. Restore real, Storage y copia externa
siguen pendientes; PR07 no cerrado.


### GO e instalacion de contratos PR07 — 29/10/2026 23:01Z

Titular: GO solo contratos y verificacion en Staging. Aplicado UNA vez el
paquete v2 aprobado f3d91990 / SQL25919dda, commit fuente c0c0fef.
Preflight inmediato23:00:31Z READ ONLY: identidad correcta, cuatro funciones
ausentes, cero sobrecargas. Una transaccion con pre/postchecks y COMMIT.
Verificacion independiente23:01:21Z READ ONLY/ROLLBACK: identity_fuse=true,
public_overloads=4, cuatro funciones presentes y metadata_matches=true.
Esto comprueba cuerpo SHA256, firma/argumentos, owner postgres, SECURITY DEFINER,
search_path, retorno, volatilidad y ACL: authenticated puede ejecutar, anon y
service_role no. Los RPC mantienen la autorizacion de Dueno en servidor.
Evidencias: ../backup-contracts-install-authorized-attempt-20261029.json,
../backup-contracts-install-go-preflight-20261029.json y
../backup-contracts-installed-verified-20261029.json; captura
../backup-contracts-installed-20261029.png. Sin reintentos ni restore ejecutado.

Estado: pilot-backup001-003 INSTALADOS/METADATA PASS solo en Staging
acoyfwwmhaeruciyedri. No se modificaron datos comerciales, flags, Edge, Vercel,
ARCA, master o Production. UI integral sigue bloqueada. Este GO queda consumido;
no autoriza restaurar datos ni ampliar funciones. PR07 sigue PARCIAL: falta
aceptacion con JWT/RLS reales de estos contratos y restore aislado autorizado,
Storage/copia externa/DR. Preparar primero el ensayo exacto y reversible;
no inferir autorizacion de mutaciones comerciales a partir de este GO.


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


### Recuperacion revisada durable con parada — 30/10/2026

079fac8 publicado; siguiente incremento solo local, sin nueva sesion Auth/SQL.
El motor permite preparar una revision hash ligada al tip del journal, plan v2,
indice/UUID/solicitud/ACK y Dueño pinneado, vigencia5min. Relectura al consumir:
solo ACK exacto/contexto original y revision vigente permiten fsync de
RECOVERED_CONFIRMED. Nunca se guarda solicitud/ACK crudo, solo hashes/identidades.
Una resolucion revisada cierra pending y deja stopped=true/complete=false incluso
tras reload; bloquea TODAS las llamadas siguientes, incluido replay planificado.
No hay auto-retry, permiso de continuar, eliminacion de lock ni salto de pasos.
La ruta administrativa de lectura sigue separada; ausencia/conflicto/rechazo
incierto requieren investigacion, no se convierten en confirmacion.

Este hash es binding local, NO firma ni autorizacion servidor. El futuro
asistente debe acreditar identidad real, ACL/privacidad, decision del operador y
GO especifico. No se provee funcion para reanudar despues de stopped ni desbloqueo
automatico tras crash. Continuacion excepcional requiere nueva propuesta exacta.

121 pruebas enfocadas PASS/0FAIL/0skip, incluye hijo Node real que sale72 justo
tras fsync de resolucion: reload detenido, lock conservado, sin salida privada.
Evidencia ../restore-reviewed-settlement-crash-final-20261030.json. Rechazos:
review alterada/vencida/tip cambiado, actor ajeno, ACK cambiado/ausente, red/disco.
Primera corrida116PASS/4FAIL: tres tests intentaban mutar propuesta congelada
(corregidos usando copia); un caso SQL/fsync supero5s. Corrida final usa15s por
caso, sin modificar las aserciones ni eliminar escenarios. Fallos conservados.
Lint, sintaxis y diff PASS. Build final se registra tras comprobacion terminal.

PR07 PARCIAL. Faltan envoltorio Windows/ACL/entrada privada/logout, pruebas de
ese envoltorio, respaldo fresco y preflight antes de solicitar GO de restore.
Plan v2 permanece NO autorizado/NO ejecutado remotamente. Sin flags/Edge/ARCA,
master/Production/merge; UI integral bloqueada. Objetivo PR01-PR11 activo.

Build final posterior al caso crash exit0, aviso chunks >500kB conservado.
36JS publicos sin cuatro simbolos de recuperacion examinados; no certificacion
absoluta de secretos. Sin cambios al esquema ni pruebas remotas.


### Control privado de fases PR07 — 30/10/2026

c1b902b publicado, PR3 abierto/Draft y sin merge. Preparado control LOCAL de
fases Owner18/Cashier3, con sesiones/preflight inyectados y escritura cerrada por
defecto.135 pruebas enfocadas PASS, sin Auth/red/restores reales. Detalle y limites
en ExecPlan pilot-backup-recovery-acceptance, adenda de control privado de fases.
No listo para GO: faltan consola Windows/ACL/entrada de credenciales, adaptadores
reales de login/preflight y respaldo fresco. PR07 y objetivo PR01-PR11 PARCIALES;
UI integral bloqueada, master/Production/ARCA/flags sin cambios.

Build final exit0 (aviso chunks >500kB);36JS sin tres simbolos privados
seleccionados. Revisión acotada, no certificacion absoluta de secretos.


### Preparacion privada Windows PR07 — 30/10/2026

74de2c0 publicado. Consola LOCAL de preparacion y verificacion de carpeta/journal
implementada, sin login/red/PostgreSQL/restores.152 pruebas enfocadas PASS,
build/lint/diff PASS. Detalle, limites y evidencia en ExecPlan backup. Esta
preparacion NO es ejecutor de restore ni GO; faltan login/preflight privados,
respaldo fresco, pins de actores revisados y paquete exacto autorizado.
PR07 PARCIAL, objetivo PR01-PR11 activo, UI integral bloqueada. Sin cambios a
master/Production/flags/Edge/Vercel/ARCA ni lectura de claves originales.


### Login privado y comparador de dependencias PR07 — 30/10/2026

2e569da publicado. Preparado login Auth privado de rutas fijas y comparacion de
metadata contra baseline revisada, solo pruebas sinteticas/locales.188 pruebas
focalizadas PASS, sin nuevas sesiones Staging ni mutaciones. Detalle y alcance en
ExecPlan backup. Faltan conexion PG/TLS readonly, preflight de datos por paso,
backup fresco, paquete/pins/ventana y GO antes de cualquier ensayo real.
PR07 PARCIAL; no se habilita UI integral, flags, Edge, Vercel, ARCA o Production.

Build final exit0 (aviso chunks >500kB),36JS publicos sin cuatro simbolos/hash
privados seleccionados. Revision acotada, no certificacion absoluta de secretos.


### Lector PostgreSQL privado readonly PR07 — 30/10/2026

Preparado puerto fijo de lectura administrativa;209 pruebas enfocadas PASS,
build/lint/sintaxis/diff PASS. Sin conectar Staging ni usar credenciales reales.
No expone query/Client ni escritura; detalle en ExecPlan backup. Falta validar
estado comercial/fixtures/auditoria por cursor, conectar consola/login/PG en
paquete exacto y obtener respaldo/GO de ensayo. No sustituye estos gates.
Objetivo PR01-PR11 activo, PR07 PARCIAL, UI integral y permisos remotos cerrados.


### Estado del ensayo por cursor PR07 — 30/10/2026

Publicacion confirmada hasta b04be72. Preparadas lecturas por cursor vinculadas
al journal/ACK original,227 pruebas enfocadas PASS. Sin sesiones ni restores
reales. Detalle en ExecPlan backup. Resultado OWNED_FIXTURES_MATCH_ONLY: no
certifica conservacion de datos ajenos al ensayo ni todos los saldos/caja del
comercio. Falta esa baseline durable, paquete/backup/ventana/GO y consola de
EJECUCION integrada; el preparador Windows existente no ejecuta restores.
PR07 PARCIAL, objetivo PR01-PR11 activo, UI/flags/ARCA/Production cerrados.

Build final exit0 (aviso chunks >500kB);36JS publicos sin tres simbolos de
estado privado seleccionados. Revision acotada, no certificacion absoluta.


### Preservacion comercial durable PR07 — 30/10/2026

Publicacion confirmada hasta da8aaa6. Preparada huella de50 tablas comerciales,
solo hashes/cantidades, y verificacion compuesta con metadata/filas del ensayo.
247 pruebas enfocadas PASS/0FAIL/0skip. Sin sesiones/consultas remotas nuevas.
Detalles/exclusiones/limites en ExecPlan backup; no equivale a backup, restauracion
real, RLS integral ni GO. Falta paquete exacto de ejecucion Windows, revision del
alcance hospedado, respaldo fresco y GO antes de cualquier mutacion.
PR07 PARCIAL; PR01-PR11 activo, UI integral bloqueada, Production intacta.

Cierre local: build final exit0 (aviso chunks >500kB), manifiesto bootstrap43
PASS,36JS sin tres simbolos privados seleccionados. Primer build detecto union
undefined en closure de test; corregido con const local tipada y recheck43 PASS,
sin casts/supresiones en implementacion. Suite global anterior no atribuida aqui.


### 2026-10-31 - Integracion local PR07 en curso; NO habilitada

Desde fae2c3d publicado: scopes separados para captura por lectura y ensayo
mutante; actores, ventana, fuentes, baseline y respaldo vinculados. Nuevo modo
-AntesEnsayoRestauracion sin uso real. Evidencia parcial: respaldo33 PASS,
paquete/operador31 PASS, verificador sintetico12 PASS. No acredita respaldo real
ni restauracion fisica. Postflight Owner18 fallido conserva exclusion y bloquea
Cajero sin retry. Build final PASS689 modulos (aviso chunks >500kB); primer intento
con dos errores de tipos de tests corregidos sin casts. Lint enfocado PASS.

Falta probar executor integrado/wrapper y cierre agregado antes de publicar el
bloque coherente. No declarar listo ni aprobado. Sin Auth real, restore, flags,
SQL remoto, Edge, Vercel, ARCA, master o Production. Sin GO nuevo.


### 2026-10-31 - Ejecutor integrado aislado PR07 verificado localmente (GO-ready local; remoto NO ejecutado)

Resueltos los blockers locales del operador por fases y del ejecutor integrado,
preservando los reportes iniciales fallidos (`../restore-execution-package-focused-20261031.json`
30 PASS/1 FAIL y `../restore-private-executor-focused-20261031.json` 14 PASS/4 FAIL).
`runRestoreRolePhase` retiene `journal.jsonl.phase.lock` ante cualquier fallo con
`attempted > 0` (incluida la accion 0 incierta) e impone `FINAL_PREFLIGHT`;
`executePrivateRestorePacket` adquiere exclusion de instancia unica (`stage=LEASE`)
antes de `JOURNAL`/`BACKUP`/`CONNECT` y valida cursor esperado (`0` o `18`);
`RestoreJournal` verifica hash tip tras `fsyncSync` y clasifica archivo ausente;
`createRestoreHttpClient` rechaza JWT expirado antes de red; el wrapper Windows
valida existencia de `journal.jsonl` y ausencia de locks antes de pedir secretos.

Suite focalizada completa: 20 archivos / 395 pruebas PASS / 0 FAIL / 0 skipped
(`../restore-integrated-executor-complete-20261031.json`, SHA256
`cefa9bee8e579b8c586c826244c848db265d0cd69017b88ca808031ce4c972a9`).
Build (`tsc -b && vite build`, 689 modulos), `oxlint` focalizado/global,
`node --check` y aislamiento de 36 chunks JS publicos: PASS. `GLOBAL_SUITE_NOT_RUN`.
Estado: `FINAL_BLOCKER=RESOLVED`, `INTEGRATED_EXECUTOR=PASS`, `readyForRestoreGo=true`,
`REMOTE_EXECUTED=false`, `RESTORES_EXECUTED=0`. Sin ejecucion remota, respaldo real
nuevo, sesiones Auth reales, cambios en Staging/Production, ARCA, flags ni merge.


### 2026-11-02 - Cierre de ensayo de restauración aislada PR07 en Staging (PASS)

Ejecución y aceptación de ensayo de restauración aislada PR07 (`PR07_FIXED_ISOLATED_RESTORE_ACCEPTANCE`)
en run-dir `C:\Users\jonat\KioskoPOS-Privado\Restauracion-Staging\1b04a5c7d412400b94492a6c1c821300`.
El rol OWNER completó cursores 0 a 18 y el rol CASHIER completó cursores 18 a 21 con 3 reyecciones esperadas
bajo RLS (`EXPECTED_REJECTION`, SQLSTATE `42501`) en `restaurar_contacto_backup`, `restaurar_producto_backup`
y `restaurar_lote_backup`.

Evidencia:
- `PR07_RESTORE_ACCEPTANCE = PASS`
- `PR07 CLOSED = true`
- `JOURNAL_CURSOR = 21`
- `JOURNAL_COMPLETE = true`
- `CASHIER_CONFIRMED = 3`
- `BASELINE_PRESERVATION = PASS` (`6022d9241e9b942e1c83d5418bf6115615e44ce9a3272f5c6308d19303418952`)
- `STAGING_BUSINESS_WRITES_FROM_CASHIER = 0`
- `OWNER_REEXECUTED = false`
- `PG_CONNECTION_CLOSED = PASS`
- `CASHIER_LOGOUT_LOCAL = PASS`
- `ARCA_CALLS = 0`
- `PRODUCTION_MUTATIONS = 0`
- `HEAD = cb66e25488bd4765f4c5f2f8daa5dfc76d21ddb4`
- `REMOTE_HEAD = cb66e25488bd4765f4c5f2f8daa5dfc76d21ddb4`
- `WORKTREE = CLEAN`
- `merge = false`

PR07 queda CERRADO (`PASS`). Siguiente gate según orden de precedencia maestro: PR03 previo a PR02.


### 2026-11-02 - Verificación de lectura PR03-A en Staging (PASS - 6/9 requisitos)

Se auditó y verificó en Staging `acoyfwwmhaeruciyedri` el primer tramo de lectura PR03-A
bajo aislamiento `REPEATABLE READ READ ONLY` y `ROLLBACK` obligatorio:
- `PR03_A = PASS`
- `FISCAL_CUSTODY = PASS`
- `ISSUER_CHECK = PASS` (emisor `20415005963`, inactivo)
- `POS_CHECK = PASS` (PV 2, tipo 11 Factura C)
- Requisitos acreditados: 6/9.
- Pendientes: PR03-B (idempotencia y reserva de numeración) y PR03-C (catálogo 3 bajo GO).
- PR03 permanece PARCIAL. PR02 permanece PENDIENTE. Sin mutaciones ni llamadas a ARCA.


### 2026-11-02 - Reclasificación de orden de gates PR03 (PR03-A -> PR03-C -> PR03-B)

Tras la ejecución controlada y segura bajo FAIL-CLOSED del intento PR03-B en Staging:
- Se confirmó que la entrada legacy `preparar_operacion_fiscal_homologacion` está cerrada deliberadamente por migración 054 (`SQLSTATE 42501`).
- La ruta canónica y activa es `public.guardar_datos_preparacion_homologacion`, la cual depende de `cargar_datos_preparacion_homologacion`.
- `cargar_datos_preparacion_homologacion` exige estrictamente:
  1. Venta sintética completada válida sin CAE;
  2. Emisor fiscal homologación habilitado (`habilitado = true`);
  3. Parámetros fiscales vigentes (`vence_en > clock_timestamp()`).
- Dado que el catálogo revisión 2 está expirado y el emisor se encuentra inactivo, PR03-B está bloqueado técnicamente hasta que exista la revisión 3 vigente.
- Nuevo orden de ejecución formal: `PR03-A -> PR03-C -> PR03-B`.
- Estado de acreditación: `PR03_REQUIREMENTS_PASS = 6/9`.
- Estado de sub-gates:
  - `PR03_A = PASS`
  - `PR03_B = BLOCKED_BY_PR03_C`
  - `PR03_C = NEXT_GATE`
- Cero llamadas ARCA, cero mutaciones comerciales, PR02 permanece PENDIENTE.


### 2026-11-03 - Preparación íntegra de PR03-C (Refresco de Parámetros y Catálogo 3)

Preparación local y formal de contratos, paquete y runner para PR03-C:
- **Allowlist estricta de 3 llamadas**: `LoginCms` (1), `FEParamGetTiposIva` (1), `FEParamGetCondicionIvaReceptor` (1).
- **Prohibición estricta de emisión**: `FECAESolicitar`, `FECompConsultar`, `FECompUltimoAutorizado` y `FEParamGetPtosVenta` declarados inalcanzables (`FECAESOLICITAR_REACHABLE = false`, `FECOMPCONSULTAR_REACHABLE = false`, `PR03_C_EMISSION_CAPABLE = false`).
- **Estado de TA**: Expirado previamente en homologación; `EXISTING_TA_REUSABLE = false`, `LOGINCMS_REQUIRED = true`. Contador acotado a 3 llamadas máximo (4ta llamada fatal / STOP). Cero auto-retry.
- **Inmutabilidad y Requisito Insert-Only**: Revisión 2 se mantiene inalterada (`REVISION_2_MUTATED = false`); Revisión 3 es insert-only y arranca deshabilitada (`habilitado = false`).
- **Emisor**: Permanece inactivo durante PR03-C (`EMITTER_ENABLE_DURING_PR03_C = false`); su ventana temporal se reservará exclusivamente para PR03-B (`EMITTER_ENABLE_REQUIRED_FOR_PR03_B = true`).
- **Estado del gate**: `PR03_C_PREPARATION = PASS`, pendiente de GO explícito del titular para ejecución remota. PR03 permanece PARCIAL (6/9). Cero mutaciones ni llamadas a ARCA ejecutadas.


### 2026-11-03 - Implementación de Ejecutor Remoto PR03-C (Staging)

Implementación del ejecutor remoto controlado para refresco de parámetros de homologación:
- **Modos de ejecución explícitos**: Dry-run por defecto (`dryRun = true`, `authorized = false`, sin red ni escrituras). Ejecución real acotada estrictamente a `--authorized` junto con `--scope PR03_C_PARAMETER_REFRESH` y `--project-ref acoyfwwmhaeruciyedri`.
- **Ruta y Allowlist de Transporte**: Secuencia estricta y única `LoginCms` (1) -> `FEParamGetTiposIva` (1) -> `FEParamGetCondicionIvaReceptor` (1). Máximo 3 llamadas totales (`MAX_ARCA_CALLS = 3`), 4ta llamada fatal / STOP. Auto-retry taxativamente prohibido (`AUTO_RETRY = false`).
- **Bloqueo de emisión**: `FECAESolicitar`, `FECompConsultar`, `FECompUltimoAutorizado` y `FEParamGetPtosVenta` inalcanzables.
- **Custodia y Secretos**: Reutiliza custodia acreditada sin exponer Token/Sign en logs/reportes (`SECRETS_IN_REPORTS = 0`).
- **PostgreSQL Insert-Only**: Preflight en transacción READ ONLY (`REVISION_3_PREEXISTING = false`), INSERT acotado de revisión 3 bajo guards criptográficos de plan y target, y postcheck READ ONLY verificando que el emisor continúa inactivo (`EXPECTED_ISSUER_ENABLED = false`) y la revisión 2 inalterada (`REVISION_2_IMMUTABILITY = PASS`).
- **Estado**: `PR03_C_REMOTE_EXECUTION_READY = true`. PR03 permanece en 6/9 requisitos acreditados. Cero escrituras en Staging y cero llamadas a ARCA ejecutadas en este bloque (`ARCA_CALLS_NEW = 0`, `STAGING_WRITES_NEW = 0`).


### 2026-11-03 - Endurecimiento Operativo de PR03-C (Staging)

Endurecimiento operativo e implementación de garantías de seguridad para PR03-C:
- **CLI estricto y parse de subproceso**: Entrada en `scripts/fiscal/execute-pr03-c-staging.mjs` valida `process.argv` vía `validatePr03cCliArgs`. Exige explícitamente `--scope` y `--project-ref` bajo `--authorized`. Testeado en subproceso real (`spawnSync`) con intercepción previa a red.
- **Wrapper Privado y Custodia**: Creado `scripts/fiscal/run-pr03-c-staging-private.ps1` que verifica rama `feat/pilot-envases-returns`, árbol limpio y paridad de commits `HEAD == REMOTE_HEAD`. Solicita contraseña de PostgreSQL vía diálogo GUI privado, y firma TRA en memoria con `WsaaHomologacion.cs` sin llamadas externas a ARCA.
- **TLS Estricto en PostgreSQL**: Prohibición absoluta de `rejectUnauthorized: false`. `resolvePostgresSslConfig` exige certificado CA raíz válido (`prod-ca-2021.crt`) y rechaza conexiones inseguras fail-closed.
- **Vínculo estricto con HEAD**: `createPr03cExecutionPackage` valida que `headCommit` coincida con el HEAD del repositorio y con `REMOTE_HEAD`.
- **Reuso condicional de TA**: Si las credenciales no están presentes en memoria privada (`hasCredentials === false`), el TA se clasifica como no reutilizable (`TA_CREDENTIALS_INACCESSIBLE`) requiriendo `LoginCms`.
- **Separación de fases C1 y C2**:
  - `PR03_C1_PARAMETER_REFRESH`: ejecuta llamadas ARCA, inserta Revisión 3 inactiva (`habilitado = false`) y ejecuta postcheck C1.
  - `PR03_C2_CATALOG_ENABLE`: 0 llamadas ARCA; activa Revisión 3 (`habilitado = true`) bajo guards de integridad en `PR03_C_C2_ENABLE_SQL`.
  - `--resume-existing-revision3`: omite llamadas ARCA y ejecuta directamente la activación C2 si la revisión 3 ya existe inactiva y válida.
- **Trazabilidad BEFORE/AFTER y Cierre de Conexión**: Reporta estados de catálogo y emisor antes y después de cada fase. Verifica cierre formal de PostgreSQL (`PG_CONNECTION_CLOSED = PASS`).
- **Estado**: `PR03_C_REMOTE_EXECUTION_READY = true`. Cero escrituras en Staging y cero llamadas ARCA ejecutadas en este bloque (`ARCA_CALLS_NEW = 0`, `STAGING_WRITES_NEW = 0`, `PRODUCTION_MUTATIONS = 0`).


### 2026-11-03 - Cierre Integral de PR03 (9/9 PASS) en Staging

Aceptación remota hospedada de PR03 sobre el tenant sintético acreditado (`f4a00000-2026-4011-a001-000000000001`, PV 9999):
- **Idempotencia Hospedada (`REPLAY_REAL_PG = PASS`)**: Replay idéntico verificó misma reserva sin mutaciones. Solicitud conflictiva rechazada con SQLSTATE `40001` (`CONFLICT_REAL_PG = PASS`).
- **Numeración y Concurrencia Hospedada (`CONCURRENCY_REAL_PG = PASS`)**: Bloqueo demostrado en `pg_locks` (`LOCK_OBSERVATION_SOURCE = PG_LOCKS`). Segunda reserva rechazada con SQLSTATE `55000` (`SINGLE_PENDING_RESERVATION`).
- **Protección Inviolable de PV 2 (`REAL_PV2_GUARD = PASS`)**: Emisor real PV 2 permaneció strictly inactivo (`REAL_PV2_ENABLED_DURING_PR03_B = false`) y sin series tocadas (`REAL_PV2_SERIES_TOUCHED = false`).
- **Limpieza Transaccional (`SUCCESS_CLEANUP = PASS`)**: Eliminación total de entidades sintéticas de prueba (`RESIDUAL_SYNTHETIC_FISCAL_STATE = 0`).
- **Baselines Comerciales**: Hash SHA-256 pre y post ejecución idéntico (`222bb460131141d3638cd8e7e05dc5763e2ec68e6b837b722f4c622786a31088`).
- **Métricas Finales**: `PR03_B_RUN_ID = ef59490c-c1c0-40cf-a449-e51a79da3327`, `ARCA_CALLS_NEW = 0`, `COMMERCIAL_WRITES = 0`, `PRODUCTION_MUTATIONS = 0`. Conexiones cerradas (`PG_CONNECTIONS_CLOSED = PASS`).
- **Estado**: **PR03 = 9/9 PASS (100% formal y fáctico)**. Habilita preparación de PR02.


### 2026-11-03 - Preparación Segura de PR02 (Sin Emisión)

Auditoría de dependencias, protección de historial y diseño por fases para el gate PR02:
- **Protección de Intención Histórica 042**: Prohibición taxativa de segundo `FECAESolicitar` sobre intención 042. Sólo conciliable READ ONLY bajo GO posterior específico. Prohibido reutilizar UUIDs, identidades o payloads anteriores.
- **Política de Selección de Venta Candidata (PV 2)**: Venta de kiosco operativo `b7254826-c767-4098-94b8-71013c12021d`, PV 2, Factura C:
  - `estado = 'COMPLETADA'`;
  - total positivo y `detalles_venta` válidos;
  - sin CAE previo (`cae IS NULL`);
  - sin devoluciones incompatibles ni operaciones fiscales pendientes;
  - sin intento en estado `ENVIO_INCIERTO`;
  - aprobada nominativamente por el Dueño. Cero auto-selección y cero creación de ventas nuevas.
- **Verificaciones Pre-Emisión**: Catálogo R3 vigente; TA no expirado (no reuso de TA vencido); emisor operativo verificado; certificados/claves validados; permisos de worker; numeración oficial contrastada (`FECompUltimoAutorizado`).
- **Secuencia PR02 en 4 Fases**:
  - `PR02-A`: Preflight y reconciliación READ ONLY.
  - `PR02-B`: Preparación durable de un único intento.
  - `PR02-C`: Primera emisión real de Homologación (máximo 1 `FECAESolicitar`, ante incertidumbre STOP).
  - `PR02-D`: Conciliación y CAE (`FECompConsultar`, journal durable y efecto comercial exactamente una vez).
- **Estado**: `PR02_READY_FOR_READ_ONLY_GO = true`, `PR02_READY_FOR_EMISSION_GO = false`. Emisor permanece deshabilitado. Cero llamadas ARCA, cero escrituras Staging (`ARCA_CALLS_NEW = 0`, `STAGING_WRITES_NEW = 0`).


### 2026-11-03 - Endurecimiento de Invariantes PR02 Previo a GO Remoto

Subsanación y blindaje de invariantes críticas para la arquitectura de control de PR02:
- **Replay sin Doble SOAP**: Consulta obligatoria de estado durable previo; segundo acceso devuelve resultado persistido o bloqueo de conciliación sin emitir (`REPLAY_SECOND_SOAP_CALL = 0`, `TOTAL_SOAP_CALLS_FOR_SAME_INTENT = 1`).
- **Validación de Venta Candidata con Evidencia BD**: Eliminados booleanos libres. Exige pertenencia a `b7254826-c767-4098-94b8-71013c12021d`, UUID válido, suma exacta de detalles, `cae IS NULL`, auditoría persistida `CLEAN` y aprobación expresa del Dueño con `auth_id`, `venta_id` y timestamp.
- **Protección Histórica sin Heurísticas de Substring**: Descartado `includes('042')` para evitar falsos positivos sobre UUIDs modernos. Blindada la intención 042 real y prohibida la reemisión directa de cualquier intento en `ENVIO_INCIERTO`.
- **Persistencia Obligatoria de Incertidumbre**: `ENVIO_INCIERTO` debe confirmarse durablemente ante timeout SOAP. Si falla la persistencia, se emite `FATAL_UNRECONCILED_STATE`. Cero tolerancia a incertidumbre en memoria.
- **Precondiciones Fail-Closed**: Sin defaults favorables. Exige catálogo R3 explícito, TA vigente con timestamp finito y observación oficial no mayor a 5 minutos.
- **Desacoplamiento de Contratos de Lectura Oficial**:
  - `PR02_A0_STAGING_SQL_READ_ONLY`: 0 llamadas ARCA, 0 escrituras.
  - `PR02_A1_WSAA_AUTH_IF_REQUIRED`: 1 llamada WSAA (sólo si TA expiró).
  - `PR02_A2_LAST_AUTHORIZED_READ_ONLY`: 1 llamada WSFE (`FECompUltimoAutorizado`).
- **Simulación Aislada**: `executePr02Simulation` marcado estrictamente como arnés de prueba (`IS_PR02_SIMULATION_TEST_ONLY = true`). Prohibido como orquestador remoto o endpoint cliente.
- **Estado**: `PR02_LOCAL_HARDENING = PASS`. Suites validadas (37/37 PR02, 195/195 Fiscal, 6/6 PG17, build Vite exitoso). `PR02_A0_READY = true`, `PR02_A1_READY = true`, `PR02_A2_READY = true`, `PR02_READY_FOR_EMISSION_GO = false`. Emisor PV 2 deshabilitado. Cero llamadas ARCA, cero escrituras Staging (`ARCA_CALLS_NEW = 0`, `STAGING_WRITES_NEW = 0`, `PRODUCTION_MUTATIONS = 0`).


### 2026-11-04 - Preparación del Preflight PostgreSQL READ ONLY (PR02-A0)

Implementación del módulo y arnés de preflight READ ONLY en Staging para auditar emisor, catálogo, historial y ventas candidatas:
- **Ejecutor y Wrapper**: Creados `scripts/fiscal/execute-pr02-a0-staging.mjs` y `run-pr02-a0-staging-private.ps1`.
- **Garantías READ ONLY**: Transacción `REPEATABLE READ READ ONLY`, verificación `transaction_read_only = 'on'`, solo consultas `SELECT`, `ROLLBACK` incondicional en `finally`, TLS estricto con CA.
- **Auditoría de Emisor**: Kiosco `b7254826-c767-4098-94b8-71013c12021d`, CUIT `20415005963`, PV 2, cert SHA coincidente, `habilitado = false`, cero emisores habilitados globalmente (`enabled_count = 0`).
- **Auditoría de Catálogo**: Revisión 3 habilitada con hash `11e9d2244b4fd418df4ab9bc3798c303d66f181785ba678597fdeffa76d5e884` y vigencia contra `clock_timestamp()`. Si está vencido -> `CATALOG_EXPIRED = true` y STOP.
- **Auditoría de Historial e Incertidumbre**: Comprueba ausencia de reservas en `ENVIO_INCIERTO` o `RESERVADA` pendiente en PV 2, permisos consumidos sin respuesta y estado de intención 042. Si hay incertidumbre -> `FISCAL_HISTORY_REQUIRES_RECONCILIATION = true` y STOP.
- **Ventas Candidatas Sin Auto-Decisión**: Identifica elegibilidad técnica y produce lista de UUIDs candidatos. `SALE_AUTO_SELECTED = false`, `OWNER_APPROVAL_GRANTED = false`.
- **Separación de Dependencias**: `TA_STATUS = NOT_CHECKED_IN_A0`, `OFFICIAL_NUMBERING = NOT_OBSERVED_IN_A0`, `EMISSION_PERMISSION = DISABLED`.
- **Prerequisitos Obligatorios para PR02-C**: Documentados los 6 puntos críticos (getExistingIntent obligatorio, CAS durable, persistencia obligatoria de rechazos/incertidumbre, no confundir aprobación con CAE aplicado, validación del Dueño confiable, y observación oficial validada).
- **Estado**: `PR02_A0_LOCAL_PREPARATION = PASS`, `PR02_A0_REMOTE_EXECUTION_READY = true`, `PR02_A0_REMOTE_EXECUTED = false`. 22/22 tests PASS, build exitoso. Cero llamadas ARCA, cero escrituras Staging (`ARCA_CALLS_NEW = 0`, `STAGING_WRITES_NEW = 0`, `PRODUCTION_MUTATIONS = 0`).

### 2026-11-04 - Corrección Final del Ejecutor READ ONLY antes de Autorizar Staging (PR02-A0)

Blindaje exhaustivo del preflight READ ONLY antes del otorgamiento del primer GO remoto:
- **Pin de Commit Obligatorio y Externo**: Eliminado valor por defecto en `run-pr02-a0-staging-private.ps1`. Se exige `-ExpectedHead` externo de 40 hex chars con verificación estricta de `git fetch origin --prune`, rama exacta, worktree limpio, `HEAD == REMOTE_HEAD` y `HEAD == ExpectedHead`.
- **Endurecimiento Fail-Closed de Argumentos**: Rechazo de contradicciones (`--authorized --dry-run`), argumentos desconocidos y duplicados en CLI y API programática.
- **ROLLBACK Obligatorio y Verificable**: Confirmación de ROLLBACK requerida por PostgreSQL; si falla, `PR02_A0_ROLLBACK_GUARD = FAIL` y se impiden falsos éxitos, preservando diagnósticos compuestos si la consulta falló conjuntamente.
- **Cierre PostgreSQL (client.end) Exigido**: PASS solo construido y devuelto tras cierre exitoso en `finally`. Si `client.end()` falla, se marca `PR02_A0_CONNECTION_CLOSE = FAIL` y `PR02_A0_EXECUTION = FAIL`.
- **Auditoría Documental de Intención 042**: Eliminada la asunción `numero = 42`. Exige correspondencia documental demostrable (`operacion_id`, `intento_id`, serie fiscal, estado, historial de respuesta/conciliación); sin ello reporta `HISTORICAL_042_IDENTIFICATION = UNRESOLVED` sin PASS ni mutaciones.
- **Vigencia Real de Catálogo**: Distingue `PR02_A0_READ_ONLY_AUDIT = EXECUTED` de `PR02_A0_OPERATIONAL_READINESS = BLOCKED_CATALOG_EXPIRED`, permitiendo auditar el estado sin desbloquear emisión si el catálogo está vencido según `clock_timestamp()`.
- **Dry-Run sin PASS Ficticios**: Comprobaciones hospedadas no ejecutadas reportan estrictamente `NOT_RUN`.
- **Estado**: `PR02_A0_FINAL_HARDENING = PASS`, `PR02_A0_REMOTE_EXECUTION_READY = true`, `PR02_A0_REMOTE_EXECUTED = false`. 31/31 PR02-A0 tests PASS, 68/68 PR02 suite PASS, 143/143 tests fiscales PASS, 6/6 PostgreSQL 17 PASS, build Vite exitoso, `git diff --check` limpio. Cero llamadas ARCA, cero escrituras Staging, cero mutaciones Producción.

### 2026-11-04 - Alineación de Auditoría Histórica PR02-A0 con Esquema SQL Real (BLOCKERS 1 a 5)

Corrección estricta de compatibilidad SQL y resolución de bloqueadores de auditoría:
- **Esquema Real Contractual (BLOCKER 1)**: `public.fiscal_respuestas_emision_homologacion` solo contiene `respuesta jsonb` y `registrado_en timestamptz`. Se eliminaron las referencias a columnas inexistentes (`resp.cae`, `resp.resultado`, `resp.creado_en`). El CAE se consulta taxativamente desde `public.fiscal_autorizaciones_homologacion` (`cae`, `vencimiento`, `confirmado_en`).
- **Identificación Histórica 042 (BLOCKER 2)**: Prohibición total de heurísticas (`numero = 42` o sufijo `0042`). Sin coincidencia documental exacta: `HISTORICAL_042_IDENTIFICATION = UNRESOLVED` y `HISTORICAL_042_REEMISSION_FORBIDDEN = true`. PR02-A0 nunca otorga permiso de emisión (`PR02_READY_FOR_EMISSION_GO = false`).
- **Prueba en PostgreSQL 17 Real (BLOCKER 3)**: Validado en suite `fiscalPr02A0PostgresIntegration.test.ts` con contenedor Docker alpine aplicando bootstrap comercial y migraciones `001` a `054`. Confirmada ausencia de SQLSTATE `42703` (undefined_column) y `42P01` (undefined_table) tanto en historial vacío (0 filas) como con respuestas y autorizaciones reales persistidas. Demostrado rechazo con SQLSTATE `25006` ante escrituras en transacción `READ ONLY`.
- **Separación de Readiness Operativo (BLOCKER 4)**: `PR02_A0_READ_ONLY_AUDIT = EXECUTED` claramente separado de `PR02_A0_OPERATIONAL_READINESS` (`BLOCKED_CATALOG_EXPIRED` o `READY`). Catálogo vencido bloquea preparación operativa (`PR02_A0_CATALOG_GUARD = EXPIRED`, `PR02_A0_REMOTE_EXECUTION_READY = false`, `PR02_READY_FOR_EMISSION_GO = false`) sin mutar el catálogo ni llamar a ARCA.
- **Fail-Closed Total (BLOCKER 5)**: Demostrado mediante tests unitarios que ningún error SQL puede devolver PASS. Wrapper con `-ExpectedHead` externo obligatorio, rollback y cierre obligatorio de conexión PostgreSQL.
- **Estado**: `PR02_A0_SQL_SCHEMA_COMPATIBILITY = PASS`, `PR02_A0_HISTORICAL_QUERY_REAL_PG = PASS`, `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`, `HISTORICAL_042_REEMISSION_FORBIDDEN = true`, `PR02_READY_FOR_EMISSION_GO = false`, `PR02_A0_REMOTE_EXECUTION_READY = true`, `PR02_A0_REMOTE_EXECUTED = false`. 33/33 unit tests PASS, 6/6 PostgreSQL 17 tests PASS, build Vite exitoso, `git diff --check` limpio. Cero llamadas ARCA, cero escrituras Staging, cero mutaciones Producción.


### 2026-11-04 - Ejecución Hospedada Autorizada de PR02-A0 (Staging READ ONLY)

Acreditación técnica hospedada de la auditoría READ ONLY contra Staging (`acoyfwwmhaeruciyedri`):
- **Ejecución Autorizada Un Solo Uso**: Ejecutado wrapper `run-pr02-a0-staging-private.ps1` con `-ExpectedHead dee0ef6d0550d78d441a92c3a8b29c9a746ab15b`.
- **Auditoría Técnica**: `PR02_A0_READ_ONLY_AUDIT = EXECUTED`, `PR02_A0_READ_ONLY_GUARD = PASS`, `PR02_A0_TLS_GUARD = PASS`, `PR02_A0_ROLLBACK_GUARD = PASS`, `PR02_A0_CONNECTION_CLOSE = PASS`, `PR02_A0_REMOTE_EXECUTED = true`.
- **Readiness Operativo**: `PR02_A0_OPERATIONAL_READINESS = BLOCKED_CATALOG_EXPIRED`. Catálogo Revisión 3 venció el `2026-11-04T02:59:59.000Z` (`PR02_A0_CATALOG_GUARD = EXPIRED`).
- **Aislamiento de Emisor**: `PR02_A0_REAL_PV2_GUARD = PASS`. Emisor en PV 2 inactivo (`habilitado = false`), cero emisores habilitados globalmente (`enabled_count = 0`).
- **Historial e Intención 042**: `PR02_A0_HISTORY_GUARD = PASS`. Sin reservas inciertas ni pendientes en PV 2. `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`, `HISTORICAL_042_REEMISSION_FORBIDDEN = true`.
- **Ventas Candidatas**: 4 ventas técnicamente elegibles, 0 seleccionadas, 0 aprobadas (`SALE_AUTO_SELECTED = false`, `OWNER_APPROVAL_GRANTED = false`).
- **Métricas**: `ARCA_CALLS_NEW = 0`, `STAGING_WRITES_NEW = 0`, `PRODUCTION_MUTATIONS = 0`.
- **Estado**: `PR02_A0_REMOTE_EXECUTED = true`, `PR02_A0_OPERATIONAL_READINESS = BLOCKED_CATALOG_EXPIRED`, `PR02_READY_FOR_EMISSION_GO = false`. Bloquea avance operativo hasta refresco de catálogo.


### 2026-11-04 - Preparación Local del Refresco Fiscal R4 (Gates PR02-P1 y PR02-P2)

Diseño, contratos, arnés de ejecución y validación con PostgreSQL 17 real para el refresco del catálogo a Revisión 4:
- **Secuencia PR02 Actualizada**:
  `PR02-A0 (Auditoría READ ONLY -> EXECUTED)` -> `PR02-P1 (Obtención e Inserción R4 Deshabilitada)` -> `PR02-P2 (Habilitación Atómica R4)` -> `PR02-A1 (WSAA Auth)` -> `PR02-A2 (WSFE Último Autorizado)` -> `PR02-B (Preparación Durable)` -> `PR02-C (Emisión Única)` -> `PR02-D (Conciliación)`.
- **Gate PR02-P1 (Obtención de Parámetros e Inserción Deshabilitada)**:
  - Preflight READ ONLY: verifica R3 vencido, R4 ausente y emisor PV 2 inactivo.
  - Allowlist estricta WSFE: `LoginCms` (máx 1 si TA no reutilizable), `FEParamGetTiposIva` (máx 1), `FEParamGetCondicionIvaReceptor` (máx 1). Total máx 3 (o 2). Cero reintentos.
  - Prohibición total de emisión: `FECAESolicitar`, `FECompConsultar`, `FECompUltimoAutorizado`, `FEParamGetPtosVenta` inalcanzables.
  - Inserción controlada **INSERT ONLY** con `habilitado = false` en `public.fiscal_parametros_homologacion`. Prohibido UPSERT, UPDATE o mutar R3.
  - Postcheck READ ONLY: confirma R4 presente e inactiva, R3 histórica preservada con su hash, y emisor PV 2 deshabilitado.
  - Wrapper: `run-pr02-p1-staging-private.ps1` con `-ExpectedHead` externo obligatorio, GUI prompt para credenciales y TLS estricto.
- **Gate PR02-P2 (Habilitación Atómica Controlada)**:
  - Exige GO explícito independiente con `--expected-hash <SHA256>` del catálogo insertado en P1.
  - Guarda previa SQL (`PR02_P2_GUARD_SQL`): confirma R4 deshabilitada, vigente (`vence_en > clock_timestamp()`), hash coincidente, R3 intacta y emisor PV 2 deshabilitado.
  - Activación atómica única: `UPDATE public.fiscal_parametros_homologacion SET habilitado = true WHERE revision = 4 AND fuente_sha256 = $1 AND habilitado = false;` (1 fila exacta).
  - Postcheck READ ONLY: confirma R4 habilitada y vigente, R3 histórica preservada, y emisor PV 2 deshabilitado.
  - Wrapper: `run-pr02-p2-staging-private.ps1`.
- **Continuidad Contractual de `cargar_datos_preparacion_homologacion`**:
  - La función canónica privada selecciona:
    `WHERE habilitado AND consultado_en<=clock_timestamp() AND vence_en>clock_timestamp() ORDER BY revision DESC LIMIT 1 FOR SHARE;`
    Al habilitarse R4, automáticamente adopta la revisión 4 sin modificar funciones ni esquemas en la base de datos.
  - Trigger `fiscal_parametros_inmutables` activo garantiza que cualquier modificación distinta de `habilitado` es rechazada con SQLSTATE `55000`.
- **Validación con PostgreSQL 17 Real en Docker (`fiscalPr02ParametersPostgresIntegration.test.ts`)**:
  - 11/11 tests PASS cubriendo: R3 vencida confirmada, P1 preflight y postcheck, semántica insert-only, bloqueo de duplicados en PK, rechazo de parámetros corruptos, P2 guard check, actualización atómica `habilitado = true`, rechazo de habilitación de R4 vencida, selección automática en `cargar_datos_preparacion_homologacion`, rechazo por trigger `55000` ante modificaciones no autorizadas, y fail-closed con cierre estricto de conexión.
- **Estado**: `PR02_CATALOG_REFRESH_LOCAL_PREPARATION = PASS`, `REV3_PRESERVED = true`, `REV3_EXPIRED = true`, `REV4_INSERT_ONLY_DESIGN = PASS`, `REV4_ENABLE_GUARD = PASS`, `CANONICAL_LATEST_VALID_REVISION = PASS`, `PR02_REVISION_COMPATIBILITY = PASS`. `PR02_P1_REMOTE_EXECUTION_READY = true`, `PR02_P2_REMOTE_EXECUTION_READY = false`. Emisor real PV 2 deshabilitado (`REAL_PV2_ENABLED = false`, `REAL_PV2_SERIES_TOUCHED = false`). Intención 042 sin resolver (`HISTORICAL_042_IDENTIFICATION = UNRESOLVED`, `HISTORICAL_042_REEMISSION_FORBIDDEN = true`). Cero llamadas ARCA, cero escrituras Staging (`ARCA_CALLS_NEW = 0`, `STAGING_WRITES_NEW = 0`, `PRODUCTION_MUTATIONS = 0`).


### 2026-11-04 - Hardening de P0/P1/P2 tras Auditoría NO-GO de Refresco de Parámetros

Resolución exhaustiva de los 8 bloqueadores de la auditoría independiente (`PR02_P1_REMOTE_GO = DENIED`, `PR02_P2_REMOTE_GO = DENIED`):
- **Autorización Fail-Closed en Todas las Entradas (BLOCKER 1)**:
  - `executePr02ParametersStaging` exige validación estricta de autorización antes de leer credenciales o ejecutar con `deps.client`.
  - Reemplazo inmediato con `UNAUTHORIZED_EXECUTION` ante combinaciones no autorizadas o contradictorias (`UNAUTHORIZED_CONNECTION_ATTEMPTS = 0`).
  - Validación de argumentos CLI fail-closed (rechazo de `--authorized --dry-run`, duplicados y argumentos desconocidos).
- **Desacoplamiento Estricto: P0 vs P1 vs P2 (BLOCKER 2)**:
  - Scopes: `PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`, `PR02_P1_VERIFIED_CATALOG_IMPORT`, `PR02_P2_CATALOG_ENABLE`.
  - Manifiesto oficial P0 (`createPr02P0OfficialEvidenceManifest` / `validatePr02P0Manifest`) con digests SHA-256 de los XML crudos de ARCA (`FEParamGetTiposIva` y `FEParamGetCondicionIvaReceptor`) y estricta exclusión de secretos (Token, Sign, clave privada, CUIT password).
  - P1 delimitado exclusivamente a importación en base de datos (`PR02_P1_IMPORT_ONLY = true`): requiere validación del manifiesto P0 acreditado. Sin él, rechaza con `OFFICIAL_EVIDENCE_NOT_ACCREDITED`.
- **Inserción Atómica en P1 con Table Locks (BLOCKER 3)**:
  - `PR02_P1_ATOMIC_GUARD_SQL` y `verifyPr02P1InTxGuard`.
  - Transacción única: `BEGIN` -> `LOCK TABLE fiscal_parametros_homologacion IN SHARE ROW EXCLUSIVE MODE;` + `LOCK TABLE fiscal_emisores_homologacion IN SHARE ROW EXCLUSIVE MODE;` -> guarda in-tx (R3 baseline, R3 expirada, R4 ausente, emisor inactivo) -> `INSERT ... RETURNING` con `habilitado = false` -> `COMMIT`.
- **Habilitación Atómica en P2 con Verificación de Baseline R3 (BLOCKER 4)**:
  - `PR02_P2_ATOMIC_GUARD_SQL` y `verifyPr02P2InTxGuard`.
  - Transacción única con table locks en `SHARE ROW EXCLUSIVE MODE`.
  - Guarda in-tx y postcheck validan taxativamente el digest fuente exacto de la R3 histórica `11e9d2244b4fd418df4ab9bc3798c303d66f181785ba678597fdeffa76d5e884` (`REV3_SOURCE_SHA256` / `PR02_CATALOG_REV3_HASH`). Discordancia aborta con `PR02_P2_REV3_BASELINE_MISMATCH`.
  - Distinción semántica formal (`REV3_HASH_SEMANTICS = VERIFIED`): `REV3_SOURCE_SHA256` representa la procedencia de evidencia WSFE (columna `fuente_sha256`), mientras que `computeCatalogRowDigest(row)` (`REV3_ROW_DIGEST = 2f6f91e6eee09b1d8d21f0696242bc72f687be4995d7973edf1f4602822561d3`) representa el digest canónico de la tupla completa en base de datos.
  - Corrección de auditoría: `PR02_R3_HASH_DISCREPANCY = RESOLVED`. El valor apócrifo `2e6f4770...` introducido inadvertidamente en documentación previa fue eliminado y reemplazado por la evidencia fáctica acreditada en Staging por PR02-A0.
  - Procedencia P0 vinculada (`P0_PROVENANCE_BINDING = PASS`): Manifiesto P0 vincula unívocamente la identidad del colector, ID de ejecución autorizada, scope `PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`, entorno `HOMOLOGACION`, operaciones WSFE y transporte seguro sin secretos.
  - Evidencia P1 no disponible (`PR02_P1_OFFICIAL_EVIDENCE_VERIFIED = NOT_AVAILABLE`): Prohibida importación de archivos manuales; `PR02_P1_REMOTE_EXECUTION_READY = false`.
- **Máquina de Estados de Transacción y Prohibición de Reintento Incierto (BLOCKER 5)**:
  - Enum `PR02_EXECUTION_OUTCOMES` registrando estado exacto (`NOT_STARTED`, `PREFLIGHT_FAILED_NO_WRITE`, `TRANSACTION_ROLLED_BACK_CONFIRMED`, `WRITE_COMMITTED`, `WRITE_COMMITTED_POSTCHECK_FAILED`, `COMMIT_OUTCOME_UNKNOWN`, `ROLLBACK_OUTCOME_UNKNOWN`, `CONNECTION_CLOSE_FAILED_AFTER_COMMIT`).
  - `UNCERTAIN_WRITE_RETRY_FORBIDDEN = true`. Prohibido cualquier reintento automático o inferido tras fallo de commit.
- **Validación Estricta de Contrato de Catálogo (BLOCKER 6)**:
  - `validatePr02CatalogContract` exige: `consultado_en <= now < vence_en`, conteo de condiciones 1..100 con códigos únicos, alícuotas 0..100 con IDs únicos y procedencia oficial demostrada.
- **Endurecimiento de Wrappers PowerShell (BLOCKER 7)**:
  - `run-pr02-p1-staging-private.ps1` y `run-pr02-p2-staging-private.ps1` verifican `$LASTEXITCODE -ne 0` tras cada comando Git (`fetch`, `rev-parse`, `status`). P1 soporta parámetro `-ManifestFile`.
- **Validación Integral con PostgreSQL 17 Real en Docker (BLOCKER 8)**:
  - Suite `fiscalPr02ParametersPostgresIntegration.test.ts` con 29/29 tests PASS sobre `postgres:17-alpine` validando la atomicidad de locks, postchecks, reversiones, R4 expirado y alteración de columnas de R3.
- **Estado**:
  - `PR02_R3_HASH_DISCREPANCY = RESOLVED`
  - `REV3_SOURCE_SHA256 = 11e9d2244b4fd418df4ab9bc3798c303d66f181785ba678597fdeffa76d5e884`
  - `REV3_ROW_DIGEST = 2f6f91e6eee09b1d8d21f0696242bc72f687be4995d7973edf1f4602822561d3`
  - `REV3_HASH_SEMANTICS = VERIFIED`
  - `P1_R3_BASELINE_GUARD = PASS`
  - `P2_R3_BASELINE_GUARD = PASS`
  - `P0_PROVENANCE_BINDING = PASS`
  - `PR02_P0_OFFICIAL_EVIDENCE_DESIGN = PASS`
  - `PR02_P0_REMOTE_EXECUTION_READY = false`
  - `PR02_P1_IMPORT_ONLY = true`
  - `PR02_P1_OFFICIAL_EVIDENCE_VERIFIED = NOT_AVAILABLE`
  - `PR02_P1_AUTHORIZATION_GUARD = PASS`
  - `PR02_P1_ATOMIC_GUARDS = PASS`
  - `PR02_P1_COMMIT_OUTCOME_GUARD = PASS`
  - `PR02_P1_REMOTE_EXECUTION_READY = false`
  - `PR02_P2_ATOMIC_GUARDS = PASS`
  - `PR02_P2_REV3_BASELINE_GUARD = PASS`
  - `PR02_P2_REMOTE_EXECUTION_READY = false`
  - `CATALOG_CONTRACT_FAIL_CLOSED = PASS`
  - `WRAPPER_GIT_EXIT_CODE_GUARD = PASS`
  - `UNCERTAIN_WRITE_RETRY_FORBIDDEN = true`
  - `REV3_PRESERVED = true`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - Cero llamadas ARCA (`ARCA_CALLS_NEW = 0`), cero escrituras Staging (`STAGING_WRITES_NEW = 0`), cero mutaciones Producción (`PRODUCTION_MUTATIONS = 0`).


### 2026-11-05 - Hardening de Seguridad del Colector PR02-P0 Previo a Autorización GO

Endurecimiento de seguridad y custodia para el colector PR02-P0 previo a un GO oficial:
- **Transporte de Red Oficial Seguro (`createOfficialArcaTransport`)**:
  - Adaptador privado de red real para invocación oficial que requiere GO explícito (`officialGoAuthorized === true`), rigurosamente desacoplado de mocks simulados.
  - Prohibición de `MOCK_CMS` en ejecuciones autorizadas y prohibición de exposición de secretos en argumentos de CLI.
- **Endpoints Canónicos Exactos y Seguridad de Transporte**:
  - Comparación de igualdad exacta con endpoints canónicos HTTPS (`WSAA_HOMO_URL = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'` y `WSFE_HOMO_URL = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'`).
  - Rechazo estricto de HTTP redirects (`redirect: 'error'`), timeout de 15s con `AbortSignal.timeout(15000)`, límite de 2MB por respuesta y validación de Content-Type XML.
  - Prohibición de endpoints de producción y de subdominios apócrifos. Métodos de emisión permanecen inalcanzables.
- **Límites de Llamadas Inmutables y No Sobrescribibles**:
  - `LoginCms <= 1`, `FEParamGetTiposIva <= 1`, `FEParamGetCondicionIvaReceptor <= 1`, `TOTAL_ARCA_CALLS <= 3`. Cualquier intento de elevar los límites lanza `CALL_LIMIT_OVERRIDE_FORBIDDEN`.
  - Auditoría exacta de llamadas iniciadas, completadas y fallidas (`getAuditSummary()`).
- **Evaluación Estricta de TA**:
  - Eliminada autoasignación `valido: true`.
  - Falla cerrada (`TA_REVOKED`, `TA_NOT_AVAILABLE`, `TA_CREDENTIALS_INCOMPLETE`, `TA_SERVICE_MISMATCH`, `TA_CUIT_MISMATCH`, `TA_EXPIRED_OR_EXPIRING_SOON` con margen de 10 min) antes de invocar WSFE si el material de autenticación es revocado o inválido.
- **Procedencia Criptográfica Inalterable (Attestation HMAC-SHA256)**:
  - Eliminada acreditación por mero parámetro booleano. Implementada atestación criptográfica HMAC-SHA256 (`createP0Attestation` / `verifyP0Attestation`) vinculando processId, executionScope, commitSha, consultadoEn, entorno, transportType ('OFFICIAL') y hashes de los artefactos.
  - Colector rechaza marcar como acreditada evidencia simulada (`P0_SIMULATED_EVIDENCE_CANNOT_BE_ACCREDITED`).
  - P1 (`validatePr02P1ImportEvidence`) rechaza manifiestos no oficiales o sin atestación válida con `P1_IMPORT_FORBIDDEN` (`OFFICIAL_PROVENANCE = UNVERIFIED`, `P1_IMPORT_ALLOWED = false`).
- **Custodia Privada y Almacenamiento Atómico de Evidencia**:
  - Validación de `evidenceDir`: rechazo de `..` (path traversal), symlinks y rutas dentro de directorios de código fuente del repositorio (`src`, `scripts`, `supabase`, `docs`, `.agent`, `.git`).
  - Permisos `0o700` para carpetas y `0o600` para archivos.
  - Guarda contra sobreescritura (`EVIDENCE_OVERWRITE_FORBIDDEN`).
  - Exclusión de secretos verificada en todos los archivos generados (incluyendo XML crudos).
  - Escritura atómica vía staging temporal `.tmp_p0_*` con verificación SHA-256 previa al renombramiento definitivo.
- **CLI y Auditoría**:
  - Parser fail-closed que rechaza argumentos desconocidos, duplicados o con secretos, y verifica Git HEAD contra `resolveCurrentGitHead()`.
  - Dry-run reporta fielmente `NOT_RUN` para comprobaciones remotas.
- **Estado**:
  - `PR02_P0_LOCAL_HARDENING = PASS`
  - `P0_REAL_TRANSPORT_IMPLEMENTED = PASS`
  - `P0_CLI_TRANSPORT_WIRING = PASS`
  - `P0_WSAA_TA_GUARD = PASS`
  - `P0_EXACT_ENDPOINT_GUARD = PASS`
  - `P0_CALL_LIMITS_NON_OVERRIDABLE = PASS`
  - `P0_PROVENANCE_ATTESTATION = PASS`
  - `P0_FAKE_MANIFEST_REJECTED = PASS`
  - `P0_PRIVATE_EVIDENCE_STORAGE = PASS`
  - `P0_AUDIT_COUNTS_ACCURATE = PASS`
  - `P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `P1_REMOTE_EXECUTION_READY = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - 148/148 tests PASS, PostgreSQL 17 PASS, build Vite exitoso, secret scan limpio. Cero llamadas ARCA (`ARCA_CALLS_NEW = 0`), cero escrituras Staging (`STAGING_WRITES_NEW = 0`), cero mutaciones Producción (`PRODUCTION_MUTATIONS = 0`).

Implementación privada del colector de evidencia oficial ARCA homologación previo a la importación P1:
- **Colector Privado e Invocador PowerShell**:
  - Implementado `scripts/fiscal/execute-pr02-p0-official-evidence.mjs` y sus tipos `execute-pr02-p0-official-evidence.d.mts`.
  - Implementado wrapper de control `scripts/fiscal/run-pr02-p0-staging-private.ps1` con guardas Git (`git fetch origin --prune`, paridad HEAD con remoto y con `-ExpectedHead`, worktree limpio).
  - Scope exclusivo: `PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`.
  - Target autorizado: `acoyfwwmhaeruciyedri` (CUIT `20415005963`, PV `2`).
  - Modo predeterminado: `DRY_RUN` sin llamadas de red ni conexiones remotas.
- **Auditoría de Transporte WSAA/WSFE**:
  - Reutilización de parsers auditados de PR03-C (`parseWsaaLoginCmsResponse`, `parseWsfeTiposIvaResponse`, `parseWsfeCondicionIvaReceptorResponse`).
  - Allowlist estricta de métodos WSFE: `LoginCms` (máx 1 si no hay TA reutilizable), `FEParamGetTiposIva` (máx 1), `FEParamGetCondicionIvaReceptor` (máx 1). Total máximo: 3 llamadas ARCA.
  - Cero reintentos automáticos (`AUTOMATIC_RETRY_FORBIDDEN`).
  - Prohibición por diseño de métodos de emisión: `FECAESolicitar`, `FECompConsultar`, `FECompUltimoAutorizado`, `FEParamGetPtosVenta` inalcanzables.
  - Endpoints fijos y validados contra producción o URLs arbitrarias: exclusivamente `wsaahomo.afip.gov.ar` y `wswhomo.afip.gov.ar`.
- **Manifiesto y Evidencia sin Secretos**:
  - Manifiesto construido únicamente a partir de respuestas SOAP efectivamente recibidas y verificadas.
  - Validación de integridad: digest SHA-256 de XML SOAP crudo y JSON normalizado (`FEParamGetTiposIva_response.xml`, `FEParamGetTiposIva_normalized.json`, `FEParamGetCondicionIvaReceptor_response.xml`, `FEParamGetCondicionIvaReceptor_normalized.json`).
  - Exclusión rigurosa de secretos: prohibido almacenar tokens, signs, CMS, claves privadas o contraseñas en archivos o logs.
  - Directorio privado ignorado en git: `.fiscal-evidence-pr02/`.
  - Separación formal de integridad y procedencia: `CONTENT_INTEGRITY = PASS`, pero `OFFICIAL_PROVENANCE = UNVERIFIED` hasta acreditar ejecución autorizada en vivo.
- **Fail-Fast ante Errores**:
  - Ante SOAP Fault, error WSFE de negocio o timeout, aborto inmediato sin reintentos ni generación de manifiesto aprobado.
- **Validación con Tests Locales**:
  - Suite unitaria y de integración `src/test/fiscalPr02P0Collector.test.ts` con 22/22 tests PASS cubriendo escenarios negativos, de seguridad, límites de llamadas y transporte simulado. Total de pruebas fiscales: 147/147 PASS.
- **Propuesta Futura de Autorización de P0**:
  - Scope: `PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`.
  - Target: `acoyfwwmhaeruciyedri`.
  - Operaciones: `LoginCms` (<= 1), `FEParamGetTiposIva` (1), `FEParamGetCondicionIvaReceptor` (1). Límite total: 3.
  - Entorno: `HOMOLOGACION`.
  - Identidad: `scripts/fiscal/execute-pr02-p0-official-evidence.mjs` vía wrapper `run-pr02-p0-staging-private.ps1`.
  - Condiciones de STOP: Aborto inmediato ante error de transporte, HTTP != 200, SOAP Fault o error WSFE. Cero escrituras en BD.
  - Artefactos: Paquete de evidencia en `.fiscal-evidence-pr02/` sin secretos.
- **Estado**:
  - `PR02_P0_COLLECTOR_IMPLEMENTATION = PASS`
  - `PR02_P0_AUTHORIZATION_GUARD = PASS`
  - `PR02_P0_WSAA_WSFE_ALLOWLIST = PASS`
  - `PR02_P0_CALL_LIMIT_GUARD = PASS`
  - `PR02_P0_SOAP_VALIDATION = PASS`
  - `PR02_P0_MANIFEST_INTEGRITY = PASS`
  - `PR02_P0_PROVENANCE_BINDING = PASS`
  - `PR02_P0_REMOTE_EXECUTION_READY = false`
  - `PR02_P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `PR02_P1_REMOTE_EXECUTION_READY = false`
  - `PR02_P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `HISTORICAL_042_REEMISSION_FORBIDDEN = true`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - 147/147 tests PASS, PostgreSQL 17 PASS, build Vite exitoso, secret scan limpio. Cero llamadas ARCA (`ARCA_CALLS_NEW = 0`), cero escrituras Staging (`STAGING_WRITES_NEW = 0`), cero mutaciones Producción (`PRODUCTION_MUTATIONS = 0`).


### 2026-11-05 - Corrección Crítica de Atestación y Ejecución Oficial PR02-P0

Blindaje de atestación criptográfica, transporte en streaming y trazabilidad de llamadas para PR02-P0:
- **Eliminación Total de Fallback HMAC y Denylist de Claves Comprometidas**:
  - Removido `PR02_P0_FALLBACK_AUTHORITY_SECRET` y cualquier fallback en código.
  - Denylist `PR02_P0_COMPROMISED_SECRETS` con `'kioskopos-pr02-p0-official-custody-secret-2026'`. Lanza `P0_ATTESTATION_KEY_COMPROMISED`.
  - Validador `validateP0AuthoritySecret(secret)` exige custodia externa en `PR02_P0_AUTHORITY_SECRET`, >= 32 caracteres y rechaza claves de test (`P0_ATTESTATION_TEST_KEY_PROHIBITED`). Sin clave: `P0_ATTESTATION_KEY_MISSING`.
- **Atestación Oficial No Falsificable y Binding Criptográfico**:
  - Atestación oficial restringida al colector confiable (`scripts/fiscal/execute-pr02-p0-official-evidence.mjs`).
  - Vinculación obligatoria de: GO externo (`goAuthorization`), identidad de ejecutor (`executorIdentity`), commit SHA (`commitSha`), `executionId`, entorno `HOMOLOGACION`, operaciones WSFE, digests SHA-256 de respuestas SOAP y normalizadas, y `consultadoEn`.
  - Respuestas simuladas conservan `accredited: false` y `provenance: 'UNVERIFIED'`.
  - P1 (`validatePr02P1ImportEvidence`) valida la atestación contra la clave custodiada externa, lanzando `P1_IMPORT_FORBIDDEN` ante cualquier inconsistencia.
- **Circuito Seguro CLI y 4 Etapas Secuenciales**:
  - Wrapper PowerShell y ejecutor CLI manejan autenticación sin exponer secretos en `argv`.
  - 4 etapas explícitas: 1. Disponibilidad de credenciales (TA vigente o archivo CMS) -> 2. Validación obligatoria de GO externo en transporte oficial -> 3. Autorización de transporte oficial -> 4. Ejecución controlada.
- **Contadores de Auditoría y Detección de Incertidumbre**:
  - `createPr02P0CallTracker`: `recordStart()` verifica límites ANTES de iniciar y previene reintentos automáticos. `recordCall()` no re-ejecuta `recordStart()`.
  - Métricas: `CALLS_ATTEMPTED`, `CALLS_COMPLETED`, `CALLS_FAILED`, `CALLS_OUTCOME_UNKNOWN`. Ante timeout, la operación se computa como intentada y de resultado desconocido (`outcomeUnknown`). Cero reintentos automáticos.
- **Transporte HTTP en Streaming con Límite de 2MB**:
  - Lectura en streaming (`response.body.getReader()`) con cancelación inmediata (`reader.cancel()`, `controller.abort()`) en caso de superar 2 MB (`RESPONSE_SIZE_EXCEEDED`).
- **Pruebas de Falsa Procedencia E2E y Regresiones**:
  - Prueba de regresión E2E confirmando que respuestas simuladas con hashes válidos pero sin autorización oficial resultan en `OFFICIAL_PROVENANCE = UNVERIFIED`, `P1_IMPORT_ALLOWED = false` y `STAGING_WRITES = 0`.
  - Pruebas negativas para claves comprometidas, claves cortas, claves de test, firmas adulteradas, ejecutor apócrifo, commit discrepante y cancelación de streaming.
- **Estado**:
  - `P0_HARDCODED_HMAC_SECRET = REMOVED`
  - `P0_UNTRUSTED_ATTESTATION_REJECTED = PASS`
  - `P0_OFFICIAL_PROVENANCE_GUARD = PASS`
  - `P0_CLI_WSAA_AUTH_PREPARED = PASS`
  - `P0_CALL_AUDIT_ACCURATE = PASS`
  - `P0_HTTP_RESPONSE_LIMIT = PASS`
  - `P0_REMOTE_EXECUTION_READY = false`
  - `P0_REMOTE_EXECUTED = false`
  - `P1_IMPORT_ALLOWED = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - 159/159 tests PASS, PostgreSQL 17 PASS, build Vite exitoso, secret scan limpio. Cero llamadas ARCA (`ARCA_CALLS_NEW = 0`), cero escrituras Staging (`STAGING_WRITES_NEW = 0`), cero mutaciones Producción (`PRODUCTION_MUTATIONS = 0`).


### 2026-11-05 - Hardening Final de Autorización Externa, Custodia y Procedencia PR02-P0

Robustecimiento integral de la autorización administrativa externa, desacoplamiento de tokens sensibles y custodia estricta de procedencia:
- **Eliminación Total de GO Sensible en Argumentos y Manifiestos**:
  - Reemplazo de `--go-token` por `--go-file <ruta>` en `run-pr02-p0-staging-private.ps1` y `execute-pr02-p0-official-evidence.mjs`.
  - Prohibición explícita de `--go-token` en CLI con `CLI_FORBIDDEN_ARGUMENT`.
  - Ni el token en crudo, ni la firma HMAC ni el nonce sensible se incorporan en `createP0Attestation` ni en `manifest.json`. Solo se persisten `go_authorization_id` y `go_authorization_sha256` (hash SHA-256 del documento canónico firmado).
  - Test de regresión confirma que ninguna cadena del token/firma/nonce aparece en `manifest.json` ni en los archivos XML/JSON de evidencia generados.
- **Validación Estructurada y Criptográfica de la Autorización Externa**:
  - Esquema estricto y canónico para el documento GO: `aprobador_identidad`, `scope = PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`, `project_ref = acoyfwwmhaeruciyedri`, `entorno = HOMOLOGACION`, `commit_sha` de 40 hex coincidente con HEAD, operaciones permitidas (`LoginCms`, `FEParamGetTiposIva`, `FEParamGetCondicionIvaReceptor`), límites estrictos (`loginCmsMax <= 1, tiposIvaMax <= 1, condicionIvaReceptorMax <= 1, totalMax <= 3`), `identificador`, `vence_en` (> now), `emitido_en` (<= now), y `single_use_nonce` (>= 16 caracteres).
  - Verificación HMAC-SHA256 contra la clave externa `PR02_P0_GO_AUTHORITY_SECRET`. Claves de prueba son rechazadas para autorización oficial.
  - Protección anti-replay: registro en memoria de autorizaciones consumidas (`markGoAuthorizationConsumed`, `isGoAuthorizationConsumed`). Reutilizar un GO lanza `GO_AUTHORIZATION_ALREADY_CONSUMED`.
  - Fail-closed en Etapa 1: validación del documento GO previa a cualquier lectura de credenciales o CMS; sin autorización válida, `P0_EXTERNAL_GO_VALIDATION = FAIL` y `P0_OFFICIAL_NETWORK_ALLOWED = false`, deteniéndose inmediatamente.
- **Separación Conceptual entre Autorización GO y Atestación de Procedencia**:
  - `GO_AUTHORIZATION = VERIFIED`: valida la autorización administrativa previa a la conexión oficial.
  - `EVIDENCE_PROVENANCE = VERIFIED`: certifica la autenticidad e integridad de la evidencia tras recibir y procesar las respuestas oficiales de ARCA mediante el colector confiable.
  - Llamadores no confiables no pueden auto-declarar `transportType = OFFICIAL` ni generar evidencia aceptada por P1.
- **Custodia de Claves en Importador P1**:
  - `validatePr02P1ImportEvidence` rechaza manifiestos que suministren su propia clave de autoridad (`P1_IMPORT_FORBIDDEN: El manifiesto no puede proveer su propia clave de autoridad`). La verificación se realiza siempre contra la clave de autoridad externa confiable.
- **Trazabilidad de Llamadas y Registro de Fallos**:
  - El tracker computa llamadas completadas (`recordCall`) únicamente tras el parseo exitoso de la respuesta SOAP (`parseWsaaLoginCmsResponse`, `parseWsfeTiposIvaResponse`, `parseWsfeCondicionIvaResponse`). SOAP Faults y errores de respuesta se registran como fallidas, nunca como completadas.
  - Fallos de persistencia en disco adjuntan `P0_ACQUISITION_COMPLETED = false` preservando el resumen de auditoría de llamadas intentadas/completadas.
- **Pruebas de Regresión**:
  - 14 nuevas pruebas de regresión en `fiscalPr02P0Collector.test.ts` (casos 29 al 42), alcanzando 42 pruebas unitarias/seguridad para P0.
- **Estado**:
  - `P0_EXTERNAL_GO_VALIDATION = PASS (en prueba) / FAIL (sin GO)`
  - `P0_GO_SINGLE_USE_GUARD = PASS`
  - `P0_GO_SECRET_EXPOSURE = NONE`
  - `P0_TRUSTED_ATTESTATION = PASS`
  - `P1_UNTRUSTED_SIGNATURE_REJECTION = PASS`
  - `P0_CALL_AUDIT_ON_FAILURE = PASS`
  - `GO_AUTHORIZATION = NOT_RUN (dry-run)`
  - `EVIDENCE_PROVENANCE = UNVERIFIED`
  - `PR02_P0_REMOTE_EXECUTION_READY = false`
  - `P0_REMOTE_EXECUTED = false`
  - `PR02_P1_REMOTE_EXECUTION_READY = false`
  - `PR02_P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - 173 tests PASS, build Vite exitoso, secret scan limpio. Cero llamadas ARCA (`ARCA_CALLS_NEW = 0`), cero escrituras Staging (`STAGING_WRITES_NEW = 0`), cero mutaciones Producción (`PRODUCTION_MUTATIONS = 0`).

### 2026-11-05 - Auditoría Técnica Independiente y Remediación de Seguridad PR02-P0

Auditoría exhaustiva independiente y remediación local definitiva previa a cualquier solicitud de GO remoto:
- **Remediación C-01 (Integridad de Manifiesto P0)**: `validatePr02P0Manifest` valida obligatoriamente `colector_identidad === PR02_P0_COLECTOR_IDENTIDAD` y `manifest.manifest_sha256 === computeP0ManifestDigest(manifest)`.
- **Remediación C-02 (Vinculación de Atestación)**: `verifyP0Attestation` comprueba coincidencia unívoca de `executionId` y `consultadoEn` con el manifiesto. Se clarifica documentalmente el rol de la clave HMAC como garantía de custodia interna del proceso colector, manteniendo `OFFICIAL_PROVENANCE = UNVERIFIED` hasta ejecución en el entorno oficial.
- **Remediación C-03 (Fail-Closed en Opciones)**: `executePr02P0OfficialEvidence` valida tipos booleanos estrictos para `authorized`, `dryRun` y `officialGoAuthorized`. Rechaza `{ authorized: false, dryRun: false }` o `{ dryRun: false }` con `UNAUTHORIZED_EXECUTION`, y exige explícitamente `scope` y `projectRef`.
- **Remediación A-01 (Ticket de Acceso sin Bypass)**: `evaluateExistingTa` elimina `|| rec.valido === true` exigiendo `estado === 'DISPONIBLE'` y validación de strings no vacíos para `servicio` ('wsfe') y `cuit` emisor.
- **Remediación A-02 (Sin Fallback Silencioso en TA Inválido)**: Si se pasa un `existingTa` no reutilizable, `executePr02P0OfficialEvidence` arroja `TA_INVALID_OR_REVOKED` sin llamar a `LoginCms`. Se verifica margen mínimo de 10 min tras parsear un TA de WSAA.
- **Remediación A-03 (Tracker Autónomo y Allowlist en Transporte Oficial)**: `createOfficialArcaTransport.postSoap` incorpora tracker autónomo de llamadas (`createPr02P0CallTracker`), allowlist estricta de métodos, bloqueo inmediato de operaciones prohibidas (`PROHIBITED_ARCA_OPERATION`), rechazo de redirecciones HTTP 3xx y verificación de documento XML SOAP bien formado.
- **Remediación A-04 (Restricción de Tests en P1)**: `executePr02ParametersStaging` restringe `allowUnaccreditedForTest` a entornos con `deps.client` inyectado y propaga `expectedHead`.
- **Remediación M-03 (Symlinks en Ancestros)**: `validateEvidenceDirectory` verifica enlaces simbólicos en todos los ancestros existentes de la ruta.
- **Remediación M-04 (Validación de ExpectedHead en Wrapper)**: `run-pr02-p0-staging-private.ps1` valida `-ExpectedHead` de 40 caracteres hexadecimales contra HEAD aún en `-DryRun`.
- **Suite de Pruebas**: 6 nuevas pruebas de seguridad (casos 43 al 48) añadidas a `fiscalPr02P0Collector.test.ts`. 48/48 tests PASS. 166 tests unitarios fiscales PASS.
- **Estado**:
  - `PR02_P0_INDEPENDENT_AUDIT = PASS`
  - `PR02_P0_LOCAL_HARDENING = PASS`
  - `P0_REAL_TRANSPORT_IMPLEMENTED = PASS`
  - `P0_CLI_TRANSPORT_WIRING = PASS`
  - `P0_WSAA_TA_GUARD = PASS`
  - `P0_EXACT_ENDPOINT_GUARD = PASS`
  - `P0_CALL_LIMITS_NON_OVERRIDABLE = PASS`
  - `P0_PROVENANCE_ATTESTATION = PASS`
  - `P0_FAKE_MANIFEST_REJECTED = PASS`
  - `P0_PRIVATE_EVIDENCE_STORAGE = PASS`
  - `P0_AUDIT_COUNTS_ACCURATE = PASS`
  - `PR02_P0_REMOTE_GO = NOT_REQUESTED`
  - `P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `P1_REMOTE_EXECUTION_READY = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `HISTORICAL_042_REEMISSION_FORBIDDEN = true`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - `ARCA_CALLS_NEW = 0`
  - `STAGING_WRITES_NEW = 0`
  - `PRODUCTION_MUTATIONS = 0`

### 2026-11-06 - Auditoría Adversarial y Separación Criptográfica Ed25519 de Autoridades PR02-P0

Remediación criptográfica y adversarial de las 6 vulnerabilidades de frontera identificadas:
- **Separación Criptográfica Asimétrica Ed25519 (RFC 8032)**:
  - Eliminación de HMAC compartido. Firma asimétrica de 64 bytes (128 hex) nativa en Node.js.
  - Clave privada de aprobación GO aislada externamente; colector valida con clave pública `PR02_P0_GO_PUBLIC_KEY`.
  - Clave privada de atestación de custodia aislada externamente; validador P1 valida con clave pública `PR02_P0_ATTESTATION_PUBLIC_KEY`.
- **Eliminación Total del Bypass Booleano**:
  - `createOfficialArcaTransport` desexportada de TypeScript público (`.d.mts`) y requiere obligatoriamente un objeto de autorización GO validado (`valid === true`, `authorizationId`, `scope === PR02_P0_SCOPE`). Se rechaza `{ officialGoAuthorized: true }`.
- **Modelo de Confianza Fail-Closed**:
  - Atestaciones del colector local catalogadas como `trustModel: 'SELF_ATTESTED'`, `provenance: 'UNVERIFIED'`, `accredited: false` y `TRUSTED_EXECUTION_BOUNDARY: 'UNVERIFIED'`.
  - `validatePr02P1ImportEvidence` rechaza categóricamente evidencia `SELF_ATTESTED` y exige atestación independiente acreditada (`INDEPENDENT_ATTESTED`).
- **Remoción de Capacidades de Firma de Producción**:
  - Funciones de firma y reseteo de replay removidas de `scripts/fiscal/plan-pr02-parameters.mjs` y confinadas a `src/test/helpers/fiscalEd25519Signer.ts`.
- **Validador de Importación P1 Endurecido**:
  - Exigencia obligatoria de `goAuthorizationDoc`, `expectedHead`, `rawIvaSoapText` y `rawConditionSoapText`.
  - Parseo independiente de XML SOAP para verificar que los parámetros reconstruidos coinciden exactamente con los JSON normalizados, detectando cualquier adulteración con `P1_IMPORT_SOAP_PAYLOAD_DISCREPANCY`.
- **Protección Anti-Replay Atómica y Durable**:
  - Nivel de garantía: `ANTI_REPLAY_GUARANTEE_LEVEL = 'HOST_LOCAL_DURABLE_ONE_TIME_USE'`.
  - Persistencia atómica previa a cualquier llamada de red usando flags `wx` (`O_CREAT | O_EXCL`) en `.fiscal-evidence-pr02/.consumed-authorizations/consumed-${sha256(authId)}.json`.
- **Suite de Pruebas**:
  - 19 pruebas de seguridad adversarial (ADV-01 a ADV-19).
  - 73/73 tests PASS en `fiscalPr02P0Collector.test.ts`.
  - 90/90 tests PR02 totales PASS.
  - Compilación TypeScript y build Vite limpios (cero errores, código 0).
- **Estado**:
  - `PR02_P0_LOCAL_HARDENING = PASS`
  - `P0_REAL_TRANSPORT_IMPLEMENTED = PASS`
  - `P0_CLI_TRANSPORT_WIRING = PASS`
  - `P0_WSAA_TA_GUARD = PASS`
  - `P0_EXACT_ENDPOINT_GUARD = PASS`
  - `P0_CALL_LIMITS_NON_OVERRIDABLE = PASS`
  - `P0_PROVENANCE_ATTESTATION = PASS`
  - `P0_FAKE_MANIFEST_REJECTED = PASS`
  - `P0_PRIVATE_EVIDENCE_STORAGE = PASS`
  - `P0_AUDIT_COUNTS_ACCURATE = PASS`
  - `P0_PROVENANCE_TRUST_MODEL = SELF_ATTESTED`
  - `P1_OFFICIAL_PROVENANCE_TRUST = LIMITED`
  - `ANTI_REPLAY_GUARANTEE_LEVEL = HOST_LOCAL_DURABLE_ONE_TIME_USE`
  - `P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `P1_REMOTE_EXECUTION_READY = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - `ARCA_CALLS_NEW = 0`
  - `STAGING_WRITES_NEW = 0`
  - `PRODUCTION_MUTATIONS = 0`

### 2026-11-07 - Separación Criptográfica Cruzada Estricta de Autoridades PR02-P0

- **Separación Criptográfica Estricta (GO Authority != Attestation Authority)**:
  - Guarda en `validatePr02P1ImportEvidence` que compara representaciones binarias DER (SPKI) de `trustedGoPublicKey` y `trustedAttestationPublicKey`.
  - Rechazo taxativo con `P1_IMPORT_FORBIDDEN: COLLAPSED_AUTHORITIES_REJECTED: La clave de autoridad GO y la clave de Attestation Authority deben ser criptográficamente distintas` si ambas claves son iguales.
- **Suite de Pruebas y Build**:
  - Caso adversarial 73 (`[ADV-20]`) añadido en `src/test/fiscalPr02P0Collector.test.ts`.
  - 74/74 tests unitarios y de hardening en `fiscalPr02P0Collector.test.ts` PASS.
  - 91/91 tests fiscales de PR02 totales PASS.
  - Compilación TypeScript (`tsc -b`) y build Vite (`npm run build`) verificados con exit code 0.
- **Estado**:
  - `PR02_P0_LOCAL_HARDENING = PASS`
  - `P0_PROVENANCE_TRUST_MODEL = SELF_ATTESTED`
  - `P1_OFFICIAL_PROVENANCE_TRUST = LIMITED`
  - `ANTI_REPLAY_GUARANTEE_LEVEL = HOST_LOCAL_DURABLE_ONE_TIME_USE`
  - `P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `P1_REMOTE_EXECUTION_READY = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - `ARCA_CALLS_NEW = 0`
  - `STAGING_WRITES_NEW = 0`
  - `PRODUCTION_MUTATIONS = 0`

### 2026-11-06 - Remediación del Modelo de Confianza y Separación de Fronteras PR02-P0

Blindaje de seguridad, explicitación del modelo de confianza y delimitación formal de las 4 fronteras de autoridad:
- **Separación Canónica de Fronteras**:
  - `GO AUTHORITY`: exportado mediante el objeto inmutable `GoAuthority` (`validateAuthorization`, `createAuthorization`, `validateSecret`, `markConsumed`, `isConsumed`, `resetConsumedForTesting`). Clasificación explícita de nivel anti-replay: `ANTI_REPLAY_GUARANTEE_LEVEL = 'PROCESS_LOCAL_ONE_TIME_USE'`.
  - `AUTHORIZED COLLECTOR`: colector confiable `scripts/fiscal/execute-pr02-p0-official-evidence.mjs` bajo scope `PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`. Modelo de procedencia: `P0_PROVENANCE_TRUST_MODEL = 'SELF_ATTESTED'`.
  - `EVIDENCE CUSTODY / ATTESTATION AUTHORITY`: autoridad de custodia `AttestationAuthority`. Falla cerrado ante claves faltantes (`ATTESTATION_AUTHORITY_NOT_AVAILABLE`), claves comprometidas o de prueba (`UNTRUSTED_ATTESTATION_AUTHORITY`), o baja entropía (`ATTESTATION_CONFIGURATION_INVALID`).
  - `P1 VERIFIER`: verificador de importación `validatePr02P1ImportEvidence` con confianza acotada `P1_OFFICIAL_PROVENANCE_TRUST = 'LIMITED'`.
- **Cuatro Niveles de Aseguramiento Diferenciados**:
  - `EVIDENCE_INTEGRITY: 'PASS' | 'FAIL'`
  - `EVIDENCE_CUSTODY_ATTESTED: boolean`
  - `TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED' | 'UNVERIFIED'`
  - `ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false` (declaraciones fraudulentas de verificación directa de ARCA son rechazadas con `P1_IMPORT_FORBIDDEN`).
- **Validación Cruzada Opcional de GO en P1**:
  - `validatePr02P1ImportEvidence` admite `options.goAuthorizationDoc` y exige concordancia de ID y SHA con el manifiesto.
- **Suite de Pruebas**:
  - Casos 49 a 54 en `fiscalPr02P0Collector.test.ts`. 54/54 tests PASS. 71/71 tests PR02 PASS. Build Vite exitoso (exit code 0).
- **Estado**:
  - `PR02_P0_LOCAL_HARDENING = PASS`
  - `P0_REAL_TRANSPORT_IMPLEMENTED = PASS`
  - `P0_CLI_TRANSPORT_WIRING = PASS`
  - `P0_WSAA_TA_GUARD = PASS`
  - `P0_EXACT_ENDPOINT_GUARD = PASS`
  - `P0_CALL_LIMITS_NON_OVERRIDABLE = PASS`
  - `P0_PROVENANCE_ATTESTATION = PASS`
  - `P0_FAKE_MANIFEST_REJECTED = PASS`
  - `P0_PRIVATE_EVIDENCE_STORAGE = PASS`
  - `P0_AUDIT_COUNTS_ACCURATE = PASS`
  - `P0_PROVENANCE_TRUST_MODEL = SELF_ATTESTED`
  - `P1_OFFICIAL_PROVENANCE_TRUST = LIMITED`
  - `ANTI_REPLAY_GUARANTEE_LEVEL = PROCESS_LOCAL_ONE_TIME_USE`
  - `P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `P1_REMOTE_EXECUTION_READY = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - `ARCA_CALLS_NEW = 0`
  - `STAGING_WRITES_NEW = 0`
  - `PRODUCTION_MUTATIONS = 0`

### 2026-11-06 - Auditoría Adversarial y Separación Criptográfica Ed25519 de Autoridades PR02-P0

Remediación criptográfica y adversarial de las 6 vulnerabilidades de frontera identificadas:
- **Separación Criptográfica Asimétrica Ed25519 (RFC 8032)**:
  - Eliminación de HMAC compartido. Firma asimétrica de 64 bytes (128 hex) nativa en Node.js.
  - Clave privada de aprobación GO aislada externamente; colector valida con clave pública `PR02_P0_GO_PUBLIC_KEY`.
  - Clave privada de atestación de custodia aislada externamente; validador P1 valida con clave pública `PR02_P0_ATTESTATION_PUBLIC_KEY`.
- **Eliminación Total del Bypass Booleano**:
  - `createOfficialArcaTransport` desexportada de TypeScript público (`.d.mts`) y requiere obligatoriamente un objeto de autorización GO validado (`valid === true`, `authorizationId`, `scope === PR02_P0_SCOPE`). Se rechaza `{ officialGoAuthorized: true }`.
- **Modelo de Confianza Fail-Closed**:
  - Atestaciones del colector local catalogadas como `trustModel: 'SELF_ATTESTED'`, `provenance: 'UNVERIFIED'`, `accredited: false` y `TRUSTED_EXECUTION_BOUNDARY: 'UNVERIFIED'`.
  - `validatePr02P1ImportEvidence` rechaza categóricamente evidencia `SELF_ATTESTED` y exige atestación independiente acreditada (`INDEPENDENT_ATTESTED`).
- **Remoción de Capacidades de Firma de Producción**:
  - Funciones de firma y reseteo de replay removidas de `scripts/fiscal/plan-pr02-parameters.mjs` y confinadas a `src/test/helpers/fiscalEd25519Signer.ts`.
- **Validador de Importación P1 Endurecido**:
  - Exigencia obligatoria de `goAuthorizationDoc`, `expectedHead`, `rawIvaSoapText` y `rawConditionSoapText`.
  - Parseo independiente de XML SOAP para verificar que los parámetros reconstruidos coinciden exactamente con los JSON normalizados, detectando cualquier adulteración con `P1_IMPORT_SOAP_PAYLOAD_DISCREPANCY`.
- **Protección Anti-Replay Atómica y Durable**:
  - Nivel de garantía: `ANTI_REPLAY_GUARANTEE_LEVEL = 'HOST_LOCAL_DURABLE_ONE_TIME_USE'`.
  - Persistencia atómica previa a cualquier llamada de red usando flags `wx` (`O_CREAT | O_EXCL`) en `.fiscal-evidence-pr02/.consumed-authorizations/consumed-${sha256(authId)}.json`.
- **Suite de Pruebas**:
  - 19 pruebas de seguridad adversarial (ADV-01 a ADV-19).
  - 73/73 tests PASS en `fiscalPr02P0Collector.test.ts`.
  - 90/90 tests PR02 totales PASS.
  - Compilación TypeScript y build Vite limpios (cero errores, código 0).
- **Estado**:
  - `PR02_P0_LOCAL_HARDENING = PASS`
  - `P0_REAL_TRANSPORT_IMPLEMENTED = PASS`
  - `P0_CLI_TRANSPORT_WIRING = PASS`
  - `P0_WSAA_TA_GUARD = PASS`
  - `P0_EXACT_ENDPOINT_GUARD = PASS`
  - `P0_CALL_LIMITS_NON_OVERRIDABLE = PASS`
  - `P0_PROVENANCE_ATTESTATION = PASS`
  - `P0_FAKE_MANIFEST_REJECTED = PASS`
  - `P0_PRIVATE_EVIDENCE_STORAGE = PASS`
  - `P0_AUDIT_COUNTS_ACCURATE = PASS`
  - `P0_PROVENANCE_TRUST_MODEL = SELF_ATTESTED`
  - `P1_OFFICIAL_PROVENANCE_TRUST = LIMITED`
  - `ANTI_REPLAY_GUARANTEE_LEVEL = HOST_LOCAL_DURABLE_ONE_TIME_USE`
  - `P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `P1_REMOTE_EXECUTION_READY = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - `ARCA_CALLS_NEW = 0`
  - `STAGING_WRITES_NEW = 0`
  - `PRODUCTION_MUTATIONS = 0`

### 2026-11-07 - Separación Criptográfica Cruzada Estricta de Autoridades PR02-P0

- **Separación Criptográfica Estricta (GO Authority != Attestation Authority)**:
  - Guarda en `validatePr02P1ImportEvidence` que compara representaciones binarias DER (SPKI) de `trustedGoPublicKey` y `trustedAttestationPublicKey`.
  - Rechazo taxativo con `P1_IMPORT_FORBIDDEN: COLLAPSED_AUTHORITIES_REJECTED: La clave de autoridad GO y la clave de Attestation Authority deben ser criptográficamente distintas` si ambas claves son iguales.
- **Suite de Pruebas y Build**:
  - Caso adversarial 73 (`[ADV-20]`) añadido en `src/test/fiscalPr02P0Collector.test.ts`.
  - 74/74 tests unitarios y de hardening en `fiscalPr02P0Collector.test.ts` PASS.
  - 91/91 tests fiscales de PR02 totales PASS.
  - Compilación TypeScript (`tsc -b`) y build Vite (`npm run build`) verificados con exit code 0.
- **Estado**:
  - `PR02_P0_LOCAL_HARDENING = PASS`
  - `P0_PROVENANCE_TRUST_MODEL = SELF_ATTESTED`
  - `P1_OFFICIAL_PROVENANCE_TRUST = LIMITED`
  - `ANTI_REPLAY_GUARANTEE_LEVEL = HOST_LOCAL_DURABLE_ONE_TIME_USE`
  - `P0_REMOTE_EXECUTED = false`
  - `OFFICIAL_PROVENANCE = UNVERIFIED`
  - `P1_REMOTE_EXECUTION_READY = false`
  - `P2_REMOTE_EXECUTION_READY = false`
  - `REAL_PV2_ENABLED = false`
  - `HISTORICAL_042_IDENTIFICATION = UNRESOLVED`
  - `PR02_READY_FOR_EMISSION_GO = false`
  - `ARCA_CALLS_NEW = 0`
  - `STAGING_WRITES_NEW = 0`
  - `PRODUCTION_MUTATIONS = 0`
