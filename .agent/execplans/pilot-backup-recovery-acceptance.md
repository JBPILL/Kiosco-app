# Respaldo y recuperación del piloto (20/10/2026)

## Revisión vigente PR07/P13–P15 — 29/10/2026

Corrección local posterior al respaldo:4 regresiones reprodujeron replay con
otro Auth del mismo perfil (29PASS/4FAIL), informe
../backup-auth-replay-regression-before-20261029.json SHA256
ddf9e99f0d609c2f475d2c43deeca33122c1086ab3313ee72ffc10452f1f1e0f.
SQL001/002 ahora capturan auth.uid() al entrar y guardan actor_auth_id derivado
del servidor en solicitud, comparado antes de devolver ACK. Identidad histórica
ausente no se rellena ni reinterpreta. No cambian firmas/tablas/ACL ni stock/saldos.
58 pruebas enfocadas finales PASS/0FAIL, incluidos4 casos de identidad histórica
sin Auth y conservación de su registro, UI y motor strict. Informe
../backup-auth-replay-targeted-final-20261029.json SHA256
0598ec12c1afbda830709895f84fb54f508d3ec8fadbcdae3cd1d92b15ec3581.

PostgreSQL17.11 LOCAL:12 escenarios PASS, bootstrap43 + pilot-backup001–003,
sin montar el backup real y con Auth sintético, no JWT hospedado. Cuatro carreras
demuestran que reasignación espera el lock del perfil, solicitud conserva Auth
original y nuevo Auth no obtiene el ACK; cuatro rechazos de Auth movido antes de
la primera llamada, cuatro legados sin identidad rechazados sin backfill.
../backup-auth-native-20261029.json SHA256
d143688f15bc96df534ba34da9c50ad5825e998e669135ab28980da5707b036f.
Contenedor propio detenido, datos sintéticos conservados; network none, sin
puertos/publicación, originales, secretos, ARCA, emisiones o SQL remoto.
Guard de UI integral strict revisado (RestaurarBackupModal): sigue bloqueado,
incluso cuando los contratos lleguen a instalarse. No se habilitó capacidad remota.
Suite global/build de este incremento aún pendientes antes de publicar/revisar GO.

GO posterior del titular: «Sí, sólo respaldo privado». Una consola operativa,
sin credenciales en chat/argv; copia confirmada en
%USERPROFILE%\KioskoPOS-Privado\Backups\Staging\pre-contratos-restauracion-20261029-190647-434b564ec34a41d2b7e6c631dd218bd9.
Verificación independiente22:10:51Z: hash dump4039313523d60fe76c163cbe9b9bb88950aa97a4b48187b6a64b3761d9ffdec0,
roles b32402ee1fa50664c086497b0eb779bba4bea088df17afc92ebffe9c839452d1,
manifiestos/contexto coincidentes, ACL owner-only sin reparse/partials y sin
cláusulas PASSWORD de roles. pg_restore --list con montaje readonly/network none
confirma41 tablas fiscales y7 comerciales críticas;0 funciones de restauración.
Evidencia ../backup-contracts-archive-verified-20261029.json. Sólo archivo
verificado: no restore/Storage/cifrado/copia externa/equivalencia total de esquema.
GO consumido, no repetir respaldo ni instalar contratos por inferencia.

Revisión local previa a proponer SQL: comprobar que el replay conserve el Auth
original, además del perfil/kiosco/cuerpo. La UI exige la misma identidad Auth,
pero los RPC usan operaciones_escritura.usuario_id (perfil reasignable). Preparar
regresión sintética de reasignación del mismo perfil antes del replay, sin cambiar
ninguna identidad real. Si se reproduce, cerrar el guard servidor antes del GO
de instalación; conservar fuente/versiones y no inferir Auth histórico desconocido.

