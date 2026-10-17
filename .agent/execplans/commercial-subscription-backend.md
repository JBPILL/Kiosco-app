# Administración comercial y suscripciones seguras

## Objetivo y base
Habilitar administración comercial con VITE_ADMIN_COMERCIAL_HABILITADO=true sin
desactivar el piloto estricto ni habilitar AFIP/WSFE, Point, devoluciones o envases.
Rama hardening/commercial-subscription-backend desde origin/master 41bebe9 en
checkout separado. PR #1 sigue abierto (788e7e2); este bloque no depende de él
ni incluye sus commits. Si master avanza, revisar conflictos mediante merge normal,
nunca rebase destructivo, force push ni integración automática.

## Situación encontrada
El baseline ONE_SHOT_EMPTY_DB no incluye tablas comerciales. adminStore escribe
planes, kioscos, usuarios, suscripciones y pagos desde navegador, con fallbacks
y signUp privilegiado. configAdminStore simula éxito local y replica configuración
en planes. ConfigPage inventa nombre/precio si no hay plan. El login necesita
mantener acceso al perfil y al estado mínimo incluso con suscripción bloqueada.

## Actores y permisos
| Actor | Lectura | Mutaciones |
| --- | --- | --- |
| SuperAdmin real, activo en DB | Todos los comercios, planes, pagos y auditoría | RPCs comerciales; Edge exclusiva para comercio/Dueño |
| Dueño activo | Plan, fechas, estado efectivo, pagos propios sin notas internas y datos de regularización | Ninguna mutación comercial privilegiada |
| Cajero / Visor | Estado operativo mínimo del propio comercio; consultas operativas autorizadas | Ninguna mutación comercial; sin pagos/precios comerciales sensibles |
| anon | Sin acceso comercial | Ninguna |

El SuperAdmin se obtiene del perfil asociado a auth.uid(), nunca de metadata
aportada por el cliente. El tenant se resuelve en DB. No existe alta de SuperAdmin.

## Fuente de verdad y estados
Una suscripción no cancelada por kiosco. La suscripción guarda plan, inicio,
vencimiento y estado de fila ACTIVA/VENCIDA/SUSPENDIDA/CANCELADA. El kiosco guarda
la decisión administrativa ACTIVO/SOLO_LECTURA/SUSPENDIDO. La función de estado
efectivo combina ambos: suspensión domina; falta de suscripción, cancelación,
vencimiento o pausa administrativa implican SOLO_LECTURA.

Fecha comercial en America/Argentina/Buenos_Aires. Vencimiento inclusivo,
sin período de gracia. El paso del tiempo se evalúa en cada consulta/escritura:
no depende de cron ni de actualizar físicamente filas al llegar medianoche.
RPCs sincronizan ambas representaciones al mutarlas.

ACTIVO -> vencimiento -> SOLO_LECTURA.
SOLO_LECTURA -> renovación válida -> ACTIVO.
Cualquier estado -> suspensión manual SuperAdmin -> SUSPENDIDO.
SUSPENDIDO -> reactivación explícita SuperAdmin con vigencia válida -> ACTIVO.
Una renovación no levanta una suspensión manual. Meses de renovación 1..12,
meses calendario desde max(hoy,vencimiento), monto finito >=0, dos decimales.
Medios de pago manuales TRANSFERENCIA/MERCADOPAGO/EFECTIVO/OTRO; no integración externa.

## Límite backend
Extensión SQL incremental independiente, reutilizada como módulo canónico opcional
después del bootstrap endurecido. No alterar contratos/hashes históricos de importación
F6 ni instalar automáticamente esta extensión durante un cutover existente.
El checkout nuevo evidenció hashes heredados calculados sobre EOL del directorio
de trabajo que no siempre coinciden con los blobs Git. El manifest actual se
regenera desde los bytes ya versionados y se fija -text sólo para SQL; no cambia
ninguna definición SQL base ni se reescriben evidencias/hashes históricos en docs.
Manifest raíz incluye y verifica los checksums opcionales; instalación es gate separado.

RPCs SECURITY DEFINER con search_path=pg_catalog,public, actor interno, ACL cerradas
y libro privado de operaciones comerciales (equivalente a operaciones_escritura,
pero admite operaciones globales de planes sin tenant). UUID + solicitud idéntica
devuelve resultado original; actor/tipo/tenant/cuerpo distintos se rechazan.
Pago, extensión de fecha, estado y auditoría se confirman en una transacción.
No borrar historial: bajas de planes son desactivaciones; eliminar comercios queda
fuera de alcance y no tiene fallback frontend.

