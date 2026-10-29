# Respaldo y recuperación del piloto (20/10/2026)

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
