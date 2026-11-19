# EXT-REAL-09 — Controlled External Connectivity & Deployment Readiness Implementation Report

## 1. Resumen Ejecutivo

La fase **EXT-REAL-09 — Controlled External Connectivity & Deployment Readiness** implementa y valida la capa de conectividad externa controlada de solo lectura para `services/independent-attestation-authority`, cerrando la brecha entre la validación local/dry-run de EXT-REAL-08 y las futuras sondas controladas contra infraestructura externa real, bajo postura estrictamente **fail-closed**, auditable y libre de efectos secundarios.

- Se formalizó la jerarquía progresiva de 6 etapas de madurez operativa (`CONFIGURATION_VALIDATION` -> `LOCAL_PREFLIGHT` -> `SAFE_CONNECTIVITY_PREFLIGHT` -> `CONTROLLED_EXTERNAL_CONNECTIVITY` -> `REAL_INTEGRATION_TEST` -> `DEPLOYMENT_CANDIDATE`), separando explícitamente los estados `CONFIGURED`, `AUTHORIZED_TO_CONNECT` y `REAL_CONNECTIVITY_TESTED`.
- Se implementó el contrato centralizado de autorización de conectividad externa (`evaluateExternalConnectivityAuthorization` y `assertExternalConnectivityAuthorized` en `services/independent-attestation-authority/src/external-connectivity.mjs`), garantizando que ni la presencia de credenciales/endpoints ni `ATTESTATION_REAL_INTEGRATION_ENABLED=true` por sí solos disparen conexiones externas sin `ATTESTATION_CONNECTIVITY_TEST_ENABLED=true` (o `ATTESTATION_ALLOW_CONTROLLED_CONNECTIVITY_TEST=true`) y aprobación explícita (`ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL=APPROVED` o `ATTESTATION_EXPLICIT_CONNECTIVITY_APPROVAL=true`), y que `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true` bloquee toda conexión real (`NOT_RUN`).
- Se implementaron sondas controladas read-only para PostgreSQL dedicado (`runControlledPostgresConnectivityCheck`), AWS DynamoDB (`runControlledDynamoDbConnectivityCheck` y `classifyDynamoDbConnectivityError`), AWS KMS / GCP Cloud KMS (`runControlledKmsConnectivityCheck`), OIDC / JWKS (`runControlledOidcConnectivityCheck`) y mTLS (`runControlledMtlsConnectivityCheck`), junto con el orquestador unificado `runControlledExternalConnectivitySuite`.
- Se conservaron intactos todos los invariantes de aislamiento fiscal y de producción (`PRODUCTION_VALIDATED = false`, `PRODUCTION_APPROVED = false`, `EXTERNAL_AUTHORITY_DEPLOYED = false`, `AUTHORITY_REAL_WORLD_AVAILABLE = false`, `P1_IMPORT_ALLOWED = false`, `PR02_READY_FOR_EMISSION_GO = false`, `REMOTE_GO = DENIED`, `HISTORICAL_042_REEMISSION_FORBIDDEN = true`).

---

## 2. Auditoría Real del Estado Previo

Antes de modificar código se auditó el estado real del árbol de trabajo:

- **Rama actual**: `feat/pilot-envases-returns`
- **Commit base (`HEAD`)**: `014ec379a46fc14703b2542ad8bbdd0c97ef8de0` (sincronizado con `origin/feat/pilot-envases-returns`, sin commits nuevos ni `push`).
- **Estado previo en el árbol de trabajo**:
  - Implementaciones de EXT-REAL-02 a EXT-REAL-08 presentes en `services/independent-attestation-authority/src/`.
  - Endurecimientos adversariales previos aplicados sobre `infrastructure-preflight.mjs`, `real-integration.mjs`, `client-auth.mjs`, `postgres-anti-replay-adapter.mjs`, `http-server.mjs` y `server.mjs`.
  - Suite de pruebas de la autoridad independiente (`independentAttestationAuthorityService.test.ts`, `independentAttestationAuthorityAdversarialExt05.test.ts`, `independentAttestationAuthorityDistributedExt06.test.ts`, `independentAttestationAuthorityRealIntegrationExt07.test.ts`, `independentAttestationAuthorityInfrastructureExt08.test.ts`, `independentAttestationAuthorityAdversarialExt09.test.ts`) y colector fiscal (`fiscalPr02P0Collector.test.ts`) operativas en el repositorio.

