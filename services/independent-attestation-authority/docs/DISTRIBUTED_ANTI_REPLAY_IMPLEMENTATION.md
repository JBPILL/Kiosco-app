# Implementación Distribuida Anti-Replay (EXT-REAL-06)

> **Alcance y honestidad técnica:** Este documento describe los contratos, adaptadores, esquema SQL de microservicio, diseño transaccional DynamoDB y validaciones locales implementados en **EXT-REAL-06**. **Ningún recurso cloud real ni base de datos administrada remota ha sido creada, conectada o probada.**

---

## 1. Clasificación de Madurez por Componente

| Componente / Capacidad | Estado Real | Evidencia / Módulo |
|---|---|---|
| Contrato formal `DistributedAntiReplayStore` y matriz de transiciones | **IMPLEMENTADO LOCALMENTE** | [`services/independent-attestation-authority/src/distributed-anti-replay.mjs`](../src/distributed-anti-replay.mjs) |
| Clave de idempotencia lógica `(authorizationId, requestId, requestSha256)` + unicidad independiente | **IMPLEMENTADO LOCALMENTE** | `computeDistributedIdempotencyKey`, índices/ítems únicos |
| `ReferenceInProcessDistributedStore` (simulación multi-nodo compartida en memoria) | **SIMULADO** (almacén de referencia en memoria) | Validado con 2 nodos, 10 nodos y 100 requests concurrentes en 5 nodos (`EXT06-D-01..D-08`) |
| `SharedFileCoordinatorDistributedStore` (lock OS por archivo compartido entre procesos Node) | **SIMULADO** (coordinador local en filesystem) | Validado en 2 procesos OS independientes (`EXT06-D-09`), `multiNodeAtomicGuaranteed = false` fuera de un host |
| Esquema SQL independiente [`001_distributed_anti_replay.sql`](../sql/001_distributed_anti_replay.sql) y `PostgresDistributedAntiReplayStore` | **IMPLEMENTADO LOCALMENTE** (ejecutado contra `@electric-sql/pglite` WASM SQL + Pool mock; **NO probado en Cloud SQL/RDS PostgreSQL real**) | `POSTGRESQL_PRODUCTION_READY = false`, `POSTGRESQL_REAL_INTEGRATION_TESTED = false` (`EXT06-PG-01`) |
| Adaptador `DynamoDbDistributedAntiReplayStore` (`TransactWriteItems` + `ConditionExpression`) | **DISEÑADO PERO NO PROBADO CON INFRAESTRUCTURA REAL** (validado localmente mediante simulador transaccional en memoria) | `AWS_DYNAMODB_REAL_TESTED = false`, `DYNAMODB_PRODUCTION_READY = false` (`EXT06-DDB-01`) |
| Despliegue contra Cloud SQL / Amazon RDS / DynamoDB gestionado en nube | **REQUIERE INFRAESTRUCTURA REAL** | `DISTRIBUTED_ANTI_REPLAY_PRODUCTION_IMPLEMENTED = false` |

---

## 2. Contrato Formal y Máquina de Estados Fail-Closed

Definido en [`distributed-anti-replay.mjs`](../src/distributed-anti-replay.mjs):

- **Estados (`DISTRIBUTED_RESERVATION_STATES`):**
  - `AVAILABLE`: estado lógico previo a la inserción atómica.
  - `RESERVED`: reserva exclusiva adquirida **antes de invocar KMS/Ed25519**, asociada a `ownerNodeId`, `reservationToken` y `leaseExpiresAt`.
  - `CONSUMED`: firma completada y confirmada (**estado terminal inmutable**).
  - `FAILED`: fallo antes de firma, durante firma o durante commit tras reservar (**estado terminal fail-closed no reciclable**).
  - `EXPIRED`: vencimiento del lease mientras permanecía en `RESERVED` (**estado terminal fail-closed no reciclable**).

