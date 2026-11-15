# Infrastructure Preflight & Deployment Gates — Independent Attestation Authority (EXT-REAL-08)

> **Estado actual:** Este documento define la arquitectura de preflight, las puertas de fase y los criterios de rechazo/aprobación para futuras pruebas controladas de infraestructura real del microservicio `services/independent-attestation-authority`. **No se aprovisionó infraestructura cloud, no existen credenciales de producción y `EXTERNAL_AUTHORITY_DEPLOYED`, `PRODUCTION_VALIDATED`, `P1_IMPORT_ALLOWED` y `PR02_READY_FOR_EMISSION_GO` permanecen estrictamente en `false`.**

---

## 1. Arquitectura de Integración Controlada

La frontera entre configuración local/simulada y cualquier futura conexión con infraestructura real queda centralizada en cuatro piezas desacopladas dentro de `services/independent-attestation-authority/src/`:

1. [`infrastructure-preflight.mjs`](../src/infrastructure-preflight.mjs):
   - Validador estático completo (`validateInfrastructureConfiguration`).
   - Capa centralizada de preflight (`runInfrastructurePreflight`).
   - Generador de huella diagnóstica sin secretos (`buildSafeConfigurationFingerprint`).
   - Ejecutor dry-run (`runControlledRealIntegrationDryRun`).
   - Máquina de puertas por fase `PHASE_0..PHASE_6` (`evaluateIntegrationPhaseGate`).
   - Guardrails de madurez (`evaluateMaturityState`, `assertMaturityPromotionAllowed`).
2. [`real-integration.mjs`](../src/real-integration.mjs):
   - Opt-in explícito (`ATTESTATION_REAL_INTEGRATION_ENABLED=true`) y bloqueo automático cuando `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`.
   - Validación estricta de URLs dedicadas (`assertDedicatedPostgresUrl`, `assertSafeEndpointUrl`).
   - Resolución unificada KMS sin conflictos (`resolveKmsEnvConfig`).
   - Constructores controlados de `PostgresDistributedAntiReplayStore`, `DynamoDbDistributedAntiReplayStore`, `AwsKmsSigningProvider` y `GcpKmsSigningProvider`.
3. [`server.mjs`](../src/server.mjs):
   - Cablea `resolveKmsEnvConfig` y los verificadores S2S (`OIDC_JWT`, `MTLS`, `SIMULATED_TEST_ONLY`) respetando aislamiento estricto de entorno.
4. [`authority-service.mjs`](../src/authority-service.mjs):
   - Expone `/health` y `/readiness` con separación explícita entre disponibilidad de servicio controlada (`readyToSign`) y validación/aprobación de producción (`productionValidated: false`, `productionApproved: false`, `authorityRealWorldAvailable: false`, `readinessBoundary: 'CONTROLLED_SERVICE_READINESS_ONLY'`).

---

## 2. Aislamiento Estricto respecto a Supabase POS

- El almacén anti-replay distribuido de la autoridad pertenece exclusivamente a su base de datos dedicada y **nunca** puede compartir la base operativa o fiscal de KioskoPOS en Supabase.
- `assertDedicatedPostgresUrl` y el preflight rechazan con `POSTGRES_DEDICATED_DATABASE_REQUIRED`:
  - `supabase.co`, `*.supabase.co`
  - `supabase.in`, `*.supabase.in`
  - `pooler.supabase.com` y subdominios de pooler.
- Además se bloquean con `POSTGRES_FORBIDDEN_HOST`:
  - direcciones no especificadas (`0.0.0.0`, `::`, `[::]`)
  - hosts de metadata cloud (`169.254.169.254`, `169.254.170.2`, `metadata.google.internal`, `metadata`).
- Los archivos SQL en `services/independent-attestation-authority/sql/001_distributed_anti_replay.sql` están aislados del árbol de migraciones de Supabase del POS.

---

## 3. Aislamiento Estricto respecto a ARCA / WSAA / AFIP y Credenciales Fiscales