---

## 3. Problemas y Brechas Detectadas Antes de EXT-REAL-09

1. **Ausencia de separación formal entre configuración válida, autorización de conectividad y conectividad real probada**:
   - En EXT-REAL-08 existía `runInfrastructurePreflight` y `runControlledRealIntegrationDryRun`, pero faltaba un contrato dedicado que separara formalmente `CONFIGURED`, `AUTHORIZED_TO_CONNECT` y `REAL_CONNECTIVITY_TESTED` y exigiera doble compuerta explícita (`ATTESTATION_CONNECTIVITY_TEST_ENABLED=true` + `ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL=APPROVED`) además de `ATTESTATION_REAL_INTEGRATION_ENABLED=true`.
2. **Falta de sondas read-only desacopladas de mutaciones**:
   - No existía un módulo dedicado (`external-connectivity.mjs`) que ejecutara exclusivamente operaciones de lectura (`SELECT current_database()`, `to_regclass($1)` en PostgreSQL; `DescribeTable` / `DescribeTimeToLive` en DynamoDB; `GetPublicKey` en KMS; `GET` acotado de JWKS en OIDC; evaluación de 5 estados de socket TLS en mTLS) garantizando `0` mutaciones y `0` firmas.
3. **Brechas puntuales en validación de URL PostgreSQL dedicada, exportación de validador JWKS y redacción de secretos en errores de drivers**:
   - `assertDedicatedPostgresUrl` en `real-integration.mjs` bloqueaba dominios Supabase e IPs de metadata pero no rechazaba directamente dominios fiscales (`afip.gov.ar`, `arca.gob.ar`) ni nombres de bases compartidas (`postgres`, `kiosco`, `kioscopos`, `kiosco_pos`, `pos`, `supabase`) cuando se invocaba fuera de `validateInfrastructureConfiguration`.
   - `assertSafeJwksUri` en `client-auth.mjs` era interna al módulo y no estaba exportada para reutilización directa por la sonda de conectividad OIDC.
   - `redactSensitiveConfigText` en `infrastructure-preflight.mjs` redactaba credenciales en URLs, headers `Bearer` y query params (`?secret=...`), pero no redactaba patrones textuales libres devueltos por drivers o SDKs como `token=...`, `with secret ...` o `AKIA...`.

---

## 4. Diseño del Modelo de Conectividad Controlada

### 4.1 Jerarquía de 6 Etapas (`CONNECTIVITY_READINESS_STAGES`)

1. `CONFIGURATION_VALIDATION`: validación estática de variables, formato, coherencia cruzada y ausencia de colisiones con recursos POS/ARCA.
2. `LOCAL_PREFLIGHT`: verificación local de primitivas criptográficas, contratos y aislamiento de runtime.
3. `SAFE_CONNECTIVITY_PREFLIGHT`: estado alcanzado cuando la configuración y el preflight local son válidos, pero la conectividad externa permanece deshabilitada, en `DRY_RUN`, o sin autorización explícita (`NOT_RUN`).
4. `CONTROLLED_EXTERNAL_CONNECTIVITY`: habilita únicamente sondas externas read-only (`0` escrituras, `0` reservas anti-replay, `0` firmas KMS) cuando se cumplen todas las compuertas de autorización.
5. `REAL_INTEGRATION_TEST`: etapa posterior (no ejecutada en esta fase) para pruebas controladas de extremo a extremo.
6. `DEPLOYMENT_CANDIDATE`: etapa final sujeta a evidencia real y `GoAuthorizationGrant` firmado por la autoridad de gobernanza.

### 4.2 Contrato de Autorización (`evaluateExternalConnectivityAuthorization` / `assertExternalConnectivityAuthorized`)

Para autorizar `AUTHORIZED_TO_CONNECT` (`authorizedToConnect = true`, `connectivityTestStatus = 'READY_TO_RUN'`), se exige simultáneamente:

- `configurationValid === true` (sin errores de configuración ni variables faltantes).
- `ATTESTATION_REAL_INTEGRATION_ENABLED === 'true'`.
- `ATTESTATION_REAL_INTEGRATION_DRY_RUN !== 'true'` (si `DRY_RUN=true`, el estado es `DRY_RUN_ACTIVE` y `connectivityTestStatus = 'NOT_RUN'`).
- `ATTESTATION_CONNECTIVITY_TEST_ENABLED === 'true'` (o `ATTESTATION_ALLOW_CONTROLLED_CONNECTIVITY_TEST === 'true'`, sin contradicción entre ambos).
- `ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL === 'APPROVED'` (o `ATTESTATION_EXPLICIT_CONNECTIVITY_APPROVAL === 'true'`, sin contradicción entre ambos).

---

## 5. Cambios Implementados por Archivo

- [external-connectivity.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/external-connectivity.mjs):
  - Implementa `CONNECTIVITY_READINESS_STAGES`, `CONNECTIVITY_STAGE_ORDER`, `CONNECTIVITY_AUTHORIZATION_STATUSES`, `POSTGRES_CONNECTIVITY_STATES`, `MTLS_CONNECTIVITY_STATES`, `DYNAMODB_ERROR_CATEGORIES`.
  - Implementa `evaluateExternalConnectivityAuthorization`, `assertExternalConnectivityAuthorized`, `runControlledPostgresConnectivityCheck`, `classifyDynamoDbConnectivityError`, `runControlledDynamoDbConnectivityCheck`, `runControlledKmsConnectivityCheck`, `runControlledOidcConnectivityCheck`, `runControlledMtlsConnectivityCheck` y `runControlledExternalConnectivitySuite`.
- [real-integration.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/real-integration.mjs):
  - Endurece `classifyNetworkHost` para IPv4 embebido en IPv6 (`[::ffff:169.254.169.254]`) y `assertDedicatedPostgresUrl` para bloquear dominios `afip.gov.ar` / `arca.gob.ar` y nombres de bases de datos compartidas (`postgres`, `kiosco`, `kioscopos`, `kiosco_pos`, `pos`, `supabase`).
- [client-auth.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/client-auth.mjs):
  - Exporta `assertSafeJwksUri` y expone `refreshJwks` en `createOidcJwtClientAuthVerifier`.
- [infrastructure-preflight.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/infrastructure-preflight.mjs):
  - Amplía `redactSensitiveConfigText` para redactar patrones `token=...`, `secret=...`, `password=...`, `with secret ...` y `AKIA...` en mensajes de error de SDKs/drivers.
- [index.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/index.mjs) y [index.d.mts](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/index.d.mts):
  - Re-exportan y declaran los tipos TypeScript estrictos de todas las funciones y constantes de `external-connectivity.mjs`.
- [.env.example](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/.env.example):
  - Documenta `ATTESTATION_CONNECTIVITY_TEST_ENABLED=false`, `ATTESTATION_ALLOW_CONTROLLED_CONNECTIVITY_TEST=false`, `ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL=` y `ATTESTATION_EXPLICIT_CONNECTIVITY_APPROVAL=false`.
- [independentAttestationAuthorityAdversarialExt09.test.ts](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/src/test/independentAttestationAuthorityAdversarialExt09.test.ts):
  - Incorpora los casos `EXT09-CONN-AUTH-01`, `EXT09-CONN-PG-01`, `EXT09-CONN-DDB-KMS-01` y `EXT09-CONN-OIDC-MTLS-01` junto a los 8 bloques adversariales `EXT09-GATE-01`..`EXT09-DDB-KMS-ORDER-01` (12 tests en total).

---

## 6. Matriz de Estados de PostgreSQL, DynamoDB, KMS, OIDC y mTLS

