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
