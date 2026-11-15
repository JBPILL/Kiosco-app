# Reporte Técnico de Implementación — EXT-REAL-08
## Production Infrastructure Preflight & Controlled Real Integration Readiness

> **Nota de Honestidad Técnica:** Este reporte resume el trabajo ejecutado en la fase **EXT-REAL-08** sobre `services/independent-attestation-authority`. **No se realizaron despliegues cloud, no se crearon recursos en AWS/GCP, no se conectó con bases PostgreSQL/DynamoDB remotas reales, no se utilizaron credenciales reales, no se emitieron comprobantes/CAE ni se ejecutaron mutaciones en ARCA ni Supabase POS.** Todos los indicadores `*_REAL_INTEGRATION_TESTED` y `PRODUCTION_VALIDATED` permanecen estrictamente en `false`.

---

## 1. Resumen Ejecutivo Honesto

La fase **EXT-REAL-08** cierra la preparación técnica previa a credenciales reales o despliegue en infraestructura cloud mediante:

1. **Auditoría técnica de riesgos de infraestructura real** sobre los adaptadores de PostgreSQL, DynamoDB, AWS KMS, GCP Cloud KMS, OIDC/JWT, mTLS y los endpoints `/health` y `/readiness`.
2. **Endurecimiento de código** para fallos encontrados durante la auditoría (contención SQL `40001`/`40P01`/`55P03`, timeouts `57014`/`57P05`, `TransactionConflict` parcial en DynamoDB `TransactWriteItems`, anti-SSRF con `redirect: 'error'` en JWKS OIDC, `pool.on('error')` y bloqueo de hosts metadata/no especificados en PostgreSQL/endpoints, unificación de resolución KMS vía `resolveKmsEnvConfig`).
3. **Capa centralizada de Preflight (`infrastructure-preflight.mjs`)** que valida sintaxis, seguridad y requisitos de targets sin abrir conexiones ni mutar datos.
4. **Huella diagnóstica segura sin secretos (`buildSafeConfigurationFingerprint`)** con hash SHA-256 determinista sobre configuración sanitizada y redacción de credenciales en logs/reportes (`redactSensitiveConfigText`).
5. **Modo Dry-Run real controlado (`runControlledRealIntegrationDryRun`)** con matriz explícita `WOULD_RUN` / `NOT_RUN` / `FORBIDDEN` y contadores estrictos en `0`, además de bloqueo fail-closed en constructores SDK mientras `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`.
6. **Contrato secuencial por fases (`PHASE_0..PHASE_6`)** y **modelo honesto de madurez (`UNIT_TESTED..PRODUCTION_VALIDATED`)** con prohibición programática de autopromociones o saltos directos de fase.

---

## 2. Estado Verificado de Git y Alcance

- **Rama actual:** `feat/pilot-envases-returns`
- **`HEAD` local y remoto (`origin/feat/pilot-envases-returns`):** `014ec379a46fc14703b2542ad8bbdd0c97ef8de0`
- **Commits creados en esta fase:** `0` (`COMMIT = NOT_CREATED`)
- **Push realizados:** `0` (`PUSH = NOT_PERFORMED`)
- **Trabajo previo preservado:** Cambios locales intactos de EXT-REAL-03..EXT-REAL-07 en árbol de trabajo.

---

## 3. Auditoría Técnica de Riesgos y Endurecimientos Aplicados

