# EXT-REAL-06 — Reporte de Implementación y Preparación de Infraestructura Distribuida

- **Rama:** `feat/pilot-envases-returns`
- **Base HEAD:** `014ec379a46fc14703b2542ad8bbdd0c97ef8de0`
- **Estado Git:** Trabajo local sin commit ni push (`COMMITS_CREATED = 0`, `PUSHES_PERFORMED = 0`), preservando íntegramente los artefactos de EXT-REAL-03 / EXT-REAL-04 / EXT-REAL-05.

---

## 1. Resumen Ejecutivo Honesto

EXT-REAL-06 deja el servicio `services/independent-attestation-authority/` arquitectónicamente listo y localmente verificado para operar bajo **despliegue distribuido multi-nodo**, con:
1. **Contrato formal `DistributedAntiReplayStore`**, clave lógica de idempotencia `(authorizationId, requestId, requestSha256)` e invariantes de máquina de estados `AVAILABLE -> RESERVED -> CONSUMED | FAILED | EXPIRED` (**no reciclable / fail-closed**).
2. **Simulaciones locales multi-nodo y multi-proceso verificadas adversariamente** (`EXT06-CONTRACT-01`, `EXT06-D-01..D-10`, incluyendo 100 solicitudes concurrentes sobre 5 nodos y 2 procesos Node OS independientes).
3. **Adaptador PostgreSQL + esquema SQL de microservicio** ([`001_distributed_anti_replay.sql`](../sql/001_distributed_anti_replay.sql)) ejecutando transacciones SQL reales (`BEGIN / INSERT ... ON CONFLICT DO NOTHING / UPDATE condicional / COMMIT`) contra `@electric-sql/pglite` embebido en test local (`EXT06-PG-01`).
4. **Adaptador AWS DynamoDB** (`TransactWriteItems` todo-o-nada sobre `REQ#`, `ATT#`, `HASH#`, `AUTH#` con `ConditionExpression`) verificado localmente mediante simulador transaccional en memoria (`EXT06-DDB-01`).
5. **Abstracción de proveedores externos `AwsKmsSigningProvider` y `GcpKmsSigningProvider`** sin claves privadas en runtime, sin fallback local y con verificación SPKI Ed25519 post-firma (`EXT06-KMS-01`).
6. **Diferenciación estricta `/health` (`SERVICE_PROCESS_ALIVE`) vs `/readiness` (`SERVICE_READY_TO_SIGN` / `SERVICE_NOT_READY_TO_SIGN` 503)** y bloqueo pre-firma `503 SERVICE_ANTI_REPLAY_UNAVAILABLE` cuando el store está caído o corrupto (`EXT06-D-10`).

**Límites reales explícitos:**
- No existe base de datos PostgreSQL ni DynamoDB cloud desplegada ni probada remotamente (`POSTGRESQL_REAL_INTEGRATION_TESTED = false`, `AWS_DYNAMODB_REAL_TESTED = false`).
- No existe KMS/HSM cloud ni OIDC/mTLS real aprovisionado (`PROVIDER_REAL_WORLD_TESTED = false`, `REAL_OIDC_CONFIGURED = false`, `REAL_MTLS_CONFIGURED = false`, `EXTERNAL_AUTHORITY_DEPLOYED = false`).
- `P1_IMPORT_ALLOWED = false`, `PR02_READY_FOR_EMISSION_GO = false`, `REMOTE_GO = DENIED`.

---

## 2. Clasificación Técnica Detallada

| Área | Clasificación | Detalle de Implementación y Validación |
|---|---|---|
| Contrato `DistributedAntiReplayStore` y estados `RESERVED/CONSUMED/FAILED/EXPIRED` | **IMPLEMENTADO LOCALMENTE** | [`distributed-anti-replay.mjs`](../src/distributed-anti-replay.mjs) + [`service-anti-replay.mjs`](../src/service-anti-replay.mjs) |
| Clúster multi-nodo compartido en memoria (`ReferenceInProcessDistributedStore`) | **SIMULADO** | `isSimulatedReferenceStore = true`, `isRealInfrastructureTested = false`. Probado en `EXT06-D-01..D-08`. |
| Coordinador de procesos locales en disco (`SharedFileCoordinatorDistributedStore`) | **SIMULADO** | Lock exclusivo local en filesystem (`multiNodeAtomicGuaranteed = false`). Probado en 2 procesos OS en `EXT06-D-09`. |
| Adaptador PostgreSQL (`PostgresDistributedAntiReplayStore`) + DDL SQL | **IMPLEMENTADO LOCALMENTE** (sin clúster RDS/Cloud SQL real) | `POSTGRESQL_PRODUCTION_READY = false`, `POSTGRESQL_REAL_INTEGRATION_TESTED = false`. Probado contra `@electric-sql/pglite` WASM SQL + Pool trace en `EXT06-PG-01`. |
| Adaptador DynamoDB (`DynamoDbDistributedAntiReplayStore`) | **DISEÑADO PERO NO PROBADO CON INFRAESTRUCTURA REAL** | `AWS_DYNAMODB_REAL_TESTED = false`, `DYNAMODB_PRODUCTION_READY = false`. Probado contra simulador local de `TransactWriteItems` en `EXT06-DDB-01`. |
| Adaptadores KMS (`AwsKmsSigningProvider`, `GcpKmsSigningProvider`) | **IMPLEMENTADO LOCALMENTE** (sin KMS cloud real) | `PROVIDER_REAL_WORLD_TESTED = false`. Verificados con clientes simulados y detección `KMS_PUBLIC_KEY_MISMATCH` en `EXT06-KMS-01`. |
| Liveness `/health` vs Readiness `/readiness` + Gate `503` pre-firma | **IMPLEMENTADO LOCALMENTE** | [`authority-service.mjs`](../src/authority-service.mjs) y [`http-server.mjs`](../src/http-server.mjs). Verificado con servidor HTTP real local en `EXT06-D-10`. |
| PostgreSQL/Cloud SQL/RDS real, DynamoDB AWS real, AWS/GCP KMS real, OIDC/mTLS real | **REQUIERE INFRAESTRUCTURA REAL** | Pendiente para fases de aprovisionamiento y smoke test cloud real (fuera de alcance EXT-REAL-06). |

