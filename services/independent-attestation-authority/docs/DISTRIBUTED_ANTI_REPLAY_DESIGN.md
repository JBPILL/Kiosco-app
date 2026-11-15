# Diseño de Guardia Anti-Replay Distribuida Multi-Nodo

> [!IMPORTANT]
> Estado actual del código ([service-anti-replay.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/service-anti-replay.mjs)):
> - `memory` -> `HOST_LOCAL_SERVICE_IN_MEMORY_ONE_TIME_USE` (`IN_MEMORY`). Rechazado en `STAGING`/`PRODUCTION`.
> - `file` -> `HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE` (`LOCAL_DURABLE`). Escritura atómica temporal+rename en un solo nodo; **no protege contra carreras entre múltiples contenedores/instancias**.
> - `distributed` -> `DISTRIBUTED_MULTI_NODE_ONE_TIME_USE` (`DISTRIBUTED_MULTI_NODE`). La interfaz existe, pero exige inyección externa validada y falla cerrado (`SERVICE_ANTI_REPLAY_DISTRIBUTED_STORE_REQUIRED`) mientras no haya backend DB real conectado.

---

## 1. Brecha Actual al Pasar de Single-Node a Multi-Instancia

En `ServiceAntiReplayGuard.checkAsync()` + `this._signingProvider.sign()` + `ServiceAntiReplayGuard.recordAsync()` ([authority-service.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/authority-service.mjs#L355-L410)):

1. Actualmente `checkAsync()` ocurre **antes** de `kms.sign()` y `recordAsync()` ocurre **después** de `kms.sign()`.
2. Bajo concurrencia entre 2 instancias en Cloud Run / ECS Fargate (TOCTOU — Time-of-Check to Time-of-Use):
   - Instancia A e Instancia B ejecutan `checkAsync(req)` al mismo tiempo -> ambas leen `AVAILABLE`.
   - Ambas invocan KMS y firman dos respuestas válidas para el mismo `requestId` / `requestSha256`.
   - Aunque la segunda falle luego en `recordAsync()`, la primera o segunda firma ya habría sido producida por el KMS, desperdiciando unicidad o exponiendo un `attestationId` huérfano si una instancia cae justo después de firmar.
3. **Solución obligatoria para producción multi-nodo**: Patrón **Reserva Atómica Pre-Firma (`RESERVE -> SIGN -> CONSUME`)** con lease temporal e invariantes estrictos fail-closed.

---

## 2. Máquina de Estados y Transiciones Válidas

```text
  [ AVAILABLE (inexistente en DB) ]
                 |
                 | reserveAtomically(requestId, requestSha256, goAuthId, instanceId, expiresAt)
                 v
          [ RESERVED ] -----------------------+
            |       |                         |
     KMS OK |       | KMS error / validación  | Lease expirado y SIN evidencia de firma?
            v       v                         v
      [ CONSUMED ] [ REJECTED ]          [ EXPIRED ]  (NUNCA re-firmar si firma pudo haberse emitido!)
```

### Tabla de Estados y Política Fail-Closed

| Estado | Significado | Transiciones Válidas | ¿Puede re-emitirse o re-firmarse otra atestación para el mismo `requestId`/`requestSha256`? |
|---|---|---|---|
| `AVAILABLE` | Identificador aún no registrado en el almacén distribuido. | `AVAILABLE -> RESERVED` (única transición de entrada mediante `INSERT` único o transacción condicional). | N/A (aún no reservado). |
| `RESERVED` | Un worker específico obtuvo el lock transaccional antes de invocar a KMS/HSM; contiene `attestationId` preasignado y `leaseExpiresAt`. | `RESERVED -> CONSUMED` (firma completada y verificada)<br>`RESERVED -> REJECTED` (solo si el rechazo ocurrió **antes** de llamar a KMS, p. ej. falla validación)<br>`RESERVED -> EXPIRED` (cuando supera `leaseExpiresAt` o `requestExpiresAt` sin confirmación de `CONSUMED`). | **NO**. Si la llamada a KMS ya se inició y su resultado quedó incierto (`outcomeUnknown`), jamás se permite re-firmar; requiere nuevo `requestId` + nuevo `GoAuthorizationGrant`. |
| `CONSUMED` | Firma KMS completada, persistida de forma inmutable con `attestationId`, `issuedAt` y digest de auditoría. | **Estado terminal inmutable** (ninguna transición saliente). | **NO** (`409 ATTESTATION_REPLAY_DETECTED`). |
| `EXPIRED` | Reserva o solicitud vencida antes de completarse (`expiresAt` superado) o lease huérfano por caída del contenedor. | **Estado terminal inmutable** (o auditoría de expiración). | **NO** (un `GoAuthorizationGrant` vencido o reserva incerta no se recicla). |
| `REJECTED` | Rechazo determinístico registrado en auditoría (ej. política o validación previa a KMS). | **Estado terminal**. | **NO** si consumió `goAuthorizationId` / `requestId` único. |

---

## 3. Diseño de Persistencia Atómica por Tecnología

### 3.1 Opción SQL ACID (Cloud SQL PostgreSQL 16/17)

```sql
CREATE TABLE attestation_replay_ledger (
  request_id            TEXT PRIMARY KEY,
  request_sha256        CHAR(64) NOT NULL UNIQUE,
  go_authorization_id   TEXT NOT NULL UNIQUE,
  attestation_id        TEXT NOT NULL UNIQUE,
  state                 TEXT NOT NULL CHECK (state IN ('RESERVED', 'CONSUMED', 'EXPIRED', 'REJECTED')),
  owner_instance_id     TEXT NOT NULL,
  key_id                TEXT NOT NULL,
  kms_attempted         BOOLEAN NOT NULL DEFAULT FALSE,
  reserved_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at           TIMESTAMPTZ NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- **Reserva atómica pre-firma**:
  `INSERT INTO attestation_replay_ledger (...) VALUES (..., 'RESERVED', ...) ON CONFLICT DO NOTHING RETURNING request_id`.
  - Si retorna `0 filas`: al menos uno de `request_id`, `request_sha256`, `go_authorization_id` o `attestation_id` ya fue visto -> abortar inmediatamente con `409 SERVICE_ANTI_REPLAY_DUPLICATED` (nunca invocar KMS).
- **Marcado previo a KMS**: `UPDATE attestation_replay_ledger SET kms_attempted = TRUE, updated_at = NOW() WHERE request_id = $1 AND state = 'RESERVED' AND owner_instance_id = $2`.
- **Confirmación post-firma**: `UPDATE attestation_replay_ledger SET state = 'CONSUMED', consumed_at = NOW(), updated_at = NOW() WHERE request_id = $1 AND state = 'RESERVED' AND owner_instance_id = $2`.

### 3.2 Opción NoSQL ACID (AWS DynamoDB `TransactWriteItems`)

Tabla única `attestation_replay_ledger` (clave de partición `pk`):
En una sola llamada atómica `TransactWriteItems` (todo o nada):
1. `Put` item `pk = "REQ#" + requestId` con `ConditionExpression: "attribute_not_exists(pk)"`
2. `Put` item `pk = "HASH#" + requestSha256` con `ConditionExpression: "attribute_not_exists(pk)"`
3. `Put` item `pk = "GO#" + goAuthorizationId` con `ConditionExpression: "attribute_not_exists(pk)"`
4. `Put` item `pk = "ATT#" + attestationId` con `ConditionExpression: "attribute_not_exists(pk)"`

Si cualquier condición falla, DynamoDB aborta los 4 writes (`TransactionCanceledException` -> `ConditionalCheckFailed`), garantizando unicidad exacta multi-nodo y multi-AZ sin locks distribuidos en memoria.

---

## 4. Casos Borde, Recuperación ante Caídas y Auditoría

| Escenario | Comportamiento Obligatorio Fail-Closed |
|---|---|
| **Dos solicitudes simultáneas con distinto `requestId` pero mismo `requestSha256`** | Solo una transacción atómica gana el índice `UNIQUE (request_sha256)`; la segunda falla con `409` antes de llamar a KMS. |
| **Dos solicitudes idénticas simultáneas en instancias Cloud Run / ECS distintas** | Solo 1 obtiene la inserción condicional `RESERVED`; la perdedora nunca llama a KMS y registra intento de replay. |
| **Caída de contenedor después de `RESERVED` (`kms_attempted=true`) y antes de `CONSUMED`** | El estado queda bloqueado en `RESERVED`/`EXPIRED` (`kms_attempted=true`). Un reintento del cliente con el mismo `requestId`/`goAuthId` **NO re-emite**; el cliente debe abortar e iniciar nueva autorización GO si corresponde. |
| **Reintento tras timeout de red HTTP en cliente** | Como el cliente P0 solo admite consumo atómico único, ante timeout desconocido no se re-firma el mismo `requestId`; si hubo firma previa queda bloqueada para siempre. |
| **Caída o latencia extrema de PostgreSQL / DynamoDB / Firestore** | `isHealthy()` pasa a `false` -> `GET /readiness` devuelve `503`. Toda llamada a `POST /attestations` falla cerrado (`500/503 SERVICE_ANTI_REPLAY_STORAGE_ERROR`) **antes** de contactar al KMS. |
| **Auditoría de duplicados** | Todo rechazo `409` registra evento seguro `ATTESTATION_REPLAY_REJECTED` con `{ requestId, conflictingField, instanceId, timestamp }` sin registrar secretos. |