Cierre local anterior0d2c930:43 PASS/0 FAIL/0 omitidas en tres archivos de pruebas
Windows (asistente privado, exportador y verificación de integridad), Docker y
contraseña simulados. Evidencia ../backup-contracts-preparation-tests-20261029.json
SHA2567fa7172962c84e4e69ea4373e3cf530e1c2e361e17ef661afc22c1a00cd893da.
Modo -AntesContratosRestauracion implementado: contexto de etapa correcto, sin
approved_sql_commit antiguo; etapas combinadas rechazadas antes del prompt,
TOC incompleto/ACL ausente no producen contexto confirmado. TLS/CA readonly,
stdin secreto, roles sin passwords y entorno restaurado conservados.
Preparación real LOCAL con -Preparar exit0: cliente/CA disponibles, sin prompt,
dump ni conexión PostgreSQL. Log ../backup-contracts-local-preflight-20261029.log
SHA256e14731551944d12db4a10317fe9195cdf5af0162c4fd746c94f3dd56cadbad89.
Build689 exit0 (../backup-contracts-preparation-build-20261029.log), lint enfocado
y diff PASS. La global5294PASS/1skip de f9fa861 es evidencia anterior,
no una suite global nueva de aquel cambio; los SQL no cambiaron en0d2c930.
Al cerrar0d2c930 faltaban respaldo actual y GO; el respaldo se acreditó después,
como consta arriba. Revisión/GO de instalación y aceptación permanecen pendientes.

Lectura hospedada REPEATABLE READ READ ONLY/ROLLBACK,21:52:46Z: no existen las
cuatro firmas ni otras sobrecargas públicas de restaurar_contacto_backup,
restaurar_producto_backup, restaurar_lote_backup y capacidades_restauracion_backup.
Evidencia ../backup-contracts-readonly-preflight-20261029.json. No se ejecutaron
RPC, restauración, SQL DML/DDL ni cambios de flags. SQL fiscal001–054 instalado
no incluye supabase/pilot-backup/001–003: son módulos y autorizaciones distintos.

Antes de proponer instalación falta una copia privada actual identificada para
este gate. Los modos del asistente sólo describen pre-fiscal, pre054 y pre-emisor;
no reutilizar una etiqueta histórica que no representa la nueva operación.
Preparar -AntesContratosRestauracion: archivo/roles/checksums/ACL/TLS y TOC fiscal
existentes, etapa nueva, sin afirmar equivalencia de esquema, presencia/ausencia
de RPC, instalación o restore. Rechazar combinaciones de etapas antes del prompt.
Pruebas Windows con Docker/contraseña sintéticos; no solicitar ni leer secretos
reales. Preparación local sólo cliente/CA, sin exportar ni conectar a PostgreSQL.
Después revisar paquete, backup real y GO antes de instalar contratos; aceptación
integral/UI sigue bloqueada. No reutilizar un GO fiscal ni activar nada en remoto.

P15 ya tiene archivos PostgreSQL reales verificados27/10 (TOC/dump/roles/SHA),
según ExecPlan fiscal; faltan restore medido, Storage físico, cifrado y externo.
No presentar toda la fase como PASS ni volver a crear copias cerradas sin drift.

## Objetivo
Avanzar P13/P14 tras los ensayos de recuperación de cobros, sin confundir el
snapshot operativo con un respaldo PostgreSQL completo. Impresora y Point
continúan diferidos al final por el usuario.

## Progreso y evidencia
- [x] Revisadas generación, alcance 4.0, validación de relaciones y restauración.
- [x] 113 pruebas existentes PASS en seis archivos: exportación, cifrado,
      relaciones, restauración, verificación e integración ampliada; 3.85 s.
- [x] RPC generar_snapshot_backup_ampliado con JWT Dueño real del comercio
      aislado de Staging devuelve 4.0 para el comercio correcto. Conteos
      coinciden: 7 productos y cero categorías, clientes, proveedores,
      promociones y lotes. Colecciones con kiosco_id pertenecen al comercio.
- [x] Alcance declara incluyeCredenciales=false. Snapshot completo sólo en
      memoria, sin exportarlo a disco ni imprimir datos privados. No se ejecuta
      restauración ni SQL remoto. Runner externo: ../verify-backup-snapshot-staging.cjs.