| Área Auditada | Riesgo / Hallazgo Detectado | Mitigación Implementada (Fail-Closed) | Archivo |
|---|---|---|---|
| **PostgreSQL SQLSTATEs** | Códigos de contención transaccional (`40001`, `40P01`, `55P03`) y timeouts (`57014`, `57P05`) se clasificaban genéricamente como `STORAGE_ERROR`. | Clasificación explícita a `SERVICE_ANTI_REPLAY_LOCK_CONTENTION` y `SERVICE_ANTI_REPLAY_UNAVAILABLE`. | [`postgres-anti-replay-adapter.mjs`](../src/postgres-anti-replay-adapter.mjs) |
| **PostgreSQL Pool / Host** | Faltaba listener `pool.on('error')` para clientes ociosos caídos; faltaba bloqueo de hosts metadata cloud (`169.254.169.254`, `metadata.google.internal`), hosts no especificados (`0.0.0.0`, `[::]`), nombre DB vacío y límite superior de pool. | `pool.on('error')` con captura segura `getLastPoolError()`, rechazo `POSTGRES_FORBIDDEN_HOST`, exigencia de nombre DB dedicada y tope `poolMax <= 200`. | [`real-integration.mjs`](../src/real-integration.mjs) |
| **DynamoDB TransactWriteItems** | `isConditionalCancelError` devolvía `true` ante cualquier `TransactionCanceledException`, tratando `TransactionConflict` o throttling en `CancellationReasons` como conflicto de idempotencia; faltaba discriminación explícita de colisión `ATT#`. | Cuando existe `CancellationReasons[]`, solo retorna condicional si hay `'ConditionalCheckFailed'`; discrimina `'TransactionConflict'` -> `LOCK_CONTENTION`, throttling -> `UNAVAILABLE`, y colisión `ATT#` -> `SERVICE_ANTI_REPLAY_ATTESTATION_ID_DUPLICATED`. | [`dynamodb-anti-replay-adapter.mjs`](../src/dynamodb-anti-replay-adapter.mjs) |
| **KMS / Env Drift** | `server.mjs` y `real-integration.mjs` leían distintas variantes de variables KMS (`ATTESTATION_KMS_KEY_VERSION` vs `_NAME`, `ATTESTATION_PUBLIC_KEY_SPKI` vs `ATTESTATION_KMS_PUBLIC_KEY_SPKI`, etc.) y `kmsEndpoint` no validaba HTTPS remoto. | Helper unificado `resolveKmsEnvConfig(env)` con detección `KMS_CONFIGURATION_CONFLICT`, compartido por `server.mjs`, `real-integration.mjs` e `infrastructure-preflight.mjs`; validación HTTPS en `assertSafeEndpointUrl`. | [`real-integration.mjs`](../src/real-integration.mjs), [`server.mjs`](../src/server.mjs) |
| **OIDC JWKS Fetch SSRF** | `fetchRemoteJwksFromUri` permitía redirects implícitos (`redirect: 'follow'` por defecto) y `assertSafeJwksUri` no bloqueaba metadata IPs ni credenciales embebidas. | Bloqueo de `169.254.169.254` / `metadata.google.internal` / `user:pass@` en `assertSafeJwksUri` y `redirect: 'error'` en `fetch`. | [`client-auth.mjs`](../src/client-auth.mjs) |
| **Health vs Readiness** | Convenía explicitar en JSON de `/health` y `/readiness` que operatividad controlada nunca implica aprobación/validación productiva. | Campos explícitos `productionValidated: false`, `productionApproved: false`, `authorityRealWorldAvailable: false` y `readinessBoundary: 'CONTROLLED_SERVICE_READINESS_ONLY'`. | [`authority-service.mjs`](../src/authority-service.mjs) |

---

## 4. Capa Centralizada de Preflight de Infraestructura

Implementada en [`infrastructure-preflight.mjs`](../src/infrastructure-preflight.mjs):

- `validateInfrastructureConfiguration(env, options)`
- `runInfrastructurePreflight(env, options)`

Estados formales exportados en `PREFLIGHT_STATUSES`:
- `CONFIGURATION_VALID`
- `CONFIGURATION_INVALID`
- `REAL_INTEGRATION_DISABLED`
- `REAL_INTEGRATION_NOT_CONFIGURED`
- `REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST`

Garantías:
- Ejecuta validaciones sin abrir sockets TCP/TLS ni llamar KMS/DB/OIDC.
- Reprueba explícitamente URLs de PostgreSQL apuntando a Supabase POS (`POSTGRES_DEDICATED_DATABASE_REQUIRED`), hosts remotos sin TLS (`POSTGRES_TLS_REQUIRED`), endpoints KMS/DynamoDB/JWKS sin HTTPS remoto, claves KMS no Ed25519 o con mismatch de `keyId`, algoritmos AWS distintos a `ED25519_SHA_512`, colapso de autoridad GO/Atestación y contaminaciones fiscales.
- Separa en todos los casos `syntaxValid` / `securityPostureValid` respecto a `connectivityTested: false`, `healthVerified: false`, `realIntegrationTested: false`, `productionValidated: false` y `productionApproved: false`.

