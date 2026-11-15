# EXT-REAL-09 — Informe de Auditoría Adversarial Independiente de Seguridad, Compuertas y Aislamiento de Integraciones Reales

## 1. Resumen Ejecutivo

- **Fase:** `EXT-REAL-09`
- **Servicio auditado:** `services/independent-attestation-authority`
- **Modo de ejecución:** `LOCAL-ONLY` (cero llamadas a servicios externos reales, cero mutaciones en `HEAD`, cero commits/pushes, cero despliegues cloud).
- **Veredicto general:** `PASS_WITH_CONTROLLED_LIMITATIONS`
- **Resultado:** Se ejecutó una auditoría adversarial independiente sobre los bloques **A a I** (compuertas `PHASE_0..PHASE_6`, aislamiento `DRY_RUN`, SSRF/red en OIDC y endpoints, validación criptográfica JWT/JWKS, autenticación mTLS y SAN matching, anti-replay distribuido PostgreSQL/PGlite y DynamoDB, proveedores AWS/GCP KMS y separación de autoridades, contrato de evidencia Nivel 1 y redacción de secretos). Se identificaron y corrigieron **9 defectos demostrables** en código de producción del microservicio, respaldados por la nueva suite adversarial `src/test/independentAttestationAuthorityAdversarialExt09.test.ts`.

---

## 2. Estado Git Verificado

- **Rama actual:** `feat/pilot-envases-returns`
- **`HEAD` verificado:** `014ec379a46fc14703b2542ad8bbdd0c97ef8de0`
- **`origin/feat/pilot-envases-returns`:** `014ec379a46fc14703b2542ad8bbdd0c97ef8de0`
- **Commits nuevos creados:** `0`
- **Push realizados:** `0`
- **Migraciones SQL modificadas:** `0` (`sql/001_distributed_anti_replay.sql` intacto)

---

## 3. Metodología de Auditoría Adversarial (Bloques A–I)

