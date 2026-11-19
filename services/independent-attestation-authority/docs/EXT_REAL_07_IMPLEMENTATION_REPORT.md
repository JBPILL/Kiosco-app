# EXT-REAL-07 — Reporte de Implementación y Auditoría: Controlled Real Infrastructure Integration Readiness

- **Rama:** `feat/pilot-envases-returns`
- **Base HEAD:** `014ec379a46fc14703b2542ad8bbdd0c97ef8de0`
- **Estado Git:** Trabajo local únicamente (`COMMITS_CREATED = 0`, `PUSHES_PERFORMED = 0`), sin despliegues en nube ni mutaciones remotas.

---

## 1. Resumen Ejecutivo Honesto

La fase **EXT-REAL-07** cierra la brecha técnica entre los adaptadores y verificadores locales previos y una futura integración controlada con infraestructura real en producción/staging (**PostgreSQL dedicado**, **AWS DynamoDB opcional**, **AWS/GCP KMS Ed25519**, **OIDC/JWT S2S** y **mTLS S2S**), manteniendo de forma estricta e innegociable:

- **Integración externa opt-in explícito:** Deshabilitada por defecto (`ATTESTATION_REAL_INTEGRATION_ENABLED=false`). Con la configuración por defecto se realizan **0 llamadas de red externas** y los tests de integración real permanecen explícitamente omitidos (`SKIPPED`).
- **0 llamadas ARCA / AFIP**, **0 lecturas/escrituras Supabase**, **0 mutaciones de producción**, **0 emisiones CAE**, **`P1_IMPORT_ALLOWED = false`**, **`PR02_READY_FOR_EMISSION_GO = false`**, **`REMOTE_GO = DENIED`**.

---

## 2. Hallazgos Críticos Detectados en Auditoría y Remediados

1. **Bug Crítico de Rollback en PostgreSQL (`markSigningAttemptStarted` / `commitReservation`):**
   - *Hallazgo:* Cuando el lease de una reserva vencía antes de iniciar firma o de confirmar `CONSUMED`, `PostgresDistributedAntiReplayStore` ejecutaba `expireSql` dentro de `_withTx(...)` y luego lanzaba `SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED` dentro del mismo bloque `try`, causando que `_withTx` ejecutara `ROLLBACK` y revirtiera el cambio de estado a `'RESERVED'`.
   - *Remediación:* Se reestructuró `markSigningAttemptStarted` y `commitReservation` en [`postgres-anti-replay-adapter.mjs`](../src/postgres-anti-replay-adapter.mjs) para que la transición atómica `RESERVED -> EXPIRED` haga `COMMIT` antes de lanzar `SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED` (y verificado en regresión `EXT07-PG-01`).
2. **Timeouts, Pool Poisoning y Clasificación de Conectividad en PostgreSQL:**
   - *Remediación:* Se incorporaron `queryTimeoutMs`, `healthCheckTimeoutMs`, `statementTimeoutMs` (`SET LOCAL statement_timeout`), `isolationLevel` restringido por allowlist (`READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`), liberación segura con error en sockets rotos (`client.release(err)`) y clasificación de errores de red SQLSTATE `08*` / timeouts en `SERVICE_ANTI_REPLAY_UNAVAILABLE`.
3. **Resiliencia Transaccional en DynamoDB:**
   - *Remediación:* En [`dynamodb-anti-replay-adapter.mjs`](../src/dynamodb-anti-replay-adapter.mjs) se agregaron timeouts acotados, clasificación `ThrottlingException`/`ProvisionedThroughputExceededException` -> `SERVICE_ANTI_REPLAY_UNAVAILABLE` y `TransactionConflictException` -> `SERVICE_ANTI_REPLAY_LOCK_CONTENTION`, soporte de TTL de retención (`ttlEpochSeconds`), `ClientRequestToken` de idempotencia en `TransactWriteItems` y expiración oportunista ante lease vencido.
4. **KMS Health Check, Timeout Acotado y Verificación Estricta de Respuesta:**
   - *Remediación:* [`signing-providers.mjs`](../src/signing-providers.mjs) valida timeout de firma (`DEFAULT_KMS_SIGNING_TIMEOUT_MS = 5000`), verifica coincidencia de algoritmo devuelto (`ED25519_SHA_512` / `Ed25519`) y `KeyId`/`name` devueltos, exige verificación Ed25519 contra el SPKI configurado, expone `isHealthy()` verificando `healthCheck`/`getPublicKey` vs SPKI, y [`authority-service.mjs`](../src/authority-service.mjs) bloquea reservas antes de `reserveBeforeSign` si el KMS no está saludable.
5. **Verificadores S2S Reales OIDC/JWT y mTLS End-to-End + Socket TLS:**
   - *Remediación:* [`client-auth.mjs`](../src/client-auth.mjs) implementa `createOidcJwtClientAuthVerifier` (`EdDSA`, `RS256`, `ES256`, cache y rotación JWKS, bloqueo `alg=none`/`HS256`/`kty=oct`, rechazo `http://` no local, outage `503 OIDC_JWKS_UNAVAILABLE`) y `createMtlsClientAuthVerifier` validando contexto TLS real propagado desde [`http-server.mjs`](../src/http-server.mjs) (`req.socket.authorized` + `getPeerCertificate`), bloqueando suplantación por headers HTTP.
