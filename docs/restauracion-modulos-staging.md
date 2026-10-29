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