- [ ] Ensayo de exportar/cifrar/descifrar/restaurar a destino aislado, con datos
      representativos y comparación completa de relaciones, costos y saldos.
- [ ] Respaldo completo PostgreSQL/Storage y destino/retención externos (P15/P16).

## Límites y resultado
Las colecciones vacías no prueban relaciones complejas, saldos ni combos: no hay
combos activos que permitan acreditar el paso de restauración de recetas.
La disponibilidad de la RPC 4.0 no demuestra equivalencia de todas las funciones
SQL instaladas ni una restauración remota. P13/P14 continúan abiertos.
No se guardaron claves, tokens, JWT, contraseñas ni snapshot privado en archivos.
No hubo cambios de aplicación, despliegue, merge ni acceso a Production.

## Ensayo remoto y defecto detectado (20/10/2026)
Destino nuevo y separado creado mediante provision-commerce, Dueño ordinario y
plan de ensayo $0. El código real de backupUtils exporta/cifra/descifra en memoria,
pero la restauración falla: las siete inserciones directas a productos reciben
permission denied. Cero productos escritos; origen sin cambios; destino suspendido.
Diario externo backup-restore-staging-journal.json; no repetir provisioning.

Corrección prevista: catálogo strict mediante RPC autorizada, IDs de producto
reproducibles y operación durable por registro, sin habilitar DML. Evitar que
descripciones duplicadas colapsen registros. Validar ACK y mantener solicitudes
inciertas. Detectar antes de escribir colecciones/campos sin contrato strict
de restauración; no omitirlos ni declarar éxito parcial. Flujo legacy intacto.
Pruebas de regresión, build, reensayo del mismo destino y suspensión final.

## Corrección y reensayo (20/10/2026)
- [x] Catálogo/categorías strict usan RPC con identidad reproducible y operación
      durable por registro. No fusiona dos productos sólo por igual descripción.
      Mantiene stock, costo, precio, actividad y favoritos y verifica snapshot.
- [x] Sesión original antes/después de la RPC; ACK ajeno/ausente, almacenamiento
      fallido y respuesta incierta no se convierten en éxito ni nueva operación.
- [x] 89 pruebas dirigidas PASS en cinco archivos; build 632 módulos PASS.
- [x] Reensayo real del código final: 7 productos restaurados/verificados. Nueva
      ejecución actualiza 7 y crea 0, conserva origen y recuento de destino.
      Origen sólo leído, claves/contraseña de cifrado en memoria; destino nuevo
      suspendido al terminar. No se reutiliza ni altera un comercio anterior.
- [x] SQL histórico: 43 archivos intactos. Scan 1135 textos, 14 binarios omitidos,
      mismos 46 candidatos conocidos; npm audit --omit=dev: 0 vulnerabilidades.
- [x] Suite completa final: 2101 PASS / 1 skipped / 219 archivos, 201.41 s,
      --maxWorkers=4. Evidencia ../pilot-backup-strict-post-review-suite.log.
      Código cerrado en 6763ea2; publicación normal en la rama del PR #3.

No se activa restauración integral en la UI: su bloqueo strict se conserva.
REEMPLAZO y colecciones sin contrato strict (clientes/proveedores/promociones/
lotes/asociación a proveedor) se rechazan antes de escribir. Categorías y combos
requieren todavía un ensayo representativo de relaciones, además de las pruebas
locales. P14 continúa abierto; no es una restauración PostgreSQL completa.
La primera suite global coincidió con cambios a archivos: falló una prueba de
sesión y no se cuenta como PASS. Se repite con los archivos estabilizados.

Resultado de este bloque: motor de restauración del catálogo estricto corregido
y ensayado con JWT real, cifrado/descifrado en memoria, verificación posterior y
repetición sin duplicados. Destino suspendido. El flujo integral en UI conserva
su gate; P14 y los módulos de respaldo completo no se declaran terminados.
Sin cambios de SQL, dependencias, permisos remotos, master ni Production; no se
necesita activar/deployar una UI nueva para publicar esta preparación técnica.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR06, PR07, PR08 y PR09**.