- **Transiciones permitidas (`ALLOWED_RESERVATION_TRANSITIONS`):**
  - `AVAILABLE -> RESERVED`
  - `RESERVED -> CONSUMED | FAILED | EXPIRED`
  - `CONSUMED -> []` (terminal)
  - `FAILED -> []` (terminal)
  - `EXPIRED -> []` (terminal)

Cualquier intento de transición no listada dispara `SERVICE_ANTI_REPLAY_INVALID_TRANSITION`. Ninguna reserva `EXPIRED` o `FAILED` vuelve a `AVAILABLE`: el `requestId`, `requestSha256`, `attestationId` y `authorizationId` quedan bloqueados para siempre (fail-closed).

- **Métodos contractuales obligatorios (`REQUIRED_DISTRIBUTED_STORE_METHODS`):**
  1. `reserveOnce(entry)`
  2. `getReservation(requestId)`
  3. `commitReservation(commitInput)`
  4. `markReservationFailed(failInput)`
  5. `hasAuthorizationId(authorizationId)`
  6. `expireReservation(expireInput)`
  7. `isHealthy()`

`assertDistributedStoreContract(store)` y `ServiceAntiReplayGuard.reserveBeforeSign()` rechazan de forma cerrada (`SERVICE_ANTI_REPLAY_DISTRIBUTED_CONTRACT_INCOMPLETE`) cualquier almacén distribuido que no exponga los 7 métodos.

---

## 3. Clave Lógica de Idempotencia e Invariantes

`computeDistributedIdempotencyKey({ authorizationId, requestId, requestSha256 })` computa el SHA-256 hex sobre el JSON canónico ordenado `{ authorizationId, requestId, requestSha256 }`.

Además de la clave compuesta, tanto el esquema SQL como DynamoDB imponen **unicidad individual estricta** sobre:
- `request_id` (`PK` / `REQ#<requestId>`)
- `request_sha256` (`UNIQUE` / `HASH#<requestSha256>`)
- `attestation_id` (`UNIQUE` / `ATT#<attestationId>`)
- `authorization_id` (`UNIQUE WHERE authorization_id IS NOT NULL` / `AUTH#<authorizationId>`)

Esto impide:
- Reusar un mismo `requestId` con distinto payload (`SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT`).
- Reusar un mismo `authorizationId` en dos solicitudes distintas (`SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED`).
- Doble firma concurrente entre múltiples nodos sobre el mismo paquete (`MAX_SIGNATURES === 1`).

---

## 4. Adaptador PostgreSQL (Sin TOCTOU)

- **Archivo SQL del microservicio:** [`services/independent-attestation-authority/sql/001_distributed_anti_replay.sql`](../sql/001_distributed_anti_replay.sql)
  > Aislado exclusivamente en la base de datos del servicio de atestación. **No forma parte de las migraciones Supabase de KioskoPOS.**
- **Adaptador Node:** [`PostgresDistributedAntiReplayStore`](../src/postgres-anti-replay-adapter.mjs)
  - `reserveOnce`: ejecuta `BEGIN` -> `INSERT ... ON CONFLICT DO NOTHING RETURNING ...` -> `COMMIT`. Si `rowCount === 0`, consulta el motivo de conflicto y lanza error específico fail-closed. Ante cualquier excepción SQL ejecuta `ROLLBACK`.
  - `commitReservation`: ejecuta `UPDATE ... SET state = 'CONSUMED' WHERE request_id = $1 AND attestation_id = $2 AND state = 'RESERVED' AND owner_node_id = $3 AND reservation_token = $4 AND lease_expires_at > $5 RETURNING ...`. Si `rowCount === 0`, determina si el lease expiró (`SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED`), si ya estaba cerrada o si otro nodo tomó propiedad, rechazando el commit tardío.
  - `markReservationFailed` / `expireReservation`: `UPDATE` condicional estricto desde `state = 'RESERVED'`.
  - `isHealthy()`: ejecuta `SELECT 1` contra el pool; si falla o no hay pool conectado retorna `false` y el servicio responde `503 SERVICE_ANTI_REPLAY_UNAVAILABLE` sin ejecutar firma.

