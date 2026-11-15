# Informe Técnico de Implementación Local — EXT-REAL-04

> [!IMPORTANT]
> **EXT-REAL-04** es una fase **LOCAL-ONLY** sobre `services/independent-attestation-authority/`.
> **No se desplegó ningún servicio, no se crearon recursos cloud, KMS ni DB real, y todos los controles fiscales (`ARCA_CALLS_NEW = 0`, `P0_REMOTE_EXECUTED = false`, `P1_IMPORT_ALLOWED = false`, `REAL_PV2_ENABLED = false`) permanecen intactos.**

---

## 1. Resumen Ejecutivo por Categoría de Madurez

| Categoría | Estado Real y Alcance Exacto |
|---|---|
| **Implementado** | 1. **Contrato `GoAuthorizationGrant` v1.1** ([go-authorization.mjs](../src/go-authorization.mjs)): parsing estricto sin prototype pollution, serialización canónica determinística, separación de dominio criptográfica (`KIOSKOPOS_GO_AUTHORIZATION_GRANT_V1_1`), verificación Ed25519 sobre clave pública GO pineada, validación de TTL/vigencia (`issuedAt`, `notBefore`, `expiresAt`), `singleUse: true` y vinculación exacta a `authorizationId`, `requestId`, `processId`, `executionScope`, `environment`, `projectRef`, `commitSha` y `requestSha256`.<br>2. **Separación de Autoridades GO vs Atestación** ([go-authorization.mjs](../src/go-authorization.mjs), [authority-service.mjs](../src/authority-service.mjs)): verificación fail-closed en arranque y por solicitud bloqueando coincidencia de `authorityId`, `keyId` o `publicKeySpki` (`COLLAPSED_AUTHORITIES_REJECTED`).<br>3. **Autenticación del Cliente Cableada y Fail-Closed** ([client-auth.mjs](../src/client-auth.mjs), [server.mjs](../src/server.mjs), [authority-service.mjs](../src/authority-service.mjs)): en modo protegido (`DEVELOPMENT`, `STAGING`, `PRODUCTION`, o `protectedMode: true`), el servicio exige `clientAuthVerifier` y `trustedGoPublicKeySpki` sin fallback silencioso (`CLIENT_AUTH_VERIFIER_REQUIRED`, `GO_TRUST_ANCHOR_REQUIRED`), validando identidad normalizada y `allowedScopes` sin confiar en claims GO dentro de tokens de cliente.<br>4. **Validación Estricta de Alcance y Política** ([attestation-policy.mjs](../src/attestation-policy.mjs)): rechazo explícito de `PRODUCTION`, `P1`, `P2`, `PV2`, `CAE`, `EMISION` e IDs ambiguos/caracteres de control; validación opcional de `expectedProjectRef` y `expectedCommitSha`.<br>5. **Anti-Replay Host-Local Atómico Pre-Firma** ([service-anti-replay.mjs](../src/service-anti-replay.mjs)): reserva atómica (`AVAILABLE -> RESERVED -> SIGNED_CONSUMED` / `FAILED_CONSUMED`) ejecutada **antes** de `signingProvider.sign()`, registrando conjuntamente `requestId`, `requestSha256`, `authorizationId` y `attestationId`, con lockfile exclusivo (`O_EXCL`/`wx`) y cola serializada en modo `file`. Ante error en firma o commit, pasa a `FAILED_CONSUMED` sin reciclar identificadores.<br>6. **Modelo de Integridad de Evidencia Honesto (Nivel 1)** ([evidence-integrity.mjs](../src/evidence-integrity.mjs), [contract.mjs](../src/contract.mjs), [http-server.mjs](../src/http-server.mjs)): Nivel 1 (`LEVEL_1_DIGEST_ONLY`) con `rawSoapVerified = false` y `arcaOriginVerified = false`, rechazo de flags de elevación enviados por el cliente (`EVIDENCE_LEVEL_ELEVATION_REJECTED`), headers HTTP informativos, soporte dual `schemaVersion: '1.0'` (retrocompatible con colector PR02) y `'1.1'` firmado (`verifyServiceAttestationResponse`), más stubs tipados `Level2ASubmittedContentEvaluatorStub` y `Level2BIndependentObservedEvaluatorStub` que fallan cerrado (`EVIDENCE_LEVEL_2A_NOT_IMPLEMENTED`, `EVIDENCE_LEVEL_2B_NOT_IMPLEMENTED`). |
| **Probado localmente** | Suite completa `src/test/independentAttestationAuthorityService.test.ts` (`EXT-REAL-01..21`, `EXT-REAL-02-*` y los 24 escenarios obligatorios `EXT-REAL-04-*` incluyendo carrera concurrente `Promise.all` de 10 solicitudes idénticas = `1` firma y `9` rechazos, fallo de firma sin reciclaje de IDs, integración HTTP y ausencia de secretos/tokens en logs), compatibilidad regresiva PR02 (`fiscalPr02P0Collector.test.ts`, `fiscalPr02ParametersPlan.test.ts`), compilación TypeScript/Vite (`npm run build`), linter (`oxlint`), escaneo de secretos, aislamiento de clave privada en runtime (`verifyRuntimeSigningIsolation`) y `-DryRun`. |
| **Simulado** | Emisión local de `GoAuthorizationGrant` mediante `TestOnlyGoAuthorityIssuer` (claves Ed25519 efímeras en memoria para pruebas) y verificación local de tokens cliente mediante `createSimulatedClientAuthVerifier` (`SIMULATED_TEST_ONLY`), ambos bloqueados explícitamente en `STAGING` y `PRODUCTION`. Firmante de pruebas `TestSigningProvider` aislado exclusivamente de entornos protegidos. |
| **Pendiente de integración real** | Adaptador OIDC Workload Identity / mTLS real para reemplazar `SIMULATED_TEST_ONLY` en despliegue S2S; adaptador SDK real de Cloud KMS / AWS KMS en `ProductionKmsSigningProvider`; almacenamiento `distributedStore` ACID multi-nodo real (PostgreSQL/DynamoDB con restricción `UNIQUE` transaccional pre-firma); emisor GO respaldado por clave hardware/offline/KMS humana; implementación eventual de Nivel 2A/2B si es requerida por auditoría. |
| **Pendiente de infraestructura** | Cuenta/proyecto cloud aislado, provisioning KMS/HSM Ed25519 no exportable, TLS 1.3 en Load Balancer/Ingress, VPC/WAF/Allowlist, Cloud Audit Logs / CloudTrail y ejecución contra imagen Docker real (entorno Windows actual sin Docker daemon activo). |
| **Pendiente de autorización humana** | Decisión arquitectónica AWS vs GCP, selección Nivel 1 vs Nivel 2 de evidencia, aprovisionamiento de autoridad real, resolución de `HISTORICAL_042` y autorización formal `GO` humana para P0 remoto. |