Ampliación local del 20/10: clientes/proveedores con conservación de saldos, producto/proveedor/lotes atómicos y capacidad previa implementados; suite 2177 PASS / 1 skipped, build 634 módulos PASS. SQL nuevo y ensayo hospedado aún pendientes. UI integral bloqueada. El snapshot JSON no cubre pg_dump/pg_restore, Storage ni historia financiera completa.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.

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

### Fallo del primer respaldo real — 26/10/2026

El titular ejecutó el asistente e ingresó su contraseña sólo en terminal. Falló
antes de confirmar el archivo, con RuntimeException en esquema/datos. No hay
respaldo confirmado ni SQL instalado. La causa real todavía no está acreditada.
Se añadió captura privada en memoria del error del cliente y clasificación
cerrada (TLS, autenticación, DNS, conexión, versión o permisos); la respuesta
externa completa nunca se imprime. Windows PowerShell no debe convertir stderr
nativo en una excepción antes de clasificarlo. Mantener verify-full: no degradar
TLS para sortear un fallo. El siguiente intento humano debe comunicar sólo la
categoría segura. Este diagnóstico no equivale a una copia real exitosa.

### Certificado raíz explícito — 26/10/2026

El titular descargó `Downloads/prod-ca-2021.crt` desde Supabase. Se verificó como
certificado público Supabase Root2021CA, sin clave privada, vigente hasta2031.
El asistente exige esa raíz (huella SHA1 de identificación
A4518A0933AF6949482CCA3014C007C369DF9F6F), PEM y vigencia antes del prompt.
La monta como archivo de sólo lectura en `/supabase-root.crt` y configura
PGSSLROOTCERT sin reducir `sslmode=verify-full`. No instala una CA en Windows
ni cambia SSL del servidor. El comando humano permanece igual; opcionalmente
`-CertificadoRaiz` permite indicar otra ubicación del mismo certificado público.

19 pruebas Windows PASS: incluye raíz ausente/inválida y montaje readonly;
lint PASS y `-Preparar` con certificado y Docker reales PASS sin conexión DB.
La fixture de pruebas es únicamente el certificado CA público, no material ARCA.
El respaldo real sigue pendiente: el fallo TLS anterior no queda cerrado sólo
por estas pruebas. No se instaló SQL fiscal.

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


### Corrección de secuencia vigente — 29/10/2026

El «Siguiente gate» anterior describe el cierre histórico SQL001–053; no ordena
repetir despliegue. SQL054, Edge cerrada, custodia por metadatos y emisor inactivo
ya se acreditaron bajo GOs separados, según ExecPlan arca-homologation.md.
La aceptación positiva hospedada y restauración integral siguen pendientes;
ningún respaldo equivale a restore probado. Conservar historial y no reinstalar.


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


### Asistente de aceptacion READ ONLY de contratos — 29/10

Modo -ComprobarCapacidadRestauracion preparado en el asistente JWT existente:
identidad Auth/perfil activo ordinario y comercio aislado, consulta STABLE
capacidades_restauracion_backup, Dueno exige200/version1/modulos exactos,
Cajero exige403/42501, sentinel ajeno exige403/42501. Maximo dos consultas
fijas, sin restaurar_* ni Edge/flags/ARCA. El sentinel no acredita existencia
ajena ni aislamiento RLS de filas. Logout de esta sesion scope=local.
64 pruebas sinteticas PASS/0FAIL/0skip (11 nuevas), errores de red, rol/scope,
metadata y modos incompatibles incluidos; ../backup-capability-helper-tests-20261029.json.
Build final PASS689, lint enfocado y diff PASS. La suite global5310 corresponde
al bloque c0c0fef anterior, no a este incremento del asistente. No se ejecuto
login real ni se uso password/clave de chat. Proximo paso: operador local del
Dueno y Cajero con credenciales ingresadas por titular, solo esta consulta;
no activa interfaz ni acredita restauracion/comercial/DR. GO de instalacion
consumido, no autoriza ninguna restauracion.


### Incidente operador real PowerShell 7 — 30/10/2026