Triggers de tablas operativas verifican estado efectivo bajo lock del kiosco,
incluidas ventas de todas las rutas y efectos de stock/caja/crédito. No se guardan
reglas sólo en Edge/UI. Consultas, login, soporte y exportación de backups conservan
su autorización previa. Replays ya confirmados sin nuevas mutaciones conservan su ACK.
La instalación en datos existentes requiere resolver suscripciones vigentes ambiguas
y comprobar tablas/prerequisitos antes de permitir escrituras; no inventar planes.

## Provisioning y recuperación
Nueva Edge provision-commerce, JWT validado, SuperAdmin real, CORS allowlist existente,
JSON exacto y acotado; sólo crea Dueño ordinario. IDs de negocio generados por servidor.
Reserva durable con ganador único antes de Auth Admin; creación SQL de kiosco,
suscripción y perfil atómica. No guardar contraseñas en localStorage, auditoría ni logs.
Un fallo inequívoco permite compensación sólo tras reclamar y confirmar ausencia
de commit. Una respuesta incierta conserva estado de conciliación, nunca borra Auth
automáticamente ni repite una creación a ciegas. Compensación fallida queda TAINTED.
Un resultado terminado se recupera por el mismo operation ID sin duplicar comercio.
Funciones internas de saga tienen ejecución sólo service_role, excepción explícita
a las RPCs públicas autenticadas; el navegador nunca recibe claves administrativas.

## Frontend
Helper de capacidad centralizado; default false. ConfigPage muestra panel real
de sólo lectura al Dueño cuando se habilita. Sin datos: Plan no disponible,
sin importes ni vigencias inventadas. Errores explícitos y reintento.
SuperAdmin usa exclusivamente RPC/Edge, ACK real y solicitudes persistidas sin
credenciales. Ante incertidumbre se conserva solicitud original para recuperación;
no se aceptan cambios de parámetros silenciosos mientras haya operación pendiente.
Config de regularización sólo se guarda por RPC SuperAdmin; sin escritura local
optimista ni fila oculta en planes.

## Plan y validación
1. Diseño/DECISIONS antes de implementación.
2. SQL comercial, lecturas, ACL/RLS, idempotencia y auditoría.
3. Gate central de escrituras y tests de checkout/estados.
4. Provision-commerce con tests de autorización, cuerpo, saga y fallos inciertos.
5. Migrar stores/UI y capacidad independiente; tests de flags y permisos.
6. Tests dirigidos, suite completa, build, manifest, diff/index, audit diagnóstico
   y secret scan sólo path:line:type. Commits temáticos, push normal y PR a master.
7. Sin SQL remoto, deploy, merge ni cambios a .env.local.

## Progreso
- [x] Base/PR #1, guías, flujos existentes y límite comercial inspeccionados.
- [x] Modelo documentado antes del código.
- [x] SQL/RLS/RPCs/auditoría y tests.
- [x] Enforcement de estados y pruebas directas backend.
- [x] Provisioning seguro y pruebas.
- [x] Stores/UI/feature flag y pruebas.
- [x] Validación completa y push normal de rama independiente.
- [ ] PR y aceptación hospedada autorizada.

## Resultado final
Implementación terminada y rama publicada. PR pendiente de creación.
Tests dirigidos: 87 PASS / 8 archivos. Build: PASS / 608 módulos.
Manifest: PASS, 43 SQL base sin cambios de fuente y módulo opcional separado.
Primer suite: 1829 PASS, 1 skipped, un timeout de 5s en preflight SQL.
Se repite con maxWorkers=2 sin modificar el test; el resultado previo no es PASS.
Repetición final 17/10/2026: 1830 PASS / 1 skipped / 191 archivos, 301,32 s.
Diff e índice: PASS. Secret scan: 44 candidatos de fixtures/ejemplos,
sin credenciales reales detectadas; excluye binarios e historial.
El usuario autorizó continuar integración/activación, primero Staging y luego
Production si pasan los gates. PR #1 conserva su restricción de no merge.
Pendiente localizar las CLI autenticadas indicadas por el usuario y verificar
destinos, backup y acceso de prueba antes de cualquier escritura remota.
xlsx: una dependencia HIGH con dos avisos, sin fix automático; no audit fix.
La aceptación hospedada, concurrencia PostgreSQL real, Auth Admin/PostgREST y
activación de flags se harán en Staging autorizado antes de Production autorizado.