- El microservicio de atestación opera únicamente sobre resúmenes y hashes canónicos verificables (`Level1DigestOnlyEvidenceEvaluator`), con prohibición total de credenciales fiscales o POS:
  - En configuración y entorno (`validateInfrastructureConfiguration`): presencia de variables `ARCA_*`, `AFIP_*`, `WSAA_*`, `SUPABASE_SERVICE_ROLE_KEY`, o patrones de secretos dentro de `ATTESTATION_*`, dispara `PROHIBITED_FISCAL_SECRET_DETECTED` / `PROHIBITED_FISCAL_CREDENTIAL_ENV` -> `CONFIGURATION_INVALID`.
  - En runtime HTTP (`handleRequest`): presencia de headers fiscales (`x-wsaa-*`, `x-arca-*`, `x-afip-*`, `x-supabase-*`) o campos de payload prohibidos aborta la solicitud sin invocar anti-replay ni KMS.
- En la matriz dry-run, `ARCA` y `SUPABASE_POS_MUTATION` reportan siempre estado `'FORBIDDEN'` con `0` ejecuciones.

---

## 4. Requisitos de PostgreSQL Dedicado

- **Esquema e idempotencia:** [`001_distributed_anti_replay.sql`](../sql/001_distributed_anti_replay.sql) impone claves únicas independientes sobre `request_id` (`PRIMARY KEY`), `idempotency_key`, `request_sha256`, `attestation_id` y `authorization_id` (índice único parcial `WHERE authorization_id IS NOT NULL`).
- **TLS obligatorio en hosts remotos:**
  - `sslmode=disable`, `allow`, `prefer` o vacío en hosts no locales producen `POSTGRES_TLS_REQUIRED` -> `CONFIGURATION_INVALID`.
  - En conexión real remota, `rejectUnauthorized` se fuerza a `true` y se recomienda `sslmode=verify-full` con `ATTESTATION_POSTGRES_SSL_CA_PEM` válido (`CERTIFICATE_PEM_INVALID` / `CERTIFICATE_EXPIRED` verificados por `crypto.X509Certificate`).
- **Transacciones, timeouts y pool hardening:**
  - Aislamientos válidos: `READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`.
  - Timeouts acotados (`ATTESTATION_POSTGRES_QUERY_TIMEOUT_MS` y `ATTESTATION_POSTGRES_STATEMENT_TIMEOUT_MS` entre `100` y `60000 ms`) y límite `ATTESTATION_POSTGRES_POOL_MAX <= 200`.
  - `pg.Pool` adjunta manejador `pool.on('error', ...)` evitando caídas del proceso por desconexiones en reposo; captura `lastPoolError` sin exponer cadenas ni contraseñas.
  - Clasificación SQLSTATE fail-closed:
    - Contención/serialización (`40001`, `40P01`, `55P03`) -> `SERVICE_ANTI_REPLAY_LOCK_CONTENTION`.
    - Indisponibilidad/timeout (`57014`, `57P01..05`, `08xxx`, `53300`) -> `SERVICE_ANTI_REPLAY_UNAVAILABLE`.
  - Reservas `CONSUMED`, `FAILED` y `EXPIRED` son terminales no reciclables; `INSERT ... ON CONFLICT DO NOTHING` y rollback automático ante error impiden resurrección tras caída.

---

## 5. Requisitos de AWS DynamoDB

- Diseño single-table (`ATTESTATION_DYNAMODB_TABLE`) validado por expresión segura `^[a-zA-Z0-9_.-]{3,255}$`, Partition Key `pk`, modo recomendado `PAY_PER_REQUEST`, PITR habilitado y protección de borrado.
- Mutualidad atómica pre-firma vía `TransactWriteItems` (`ConditionExpression: attribute_not_exists(pk)`) sobre las familias de ítem `REQ#`, `ATT#`, `HASH#` y `AUTH#`, con `ClientRequestToken` determinista derivado del SHA-256 de idempotencia y soporte opcional de TTL (`ttlEpochSeconds`).
- Endurecimiento de `CancellationReasons`:
  - `ConditionalCheckFailed` discrimina exactamente `REQ#`, `AUTH#`, `HASH#` y `ATT#`.
  - `TransactionConflict` en `CancellationReasons` clasifica `SERVICE_ANTI_REPLAY_LOCK_CONTENTION` (no falso conflicto de idempotencia).
  - `ProvisionedThroughputExceeded` / `ThrottlingError` / timeouts de red clasifican `SERVICE_ANTI_REPLAY_UNAVAILABLE`.