Titular informa una ejecucion con Dueno y una con Cajero sobre420cc5f:
ambas JWT_CHECK_NOT_CONFIRMED paso=capacidad restauracion solo lectura
[SIN_DETALLE] status=0, con TEST_SESSION_LOGOUT_LOCAL_CONFIRMED.
No convertir estas ejecuciones en PASS ni repetirlas durante el diagnostico.
No hubo restore, flags, ARCA o mutaciones segun el operador.

Reproduccion local en pwsh7.6.5: dos pruebas de regresion con Response real
System.Net.Http.HttpResponseMessage (sin GetResponseStream) reproducen ambas
fallas y logout confirmado; ../backup-capability-pwsh-before-20261030.json:
0PASS/2FAIL,64 pruebas anteriores no seleccionadas. Esto acredita el defecto
local, no la respuesta ni causa definitiva de las sesiones hospedadas anteriores.
Parche en curso solo al lector HTTP/asistente; RPC y permisos sin cambios.
Ensayo loopback real con Web Cmdlets de pwsh7 y Windows PowerShell5.1:
2PASS/0FAIL,401/403/404/409,codigo42501,limite4096 bytes UTF8,exceso y JSON
invalido rechazados. Evidencia ../backup-capability-http-runtime-20261030.json.
Rama PS7 ErrorDetails/HttpResponseMessage y legacy solo si existe metodo.
No contactos con Staging ni credenciales reales en estas pruebas.
Validacion completa del parche/build/lint y revision de salidas aun pendientes.


### Cierre parche lector HTTP — 30/10/2026

82PASS/0FAIL/0skip en los dos archivos enfocados del asistente, incluidos los
64 casos existentes y18 nuevos (16 PS7 completos +2 runtimes HTTP loopback).
Evidencia ../backup-capability-pwsh-final-20261030.json SHA256
7c63cae8757b5b0f039f0d961dadc33aa5e33cef5e1ea01b2ec2982be8a8a505.
Tras mover guard de cleanup fuera de finally para cerrar warning lint, se repiten
los2 ensayos loopback:2PASS/0FAIL/0skip; evidencia
../backup-capability-http-runtime-final-20261030.json SHA256
1e8c22e91483092acf5d42904b1ac94e1db45142ec48e2e826ea00efc3b2667e.
Build final689 PASS, lint enfocado sin avisos y diff PASS. Sin cambios posteriores
de comportamiento a la fuente del asistente. Suite global5310 anterior no
atribuida a este parche. Revisadas salidas: solo marcadores/categorias internas,
no cuerpo externo, JWT/password/clave/refresh/cookies/headers privados; fixtures
con sentinels sinteticos comprobados en ambos runtimes. Ninguna RPC modificada.

Historia preservada: regresion inicial0PASS/2FAIL (64 no seleccionados), primera
suite76PASS/3FAIL (un proceso legacy sin salida agoto timeout; dos expectativas
nuevas no distinguian HTTP403 de JSON invalido y objeto valido incompleto).
Se ajustaron expectativas por semantica real, se agrego JSON invalido HTTP200,
17 rechecks PASS y despues82 completos PASS. No aumentar timeouts ni debilitar
aserciones de autorizacion/salidas. Conservar todos los informes previos.

Parche preparado para repetir exactamente DOS ejecuciones reales posteriores:
pwsh -NoProfile -File scripts/comprobar-jwt-fiscal-staging.ps1 -ComprobarCapacidadRestauracion
Primero Dueno: RESTORE_CAPABILITY_READ_OBSERVED role=OWNER own=200 other=403 mutation=false
Luego Cajero: RESTORE_CAPABILITY_READ_OBSERVED role=CASHIER own=403 other=403 mutation=false
Ambos requieren TEST_SESSION_LOGOUT_LOCAL_CONFIRMED y exit0. Ante cualquier
marcador distinto o logout fallido: STOP, sin retry. No se ejecuto ninguna de
estas sesiones como parte del parche. No restore/flags/Edge/ARCA/Production/master.
La causa remota anterior sigue no demostrada y PR07 no se cierra localmente.


