# Informe Técnico de Arquitectura y Preparación — EXT-REAL-03

> [!IMPORTANT]
> **EXT-REAL-03** es exclusivamente una fase **LOCAL-ONLY** de arquitectura, análisis de seguridad, comparación cloud y planificación operativa.
> **No se creó ni conectó ningún recurso cloud, KMS, base de datos ni endpoint real.**
> Todos los bloqueos de seguridad y controles fiscales permanecen intactos.

---

## 1. Resumen Ejecutivo por Nivel de Madurez

| Categoría | Qué incluye concretamente |
|---|---|
| **Implementado (Local)** | Servicio Node.js desacoplado (`services/independent-attestation-authority/src/`), contrato JSON estricto v1.0 sin prototype pollution ni claves duplicadas, `Dockerfile` no-root (`UID 10001`), `.dockerignore`, contrato de variables de entorno validado, `GET /health` honesto, `GET /readiness` estricto, shutdown controlado por `SIGTERM`/`SIGINT`, guardia anti-replay `memory`/`file` (single-node) + interfaz `distributedStore`, adaptador cliente POS con Public Key Pinning e invariante anti-replay host-local. |
| **Diseñado (Especificación Técnica)** | Comparativa de proveedores cloud y compatibilidad Ed25519 ([CLOUD_PROVIDER_COMPARISON.md](./CLOUD_PROVIDER_COMPARISON.md)), modelo de autorización criptográfica mediante `GoAuthorizationGrant` de uso único ([TRUST_AND_AUTHORIZATION_ARCHITECTURE.md](./TRUST_AND_AUTHORIZATION_ARCHITECTURE.md)), modelo de integridad de evidencia en Niveles 1 y 2 ([EVIDENCE_INTEGRITY_MODEL.md](./EVIDENCE_INTEGRITY_MODEL.md)), máquina de estados multi-nodo pre-firma para anti-replay distribuido ([DISTRIBUTED_ANTI_REPLAY_DESIGN.md](./DISTRIBUTED_ANTI_REPLAY_DESIGN.md)), revisión completa de controles HTTP/seguridad ([SECURITY_REVIEW.md](./SECURITY_REVIEW.md)), runbook de despliegue en 16 etapas ([DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)) y matriz de aceptación en 5 capas ([ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md)). |
| **Documentado** | Los 7 documentos técnicos anteriores bajo `services/independent-attestation-authority/docs/` + guía operativa [CLOUD_DEPLOYMENT_GUIDE.md](./CLOUD_DEPLOYMENT_GUIDE.md) + enlace en [README.md](../README.md). |
| **Probado localmente** | Suite del servicio y suites fiscales PR02 en Vitest (con `TestSigningProvider` y mocks locales), build TypeScript/Vite, `oxlint`, escaneo de secretos e invariantes en `-DryRun`. *(Construcción de imagen Docker real no ejecutada cuando Docker daemon no está activo; nunca simulada).* |
| **Pendiente de decisión humana** | Elección final entre **AWS (ECS/Lambda + AWS KMS `ECC_NIST_EDWARDS25519` + DynamoDB)** vs **GCP (Cloud Run + Cloud KMS `EC_SIGN_ED25519` + Cloud SQL/Firestore)**; decisión sobre nivel **HSM vs Software KMS** verificando compatibilidad regional Ed25519 HSM; decisión de implementar Nivel 1 vs Nivel 2 de integridad de evidencia y obligatoriedad de `GoAuthorizationGrant` antes de salir a P0 remoto; resolución humana de `HISTORICAL_042`. |
| **Pendiente de infraestructura real y desarrollo posterior** | Implementación del adaptador SDK real de KMS (`@aws-sdk/client-kms` o `@google-cloud/kms`), implementación del `distributedStore` ACID, conexión obligatoria de `clientAuthVerifier` (OIDC/mTLS) en `server.mjs`, verificación criptográfica `GoAuthorizationGrant` v1.1 en `authority-service.mjs`, creación de cuenta/proyecto aislado, generación de clave KMS Ed25519 no exportable, TLS 1.3/WAF/mTLS reales y ejecución del plan de aceptación [ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md). |

---

## 2. Brechas Clave Identificadas en la Auditoría EXT-REAL-03

1. **Autenticación obligatoria S2S no cableada aún en arranque (`SECURITY_REVIEW.md`)**: *(Abordado localmente en EXT-REAL-04 — ver [EXT_REAL_04_IMPLEMENTATION_REPORT.md](./EXT_REAL_04_IMPLEMENTATION_REPORT.md); pendiente adaptador OIDC/mTLS real en despliegue).* `createConfiguredAuthorityFromEnv` en `server.mjs` aún no contaba con enforcement obligatorio de `clientAuthVerifier`.
2. **Autorización GO aún basada en referencia/hash (`TRUST_AND_AUTHORIZATION_ARCHITECTURE.md`)**: *(Abordado localmente en EXT-REAL-04 con claves de prueba `GoAuthorizationGrant` v1.1; pendiente custodia HSM/KMS GO real).* El contrato `v1.0` solo validaba presencia de `authorizationId` y formato hex.
3. **Atestación actual de Nivel 1 únicamente (`EVIDENCE_INTEGRITY_MODEL.md`)**: El servicio v1.0 atestigua los digests recibidos del colector, no los bytes XML/SOAP originales ni procedencia ARCA (`ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED = false`).
4. **Anti-replay multi-nodo requiere transición a `RESERVE -> SIGN -> CONSUME` (`DISTRIBUTED_ANTI_REPLAY_DESIGN.md`)**: El modo `file` local no resiste concurrencia entre réplicas y requiere reemplazo transaccional atómico pre-firma antes de escalar a más de una instancia.
5. **Compatibilidad HSM regional de Ed25519 (`CLOUD_PROVIDER_COMPARISON.md`)**: Azure Key Vault/Managed HSM no soporta Ed25519 nativo; AWS KMS soporta `ECC_NIST_EDWARDS25519` y GCP KMS soporta `EC_SIGN_ED25519`, debiendo validarse explícitamente el tier `HSM` vs `SOFTWARE` en la región seleccionada durante el aprovisionamiento autorizado futuro.

---

## 3. Invariantes Confirmados sin Alteración

```text
P0_REMOTE_EXECUTED = false
ARCA_CALLS_NEW = 0
STAGING_READS_NEW = 0
STAGING_WRITES_NEW = 0
PRODUCTION_MUTATIONS = 0
CAE_EMISSIONS_NEW = 0
P1_IMPORT_ALLOWED = false
PR02_P1_REMOTE_EXECUTION_READY = false
PR02_P2_REMOTE_EXECUTION_READY = false
REAL_PV2_ENABLED = false
HISTORICAL_042_IDENTIFICATION = UNRESOLVED
HISTORICAL_042_REEMISSION_FORBIDDEN = true
PR02_READY_FOR_EMISSION_GO = false
REMOTE_GO = DENIED
EXTERNAL_AUTHORITY_SERVICE_DEPLOYED = false
AUTHORITY_REAL_WORLD_AVAILABLE = false
```