1. **Bloque A — Compuertas de fase y madurez (`infrastructure-preflight.mjs`):** Intentos de autopromoción mediante `ATTESTATION_INTEGRATION_PHASE=PHASE_6_DEPLOYMENT_CANDIDATE`, `ATTESTATION_REAL_INTEGRATION_ENABLED=true`, `ATTESTATION_DEPLOYMENT_CANDIDATE_OPT_IN=true`, `TEST_SIGNER` + `memory` + `OIDC_JWKS_JSON` estático, inyección de `preflightResult` sintético y uso de booleano `governanceManualSignOff: true` sin `GoAuthorizationGrant` v1.1 firmado.
2. **Bloque B — Aislamiento de `DRY_RUN` (`real-integration.mjs`, `server.mjs`, `client-auth.mjs`):** Verificación de que `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true` impide llamadas de red y operaciones remotas en PostgreSQL (`ensureSchema`/`reserveOnce`), DynamoDB (`transactWriteItems`/`updateItem`), AWS/GCP KMS (`sign`) y OIDC (`fetch` remoto de JWKS), además de rechazar destinos ARCA/AFIP y Supabase POS.
3. **Bloque C — SSRF y clasificación de red (`real-integration.mjs`, `client-auth.mjs`, `infrastructure-preflight.mjs`):** Pruebas con IPv4 loopback (`127.0.0.0/8`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`), link-local/metadata (`169.254.169.254`), CGNAT (`100.64.0.0/10`), multicast/unspecified, IPv6 loopback (`::1`), ULA (`fc00::/7`, `fd00:ec2::254`), link-local (`fe80::/10`), IPv4-mapped/compat/NAT64 (`[::ffff:169.254.169.254]`, `[::ffff:10.0.0.1]`), Zone-ID (`%eth0`), credenciales embebidas, trailing dots (`supabase.co.`, `metadata.google.internal.`), `*.localhost`, redirecciones HTTP `302` y esquemas en mayúsculas (`HTTP://`).
4. **Bloque D — OIDC/JWT criptográfico (`client-auth.mjs`, `infrastructure-preflight.mjs`):** Ataques con `alg=none`, `HS256`, `kty=oct`, headers peligrosos (`jwk`, `jku`, `x5u`, `x5c`, `crit`), `iss`/`aud`/`exp`/`nbf`/`scope`/`client_id` inválidos, garantizando `0` reservas anti-replay y `0` firmas KMS ante fallos de autenticación.
5. **Bloque E — mTLS y certificados X.509 (`client-auth.mjs`, `server.mjs`, `infrastructure-preflight.mjs`):** Ataques de substring en SAN (`DNS:collector.pr02.internal.evil.com` contra `DNS:collector.pr02.internal`), wildcards (`*.pr02.internal`), deshabilitación de `requestCert: false` en `tlsOptions`, certificados expirados/no vigentes, paridad de esquema (`subjectCN`/`commonName`, `sanDnsNames`, `sanUris`, `subjectAltName`) y cabeceras HTTP forjadas (`x-forwarded-client-cert`, `x-client-cert-cn`) sin sesión TLS verificada.
6. **Bloque F — Anti-replay distribuido PostgreSQL (`postgres-anti-replay-adapter.mjs`, `real-integration.mjs`):** Concurrencia 50x sobre PGlite real (exactamente 1 firma y 49 rechazos), transición terminal `EXPIRED` e imposibilidad de reciclar `authorizationId`, transición `FAILED` ante fallo KMS post-reserva, fallo ambiguo en `commitReservation` post-firma (reintento falla cerrado sin segunda firma) y fallo de BD pre-firma (`0` llamadas KMS).
7. **Bloque G — Anti-replay distribuido DynamoDB (`dynamodb-anti-replay-adapter.mjs`):** Clasificación de `TransactionCanceledException` (`ConditionalCheckFailed`) diferenciando duplicado vs conflicto de `authorizationId` o `requestSha256`, y clasificación de `IdempotentParameterMismatchException` como `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT`.
8. **Bloque H — KMS, orden de ejecución e invariantes (`signing-providers.mjs`, `attestation-service.mjs`):** Verificación de `GetPublicKey` en AWS KMS con `PublicKey` binario DER (`Buffer`/`Uint8Array`) además de PEM, coincidencia de `KeyId`/`keyVersionName`, bloqueo de `TEST_SIGNER` y `fallbackToLocal()` en `PRODUCTION`, prohibición de colapso entre autoridad GO y autoridad de atestación, bloqueo de elevación de evidencia (`LEVEL_2B_INDEPENDENT_OBSERVED`, `arcaOriginVerified: true`) y preservación del orden estricto pre-firma.
9. **Bloque I — Redacción de secretos y huella diagnóstica (`infrastructure-preflight.mjs`, `logger.mjs`):** Verificación de ausencia de secretos crudos en `buildSafeConfigurationFingerprint` y redacción de URLs `postgres://user:pass@host` y tokens `Bearer` en `redactSensitiveConfigText`.

---

## 4. Tabla Consolidada de Hallazgos

| ID | Bloque | Severidad | Descripción del Hallazgo | Archivo Principal | Estado |
|---|---|---|---|---|---|
| `EXT09-F01` | A | `CRITICAL` | `evaluateIntegrationPhaseGate` permitía alcanzar `PHASE_6_DEPLOYMENT_CANDIDATE` con booleano `governanceManualSignOff: true` o `preflightResult` inyectado sin recalcular preflight real ni exigir `GoAuthorizationGrant` v1.1 firmado criptográficamente; `ATTESTATION_INTEGRATION_PHASE` no bloqueaba escalación por variable de entorno. | `src/infrastructure-preflight.mjs` | `FIXED` |
| `EXT09-F02` | A | `HIGH` | `validateInfrastructureConfiguration` permitía `readyForControlledTest: true` en entornos no productivos usando `TEST_SIGNER`, `memory` o `ATTESTATION_OIDC_JWKS_JSON` estático, y `evaluateMaturityState` confiaba en booleanos del caller para estados superiores. | `src/infrastructure-preflight.mjs` | `FIXED` |
| `EXT09-F03` | B / D | `HIGH` | En `server.mjs` y `client-auth.mjs`, `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true` no forzaba `allowNetworkFetch: false` ni `realOidcConfigured: false` en el verificador OIDC. | `src/server.mjs`, `src/client-auth.mjs` | `FIXED` |
| `EXT09-F04` | C | `HIGH` | `assertSafeJwksUri`, `assertSafeEndpointUrl` y `assertDedicatedPostgresUrl` no bloqueaban IPv6 ULA (`fc00::/7`), IPv6 link-local (`fe80::/10`), IPv6 con IPv4 embebido (`[::ffff:169.254.169.254]`, `[::ffff:10.0.0.1]`), CGNAT (`100.64.0.0/10`), Zone-ID (`%`), `*.localhost`, trailing dots (`supabase.co.`, `metadata.google.internal.`) ni redirecciones HTTP `30x` en fetch JWKS. | `src/real-integration.mjs`, `src/client-auth.mjs` | `FIXED` |
| `EXT09-F05` | D | `MEDIUM` | `verifyJwtCryptographically` rechazaba `jwk`/`jku`/`x5u` pero no rechazaba explícitamente `x5c` ni `crit` en el header JWT; `createOidcJwtClientAuthVerifier` no exponía `refreshJwks` pese a estar declarado en `index.d.mts`. | `src/client-auth.mjs`, `src/index.d.mts` | `FIXED` |
| `EXT09-F06` | E | `HIGH` | `createMtlsClientAuthVerifier` comparaba `subjectAltName` mediante `peerSan.includes(...)` (vulnerable a bypass por subdominio sufijo `DNS:collector.pr02.internal.evil.com`), existía divergencia de esquema entre `infrastructure-preflight.mjs` (`subjectCN`, `sanDnsNames`, `sanUris`) y `client-auth.mjs` (`commonName`, `subjectAltName`), y `server.mjs` no rechazaba `tlsOptions.requestCert === false` en modo `MTLS`. | `src/client-auth.mjs`, `src/infrastructure-preflight.mjs`, `src/server.mjs` | `FIXED` |
| `EXT09-F07` | G | `MEDIUM` | `DynamoDbDistributedAntiReplayStore.reserveOnce` no verificaba conflicto de `authorizationId` al inspeccionar un ítem existente tras `ConditionalCheckFailed`, ni clasificaba `IdempotentParameterMismatchException` como `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT`. | `src/dynamodb-anti-replay-adapter.mjs` | `FIXED` |
| `EXT09-F08` | H | `MEDIUM` | `ProductionKmsSigningProvider.isHealthy()` asumía que `getPublicKey()` devolvía únicamente PEM string (`includes('BEGIN PUBLIC KEY')`), fallando ante `PublicKey` binario DER (`Uint8Array`/`Buffer`) del SDK real de AWS KMS y sin verificar coincidencia de `KeyId`/`keyVersionName`. | `src/signing-providers.mjs` | `FIXED` |
| `EXT09-F09` | C | `LOW` | Mitigación frente a DNS rebinding en `ATTESTATION_OIDC_JWKS_URI` y endpoints requería soporte de allowlist explícita de hosts (`ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS` / `allowedHosts`) y documentación del riesgo residual de resolución DNS en runtime. | `src/client-auth.mjs`, `src/real-integration.mjs`, `src/infrastructure-preflight.mjs` | `FIXED` / `RESIDUAL_DOCUMENTED` |

---

## 5. Defectos Corregidos y Archivos Modificados

1. **[real-integration.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/real-integration.mjs)**
   - Se implementaron `normalizeNetworkHostname` y `classifyNetworkHost` para clasificar de forma determinista IPv4 (loopback, RFC1918, link-local/metadata `169.254.0.0/16`, CGNAT `100.64.0.0/10`, multicast, unspecified), IPv6 (loopback `::1`, ULA `fc00::/7`, link-local `fe80::/10`, multicast `ff00::/8`, Zone-ID `%`, IPv4-mapped/compat/NAT64 en notación dotted-quad o hex), hosts de metadata cloud (`metadata`, `metadata.google.internal`, `metadata.aws.internal`, `instance-data*`, `fd00:ec2::254`) y `*.localhost`.
   - `assertDedicatedPostgresUrl` normaliza trailing dots (bloqueando `*.supabase.co.` y `*.supabase.in.`) y rechaza hosts metadata/link-local/loopback/IPv4-mapeados manteniendo permitidos hosts privados de VPC con TLS obligatorio.
   - `assertSafeEndpointUrl` aplica `classifyNetworkHost`, soporta `allowedHosts` y restringe `allowInsecureLocalhost` exclusivamente a loopback real.
2. **[client-auth.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/client-auth.mjs)**
   - `assertSafeJwksUri` utiliza `classifyNetworkHost`, valida `allowedJwksHosts`, preserva `OIDC_INSECURE_JWKS_URI_FORBIDDEN` ante `http://` cuando `allowInsecureLocalhostHttp=false` y rechaza IPs privadas/metadata incluso si `allowInsecureLocalhostHttp=true`.
   - `fetchRemoteJwksFromUri` bloquea redirecciones HTTP (`response.redirected`, códigos `300..399` y cambio de host en `response.url`).
   - `createOidcJwtClientAuthVerifier` desactiva `allowNetworkFetch` y `realOidcConfigured` cuando `dryRun=true`, expone `refreshJwks(force)` y rechaza headers JWT `x5c` y `crit`.
   - `createMtlsClientAuthVerifier` reemplaza `peerSan.includes(...)` por comparación exacta de entradas SAN parseadas (`DNS:<lowercase>` y `URI:<exact>`), soporta `commonName`/`subjectCN`, `subjectAltName`, `sanDnsNames`, `sanUris` y rechaza comodines `*` o comas.
3. **[infrastructure-preflight.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/infrastructure-preflight.mjs)**
   - Validación estricta de `ATTESTATION_INTEGRATION_PHASE` (`INVALID_INTEGRATION_PHASE`, `PHASE_ESCALATION_FORBIDDEN`).
   - Prohibición de `readyForControlledTest: true` si se usa `TEST_SIGNER`, `memory` o `ATTESTATION_OIDC_JWKS_JSON` sin `ATTESTATION_OIDC_JWKS_URI`.
   - `evaluateIntegrationPhaseGate` recalcula `runInfrastructurePreflight(env)`, detecta discrepancias con `preflightResult` inyectado, verifica `completedPhases` y exige `governanceGrant` (`GoAuthorizationGrant` v1.1 firmado y verificado criptográficamente con clave distinta a la de atestación) para `PHASE_6_DEPLOYMENT_CANDIDATE`, rechazando el booleano `governanceManualSignOff: true` con `PHASE_GOVERNANCE_CRYPTOGRAPHIC_APPROVAL_REQUIRED`.
   - `evaluateMaturityState` nunca devuelve `PRODUCTION_VALIDATED` ni `realInfrastructureValidated: true`.
4. **[server.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/server.mjs)**
   - Propaga `dryRun = isRealIntegrationDryRun(env)` al verificador OIDC (`allowNetworkFetch: false`, `realOidcEnabled: false`), conecta `ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS` y `ATTESTATION_ALLOWED_HOSTS`, y rechaza `deps.tlsOptions.requestCert === false` en modo `MTLS`.
5. **[signing-providers.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/signing-providers.mjs)**
   - `ProductionKmsSigningProvider.isHealthy()` soporta `PublicKey` en formato PEM string o DER binario (`Buffer`/`Uint8Array`), verifica tipo `ed25519`, igualdad byte a byte del SPKI DER contra la clave configurada y coincidencia de `KeyId`/`keyVersionName`.
6. **[dynamodb-anti-replay-adapter.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/dynamodb-anti-replay-adapter.mjs)**
   - Clasifica `IdempotentParameterMismatchException` como `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT` y verifica conflicto de `authorizationId` en `reserveOnce` tras `ConditionalCheckFailed`.
7. **[index.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/index.mjs), [index.d.mts](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/index.d.mts), [.env.example](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/.env.example), [INFRASTRUCTURE_PREFLIGHT_AND_DEPLOYMENT_GATES.md](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/docs/INFRASTRUCTURE_PREFLIGHT_AND_DEPLOYMENT_GATES.md)**
   - Exportación y tipado de `normalizeNetworkHostname`, `classifyNetworkHost`, `refreshJwks`, `governanceGrant` y documentación de allowlists y controles de fase.

---

## 6. Matriz de Vectores de Ataque y Controles Verificados

| Vector Adversarial | Control que lo Bloquea | Código de Rechazo / Resultado |
|---|---|---|
| Escalación a `PHASE_6` por env o sin fases previas | `validateInfrastructureConfiguration` / `evaluateIntegrationPhaseGate` | `PHASE_ESCALATION_FORBIDDEN` / `PHASE_PREREQUISITES_NOT_MET` |
| `PHASE_6` con `governanceManualSignOff: true` sin Grant GO firmado | `evaluateIntegrationPhaseGate` | `PHASE_GOVERNANCE_CRYPTOGRAPHIC_APPROVAL_REQUIRED` |
| `preflightResult` falsificado o `TEST_SIGNER` en preflight | `evaluateIntegrationPhaseGate` / `validateInfrastructureConfiguration` | `PHASE_PREFLIGHT_NOT_READY` / `readyForControlledTest = false` |
| Llamadas de red en `DRY_RUN=true` (PG, DDB, KMS, OIDC) | `runControlledRealIntegrationDryRun` / `createOidcJwtClientAuthVerifier` | `0` llamadas a clientes SDK/red (`realOidcConfigured = false`) |
| SSRF a `169.254.169.254`, `10.0.0.1`, `100.64.0.1`, `[::ffff:169.254.169.254]`, `[fd00:ec2::254]`, `*.localhost` | `classifyNetworkHost` / `assertSafeJwksUri` / `assertSafeEndpointUrl` | `OIDC_PRIVATE_OR_LOOPBACK_JWKS_FORBIDDEN` / `REAL_INTEGRATION_ENDPOINT_FORBIDDEN_HOST` |
| Redirección HTTP `302` desde JWKS hacia metadata | `fetchRemoteJwksFromUri` (`redirect: 'error'` + check `3xx`/`redirected`) | `OIDC_JWKS_UNAVAILABLE` (`targetHits = 0`) |
| JWT con `crit`, `x5c`, `jwk`, `jku`, `x5u`, `alg=none`, `HS256`, `kty=oct` | `verifyJwtCryptographically` / `createOidcJwtClientAuthVerifier` | `OIDC_*` (`0` reservas anti-replay, `0` llamadas KMS) |
| Substring SAN `DNS:collector.pr02.internal.evil.com` (unidad y socket HTTPS real) | `createMtlsClientAuthVerifier` (set exacto de tokens SAN) | `CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED` (HTTP `403`) |
| Cabeceras `x-forwarded-client-cert` sin peer TLS o `requestCert: false` | `createMtlsClientAuthVerifier` / `createConfiguredAuthorityFromEnv` | `CLIENT_AUTH_MTLS_REQUIRED` / `CLIENT_AUTH_MTLS_CONFIG_INVALID` |
| Ráfaga 50x concurrente sobre PostgreSQL (PGlite) con mismo request/grant | `PostgresDistributedAntiReplayStore` (`SERIALIZABLE` + UNIQUE constraints) | `1` firma emitida, `49` rechazos deterministas |
| Lease expirado (`EXPIRED`), fallo KMS (`FAILED`) o fallo ambiguo en `commitReservation` | `PostgresDistributedAntiReplayStore` + `ServiceAntiReplayGuard` | Estado terminal irreversible; `maxSignaturesPerReplayKey = 1` |
| Colisión en DynamoDB con distinto `authorizationId` o `IdempotentParameterMismatchException` | `DynamoDbDistributedAntiReplayStore` | `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT` |
| Elevación de evidencia (`LEVEL_2B_INDEPENDENT_OBSERVED`, `arcaOriginVerified: true`) | `validateAttestationRequestStrict` / `assertNoClientEvidenceElevation` | `EVIDENCE_LEVEL_ELEVATION_REJECTED` (`0` reservas, `0` firmas) |

---

## 7. Controles No Eludibles vs Riesgos Residuales para Infraestructura Real

### Controles demostrados localmente como no eludibles
- Separación criptográfica entre la autoridad emisora de `GoAuthorizationGrant` v1.1 y la autoridad firmante de atestación Ed25519.
- Orden estricto de ejecución: `HTTPS/Host -> Body/JSON -> Auth Cliente (OIDC/mTLS) -> Esquema/Política/Evidencia Nivel 1 -> Grant GO v1.1 -> Reserva Anti-Replay (RESERVED) -> Mark Signing Attempt -> Firma KMS -> Commit Anti-Replay (COMMITTED)`.
- Imposibilidad de obtener más de `1` firma por `requestId`, `requestSha256`, `authorizationId`, `attestationId` o `idempotencyKey` bajo fallo de KMS o fallo ambiguo de commit.
- Bloqueo de `PHASE_6_DEPLOYMENT_CANDIDATE` sin `GoAuthorizationGrant` v1.1 criptográfico válido y sin `PHASE_0..PHASE_5` completas.

### Riesgos residuales que requieren infraestructura real
1. **DNS Rebinding en tiempo de resolución:** La validación estática de URLs (`classifyNetworkHost`) bloquea literales IP privados/metadata y dominios internos conocidos, y `ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS` / `ATTESTATION_ALLOWED_HOSTS` restringen los FQDN permitidos. No obstante, el bloqueo definitivo contra un servidor DNS malicioso que cambie un registro `A`/`AAAA` público a `169.254.169.254` requiere controles de red/VPC (Security Groups de egreso, VPC Endpoints privados y bloqueo de IMDSv1 / hop limit = 1 en instancia/contenedor).
2. **Validación empírica contra endpoints cloud reales:** PostgreSQL remoto (RDS/Cloud SQL con validación de cadena CA real), DynamoDB real, AWS KMS / GCP Cloud KMS reales e IdP OIDC / PKI mTLS productivos permanecen en `false` por mandato `LOCAL-ONLY`.
3. **Evidencia Nivel 2B:** El servicio continúa operando exclusivamente en `LEVEL_1_DIGEST_ONLY` (`rawSoapVerified = false`, `arcaOriginVerified = false`).

---

## 8. Suite Adversarial Agregada

Archivo creado: [independentAttestationAuthorityAdversarialExt09.test.ts](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/src/test/independentAttestationAuthorityAdversarialExt09.test.ts)

Casos incluidos (8 pruebas multi-escenario):
1. `EXT09-GATE-01`: Manipulación combinada de variables de entorno, `PHASE_6` en env y `TEST_SIGNER` en preflight.
2. `EXT09-GATE-02`: Bloqueo de `preflightResult` forjado, booleano `governanceManualSignOff` sin Grant GO criptográfico y autopromoción de madurez.
3. `EXT09-DRYRUN-01`: Aislamiento estricto de `DRY_RUN` sobre PostgreSQL, DynamoDB, KMS, OIDC y prohibición de ARCA/Supabase.
4. `EXT09-SSRF-01`: Bloqueo de SSRF IPv4 privado/metadata/CGNAT, IPv6 ULA/link-local/IPv4-mapeado, redirecciones HTTP `302` y `HTTP://` en mayúsculas.
5. `EXT09-OIDC-JWT-01`: Rechazo de headers `crit`/`x5c`/`jwk`/`jku`/`x5u`, `alg=none`, `HS256`, `kty=oct` y claims inválidos sin reservar ni firmar.
6. `EXT09-MTLS-01`: Bloqueo de bypass por substring en SAN (unidad y servidor HTTPS mutuo real con certificados X.509 DER), wildcards, `requestCert: false` y cabeceras forjadas.
7. `EXT09-PG-LIFECYCLE-01`: Concurrencia 50x en PGlite (`1` firma, `49` rechazos), expiración irreversible, fallo en firma KMS, fallo ambiguo en commit y fallo PG pre-firma.
8. `EXT09-DDB-KMS-ORDER-01`: Conflictos DynamoDB, `GetPublicKey` binario DER en AWS KMS, orden estricto pre-firma, bloqueo de elevación de evidencia y redacción de secretos.

---

## 9. Validaciones Ejecutadas (Sección 15)

1. `npx vitest run independentAttestationAuthority --fileParallelism=false`: **PASS** (`6 passed (6)` archivos de test: `Ext05` [23], `Ext06` [14], `Ext07` [8 passed | 1 skipped: `EXT07-REAL-INFRA-OPTIN-01`], `Ext08` [15], `Ext09` [8], `Service` [38]; total `106 passed | 1 skipped (107)`).
2. `npx vitest run fiscalPr02P0Collector --fileParallelism=false`: **PASS** (`1 passed (1)` archivo, `186 passed (186)` tests).
3. `npx tsc --noEmit`: **PASS** (exit code `0`, `0` errores).
4. `npm run build`: **PASS** (`tsc -b && vite build`, exit code `0`, `689 modules transformed`).
5. `npx oxlint services/independent-attestation-authority src/test`: **PASS** (`Found 38 warnings and 0 errors`).
6. `git diff --check`: **PASS** (exit code `0`, sin errores de formato/whitespace).
7. `verifyRuntimeSigningIsolation({ forceRescan: true })`: **PASS** (`{"valid": true, "reason": "RUNTIME_SIGNING_ISOLATED", "productionSigningInRuntime": false, "privateKeysDetected": 0}`).
8. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/fiscal/run-pr02-p0-staging-private.ps1 -DryRun -ExpectedHead 014ec379a46fc14703b2542ad8bbdd0c97ef8de0`: **PASS** (`DryRun` validado sobre `HEAD` esperado sin tocar ARCA ni Staging).

---

## 10. Estado de Invariantes de Gobernanza (Sección 16)

```text
POSTGRESQL_REAL_INTEGRATION_TESTED = false
DYNAMODB_REAL_INTEGRATION_TESTED = false
AWS_KMS_REAL_TESTED = false
GCP_KMS_REAL_TESTED = false
REAL_OIDC_IDP_TESTED = false
REAL_MTLS_PKI_TESTED = false
EXTERNAL_AUTHORITY_DEPLOYED = false
PRODUCTION_INFRASTRUCTURE_VALIDATED = false
PRODUCTION_APPROVED = false
LEVEL_2B_IMPLEMENTED = false
P1_IMPORT_ALLOWED = false
PV2_ENABLED = false
CAE_ISSUANCE_ALLOWED = false
PR02_READY_FOR_EMISSION_GO = false
REMOTE_GO = DENIED
```

---

## 11. Conclusión Final

El microservicio `services/independent-attestation-authority` supera la auditoría adversarial local **EXT-REAL-09** tras corregir los 9 hallazgos identificados. Sus compuertas de preflight, aislamiento `DRY_RUN`, protecciones SSRF/OIDC/mTLS, invariantes anti-replay (`MAX_SIGNATURES_PER_REPLAY_KEY = 1`) y separación criptográfica de autoridades operan en modo **fail-closed** verificable localmente, manteniendo `REMOTE_GO = DENIED` y `PRODUCTION_APPROVED = false`.