---

## 2. Contrato `GoAuthorizationGrant` v1.1 Implementado

- Archivo: [go-authorization.mjs](../src/go-authorization.mjs)
- `schemaVersion`: `'1.1'`
- Separación de dominio al firmar/verificar Ed25519: prefijo literal `KIOSKOPOS_GO_AUTHORIZATION_GRANT_V1_1\n` seguido del JSON canónico determinístico sin el campo `signature`.
- Vínculos verificados obligatoriamente contra configuración de servidor y contra `AttestationRequestPackage`:
  - `authorizationId` (no colapsable con `authorityId`)
  - `issuerAuthorityId` / `issuerKeyId` (derivado como `ed25519-spki-${sha256(spkiDer).slice(0,16)}` y nunca igual al de la autoridad de atestación)
  - `requestId`
  - `processId`
  - `executionScope === 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'`
  - `environment === 'HOMOLOGACION'`
  - `projectRef` y `commitSha`
  - `requestSha256`
  - `issuedAt`, `notBefore` (opcional), `expiresAt` (`ttlMs <= DEFAULT_MAX_GO_GRANT_TTL_MS = 15 min`), `singleUse === true`.

---

## 3. Garantías y Límites Honestos del Anti-Replay Actual

- En EXT-REAL-04, `ServiceAntiReplayGuard` ejecuta reserva atómica **previa** a la firma KMS (`reserveBeforeSign` -> `sign()` -> `commitReservation` / `markReservationFailed`).
- En modo `memory` y `file`, la reserva sincroniza explícitamente el estado en memoria antes de cualquier `await` y (en `file`) serializa escrituras mediante cola asíncrona + lockfile exclusivo (`O_EXCL` `'wx'`) + `writeFileSync`/`renameSync`, evitando condiciones de carrera en el mismo proceso y nodo host.
- **Límite declarado**: `multiNodeAtomicGuaranteed` continúa siendo `false` para `memory` y `file`. Garantizar unicidad entre múltiples réplicas cloud horizontales requiere conectar un `distributedStore` transaccional real (`reserveBeforeSign` atómico en PostgreSQL o DynamoDB).