---

## 3. Artefactos Creados y Modificados en EXT-REAL-06

### Archivos creados en EXT-REAL-06
- [`services/independent-attestation-authority/src/distributed-anti-replay.mjs`](../src/distributed-anti-replay.mjs)
- [`services/independent-attestation-authority/src/postgres-anti-replay-adapter.mjs`](../src/postgres-anti-replay-adapter.mjs)
- [`services/independent-attestation-authority/src/dynamodb-anti-replay-adapter.mjs`](../src/dynamodb-anti-replay-adapter.mjs)
- [`services/independent-attestation-authority/sql/001_distributed_anti_replay.sql`](../sql/001_distributed_anti_replay.sql)
- [`src/test/independentAttestationAuthorityDistributedExt06.test.ts`](../../../src/test/independentAttestationAuthorityDistributedExt06.test.ts)
- [`services/independent-attestation-authority/docs/DISTRIBUTED_ANTI_REPLAY_IMPLEMENTATION.md`](./DISTRIBUTED_ANTI_REPLAY_IMPLEMENTATION.md)
- [`services/independent-attestation-authority/docs/KMS_PROVIDER_ABSTRACTION.md`](./KMS_PROVIDER_ABSTRACTION.md)
- [`services/independent-attestation-authority/docs/EXT_REAL_06_IMPLEMENTATION_REPORT.md`](./EXT_REAL_06_IMPLEMENTATION_REPORT.md)

### Archivos modificados en EXT-REAL-06
- [`services/independent-attestation-authority/src/signing-providers.mjs`](../src/signing-providers.mjs)
- [`services/independent-attestation-authority/src/service-anti-replay.mjs`](../src/service-anti-replay.mjs)
- [`services/independent-attestation-authority/src/authority-service.mjs`](../src/authority-service.mjs)
- [`services/independent-attestation-authority/src/http-server.mjs`](../src/http-server.mjs)
- [`services/independent-attestation-authority/src/server.mjs`](../src/server.mjs)
- [`services/independent-attestation-authority/src/index.mjs`](../src/index.mjs)
- [`services/independent-attestation-authority/src/index.d.mts`](../src/index.d.mts)
- [`services/independent-attestation-authority/.env.example`](../.env.example)

---

## 4. Pruebas Requeridas EXT-REAL-06 (`EXT06-*`)

1. `EXT06-CONTRACT-01`: Contrato formal `DistributedAntiReplayStore`, clave `computeDistributedIdempotencyKey` y transiciones fail-closed (`AVAILABLE -> RESERVED -> CONSUMED | FAILED | EXPIRED`, terminales inmutables).
2. `EXT06-D-01`: Contienda simultánea de 2 nodos (`NODE_A` vs `NODE_B`) con `signDelayMs` -> `MAX_SIGNATURES = 1`.
3. `EXT06-D-02`: Contienda simultánea de 10 nodos -> `1` firma, `9` rechazos.
4. `EXT06-D-03`: 100 solicitudes concurrentes con el mismo `authorizationId` repartidas en 5 nodos -> `1` firma y `99` rechazos.
5. `EXT06-D-04`: Mismo `requestId` con distinto digest -> `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT` sin invocar KMS.
6. `EXT06-D-05`: Mismo `authorizationId` con distinto `requestId`/digest -> `SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED` sin invocar KMS.
7. `EXT06-D-06`: Crash simulado tras `RESERVED` antes de `SIGN` mantiene bloqueo fail-closed entre nodos.
8. `EXT06-D-07`: Fallo en proveedor KMS transiciona a `FAILED` terminal no reciclable en todos los nodos.
9. `EXT06-D-08`: Timeout de lease transiciona `RESERVED -> EXPIRED` no reciclable y rechaza commit tardío (`SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED`).
10. `EXT06-D-09`: Dos procesos OS `node` independientes compitiendo sobre coordinador en filesystem -> máximo `1` firma.
11. `EXT06-D-10`: Store corrupto / caído conserva `/health = 200 (SERVICE_PROCESS_ALIVE)`, degrada `/readiness = 503 (SERVICE_NOT_READY_TO_SIGN)` y rechaza `POST /attestations` con `503` sin invocar firma KMS.
12. `EXT06-PG-01`: `PostgresDistributedAntiReplayStore` sobre `@electric-sql/pglite` real SQL (`BEGIN / ON CONFLICT / COMMIT`) y trazado de pool (`POSTGRESQL_REAL_INTEGRATION_TESTED = false`).
13. `EXT06-DDB-01`: `DynamoDbDistributedAntiReplayStore` valida `TransactWriteItems` en 4 prefijos (`REQ#`, `ATT#`, `HASH#`, `AUTH#`), `ConditionExpression`, timeout y degradación health (`AWS_DYNAMODB_REAL_TESTED = false`).
14. `EXT06-KMS-01`: `AwsKmsSigningProvider` y `GcpKmsSigningProvider` verifican firma Ed25519 sin clave privada y rechazan firma corrupta (`KMS_PUBLIC_KEY_MISMATCH`), manteniendo `PROVIDER_REAL_WORLD_TESTED = false`.