---

## 5. Huella Diagnóstica Segura sin Secretos

- `buildSafeConfigurationFingerprint(env)` extrae únicamente metadatos estructurales no secretos: entorno, flags booleanas, modo KMS, región, `keyId` público, host/puerto/base/sslmode de PostgreSQL (sin usuario ni contraseña), tabla/región DynamoDB, modo client auth, host JWKS y SHA-256 determinista del descriptor (`secretsIncluded: false`).
- `redactSensitiveConfigText(text)` enmascara bloques `PRIVATE KEY`, credenciales embebidas en URLs (`protocol://user:pass@`), tokens `Bearer` y parámetros de consulta sensibles (`password=`, `token=`, `service_role=`, etc.).

---

## 6. Modo Dry-Run Real (`ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`)

- `runControlledRealIntegrationDryRun(env)` exige `ATTESTATION_REAL_INTEGRATION_ENABLED=true` y `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`.
- Genera la matriz formal de acciones sin ejecutar efectos secundarios:
  - `POSTGRES_CONNECTION_CHECK`: `WOULD_RUN` (si configurado) / `NOT_RUN_UNCONFIGURED_OR_SKIPPED`
  - `POSTGRES_WRITE_TEST`: `NOT_RUN`
  - `DYNAMODB_CONNECTIVITY_CHECK`: `WOULD_RUN` / `NOT_RUN_UNCONFIGURED_OR_SKIPPED`
  - `DYNAMODB_MUTATION`: `NOT_RUN`
  - `KMS_PUBLIC_KEY_CHECK`: `WOULD_RUN` / `NOT_RUN_UNCONFIGURED_OR_SKIPPED`
  - `KMS_SIGN_OPERATION`: `NOT_RUN`
  - `OIDC_DISCOVERY`: `WOULD_RUN` / `NOT_RUN_UNCONFIGURED_OR_SKIPPED`
  - `MTLS_HANDSHAKE_VALIDATION`: `WOULD_RUN` / `NOT_RUN_UNCONFIGURED_OR_SKIPPED`
  - `ARCA`: `FORBIDDEN`
  - `SUPABASE_POS_MUTATION`: `FORBIDDEN`
- Adicionalmente, `assertRealIntegrationEnabled` en `real-integration.mjs` bloquea con `REAL_INTEGRATION_DRY_RUN_ACTIVE` cualquier intento de construir pools PG o clientes DynamoDB/KMS reales mientras el modo dry-run esté activo.

---

## 7. Contrato Secuencial por Fases (`PHASE_0..PHASE_6`)

`evaluateIntegrationPhaseGate` aplica progresión obligatoria sobre `INTEGRATION_PHASE_ORDER`:
`PHASE_0_CONFIG_VALIDATION` -> `PHASE_1_READ_ONLY_CONNECTIVITY` -> `PHASE_2_NON_PRODUCTION_MUTATION` -> `PHASE_3_CONCURRENCY_VALIDATION` -> `PHASE_4_KMS_SIGNING_VALIDATION` -> `PHASE_5_AUTHENTICATION_VALIDATION` -> `PHASE_6_DEPLOYMENT_CANDIDATE`.

- Todo salto (por ejemplo `PHASE_0 -> PHASE_6`) falla cerrado con `PHASE_ESCALATION_FORBIDDEN`.
- Cada fase desde `PHASE_1` en adelante exige su variable de opt-in explícita en `true` y estado de preflight `REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST`.
- `PHASE_6` exige además `governanceManualSignOff === true` y mantiene bloqueados `productionApproved: false`, `p1ImportAllowed: false` y `remoteGo: 'DENIED'`.

---

## 8. Modelo Honesto de Madurez

`MATURITY_STATES` distingue estrictamente:
- `UNIT_TESTED`
- `LOCAL_TESTED`
- `SIMULATION_TESTED`
- `REAL_CONNECTIVITY_TESTED`
- `REAL_INTEGRATION_TESTED`
- `PRODUCTION_VALIDATED`

