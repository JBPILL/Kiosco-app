# Restauración de contactos, saldos y lotes del piloto

## Estado

Preflight hospedado29/10/2026,21:52:46Z: las cuatro firmas y cualquier sobrecarga
pública de estos contratos están ausentes. Consulta REPEATABLE READ READ ONLY,
ROLLBACK; no llamadas de restauración ni modificaciones. Evidencia
../backup-contracts-readonly-preflight-20261029.json SHA256
8680c4e4b5bf16766931c7b613694d676da8eba6df25e65cc330c85a282a324f.
SQL001–054 acreditado pertenece a pilot-fiscal, no a estos tres archivos.
Antes de una instalación nueva se necesita backup privado actual/revisión/GO;
el modo -AntesContratosRestauracion prepara esa etapa sin conceder autorización.

Respaldo real29/10 confirmado y verificado independientemente (archivo, roles sin
passwords, hashes, ACL privada y TOC), sin restore. Evidencia y límites en el
ExecPlan pilot-backup-recovery-acceptance. El GO de respaldo está consumido;
no equivale a GO de instalación ni acepta Storage/DR/cifrado.

Corrección local de identidad antes de instalar: solicitud de cada operación
BACKUP_CONTACTO/PRODUCTO/LOTE incorpora actor_auth_id capturado desde auth.uid()
al entrar al RPC. Reintentar exige ese mismo Auth además del perfil/comercio/cuerpo;
reasignar el perfil no transfiere la confirmación anterior. Las operaciones sin
identidad histórica acreditada fallan cerradas, sin backfill ni UUID alternativo.
No cambian firmas/grants; se revisarán hashes nuevos de001/002 antes del GO.

Prueba PostgreSQL local, con datos/identidades sintéticos y red deshabilitada:

```powershell
node .\scripts\backup\test-auth-native.mjs --run-local --evidence ..\backup-auth-native-NUEVO.json
```

Exige archivo de evidencia nuevo e imagen postgres17 previamente disponible,
no descarga ni monta respaldos reales.12 escenarios de locks/replay/identidad
desconocida no sustituyen JWT/RLS de Staging ni autorización de restauración.

Preparado localmente. No instalado en Staging ni Production. La interfaz integral
permanece bloqueada; REEMPLAZO tampoco se habilita. El ensayo anterior de catálogo
y promociones no prueba estos nuevos contratos.

## Contratos preparados
Instalar en este orden, sobre el bootstrap estricto completo:

1. `supabase/pilot-backup/001_contacts_restore.sql`: RPC de Dueño para clientes y
   proveedores. Inicializa el saldo de una fila nueva y conserva el saldo de una
   fila existente; no simula cargos, pagos ni movimientos de caja. Mantiene
   contactos homónimos mediante identidad reproducible, sin fusionarlos por nombre.
2. `002_inventory_restore.sql`: producto, proveedor y lotes de la copia en la misma transacción,
   reutilizando el RPC de catálogo/stock/costos existente. Restauración de lotes
   físicos sin sumar stock nuevamente, con fechas de ingreso FEFO, cantidades
   válidas y límite del stock físico. Conserva tres decimales sólo para pesables.
   Puede reducir varios lotes existentes sin depender del orden en que se
   reemplazan; un lote inválido revierte también el ajuste de stock y el kardex.
   Los lotes que Fusión retiene siguen el ajuste FEFO del contrato de stock existente.
3. `003_restore_capability.sql`: anuncia la versión únicamente al Dueño activo del
   comercio habilitado y sólo si existen todos los contratos.

Los 43 SQL del manifiesto histórico no cambian. No se añaden tablas, columnas,
permisos directos de DML ni acceso de anon/service_role a los RPC nuevos.
Las operaciones usan el registro idempotente existente, con actor, comercio y
solicitud inmutables. Cada llamada es transaccional; la restauración completa de
muchas filas no constituye una sola transacción global.

