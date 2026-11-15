# Plan de Pruebas de Aceptación y Seguridad — Independent Attestation Authority

> [!IMPORTANT]
> Este catálogo define los criterios obligatorios de aceptación antes de autorizar cualquier uso real de la autoridad externa (`EXT-REAL-04+`).
> Distingue entre pruebas ya implementadas localmente sobre mocks/loopback y pruebas futuras contra infraestructura real desplegada.

---

## 1. Matriz de Cobertura Obligatoria (16 Escenarios Críticos)

| ID | Escenario Requerido | Capa / Categoría | Estado Actual |
|---|---|---|---|
| **ACC-01** | Solicitud sin autenticación cliente debe rechazarse (`401`/`403`). | Seguridad / Infraestructura | **Implementado y probado localmente con simulador** (`EXT-REAL-04-01`, enforcement en modo protegido y bloqueo de `SIMULATED_TEST_ONLY` en `STAGING`/`PRODUCTION`); **pendiente adapter OIDC/mTLS real** |
| **ACC-02** | Solicitud sin GO criptográficamente válido debe rechazarse (`403`). | Seguridad / Unit + Integración | **Implementado y probado localmente con claves de prueba** (`EXT-REAL-04-02/03/04`, `GoAuthorizationGrant` v1.1); **pendiente custodia GO real** |
| **ACC-03** | GO expirado (`now > expiresAt`) debe rechazarse (`403`). | Unit + Seguridad | **Implementado y probado localmente** (`EXT-REAL-04-05/06`) |
| **ACC-04** | GO con alcance incorrecto (no `PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`) debe rechazarse (`403`). | Unit + Seguridad | **Implementado y probado localmente** (`EXT-REAL-04-09/14`) |
| **ACC-05** | GO perteneciente a otro `projectRef` debe rechazarse (`403`). | Unit + Seguridad | **Implementado y probado localmente** (`EXT-REAL-04-11`) |
| **ACC-06** | GO vinculado a otro `commitSha` debe rechazarse (`403`). | Unit + Seguridad | **Implementado y probado localmente** (`EXT-REAL-04-12`) |
| **ACC-07** | Solicitud duplicada (`requestId`, `requestSha256`, `attestationId`, `goAuthorizationId`) debe rechazarse (`409`). | Integración + Infraestructura | **Implementado y probado en modo host-local pre-firma** (`EXT-REAL-04-19/21`); **pendiente en DB distribuida real** |
| **ACC-08** | Dos instancias concurrentes NO deben consumir el mismo identificador ni emitir doble firma KMS. | Infraestructura + Seguridad | Cubierto host-local (`EXT-REAL-04-20`, 10 paralelas = 1 firma y 9 `409`); **pendiente multi-réplica cloud real** |
| **ACC-09** | Clave pública sustituida debe detectarse (`PUBLIC_KEY_SUBSTITUTION_REJECTED` / `KMS_PUBLIC_KEY_MISMATCH`). | Unit + Integración | **Implementado y probado localmente** en `fiscalPr02P0Collector.test.ts` y `EXT-REAL-02-KMS-1` |
| **ACC-10** | Firma inválida o corrupta debe rechazarse (`ATTESTATION_SIGNATURE_INVALID`). | Unit + Integración | **Implementado y probado localmente** (`EXT-REAL-16`, `EXT-REAL-04-22`) |
| **ACC-11** | Cambio de 1 bit en el digest (`requestSha256`) o payload debe detectarse. | Unit | **Implementado y probado localmente** (`EXT-REAL-02`, `EXT-REAL-15`, `EXT-REAL-04-13`) |
| **ACC-12** | Evidencia original (XML/JSON) modificada respecto a hashes/normalización debe detectarse. | Integración (Nivel 2) | **Nivel 1 explícito (`LEVEL_1_DIGEST_ONLY`) + stubs tipados Nivel 2A/2B (`NOT_IMPLEMENTED`) en EXT-REAL-04**; pendiente implementación real Nivel 2 |
| **ACC-13** | La autoridad nunca debe firmar solicitudes de `P1`, `P2`, `PRODUCTION` o emisión CAE/PV2. | Unit + Seguridad | **Implementado y probado localmente** (`EXT-REAL-03`, `EXT-REAL-04-14`) |
| **ACC-14** | Indisponibilidad o error del KMS debe provocar fallo cerrado (`500`/`503`), cero firma local, y marcar intento fallido sin reciclar IDs. | Unit + Infraestructura + Operativa | **Implementado y probado localmente** (`EXT-REAL-08`, `EXT-REAL-04-21`); pendiente prueba contra KMS cloud real |
| **ACC-15** | Indisponibilidad del almacenamiento anti-replay debe provocar fallo cerrado (`500`/`503`), cero firmas emitidas. | Unit + Infraestructura + Operativa | **Implementado en `ServiceAntiReplayGuard` / `/readiness`** (`EXT-REAL-02-ENV-1`); pendiente fallo simulado DB real |
| **ACC-16** | Logs de servicio y auditoría jamás deben exponer secretos, claves ni tokens. | Unit + Seguridad + Operativa | **Implementado y probado localmente** (`EXT-REAL-19`, `EXT-REAL-02-REPLAY-LOG-1`, `EXT-REAL-04-23`); pendiente auditoría de Cloud Logging real |