6. **Guardia Central en `/readiness`, Enmascaramiento de Errores y Harness Controlado:**
   - `/readiness` ahora audita `providerHealthy` y `authHealthy`, además de `antiReplayHealthy`.
   - [`authority-service.mjs`](../src/authority-service.mjs) protege `markReservationFailed` ante fallos secundarios para no enmascarar errores de `commitReservation` ni filtrar respuestas no confirmadas.
   - [`real-integration.mjs`](../src/real-integration.mjs) encapsula la carga diferida opcional (`@aws-sdk/client-kms`, `@google-cloud/kms`, `@aws-sdk/client-dynamodb`, `pg`) bajo compuerta explícita `ATTESTATION_REAL_INTEGRATION_ENABLED=true` y validación `assertDedicatedPostgresUrl` (prohibiendo compartir Supabase POS).

---

## 3. Matriz de Estado y Madurez por Componente

| Componente | Estado Técnico | Evidencia Verificada en Local |
|---|---|---|
| OIDC/JWT Verifier (`EdDSA`, `RS256`, `ES256`, JWKS + rotación + outage `503`) | **LOCAL_TESTED** | `EXT07-OIDC-01`, `EXT07-OIDC-02` (incluye loopback HTTP JWKS local y rechazo `alg=none`/`oct`) |
| mTLS Verifier + Node `https` Mutual TLS Socket Transport | **LOCAL_TESTED** | `EXT07-MTLS-01` (PKI efímera X.509 local, CA confiable/rogue, cert expirado, allowlist, anti-header-spoof) |
| Adaptador PostgreSQL + Esquema SQL + `BEGIN/ON CONFLICT/COMMIT` | **LOCAL_TESTED / SIMULATION_TESTED** | `EXT06-PG-01`, `EXT07-PG-01`, `EXT07-PG-02` sobre `@electric-sql/pglite` WASM SQL + pool traces (>=100 concurrencia) |
| Integración real PostgreSQL externa (`ATTESTATION_POSTGRES_URL`) | **IMPLEMENTED / NOT_RUN (`SKIPPED` por defecto)** | Bloque opt-in `EXT07-REAL-PG-01` en `src/test/independentAttestationAuthorityRealIntegrationExt07.test.ts` |
| Adaptador DynamoDB (`TransactWriteItems`, TTL, throttling, contention) | **IMPLEMENTED / SIMULATION_TESTED** | `EXT06-DDB-01`, `EXT07-DDB-01` contra simulador y clientes fallidos |
| Proveedores KMS (`AwsKmsSigningProvider`, `GcpKmsSigningProvider`) | **IMPLEMENTED / SIMULATION_TESTED** | `EXT06-KMS-01`, `EXT07-KMS-01` (clientes SDK encapsulados, sin claves ni llamadas nube reales) |
| Integración real Cloud (AWS KMS, GCP KMS, DynamoDB real, IdP OIDC real) | **NOT_TESTED (`PRODUCTION_VALIDATED = false`)** | Sin credenciales ni recursos cloud en este entorno |

---

## 4. Artefactos Modificados y Creados en EXT-REAL-07

### Modificados
- [`services/independent-attestation-authority/src/postgres-anti-replay-adapter.mjs`](../src/postgres-anti-replay-adapter.mjs)
- [`services/independent-attestation-authority/src/dynamodb-anti-replay-adapter.mjs`](../src/dynamodb-anti-replay-adapter.mjs)
- [`services/independent-attestation-authority/src/signing-providers.mjs`](../src/signing-providers.mjs)
- [`services/independent-attestation-authority/src/client-auth.mjs`](../src/client-auth.mjs)
- [`services/independent-attestation-authority/src/authority-service.mjs`](../src/authority-service.mjs)
- [`services/independent-attestation-authority/src/http-server.mjs`](../src/http-server.mjs)
- [`services/independent-attestation-authority/src/server.mjs`](../src/server.mjs)
- [`services/independent-attestation-authority/src/index.mjs`](../src/index.mjs)
- [`services/independent-attestation-authority/src/index.d.mts`](../src/index.d.mts)
- [`services/independent-attestation-authority/.env.example`](../.env.example)

### Creados
- [`services/independent-attestation-authority/src/real-integration.mjs`](../src/real-integration.mjs)
- [`src/test/independentAttestationAuthorityRealIntegrationExt07.test.ts`](../../../src/test/independentAttestationAuthorityRealIntegrationExt07.test.ts)
- [`services/independent-attestation-authority/docs/REAL_INFRASTRUCTURE_INTEGRATION_GUIDE.md`](./REAL_INFRASTRUCTURE_INTEGRATION_GUIDE.md)
- [`services/independent-attestation-authority/docs/EXT_REAL_07_IMPLEMENTATION_REPORT.md`](./EXT_REAL_07_IMPLEMENTATION_REPORT.md)

---

## 5. Pruebas y Estado Final de Puertas de Seguridad

```text
POSTGRESQL_REAL_INTEGRATION_TESTED = false
DYNAMODB_REAL_INTEGRATION_TESTED = false
AWS_KMS_REAL_TESTED = false
GCP_KMS_REAL_TESTED = false
REAL_OIDC_CONFIGURED = false
REAL_MTLS_CONFIGURED = false
PRODUCTION_KMS_CONFIGURED = false
EXTERNAL_AUTHORITY_DEPLOYED = false

ARCA_CALLS_NEW = 0
STAGING_READS_NEW = 0
STAGING_WRITES_NEW = 0
PRODUCTION_MUTATIONS = 0
CAE_EMISSIONS_NEW = 0

HISTORICAL_042_IDENTIFICATION = UNRESOLVED
HISTORICAL_042_REEMISSION_FORBIDDEN = true
P1_IMPORT_ALLOWED = false
PR02_READY_FOR_EMISSION_GO = false
REMOTE_GO = DENIED
```