`assertMaturityPromotionAllowed` rechaza con `MATURITY_PROMOTION_FORBIDDEN` toda autopromoción desde `UNIT_TESTED`, `LOCAL_TESTED` o `SIMULATION_TESTED` hacia `PRODUCTION_VALIDATED`, y exige evidencia real verificada para niveles `REAL_*`.

---

## 9. Archivos Creados y Modificados en EXT-REAL-08

### Archivos Nuevos
- [`services/independent-attestation-authority/src/infrastructure-preflight.mjs`](../src/infrastructure-preflight.mjs)
- [`src/test/independentAttestationAuthorityInfrastructureExt08.test.ts`](../../../src/test/independentAttestationAuthorityInfrastructureExt08.test.ts)
- [`services/independent-attestation-authority/docs/INFRASTRUCTURE_PREFLIGHT_AND_DEPLOYMENT_GATES.md`](./INFRASTRUCTURE_PREFLIGHT_AND_DEPLOYMENT_GATES.md)
- [`services/independent-attestation-authority/docs/EXT_REAL_08_IMPLEMENTATION_REPORT.md`](./EXT_REAL_08_IMPLEMENTATION_REPORT.md)

### Archivos Actualizados
- [`services/independent-attestation-authority/src/postgres-anti-replay-adapter.mjs`](../src/postgres-anti-replay-adapter.mjs)
- [`services/independent-attestation-authority/src/dynamodb-anti-replay-adapter.mjs`](../src/dynamodb-anti-replay-adapter.mjs)
- [`services/independent-attestation-authority/src/client-auth.mjs`](../src/client-auth.mjs)
- [`services/independent-attestation-authority/src/authority-service.mjs`](../src/authority-service.mjs)
- [`services/independent-attestation-authority/src/real-integration.mjs`](../src/real-integration.mjs)
- [`services/independent-attestation-authority/src/server.mjs`](../src/server.mjs)
- [`services/independent-attestation-authority/src/index.mjs`](../src/index.mjs)
- [`services/independent-attestation-authority/src/index.d.mts`](../src/index.d.mts)
- [`services/independent-attestation-authority/.env.example`](../.env.example)

---

## 10. Validaciones y Evidencia de Pruebas

| Validación | Alcance | Resultado Observado |
|---|---|---|
| `npx vitest run independentAttestationAuthorityInfrastructureExt08 --fileParallelism=false` | Suite EXT-REAL-08 (`EXT08-CONFIG-01..04`, `EXT08-PREFLIGHT-01..02`, `EXT08-DRYRUN-01..03`, `EXT08-KMS-01`, `EXT08-AUTH-01`, `EXT08-READY-01`, `EXT08-STATE-01`, `EXT08-SECRETS-01`, `EXT08-AUDIT-01`) | `15/15 PASS` |
| `npx vitest run independentAttestationAuthority --fileParallelism=false` | Suites EXT-REAL-02..EXT-REAL-08 (`5` archivos) | `98 passed \| 1 skipped` (`EXT07-REAL-PG-01` omitido por diseño fail-closed sin entorno PostgreSQL real opt-in) |
| `npx vitest run fiscalPr02P0Collector --fileParallelism=false` | Regresión colector P0 (`1` archivo) | `186/186 PASS` |
| `npx tsc --noEmit` | Verificación TypeScript estricto del proyecto (incluyendo `.d.mts` y tests `.ts`) | `PASS` (`exit code 0`) |
| `npm run build` | `tsc -b && vite build` | `PASS` (`exit code 0`) |
| `npx oxlint services/independent-attestation-authority src/test/independentAttestationAuthorityInfrastructureExt08.test.ts` | Linter focalizado del microservicio y tests EXT-REAL-08 | `PASS` (`0 errors`, `2 warnings` preexistentes) |
| `npx oxlint` (repositorio completo) | Escaneo global del repo (`894` archivos) | `220 warnings`, `1 error` en `src/types/pg.d.ts:14:20` (`Identifier 'pg' has already been declared`, fuera de los archivos de EXT-REAL-08) |
| `git diff --check` | Integridad de formato de diff | `PASS` (`exit code 0`) |
| Escaneo estático de secretos (`42` archivos: autoridad + test EXT08) | Detección de claves privadas PEM reales, tokens WSAA/ARCA y credenciales | `PASS` (solo listas de bloqueo declarativas, documentación y texto redactado de fixture en test EXT08) |
| `verifyRuntimeSigningIsolation({ forceRescan: true })` | Aislamiento de firma en runtime del POS | `PASS` (`RUNTIME_SIGNING_ISOLATED`, `privateKeysDetected: 0`) |
| `pwsh ... run-pr02-p0-staging-private.ps1 -DryRun -ExpectedHead 014ec379...` | Simulación P0 staging en modo dry-run | `PASS` (`ARCA_CALLS_NEW = 0`, `STAGING_READS_NEW = 0`, `STAGING_WRITES_NEW = 0`, `PRODUCTION_MUTATIONS = 0`) |