## Motor preparado
Antes de escribir comprueba relaciones y valores de contactos/lotes, rechaza puntos
de fidelidad no soportados y verifica la capacidad del servidor. Si falta el SQL,
no empieza ni siquiera por categorías. El pendiente local de estos módulos guarda
UUID de operación y SHA256 de la solicitud; no guarda nombres, teléfonos ni saldos.
Al recuperar un resultado incierto exige la misma solicitud y la sesión original.
El snapshot final comprueba contactos/saldos, relación de proveedor, lotes, fechas,
productos, promociones y combos. Un error parcial se informa como fallo; no se
desactivan productos para ocultarlo ni se inicia REEMPLAZO.
La capacidad nueva se exige para toda restauración estricta, incluso si la copia
no tiene lotes: el destino sí puede tenerlos. Las copias estrictas deben ser
completas 3.0/4.0; el modo legacy fuera del piloto conserva su compatibilidad.

## Puerta de instalación de Staging
Se requiere autorización concreta para instalar estos tres archivos **solamente**
en `acoyfwwmhaeruciyedri`. No inferir autorización de las instalaciones anteriores
de envases/devoluciones. Preparar/verificar antes:

- Ref/host de Staging y sesión operativa autorizada; abortar ante Production.
- Respaldo privado previo del esquema/definiciones y privilegios afectados. No
  guardar credenciales, conexión ni dumps en Git.
- Preflight de existencia/firmas: si alguno de los cuatro RPC ya existe, comparar
  definición/ACL y revisar el respaldo antes de reemplazarlo. No sobrescribir a ciegas.
- Integridad del manifiesto histórico y hashes de los tres archivos revisados.
- Aplicación en orden y verificación de firmas/ACL. La capacidad va al final para
  que una instalación parcial no anuncie soporte completo.

## Ensayo hospedado requerido
Usar exclusivamente comercios de ensayo separados del comercio interactivo y del
original. Conservar registros y suspender los fixtures al terminar, incluso si falla
la prueba. JWT del Dueño para restaurar; credenciales sólo en memoria.

1. Fuente con clientes homónimos, contacto inactivo, proveedor con saldo y datos de
   contacto, productos con proveedor, lote por unidad y lote pesable con ingreso FEFO.
2. Exportación real cifrada, descifrado/validación y restauración en destino vacío.
3. Snapshot completo verifica todas las colecciones y ausencia de movimientos
   financieros artificiales; el origen queda intacto.
4. Repetir sin duplicar ni sumar stock. Variar la foto de saldo de la copia y
   comprobar que prevalece el saldo actual del destino.
5. JWT Cajero, anónimo, comercio ajeno/inactivo y solicitud cambiada con el mismo
   UUID deben ser rechazados. Probar pérdida de respuesta/reintento y concurrencia
   real; PGlite no valida esas condiciones hospedadas.
6. Confirmar suspensión final y conservar un resumen sanitizado del ensayo.

La activación de la interfaz y cualquier publicación requieren su propio gate;
no hacer commit/push/deploy mientras continúe la restricción vigente del usuario.

## Recuperación de instalación
Si el preflight confirmó que estos RPC eran nuevos, retirar primero
`capacidades_restauracion_backup(uuid)` y revocar/retirar luego los tres RPC de
escritura, sin borrar operaciones ni datos del ensayo. Si existían versiones
previas, restaurar sus definiciones y ACL desde el respaldo revisado. Ningún
rollback de código debe revertir saldos o stock a partir de una foto antigua.

## Evidencia local
Contratos probados contra los 43 SQL reales en PGlite, incluyendo rollback ante
triggers que omiten escrituras/alteran stock, saldos conservados y permisos.
Motor y almacenamiento probados con clientes homónimos, saldo cambiado, relaciones
remapeadas, fechas equivalentes con distintas zonas horarias y capacidad ausente.
Registrar los resultados finales de suite/build antes de solicitar instalación.
Resultado final local: 2177 PASS / 1 skipped / 224 archivos (246,83 s), build PASS
(634 módulos), manifiesto 43 SQL PASS y diff PASS. Escaneo: 1150 textos,
14 binarios omitidos, 46 candidatos conocidos; sin candidatos nuevos.
La suite anterior tuvo un fallo de clasificación de cuatro RPC opcionales; la
clasificación fue documentada y esta suite final pasó con el contrato actualizado.


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