- Si se especifica `ATTESTATION_DYNAMODB_ENDPOINT`, `assertSafeEndpointUrl` exige `https://` remoto.

---

## 6. Requisitos de AWS KMS y GCP Cloud KMS (Ed25519)

- **Custodia y no exportabilidad:** `ProductionKmsSigningProvider`, `AwsKmsSigningProvider` y `GcpKmsSigningProvider` prohíben cualquier clave privada en memoria o disco y rechazan cualquier fallback local (`LOCAL_FALLBACK_SIGNING_FORBIDDEN`).
- **Consistencia de variables:** `resolveKmsEnvConfig` unifica nombres de `server.mjs` y `real-integration.mjs` rechazando valores contradictorios (`KMS_CONFIGURATION_CONFLICT`).
- **Validaciones criptográficas y de recurso:**
  - `ATTESTATION_PUBLIC_KEY_SPKI` debe ser PEM SPKI asimétrico estrictamente `Ed25519` (`KMS_PUBLIC_KEY_ALGORITHM_INVALID`).
  - `keyId` con prefijo `ed25519-spki-` debe coincidir con el digest SHA-256 DER SPKI (`KMS_KEY_ID_SPKI_MISMATCH`).
  - AWS KMS: algoritmo estricto `ED25519_SHA_512` (`UNSUPPORTED_SIGNING_ALGORITHM`), formato de ARN válido y región coincidente con `ATTESTATION_AWS_REGION` (`KMS_AWS_REGION_MISMATCH`).
  - GCP KMS: formato estricto `projects/.../locations/.../keyRings/.../cryptoKeys/.../cryptoKeyVersions/...`.
  - Endpoint personalizado (`ATTESTATION_KMS_ENDPOINT`) exige `https://` remoto (`assertSafeEndpointUrl`).
- En firma real, el servicio exige firma Ed25519 de 64 bytes verificada criptográficamente contra el SPKI pineado (`KMS_PUBLIC_KEY_MISMATCH`) y verifica separación absoluta respecto a `ATTESTATION_GO_*` (`COLLAPSED_AUTHORITIES_REJECTED`).

---

## 7. Requisitos de OIDC / JWT

- Algoritmos permitidos exclusivamente: `EdDSA`, `RS256`, `ES256`. `alg=none`, `HS256` y claves `kty=oct` se rechazan de forma cerrada.
- Se prohíben encabezados `jwk`, `jku`, `x5u` y `x5c` embebidos en el token JWT (`OIDC_HEADER_KEY_INJECTION_FORBIDDEN`), así como extensiones `crit` no soportadas (`OIDC_CRITICAL_HEADER_UNSUPPORTED`).
- `ATTESTATION_OIDC_ISSUER` y `ATTESTATION_OIDC_JWKS_URI` exigen HTTPS en todo entorno no localhost, bloquean hosts de metadata, IPv4 privadas/loopback/link-local/CGNAT, IPv6 ULA/link-local/loopback, literales IPv4 embebidos en IPv6 (`::ffff:169.254.169.254`, `::ffff:127.0.0.1`), Zone-IDs (`%`), credenciales en URL y realizan `fetch(..., { redirect: 'error' })` verificando además `response.redirected` / URL final contra el host esperado.
- **Lista blanca DNS y mitigación DNS Rebinding:** configurar `ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS` para restringir los hosts JWKS permitidos. Nota residual: la validación estática/URI inspecciona el host literal; ante DNS rebinding dinámico en infraestructura real debe combinarse `ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS` con políticas de egreso de red y DNS pinning en el runtime cloud.
- En `STAGING` y `PRODUCTION`, `ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST=true` está prohibido. En `DRY_RUN`, `oidcAllowNetworkFetch` permanece bloqueado en `false`.
- Caída o timeout del JWKS retorna `503 OIDC_JWKS_UNAVAILABLE` y degrada `/readiness` a `503 CLIENT_AUTH_VERIFIER_UNHEALTHY`.