### Aceptacion hospedada de lectura de capacidades — 30/10/2026

Titular reporta DOS ejecuciones posteriores sobre a27d07e, una con Dueno y
una con Cajero, y aporta captura coincidente:
RESTORE_CAPABILITY_READ_OBSERVED role=OWNER own=200 other=403 mutation=false
RESTORE_CAPABILITY_READ_OBSERVED role=CASHIER own=403 other=403 mutation=false
Ambas TEST_SESSION_LOGOUT_LOCAL_CONFIRMED (scope local, no global).
Registro sanitizado ../backup-capability-hosted-operator-observed-20261030.json
SHA256 2bdac6fc7f9e98a4375f70d065ee260ae8fde05e375490275480fabf9ccb4147.
Captura original conservada fuera del repositorio; no copiar prompts ni valores
privados al commit. Evidencia del operador/captura, no nueva sesion ejecutada
por el agente ni captura independiente de exit code/JWT/respuesta HTTP completa.

Gate acotado: lectura positiva de capacidades del Dueno y rechazo del Cajero,
con rechazo de sentinel y logout local OBSERVADOS. No repetir este ensayo sin
drift. Las dos fallas previas420cc5f permanecen historicas NO CONFIRMADAS, no se
reclasifican retroactivamente. El sentinel inexistente no prueba aislamiento de
filas ajenas, ni estos marcadores autorizan restore, UI integral, RLS completo
o DR. Sin restores, flags, Edge, ARCA, master o Production.

Siguiente PR07: preparar paquete exacto de restauracion aislada/reversible con
fixtures, invariantes, idempotencia y plan de recuperacion; exigir revision/GO
especifico antes de ejecutar mutaciones. UI integral sigue bloqueada y PR07
PARCIAL. Ruta fiscal permanece pendiente de renovacion de catalogos autorizada
y nueva ventana; no reutilizar GO/paquetes vencidos ni solicitar LoginCms por rutina.


### Preparacion local del ensayo de restore — 30/10/2026

Plan fijo scripts/backup/restore-acceptance-plan.json SHA256
717d6524d2291b4ec2a160d1b6fd26f79ece350b5aee0cacd28200efb04c605f,
LOCAL_PREPARATION_NO_REMOTE_GO, sin ejecutor remoto. Cuatro UUID nuevos fijos
(cliente/proveedor/producto/lote), sin contacto real ni saldos iniciales.
Cliente/proveedor/producto inactivos durante todo el ensayo; cierre deja los
cuatro inactivos con saldos y stock cero, conservando fixtures y auditoria.
Esto es compensacion del stock de ensayo, no borrado ni rollback del historial.

Diez pasos de Dueno: ocho operaciones positivas (incluido cierre) con UN replay
explicito de cada ACK, una colision de mismo UUID/cuerpo cambiado y un producto
con lote invalido que debe revertir todo. Tres rechazos de escritura para Cajero,
uno por RPC, sin crear operaciones. Total previsto21 llamadas explicitas,
14 operaciones durables incluidas anidadas y3 movimientos de stock del producto
ficticio, sin ventas/caja/cuentas corrientes/pagos. No usar UUID nuevos ante fallo.
Los replays previstos son casos de prueba aprobables; no son retries automaticos
ante incertidumbre. Respuesta incierta => STOP y conciliacion de lectura.

39 pruebas PGlite completas PASS/0FAIL/0skip, incluyendo el paquete exacto con
solo kiosco/Auth remapeados a identidades SINTETICAS locales. Se verifican ACK
igual y estado sin duplicacion, rollback por rechazo, preservacion del saldo
actual aunque payload diga999, proveedor/producto/lote y cierre a cero; Cajero
rechazado42501 sin cambios. No equivalen a PostgreSQL hospedado/JWT real.
Evidencia ../backup-restore-plan-final-local-20261030.json SHA256
438962d34b7a19d89b32e3cc80e7da2832c2634f813d11f9fe36277dccd54dac.
Preflight scripts/backup/restore-acceptance-preflight.sql probado dentro de
REPEATABLE READ READ ONLY/ROLLBACK: cuatro funciones/metadata esperadas, cero
fixtures/colisiones (incluye UUID anidados y de denegaciones). Solo retorna
contadores/metadatos y hash del plan, no cuerpos/filas privadas.
Build689 PASS, lint enfocado sin avisos y diff PASS. No nueva suite global.