---

## 2. Clasificación por Tipo de Prueba

### 2.1 Pruebas Unitarias (Ejecución local en CI sin red)
- Parser JSON estricto (`__proto__`, `constructor`, `prototype`, claves duplicadas, profundidad > 8, cuerpo vacío).
- Allowlist estricta de propiedades en `AttestationRequestPackage` y `GoAuthorizationGrant` (v1.1).
- Validación estricta de variables de entorno (`port`, `maxBodyBytes`, flags TLS, backends inválidos, rechazo `TEST_SIGNER` en `PRODUCTION`/`STAGING`).
- Validación de separación de autoridades (`goKeyId !== attestationKeyId`, `goPublicKey !== attestationPublicKey`).
- Verificación criptográfica Ed25519 en `ProductionKmsSigningProvider.sign()` y bloqueo de `fallbackToLocal()`.
- Estado terminal de transición anti-replay (`AVAILABLE -> RESERVED -> CONSUMED`, bloqueo de `RESERVED` con `kms_attempted=true`).

### 2.2 Pruebas de Integración (Contenedor aislado + mocks / DB local efímera)
- Ciclo completo `POST /attestations` -> verificación cliente `verifyAttestationResponse` con clave pública SPKI pineada.
- Comportamiento HTTP estricto: `404` en rutas prohibidas (`/sign`, `/admin`, `/metrics`, `/private-key`), `405` en métodos inválidos, `413` payload excedido, `415` `Content-Type` inválido, `403` HTTP plano con `trustProxyHttps=true`.
- Verificación integrada de Nivel 2 recalculando SHA-256 sobre artefactos XML SOAP + JSON normalizados.
- Transacción ACID con PostgreSQL/DynamoDB Local comprobando unicidad conjunta de `requestId`, `requestSha256`, `goAuthorizationId` y `attestationId`.

### 2.3 Pruebas de Infraestructura (Solo en entorno cloud aislado pre-GO, EXT-REAL-04+)
- Escaneo externo verificando TLS 1.3 obligatorio, rechazo HTTP y ausencia de puertos administrativos abiertos.
- Verificación desde VPC/runner POS de autenticación mutua mTLS o OIDC IAM (y rechazo con `401`/`403` de callers anónimos o identidades ajenas).
- Comprobación en IAM de imposibilidad física de leer secretos POS/ARCA/Supabase desde el runtime de la autoridad y viceversa.
- Verificación de creación real de eventos en `CloudTrail` / `Cloud Audit Logs` por cada llamada `AsymmetricSign` / `kms:Sign`.

### 2.4 Pruebas de Aceptación de Seguridad (Red-team / Pentest acotado pre-aprobación)
- Inyección de `GO_APPROVED=true`, tokens WSAA/CMS, claves Supabase, JSON smuggling y headers falsificados `X-Forwarded-Proto`.
- Carrera distribuida real (`N >= 10` peticiones paralelas contra `>= 2` réplicas activas del servicio) exigiendo `1` éxito y `N-1` rechazos `409`.
- Sustitución de clave pública en tránsito (`keyId` distinto) detectada en fail-closed por el colector P0 cliente.
- Verificación completa de salida estándar de logs y registros de auditoría confirmando cero fuga de tokens JWT/OIDC, headers `Authorization` o PEMs.

### 2.5 Pruebas Operativas (GameDay / Resiliencia)
- Simulación de caída de DB anti-replay -> `GET /readiness` conmuta a `503 ready: false` y `POST /attestations` falla cerrado con 0 llamadas a KMS.
- Simulación de revocación de permisos IAM a KMS -> `POST /attestations` falla cerrado (`500 PRODUCTION_KMS_UNAVAILABLE`) sin fallback.
- Envío de `SIGTERM` bajo carga -> rechazo `503 SERVER_SHUTTING_DOWN` a entrantes, cierre ordenado de requests en vuelo y verificación de persistencia anti-replay intacta.
- Prueba de procedimiento de rotación y revocación de emergencia de clave en staging aislado de la autoridad.