---

## 8. Requisitos de mTLS

- Terminación TLS real sobre `IndependentAttestationHttpServer`: en modo `MTLS`, `server.mjs` rechaza explícitamente `tlsOptions.requestCert === false` o `tlsOptions.rejectUnauthorized === false` y fuerza verificación real de `req.socket.authorized` y `getPeerCertificate()`.
- Cabeceras HTTP inyectadas sin TLS mutuo verificado (`x-mtls-verified`, etc.) son rechazadas con `401 CLIENT_AUTH_MTLS_TLS_REQUIRED`.
- Preflight y `createMtlsClientAuthVerifier` comparten paridad de esquema (`commonName`/`subjectCN`, `subjectAltName`, `sanDnsNames`, `sanUris`, `allowedScopes`), prohíben wildcards (`*`) o comas y comparan cada entrada SAN parseada por igualdad exacta (nunca substring `.includes()`).
- Preflight valida `ATTESTATION_MTLS_TRUSTED_CA_PEM` mediante `crypto.X509Certificate` (formato válido y certificado no expirado).

---

## 9. Procedimiento Completo de Preflight

Antes de habilitar cualquier conexión real o fase controlada, ejecutar en memoria/proceso aislado:

```ts
const preflight = runInfrastructurePreflight(env)
```

El preflight evalúa sintaxis, seguridad y completitud en estático (sin sockets) y devuelve uno de los estados formales de `PREFLIGHT_STATUSES`:

| Estado Retornado | Significado | Siguiente Acción Permitida |
|---|---|---|
| `CONFIGURATION_INVALID` | Error de sintaxis, esquema, TLS, KMS, OIDC/mTLS, aislamiento o contaminación Supabase/ARCA | Corregir configuración; abortado |
| `REAL_INTEGRATION_DISABLED` | Configuración base sin errores, pero `ATTESTATION_REAL_INTEGRATION_ENABLED` no es `'true'` | Mantener aislamiento local o habilitar dry-run |
| `REAL_INTEGRATION_NOT_CONFIGURED` | Opt-in real habilitado pero faltan targets reales obligatorios (ej. URL PG, ARN KMS, JWKS/CA, GO SPKI) | Completar targets de infraestructura aprobada |
| `REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST` | Opt-in real habilitado, sintaxis y seguridad válidas, targets completos | Habilitar `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true` y ejecutar validación dry-run |

Separación explícita garantizada en toda respuesta del preflight:
- `syntaxValid`, `securityPostureValid`
- `connectivityTested: false`, `healthVerified: false`
- `realIntegrationTested: false`, `productionValidated: false`, `productionApproved: false`, `readyForProduction: false`
- `fingerprint`: obtenido vía `buildSafeConfigurationFingerprint(env)`, con SHA-256 determinista sobre metadatos no secretos (`secretsIncluded: false`).

---

## 10. Procedimiento de Dry-Run Real

Activar explícitamente:
```text
ATTESTATION_REAL_INTEGRATION_ENABLED=true
ATTESTATION_REAL_INTEGRATION_DRY_RUN=true
```
Invocar `runControlledRealIntegrationDryRun(env)`.