NO listo para GO remoto todavia: faltan operador privado/journal durable,
lectura de recuperacion y pruebas de ACK perdido/crash del operador, inventario
pinneado de dependencias/callees/triggers del esquema hospedado y revision de
vigencia del respaldo. Preparar esas piezas antes de pedir permiso final.
No se ejecutaron preflight ni restores remotos en este bloque, no hubo flags,
SQL/Edge/Vercel/ARCA/master/Production ni UI habilitada. PR07 sigue PARCIAL.

Proteccion del paquete: .gitattributes fija LF solo para los dos archivos nuevos
del plan/preflight. Evita drift de su hash por checkout Windows; no renormaliza
SQL historico ni otros documentos. Hash del plan717d6524 sin cambios.


### Motor privado de journal y conciliacion — 30/10/2026

scripts/backup/restore-acceptance-engine.mjs + declaraciones d.mts: nucleo privado
sin CLI/red/credenciales ni export al browser. Carga solo plan717d6524 pinneado,
21 acciones fijas; actor/Auth/comercio ligados al journal. JSONL secuencial con
hash de cadena y UTC, escritura exclusiva/fsync de INTENT antes de transporte,
ACK validado/hashado o rechazo previsto antes de avanzar. El replay es solo
el paso explicito del plan y exige el mismo ACK. Nunca repetir por error de red.
No almacena body/ACK raw ni tokens: solo hashes, UUID y metadatos de control.
La cadena detecta corrupcion; no es firma/autorizacion ni reemplaza ACL privada.

INTENT sin cierre tras crash/ACK perdido => STOP. Conciliacion por lectura fija
UUID/actor/comercio/hash de solicitud y ACK: ausencia no prueba no ejecucion;
ACK coincidente requiere revision, conflicto bloquea. mayResend=false y
mayAdvance=false en TODOS los resultados; no hay desbloqueo ni borrado automatico
de lock huerfano. Operador/GO de recuperacion y controles Windows quedan pendientes.

62 pruebas enfocadas PASS/0FAIL/0skip:22 de journal/engine +40 SQL/PGlite.
Incluyen doble clic, disco fallido antes de envio/despues de ACK, replay con ACK
cambiado,401/403/500/cuerpo invalido, actor/cuerpo/comercio/ACK conflictivos,
truncado/cadena corrupta, y proceso Node real con exit71 despues del INTENT
fsync (lock e intencion retenidos, sin reinicio automatico). No prueba corte
electrico/almacenamiento fisico ni JWT/HTTP hospedado.
Integracion local ejecuta las21 acciones contra funciones SQL reales del
bootstrap43 + pilot-backup, verifica hashes de solicitud/resultado SQL contra
journal,14 operaciones y cierre de producto a0/inactivo. Identidades sinteticas;
UUID de kiosco del plan es solo una fila LOCAL dentro de transaccion rollback.
Evidencia ../backup-restore-journal-final-20261030.json SHA256
58a5ca4b6bc987300deb4bc44ed5936ed6aa0f6f7d99faadcc0f9f56384e6c60.

Build final689 PASS, lint enfocado sin avisos, node --check/diff PASS. Escaneo de
36JS publicos sin5 literales privados examinados; no certificacion absoluta de
secretos. Primera integracion61PASS/1FAIL detecto setup local con GUC de usuario
al mover perfil; corregido bootstrap administrativo LOCAL limpiando GUC y luego
restaurando actor authenticated, sin desactivar triggers/politicas. Primer build
TS7016 resuelto con declaraciones explicitas, sin any/supresiones. Evidencias
previas conservadas; suite global anterior no atribuida al incremento.