- **Banderas honestas exportadas:**
  - `POSTGRESQL_PRODUCTION_READY = false`
  - `POSTGRESQL_REAL_INTEGRATION_TESTED = false`
  - Probado localmente en `EXT06-PG-01` ejecutando transacciones SQL reales sobre `@electric-sql/pglite` (WASM PostgreSQL embebido) y pool mock verificando la secuencia exacta `BEGIN -> INSERT -> COMMIT -> RELEASE`.

---

## 5. Adaptador DynamoDB (Sin TOCTOU)

- **Adaptador Node:** [`DynamoDbDistributedAntiReplayStore`](../src/dynamodb-anti-replay-adapter.mjs)
- **Diseño de ítems en una sola tabla (`kioskopos_attestation_anti_replay`):**
  - `REQ#<requestId>`: registro principal de estado (`RESERVED`/`CONSUMED`/`FAILED`/`EXPIRED`), `ownerNodeId`, `reservationToken`, `leaseExpiresAtEpochMs`, `idempotencyKey`.
  - `ATT#<attestationId>`: bloqueo atómico del ID asignado a la respuesta.
  - `HASH#<requestSha256>`: bloqueo atómico del digest canónico del request.
  - `AUTH#<authorizationId>`: bloqueo atómico single-use del `GoAuthorizationGrant`.
- **Operación de reserva (`reserveOnce`):**
  Usa `TransactWriteItems` todo-o-nada con `ConditionExpression = "attribute_not_exists(pk)"` sobre todos los ítems aplicables. Si cualquiera colisiona, DynamoDB cancela toda la transacción (`TransactionCanceledException`) con `CancellationReasons` por ítem.
- **Transiciones (`commitReservation`, `markReservationFailed`, `expireReservation`):**
  Usan `UpdateItem` con `ConditionExpression` verificando `attribute_exists(pk)`, `#state = :reserved`, `ownerNodeId = :owner`, `reservationToken = :token`, `attestationId = :attId` y vigencia o expiración del lease (`leaseExpiresAtEpochMs > :nowEpochMs` o `<= :nowEpochMs`).

- **Banderas honestas exportadas:**
  - `AWS_DYNAMODB_REAL_TESTED = false`
  - `DYNAMODB_PRODUCTION_READY = false`
  - Validado localmente en `EXT06-DDB-01` usando un simulador local de `TransactWriteItems` / `UpdateItem` en memoria; no se llamó a AWS DynamoDB real.

---

## 6. Diferenciación Explícita entre Liveness (`/health`) y Readiness (`/readiness`)

Implementado en [`authority-service.mjs`](../src/authority-service.mjs) y mapeado a HTTP en [`http-server.mjs`](../src/http-server.mjs):

- **`GET /health` -> `200 OK`:**
  - Reporta `livenessState: 'SERVICE_PROCESS_ALIVE'`, `processAlive: true`.
  - Un fallo del almacén distribuido **no** mata el proceso HTTP (`/health` sigue vivo para evitar restart loops ciegos).
- **`GET /readiness` -> `200 OK` o `503 Service Unavailable`:**
  - Reporta `readinessState: 'SERVICE_READY_TO_SIGN'` (`200`) únicamente cuando `providerReady && antiReplayHealthy && durableEnough && authReady && goTrustReady`.
  - Cuando el store está corrupto o caído (`antiReplayHealthy = false`), responde `503` con `readinessState: 'SERVICE_NOT_READY_TO_SIGN'` y `reason: 'ANTI_REPLAY_STORAGE_UNAVAILABLE'`.
- **`POST /attestations` -> `503 SERVICE_ANTI_REPLAY_UNAVAILABLE`:**
  - Previo a `reserveBeforeSign()`, el servicio consulta `await antiReplayGuard.isHealthy()`. Si retorna `false` o lanza error, aborta **sin invocar el proveedor de firma KMS**.