| Componente | Operación Read-Only Permitida | Estados / Categorías Evaluadas | Mutaciones / Firmas |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `SELECT current_database(), current_schema()` y `SELECT to_regclass($1)` | `CONFIGURATION_VALID`, `CONNECTIVITY_REACHABLE`, `AUTHENTICATION_VALID`, `DATABASE_ACCESS_VALID`, `SCHEMA_READY`, `REAL_INTEGRATION_TESTED = false` | `0` mutaciones SQL (`poolClosed = true` garantizado en `finally`) |
| **DynamoDB** | `DescribeTable` (+ `DescribeTimeToLive` opcional) | Categorías de error: `AUTHENTICATION`, `AUTHORIZATION`, `THROTTLING`, `CONNECTIVITY`, `CONFIGURATION`, `RESOURCE_NOT_FOUND` | `0` escrituras (`writesExecuted = 0`, `mutationsExecuted = 0`) |
| **AWS / GCP KMS** | `GetPublicKey` | Conectividad, autorización IAM, algoritmo Ed25519 (`ED25519_SHA_512` / `EC_SIGN_ED25519`), identidad de clave y coincidencia exacta de SPKI DER | `0` firmas (`signaturesExecuted = 0`, `PRIVATE_KEYS_LOCAL = FORBIDDEN`, `PRODUCTION_SIGNING_KEY_IN_RUNTIME = FORBIDDEN`) |
| **OIDC / JWKS** | `GET` HTTPS con `redirect: 'error'` y timeout acotado | Bloqueo SSRF/metadata IPv4/IPv6, bloqueo de credenciales en URL, rechazo de HTTP 3xx, rechazo de `alg=none` y `kty=oct`, conteo de claves asimétricas (`EdDSA`, `RS256`, `ES256`) | `0` efectos secundarios |
| **mTLS** | Inspección de contexto de handshake TLS real del socket | `TLS_CONNECTED`, `SERVER_CERT_VALID`, `CLIENT_CERT_PRESENT`, `CLIENT_CERT_TRUSTED`, `CLIENT_IDENTITY_ALLOWED` | Rechazo de suplantación por headers HTTP (`x-ssl-client-*`) sin socket TLS real |

---

## 7. Controles de Seguridad y Redacción de Secretos

- Toda salida diagnóstica y registro de error de conectividad pasa por `redactSensitiveConfigText` y `buildSafeConfigurationFingerprint` (`secretsIncluded: false`).
- Se verificó mediante pruebas automatizadas que contraseñas embebidas en `ATTESTATION_POSTGRES_URL`, secretos reflejados en errores de autenticación (`with secret ...`), tokens `Bearer` y claves `AKIA...` nunca aparecen en los resultados ni en las huellas diagnósticas.
- El escaneo de secretos sobre el repositorio y el verificador `verifyRuntimeSigningIsolation({ forceRescan: true })` confirmaron `privateKeysDetected: 0` y `productionSigningInRuntime: false`.

---

## 8. Resultados de Pruebas Unitarias, Adversariales y de Regresión

Comandos ejecutados tras las ediciones finales y resultados observados:

1. `npx vitest run src/test/independentAttestationAuthorityAdversarialExt09.test.ts --fileParallelism=false`:
   - **Resultado**: `1 passed (1)` archivo, `12 passed (12)` tests (`EXT09-GATE-01`, `EXT09-GATE-02`, `EXT09-DRYRUN-01`, `EXT09-SSRF-01`, `EXT09-OIDC-JWT-01`, `EXT09-MTLS-01`, `EXT09-PG-LIFECYCLE-01`, `EXT09-DDB-KMS-ORDER-01`, `EXT09-CONN-AUTH-01`, `EXT09-CONN-PG-01`, `EXT09-CONN-DDB-KMS-01`, `EXT09-CONN-OIDC-MTLS-01`).
2. `npx vitest run independentAttestationAuthority --fileParallelism=false`:
   - **Resultado**: `6 passed (6)` archivos de test, `110 passed | 1 skipped (111)` tests (el único test `skipped` es el arnés opcional de infraestructura real externa en `independentAttestationAuthorityRealIntegrationExt07.test.ts` cuando `ATTESTATION_REAL_INTEGRATION_ENABLED=false`).
3. `npx vitest run fiscalPr02P0Collector --fileParallelism=false`:
   - **Resultado**: `1 passed (1)` archivo, `186 passed (186)` tests.
4. `node -e "import('./scripts/fiscal/plan-pr02-parameters.mjs').then(m => console.log(JSON.stringify(m.verifyRuntimeSigningIsolation({ forceRescan: true }), null, 2)))"`:
   - **Resultado**: `{"valid": true, "reason": "RUNTIME_SIGNING_ISOLATED", "productionSigningInRuntime": false, "privateKeysDetected": 0}`.
5. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/fiscal/run-pr02-p0-staging-private.ps1 -DryRun -ExpectedHead 014ec379a46fc14703b2542ad8bbdd0c97ef8de0`:
   - **Resultado**: `execution: "DRY_RUN"`, `ARCA_CALLS_NEW: 0`, `STAGING_READS_NEW: 0`, `STAGING_WRITES_NEW: 0`, `PRODUCTION_MUTATIONS: 0`, `UNAUTHORIZED_CONNECTION_ATTEMPTS: 0`, `P1_IMPORT_ALLOWED: false`, `PR02_READY_FOR_EMISSION_GO: false`, `HISTORICAL_042_REEMISSION_FORBIDDEN: true`.

---

## 9. Resultado del Build, Typecheck y Lint

- `npx tsc --noEmit`: **PASS** (exit code `0`, `0` errores).
- `npm run build` (`tsc -b && vite build`): **PASS** (exit code `0`, `689 modules transformed`, build de producción completado en `2.02s`).
- `npx oxlint services/independent-attestation-authority src/test/independentAttestationAuthorityAdversarialExt09.test.ts`: **PASS** (exit code `0`, `0 errors`, `2 warnings` intencionales `no-control-regex`).
- `npx oxlint services/independent-attestation-authority src/test`: **PASS** (exit code `0`, `0 errors`, `38 warnings`). *(Nota: el comando global `npx oxlint` sobre todo el repositorio mantiene 1 error preexistente fuera de alcance en `src/types/pg.d.ts:14:20` por declaración duplicada de `pg`).*
- `git diff --check`: **PASS** (exit code `0`, sin errores de formato ni espacios en blanco).

---

## 10. Estado Honesto de Madurez Técnica

```text
LOCAL_FOUNDATION_READY = true
ADVERSARIAL_HARDENING_COMPLETE = true
PREFLIGHT_GATES_READY = true
CONTROLLED_CONNECTIVITY_HARNESS_READY = true

REAL_POSTGRESQL_CONNECTED = false
REAL_DYNAMODB_CONNECTED = false
REAL_KMS_CONNECTED = false
REAL_OIDC_CONNECTED = false
REAL_MTLS_CONNECTED = false

PRODUCTION_VALIDATED = false
PRODUCTION_APPROVED = false
EXTERNAL_AUTHORITY_DEPLOYED = false
AUTHORITY_REAL_WORLD_AVAILABLE = false
P1_IMPORT_ALLOWED = false
PR02_READY_FOR_EMISSION_GO = false
REMOTE_GO = DENIED
HISTORICAL_042_REEMISSION_FORBIDDEN = true
```

---

## 11. Qué Sigue Pendiente para Pruebas Contra Infraestructura Real

1. Provisionar en un entorno de staging aislado una base PostgreSQL dedicada (o tabla DynamoDB dedicada) físicamente separada de Supabase POS.
2. Provisionar una clave asimétrica Ed25519 en AWS KMS (`ECC_NIST_EDWARDS25519`) o GCP Cloud KMS (`EC_SIGN_ED25519`) y configurar su SPKI público pineado.
3. Configurar el emisor OIDC / endpoint JWKS HTTPS o la PKI mTLS en el entorno aislado.
4. Ejecutar primero `runControlledRealIntegrationDryRun`, luego `runControlledExternalConnectivitySuite` con `ATTESTATION_REAL_INTEGRATION_ENABLED=true`, `ATTESTATION_CONNECTIVITY_TEST_ENABLED=true` y `ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL=APPROVED`, y recién después habilitar las fases de mutación/concurrencia controlada (`PHASE_2` a `PHASE_5`).

---

## 12. Riesgos Residuales

- **Dependencia de infraestructura externa aún no provisionada**: las sondas han sido verificadas exhaustivamente en local (con PGlite, mocks deterministas y servidores locales), pero la conectividad real contra endpoints cloud en red privada/VPC aún no ha sido ejecutada (`REAL_*_CONNECTED = false`).
- **Atestación Nivel 1 (`LEVEL_1_DIGEST_ONLY`)**: el servicio continúa firmando manifiestos de digests sin observar tráfico TLS directo de ARCA (`rawSoapVerified = false`, `arcaOriginVerified = false`).

---

## 13. Veredicto Final

**`EXT_REAL_09_STATUS = PASS_WITH_LIMITATIONS`** — El arnés de conectividad externa controlada, las compuertas de autorización de 6 etapas y las sondas read-only para PostgreSQL, DynamoDB, KMS, OIDC y mTLS están implementados, tipados, probados adversarialmente y en estado **fail-closed**, quedando listos para pruebas controladas cuando se habilite infraestructura real autorizada.