Aun NO listo para GO remoto: falta envoltorio privado con ACL Windows, identidad
Auth real y transporte fijo; pruebas del envoltorio, pin de dependencias/triggers
hospedados y vigencia del respaldo/preflight. Crear journal local sintetico no
autoriza claves ni acceso/restore remoto. Sin nuevas sesiones, SQL/Edge/flags,
ARCA/master/Production o UI integral habilitada. PR07 sigue PARCIAL.


### Transporte privado y lectura administrativa de recuperacion — 30/10/2026

27c3fbb publicado tras autenticacion del titular. Preparado transporte privado
restore-acceptance-http.mjs/d.mts: sin CLI, login, env ni fetch ambiente.
Destino HTTPS fijo acoyfwwmhaeruciyedri, redirect error, credentials omit,
timeout15s; verifica Auth API y perfil exacto activo ordinario (incluye
es_superadmin=false). Claims JWT solo filtran contexto, no acreditan identidad.
Solo tres rutas RPC y cuerpos/UUID del plan717d6524 para el rol; escrituras
cerradas por defecto. allowMutations/hash revisado es guard local, no reemplaza
GO, identidad verificada, ni autorizacion servidor. Logout solo scope local,
fallo cierra cliente y no habilita retry. Respuestas hasta4096 bytes UTF8 y
errores internos seguros, sin imprimir cuerpos, tokens o headers privados.

Dependencia encontrada en contrato local bootstrap040/900: operaciones_escritura
NO ofrece SELECT a authenticated. No asumir GET disponible ni convertir403 en
fila ausente. Sin nuevos grants/policies/RPC. Recovery administrativo separado:
restore-acceptance-recovery.mjs/d.mts genera solo REPEATABLE READ READ ONLY/
ROLLBACK, un UUID de intencion pinneado, contexto postgres/perfil/comercio activo,
tipo y solicitud exacta con Auth ORIGINAL. Oculta solicitud/resultado si hay
conflicto o falta Auth historico. Decodificador exige read_only=on/contexto/
hashes correctos; devuelve observacion a motor, nunca permiso de reenviar o
avanzar. ACK/raw solicitud solo en memoria del futuro lector privado; no consola.
El canal admin PostgreSQL/TLS/ACL se debe validar antes de usarlo remotamente.

104 pruebas enfocadas finales PASS/0FAIL/0skip (42 SQL/PGlite,22 journal,
28 HTTP inyectado y12 recuperacion). HTTP sin red real: identidad/rol/comercio,
perfil sin superadmin flag, cuerpo/UUID fuera de plan, servicio/issuer/sub,
4096 exactos/4098 rechazados, UTF8 invalido/stream caido, logout fallido/sin retry.
SQL local prueba BOUND con solicitud original y conflicto que oculta datos;
rechaza normalizar read_only=off. Otra prueba ejecuta el SQL completo READ ONLY/
ROLLBACK en PGlite y conserva ausencia como NO permiso de retry. Caso BOUND
normalizado exige revision y mantiene journal inmutable. Identidades sinteticas,
no sesiones/HTTP/SQL de Staging. Evidencia
../backup-restore-http-recovery-final-source-20261030.json SHA256
023d74488369a37143c362d735c252dad0beed01e4b97fe61ce8161d2272dfbd.
Build689, lint sin avisos, node --check y diff PASS. 36JS sin5 marcadores privados
examinados; no certificacion absoluta. LF fijado solo a cuatro fuentes nuevas.
No nueva suite global ni prueba de JWT/RLS hospedado atribuida al incremento.

FALTA antes de GO: envoltorio Windows/ACL/entrada privada y cierre de sesiones,
resolucion durable del journal tras revision autorizada (clasificar no basta),
pruebas del envoltorio/recuperacion, pin de callees/triggers hospedados y respaldo
actual/preflight. No ejecutor CLI ni autorizacion remota incluidos. No restaurar
por inferencia ni ampliar permisos de tabla para simplificar recuperacion.
Sin nuevas sesiones, restores, SQL/Edge/flags/ARCA/master/Production o UI habilitada.
PR07 sigue PARCIAL y el objetivo completo PR01-PR11 no se declara cerrado.


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
