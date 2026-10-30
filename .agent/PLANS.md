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