---

## 4. Niveles de Evidencia y Compatibilidad v1.0 / v1.1

- Toda atestación emitida actualmente declara **Nivel 1 (`LEVEL_1_DIGEST_ONLY`)**: la autoridad verifica firmas/esquema/políticas/anti-replay sobre los digests SHA-256 enviados por el colector P0, sin inspeccionar XML SOAP crudo (`rawSoapVerified: false`) ni validar criptográficamente origen ARCA (`arcaOriginVerified: false`).
- Para preservar compatibilidad estricta con el verificador cliente existente `verifyAttestationResponse` (`scripts/fiscal/plan-pr02-parameters.mjs`, 24 propiedades permitidas en `ATTESTATION_RESPONSE_ALLOWED_KEYS`), la respuesta HTTP por defecto mantiene `schemaVersion: '1.0'` exponiendo el nivel de evidencia mediante headers HTTP (`X-Attestation-Evidence-Level: LEVEL_1_DIGEST_ONLY`, `X-Attestation-Arca-Origin-Verified: false`), `/health` (`/readiness`) y logs de auditoría seguros; y adicionalmente el contrato `schemaVersion: '1.1'` embebe `evidenceLevel`, `rawSoapVerified`, `arcaOriginVerified`, `authenticatedClientId`, `goIssuerKeyId` y `goGrantSha256` dentro del payload canónico firmado y verificable con `verifyServiceAttestationResponse`.

---

## 5. Archivos Creados / Modificados en EXT-REAL-04

### Código del servicio (`services/independent-attestation-authority/`)
- [src/go-authorization.mjs](../src/go-authorization.mjs) *(nuevo)*
- [src/client-auth.mjs](../src/client-auth.mjs) *(nuevo)*
- [src/evidence-integrity.mjs](../src/evidence-integrity.mjs) *(nuevo)*
- [src/contract.mjs](../src/contract.mjs) *(actualizado)*
- [src/attestation-policy.mjs](../src/attestation-policy.mjs) *(actualizado)*
- [src/service-anti-replay.mjs](../src/service-anti-replay.mjs) *(actualizado)*
- [src/authority-service.mjs](../src/authority-service.mjs) *(actualizado)*
- [src/http-server.mjs](../src/http-server.mjs) *(actualizado)*
- [src/server.mjs](../src/server.mjs) *(actualizado)*
- [src/index.mjs](../src/index.mjs) *(actualizado)*
- [src/index.d.mts](../src/index.d.mts) *(actualizado)*
- [.env.example](../.env.example) *(actualizado)*

### Pruebas y Documentación
- [src/test/independentAttestationAuthorityService.test.ts](../../../src/test/independentAttestationAuthorityService.test.ts) *(actualizado)*
- [docs/TRUST_AND_AUTHORIZATION_ARCHITECTURE.md](./TRUST_AND_AUTHORIZATION_ARCHITECTURE.md) *(actualizado)*
- [docs/SECURITY_REVIEW.md](./SECURITY_REVIEW.md) *(actualizado)*
- [docs/ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md) *(actualizado)*
- [docs/EXT_REAL_03_READINESS_REPORT.md](./EXT_REAL_03_READINESS_REPORT.md) *(actualizado)*
- [docs/EXT_REAL_04_IMPLEMENTATION_REPORT.md](./EXT_REAL_04_IMPLEMENTATION_REPORT.md) *(nuevo)*