---

## 11. Limitaciones Actuales y Riesgos Pendientes

1. **Sin infraestructura real aprovisionada en nube:** PostgreSQL RDS/Cloud SQL, AWS DynamoDB, AWS KMS, GCP KMS y un IdP OIDC real aún no existen ni han recibido tráfico real desde este servicio (`*_REAL_* = false`).
2. **Validación sobre emuladores/WASM embebido:** La ejecución SQL real de la autoridad sigue respaldada únicamente por `@electric-sql/pglite` WASM + dobles contractuales locales hasta ejecutar `PHASE_1..PHASE_5` en un entorno dedicado autorizado.
3. **Dependencia de revisión humana en `PHASE_6`:** Ninguna automatización ni test del repositorio autoriza el paso a producción ni emite aprobaciones de gobernanza.
4. **Error ajeno en linter global:** `npx oxlint` reporta `1` error en `src/types/pg.d.ts:14:20` (`Identifier 'pg' has already been declared`), fuera del alcance de esta fase y no modificado por política de control de alcance.

---

## 12. Próxima Fase Recomendada e Invariantes de Bloqueo

**Siguiente paso controlado:** Una vez aprovisionada infraestructura dedicada no productiva y autorizada explícitamente la prueba real, ejecutar secuencialmente:
1. `runInfrastructurePreflight(env)` -> exigir `REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST`.
2. `runControlledRealIntegrationDryRun(env)` con `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`.
3. `PHASE_1` a `PHASE_5` siguiendo [INFRASTRUCTURE_PREFLIGHT_AND_DEPLOYMENT_GATES.md](./INFRASTRUCTURE_PREFLIGHT_AND_DEPLOYMENT_GATES.md), manteniendo `P1_IMPORT_ALLOWED = false` y cero mutaciones fiscales.

```text
BRANCH = feat/pilot-envases-returns
BASE_HEAD = 014ec379a46fc14703b2542ad8bbdd0c97ef8de0
EXT_REAL_08_IMPLEMENTATION = PASS_WITH_LOCAL_BOUNDARIES
PREFLIGHT_LAYER_IMPLEMENTED = true
SAFE_CONFIG_FINGERPRINT_IMPLEMENTED = true
DRY_RUN_REAL_INTEGRATION_IMPLEMENTED = true
PHASED_GATE_CONTRACT_IMPLEMENTED = true
PRODUCTION_VALIDATED = false
EXTERNAL_AUTHORITY_DEPLOYED = false
POSTGRESQL_REAL_INTEGRATION_TESTED = false
AWS_DYNAMODB_REAL_TESTED = false
AWS_KMS_REAL_TESTED = false
GCP_KMS_REAL_TESTED = false
OIDC_REAL_INTEGRATION_TESTED = false
MTLS_REAL_INTEGRATION_TESTED = false
P1_IMPORT_ALLOWED = false
PR02_READY_FOR_EMISSION_GO = false
REMOTE_GO = DENIED
HISTORICAL_042_REEMISSION_FORBIDDEN = true
COMMIT = NOT_CREATED
PUSH = NOT_PERFORMED
```