Comportamiento garantizado en dry-run:
- Cero conexiones TCP/TLS/HTTP reales (`networkCallsExecuted = 0`).
- Cero reservas o escrituras SQL/DynamoDB (`reservationsCreated = 0`, `mutationsExecuted = 0`).
- Cero operaciones de firma KMS (`signaturesExecuted = 0`).
- `createControlledPostgresStoreFromEnv`, `createControlledDynamoDbStoreFromEnv` y `createControlledKmsProviderFromEnv` fallan cerrado con `REAL_INTEGRATION_DRY_RUN_ACTIVE` si alguien intenta instanciar clientes SDK en modo dry-run.
- Emite matriz explícita:
  - `POSTGRES_CONNECTION_CHECK`: `'WOULD_RUN'` (si PG configurado) o `'NOT_RUN_UNCONFIGURED_OR_SKIPPED'`
  - `POSTGRES_WRITE_TEST`: `'NOT_RUN'`
  - `DYNAMODB_CONNECTIVITY_CHECK`: `'WOULD_RUN'` / `'NOT_RUN_UNCONFIGURED_OR_SKIPPED'`
  - `DYNAMODB_MUTATION`: `'NOT_RUN'`
  - `KMS_PUBLIC_KEY_CHECK`: `'WOULD_RUN'` / `'NOT_RUN_UNCONFIGURED_OR_SKIPPED'`
  - `KMS_SIGN_OPERATION`: `'NOT_RUN'`
  - `OIDC_DISCOVERY`: `'WOULD_RUN'` / `'NOT_RUN_UNCONFIGURED_OR_SKIPPED'`
  - `MTLS_HANDSHAKE_VALIDATION`: `'WOULD_RUN'` / `'NOT_RUN_UNCONFIGURED_OR_SKIPPED'`
  - `ARCA`: `'FORBIDDEN'`
  - `SUPABASE_POS_MUTATION`: `'FORBIDDEN'`

---

## 11. Procedimiento Controlado por Fases (`PHASE_0..PHASE_6`)

`evaluateIntegrationPhaseGate({ targetPhase, completedPhases, env, governanceManualSignOff, governanceGrant, trustedGoPublicKeySpki })` impone ejecución secuencial estricta con recalculo obligatorio del preflight real, opt-in por variable dedicada en cada transición y rechazo de `ATTESTATION_INTEGRATION_PHASE` superior a `targetPhase`:

| Fase | Variable Opt-In Requerida | Prerrequisitos Obligatorios |
|---|---|---|
| `PHASE_0_CONFIG_VALIDATION` | *(ninguna — por defecto)* | `CONFIGURATION_VALID` |
| `PHASE_1_READ_ONLY_CONNECTIVITY` | `ATTESTATION_REAL_INTEGRATION_ENABLED=true` | `PHASE_0` completada + `REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST` |
| `PHASE_2_NON_PRODUCTION_MUTATION` | `ATTESTATION_ALLOW_CONTROLLED_MUTATION_TEST=true` | `PHASE_0..PHASE_1` completadas |
| `PHASE_3_CONCURRENCY_VALIDATION` | `ATTESTATION_ALLOW_CONTROLLED_CONCURRENCY_TEST=true` | `PHASE_0..PHASE_2` completadas |
| `PHASE_4_KMS_SIGNING_VALIDATION` | `ATTESTATION_ALLOW_CONTROLLED_KMS_TEST=true` | `PHASE_0..PHASE_3` completadas |
| `PHASE_5_AUTHENTICATION_VALIDATION` | `ATTESTATION_ALLOW_CONTROLLED_AUTH_TEST=true` | `PHASE_0..PHASE_4` completadas |
| `PHASE_6_DEPLOYMENT_CANDIDATE` | `ATTESTATION_DEPLOYMENT_CANDIDATE_OPT_IN=true` | `PHASE_0..PHASE_5` completadas + `governanceGrant` GO v1.1 firmado y verificable (un boolean `governanceManualSignOff=true` sin firma es insuficiente) |

Todo salto directo (ej. `PHASE_0_CONFIG_VALIDATION -> PHASE_6_DEPLOYMENT_CANDIDATE`), manipulación de `preflightResult` o `ATTESTATION_INTEGRATION_PHASE` lanza `PHASE_ESCALATION_FORBIDDEN` / `PHASE_PRECONDITION_FAILED`. Incluso superando `PHASE_6` con grant GO firmado, el código conserva `productionApproved: false`, `productionValidated: false`, `p1ImportAllowed: false` y `remoteGo: 'DENIED'`.

---

## 12. Criterios Objetivos de Aprobación / Rechazo y Modelo Honesto de Madurez

Estados discretos en `MATURITY_STATES`:

1. `UNIT_TESTED`: pruebas unitarias puras de contrato/lógica aislada.
2. `LOCAL_TESTED`: pruebas locales con dependencias embebidas/mock (`@electric-sql/pglite`, dobles en memoria, proceso local).
3. `SIMULATION_TESTED`: simulaciones multi-nodo de concurrencia y fallo en entorno controlado sin nube real.
4. `REAL_CONNECTIVITY_TESTED`: conectividad de solo lectura verificada contra un backend real no productivo.
5. `REAL_INTEGRATION_TESTED`: suite controlada completa ejecutada con éxito contra infraestructura real dedicada de staging/test.
6. `PRODUCTION_VALIDATED`: reservado exclusivamente para sistema desplegado y acreditado por gobernanza externa.

**Regla dura:** `assertMaturityPromotionAllowed` bloquea con `MATURITY_PROMOTION_FORBIDDEN` toda autopromoción desde `UNIT_TESTED`, `LOCAL_TESTED` o `SIMULATION_TESTED` hacia `PRODUCTION_VALIDATED`, así como promociones hacia `REAL_*` sin evidencia real (`realEvidenceCount > 0`).

Criterios de rechazo inmediato por componente:
- **PostgreSQL:** falla aislamiento Supabase, falta TLS remoto, fallo DDL idempotente, `rowCount === 0` en conflicto sin aborto o fuga de errores SQL sin clasificar.
- **DynamoDB:** tabla/región inválida, endpoint remoto sin HTTPS o cancelación transaccional mal clasificada.
- **KMS:** algoritmo distinto a Ed25519 / `ED25519_SHA_512`, mismatch SPKI o intento de fallback local.
- **OIDC/mTLS:** aceptación de JWT `none`/`HS256`, `kty=oct`, header `jku`/`x5u`/`jwk`, redirect JWKS, CA PEM inválida/expirada o header mTLS sin socket TLS verificado.

---

## 13. Plan de Rollback ante Fallo en Preflight o Pruebas Controladas

1. **En fallo de Preflight (`CONFIGURATION_INVALID` / `REAL_INTEGRATION_NOT_CONFIGURED`):**
   - El proceso aborta antes de abrir sockets o construir clientes externos (`exit code != 0` / rechazo de gate). No existen recursos remotos ni registros creados que revertir.
2. **En fallo de conectividad/salud durante runtime controlado:**
   - `/health` permanece vivo (`SERVICE_PROCESS_ALIVE`) evitando loops destructivos de reinicio.
   - `/readiness` conmuta inmediatamente a `503 SERVICE_NOT_READY_TO_SIGN` (`ANTI_REPLAY_STORAGE_UNAVAILABLE`, `CLIENT_AUTH_VERIFIER_UNHEALTHY` o `SIGNING_PROVIDER_NOT_READY`).
   - `POST /attestations` retorna `503` antes de reservar o invocar KMS.
3. **En fallo durante o después de firma tras adquirir reserva:**
   - La reserva transiciona a estado terminal no reciclable (`FAILED` o `EXPIRED`), impidiendo doble firma en reintentos.
4. **Retorno seguro al estado base:**
   - Restaurar `ATTESTATION_REAL_INTEGRATION_ENABLED=false`, `ATTESTATION_REAL_INTEGRATION_DRY_RUN=false` y las flags `ATTESTATION_ALLOW_CONTROLLED_* = false`. Ningún paso toca la base fiscal de KioskoPOS ni servicios ARCA.

---

## 14. Invariantes de Bloqueo Vigentes

```text
EXTERNAL_AUTHORITY_DEPLOYED = false
EXTERNAL_AUTHORITY_ENDPOINT_CONFIGURED = false
EXTERNAL_AUTHORITY_ENDPOINT_REACHABLE = false
POSTGRESQL_REAL_INTEGRATION_TESTED = false
AWS_DYNAMODB_REAL_TESTED = false
AWS_KMS_REAL_TESTED = false
GCP_KMS_REAL_TESTED = false
OIDC_REAL_INTEGRATION_TESTED = false
MTLS_REAL_INTEGRATION_TESTED = false
PRODUCTION_VALIDATED = false
P1_IMPORT_ALLOWED = false
PR02_READY_FOR_EMISSION_GO = false
REMOTE_GO = DENIED
HISTORICAL_042_REEMISSION_FORBIDDEN = true
```
