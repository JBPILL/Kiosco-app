# Informe de Auditoría Adversarial Independiente — EXT-REAL-05

> [!IMPORTANT]
> **EXT-REAL-05** es una auditoría adversarial estrictamente **LOCAL-ONLY** sobre la implementación EXT-REAL-04 de `services/independent-attestation-authority/`.
> No se realizaron despliegues cloud, creación/modificación de recursos KMS/HSM, conexiones a infraestructura externa, llamadas ARCA/WSAA, lecturas/escrituras Supabase ni commits/push git.

---

## 1. Resumen Ejecutivo

La auditoría adversarial independiente revisó línea por línea los módulos del servicio (`go-authorization.mjs`, `client-auth.mjs`, `authority-service.mjs`, `server.mjs`, `service-anti-replay.mjs`, `http-server.mjs`, `attestation-policy.mjs`, `contract.mjs`, `signing-providers.mjs`, `evidence-integrity.mjs` y `.env.example`) y construyó una suite adversarial independiente ([independentAttestationAuthorityAdversarialExt05.test.ts](../../../src/test/independentAttestationAuthorityAdversarialExt05.test.ts)) siguiendo el protocolo estricto: **(1) reproducir antes de parchear -> (2) fijar test reproductor -> (3) aplicar fix mínimo -> (4) re-ejecutar suites regresivas y compilación completa**.

Se identificaron y corrigieron **11 brechas de seguridad/hardening reproducibles en código** (entre ellas omisión de `issuerAuthorityId` evadiendo `trustedGoAuthorityId`, aceptación de `Authorization` duplicado con retorno `HTTP 200`, filtración de rutas de disco en respuestas `503/500`, ausencia de protección contra symlinks/junctions en anti-replay `file`, bypass de `isProductionAuthVerifier() === false` en `PRODUCTION`, ignorado de headers de elevación de evidencia en `handleRequest`, falta de `Ed25519`/`attestationId === responseId` en `verifyServiceAttestationResponse`, falta de rechazo de accesores JS/getters mutantes, `isHealthy()` ciego a corrupción post-arranque en disco, `distributedStore` sin `reserveOnce` atómico en tiempo de reserva, y `requestTimeoutMs` pasivo sin cierre explícito `408` en lectura lenta de cuerpo).

Con los fixes aplicados, todas las validaciones locales pasan (**264/264 tests**, `tsc`, `npm run build`, `oxlint` con `0` errores, `git diff --check`, aislamiento de clave privada en runtime, escaneo de secretos y `-DryRun`). Se mantienen honestamente en **`false` / `BLOCKED` / `NOT_TESTED`** los controles que dependen de infraestructura externa no aprovisionada (OIDC/mTLS real, Cloud KMS/HSM real, anti-replay distribuido multi-nodo real, construcción Docker en daemon apagado y `chmod` POSIX en directorio Windows NTFS).

---

## 2. Alcance Auditado y Metodología Adversarial

- **Commit base verificado**: `014ec379a46fc14703b2542ad8bbdd0c97ef8de0` en rama `feat/pilot-envases-returns`.
- **Bloques ejecutados**:
  - **Bloque A**: Integridad criptográfica y canonicalización de `GoAuthorizationGrant` v1.1 y verificación cliente/servicio de respuestas Ed25519.
  - **Bloque B**: Separación estricta de autoridades GO vs Atestación y aislamiento de artefactos de prueba en entornos protegidos.
  - **Bloque C**: Autenticación cliente, autorización de alcances, rechazo de tokens no modelados y resistencia a manipulación de identidad/headers/TOCTOU.
  - **Bloque D**: Anti-replay host-local (`100` solicitudes concurrentes en proceso, `2` procesos OS independientes reales `node` sobre mismo archivo, recuperación tras crash `RESERVED` y `kmsAttempted`, lockfile huérfano, corrupción/truncado pre/post-arranque, symlinks/junctions y rollback).
  - **Bloque E**: Invariante pre-firma (`0` llamadas a `signingProvider.sign()` en todo fallo previo y bloqueo permanente ante caída de socket HTTP post-firma o fallo de KMS).
  - **Bloque F**: Inmutabilidad de Evidencia Nivel 1 (`LEVEL_1_DIGEST_ONLY`) y rechazo de elevación por body/headers.
  - **Bloque G**: Hardening HTTP (métodos, rutas, media types, límites de tamaño, JSON estricto, headers duplicados, `Host`/URI malformados, timeout de body lento, streams abortados, anti-leakage de rutas/secretos, ausencia de CORS).
  - **Bloque H**: Ciclo E2E completo con persistencia real en disco y reinicio de instancia.

---

## 3. Hallazgos Clasificados (Severidad, Evidencia y Estado)

| ID | Severidad | Componente | Comportamiento Vulnerable Observado (Pre-Fix) | Reproducción | Corrección Aplicada / Estado |
|---|---|---|---|---|---|
| **EXT05-F01** | **HIGH** *(Arquitectónico)* | `client-auth.mjs`, `signing-providers.mjs`, `service-anti-replay.mjs` | Sin adaptador OIDC/mTLS real, sin cliente Cloud/AWS KMS real y sin backend SQL/DynamoDB `distributedStore` real (`multiNodeAtomicGuaranteed: false` en `file`/`memory`). | Inspección + pruebas de límites | **ABIERTO (Esperado / Pendiente Infra Cloud)** — Bloqueado fail-closed en `PRODUCTION` salvo inyección explícita; reflejado como `false` en veredicto. |
| **EXT05-F02** | **HIGH** | [go-authorization.mjs](../src/go-authorization.mjs#L280-L287) | Un `GoAuthorizationGrant` v1.1 firmado omitiendo `issuerAuthorityId` omitía también la comparación contra `trustedGoAuthorityId` y contra `attestationAuthorityId` (`verifyGoAuthorizationGrant` retornaba `valid: true`). | `EXT-REAL-05-A-2` (pasó sin error antes del fix) | **CORREGIDO** — `issuerAuthorityId` ahora se valida obligatoriamente con `assertStrictIdentifier(..., 'GO_AUTHORIZATION_ISSUER_INVALID')`. |
| **EXT05-F03** | **HIGH** | [service-anti-replay.mjs](../src/service-anti-replay.mjs) | (a) Ausencia de chequeo `lstatSync` permitía atravesar symlinks/directory-junctions en `filePath`, padre o `.lock`; (b) `tmpPath` carecía de `O_EXCL` (`'wx'`) y contador monotónico; (c) `distributedStore` sin `reserveOnce`/`hasGoAuthorizationId` realizaba solo checks no atómicos antes de `sign()`. | `EXT-REAL-05-D-4` | **CORREGIDO** — Agregados `_assertNoSymlinks` recursivo, escritura temporal `'wx'` (`0o600`) con `_tmpSeq`, y fallo cerrado en `reserveBeforeSign` (`SERVICE_ANTI_REPLAY_STORAGE_ERROR`) si `distributedStore` no implementa `reserveOnce` + `hasGoAuthorizationId`. |
| **EXT05-F04** | **HIGH** | [http-server.mjs](../src/http-server.mjs) | Las respuestas HTTP `503`/`500` de `SERVICE_ANTI_REPLAY_LOCK_CONTENTION` / `STORAGE_ERROR` reflejaban literalmente rutas internas del sistema de archivos del host (p. ej. `C:\...\secret-internal-host-dir-...\sensitive-anti-replay-store.json.lock`). | `EXT-REAL-05-G-1` (filtraba ruta completa antes del fix) | **CORREGIDO** — Tabla `INTERNAL_SAFE_MESSAGES` y sanitización genérica para todo error `>= 500`, lock contention, storage, KMS y errores internos del verificador cliente. |
| **EXT05-F05** | **HIGH** | [http-server.mjs](../src/http-server.mjs) | Enviar dos headers `Authorization` crudos en TCP/HTTP (`Authorization: Bearer <valido>` + `Authorization: Bearer otro`) devolvía **`HTTP/1.1 200 OK`** por sobreescritura/primero-gana del parser Node, permitiendo header smuggling. | `EXT-REAL-05-G-2` (`200 OK` antes del fix) | **CORREGIDO** — Inspección explícita de `req.rawHeaders` rechazando con `400 DUPLICATE_HEADER_REJECTED` duplicados en `host`, `authorization`, `x-api-key`, `x-forwarded-proto`, `content-type`, `content-length`; más validación de `Host`, `allowedHosts` opcional y rechazo de URLs absolute-form/`//`/control chars. |
| **EXT05-F06** | **MEDIUM** | [authority-service.mjs](../src/authority-service.mjs#L405-L455) | `handleRequest` validaba elevación de evidencia solo en el cuerpo JSON (`evidence-integrity.mjs`), pero aceptaba e ignoraba headers HTTP como `x-attestation-evidence-level: LEVEL_2A_SUBMITTED_CONTENT` devolviendo `200`. | `EXT-REAL-05-F-1` (resolvía firma válida antes del fix) | **CORREGIDO** — Lista explícita de headers prohibidos en `_validateClientAuthBoundary` rechazando con `EVIDENCE_LEVEL_ELEVATION_REJECTED`. |
| **EXT05-F07** | **MEDIUM** | [attestation-policy.mjs](../src/attestation-policy.mjs#L109-L119) | En `PRODUCTION`/`STAGING`, un verificador custom con `isProductionAuthVerifier() === false` sin flags `simulated`/`TEST_ONLY` superaba `assertServiceEnvironmentIsolation`. | `EXT-REAL-05-B-1` (constructor no lanzaba antes del fix) | **CORREGIDO** — Verificación explícita de `typeof clientAuthVerifier.isProductionAuthVerifier === 'function' && !clientAuthVerifier.isProductionAuthVerifier()`. |
| **EXT05-F08** | **MEDIUM** | [authority-service.mjs](../src/authority-service.mjs#L445-L465) | Si `serviceEnvironment === 'DEVELOPMENT'` con `protectedMode: false` explícito y sin `clientAuthVerifier`, el servicio ignoraba headers `Authorization: Bearer ...` sin lanzar `UNMODELED_BEARER_TOKEN_REJECTED`. | `EXT-REAL-05-C-2` | **CORREGIDO** — Rechazo obligatorio fuera del modo unitario aislado `TEST` (`requiresAuthBoundary`), preservando compatibilidad retroactiva de `EXT-REAL-02-REPLAY-LOG-1` exclusivamente para `serviceEnvironment === 'TEST'` sin verificador. |
| **EXT05-F09** | **MEDIUM** | [contract.mjs](../src/contract.mjs) | (a) `verifyServiceAttestationResponse` aceptaba `algorithm !== 'Ed25519'`, no verificaba `pubKeyObj.asymmetricKeyType === 'ed25519'` ni `attestationId === responseId` en v1.1; (b) `assertNoPrototypePollution` no bloqueaba propiedades getter/setter mutantes (TOCTOU en memoria). | `EXT-REAL-05-A-4`, `EXT-REAL-05-C-3` | **CORREGIDO** — Validación estricta de `Ed25519`, tipo de clave, igualdad `attestationId === responseId` y bloqueo de descriptores `get`/`set`. |
| **EXT05-F10** | **MEDIUM** | [service-anti-replay.mjs](../src/service-anti-replay.mjs) + [server.mjs](../src/server.mjs#L170) | (a) `isHealthy()` (`GET /readiness`) devolvía `true` aun tras corromperse/truncarse el archivo JSON anti-replay en disco después del arranque; (b) `server.mjs` parseaba `ATTESTATION_SIMULATED_CLIENT_TOKENS_JSON` con `JSON.parse` sin detector de claves duplicadas. | `EXT-REAL-05-D-3`, `EXT-REAL-05-G-4` | **CORREGIDO** — `isHealthy()` verifica symlinks y parseo íntegro del archivo en disco en modo `file`; `server.mjs` ahora usa `safeParseStrictJson`. |
| **EXT05-F11** | **LOW** | [http-server.mjs](../src/http-server.mjs) | `this._server.requestTimeout = requestTimeoutMs` no cortaba determinísticamente en `120ms` streams de cuerpo incompletos/lentos en Node, dejando colgada la petición hasta el timeout por defecto del socket. | `EXT-REAL-05-G-4` (timeout 5000ms de Vitest antes del fix) | **CORREGIDO** — Temporizador explícito por solicitud (`bodyTimer`) que responde `408 REQUEST_TIMEOUT` y destruye `req` si el cuerpo excede `requestTimeoutMs`. |
| **EXT05-I01** | **INFO** *(Operacional)* | [service-anti-replay.mjs](../src/service-anti-replay.mjs) | Un lockfile `.lock` huérfano (p. ej. tras `SIGKILL`) falla cerrado con `503 SERVICE_ANTI_REPLAY_LOCK_CONTENTION` (cero doble firma, pero requiere limpieza operacional manual para recuperar disponibilidad). | `EXT-REAL-05-D-3` | **ACEPTADO / DOCUMENTADO** — Preferible a desbloqueo automático por heurística de edad en ausencia de lease distribuido. |

---

## 4. Verificación de Criptografía y Autorización GO

- Se verificó mutación sistemática de los **15 campos críticos** de `GoAuthorizationGrant` v1.1 (`EXT-REAL-05-A-1`) y domain separation cruzado contra claves ajenas, claves JSON duplicadas, campos extra en request/grant y ventana temporal exacta (`notBefore` y límite estricto `now === expiresAt`).
- Corrección crítica aplicada en `go-authorization.mjs` impide omitir `issuerAuthorityId` para evadir `trustedGoAuthorityId`.

---

## 5. Verificación de Autenticación y Autorización del Cliente

- Confirmado fail-closed para credenciales vacías/ausentes, scopes insuficientes/vacíos, suplantación `isGoAuthority: true`, fallos inesperados del verificador (`503 CLIENT_AUTH_VERIFIER_ERROR` sin fuga de token), headers duplicados y tokens Bearer estáticos no modelados en entornos protegidos.

---

## 6. Verificación de Anti-Replay, Concurrencia y Fallos

- **Concurrencia intra-proceso (`EXT-REAL-05-D-1`)**: `100` solicitudes simultáneas con el mismo `authorizationId` produjeron exactamente **1 firma** y **99 rechazos**.
- **Concurrencia HTTP (`EXT-REAL-05-G-4`)**: `20` requests HTTP paralelos sobre mismo grant produjeron **1x HTTP 200**, **19x HTTP 409/503**, **0x HTTP 500** y **1** firma.
- **Concurrencia real entre procesos OS (`EXT-REAL-05-D-2`)**: `2` procesos Node independientes (`spawn`) alineados por barrera temporal compartiendo el mismo archivo en disco produjeron máximo **1 archivo marcador de firma** (`1` éxito, `1` rechazo, `0` doble firma).
- **Recuperación ante crash y corrupción (`EXT-REAL-05-D-3`, `EXT-REAL-05-D-5`)**: reinicios cargando estado `RESERVED` o con `kmsAttempted: true` bloquean reintentos; fallo de escritura pre-firma revierte memoria (`_removeUncommittedMemoryEntry`); archivo corrupto pre-arranque y post-arranque fallan cerrados y tornan `/readiness` a `503` (`healthy: false`); symlinks/junctions lanzan `SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN`.
- **Elemento `NOT_TESTED`**: Manipulación de permisos POSIX `chmod 0444/0555` sobre directorios en Windows NTFS no es enforceable por propietario en el sistema de archivos NTFS (requeriría ACE explícita `icacls` de sistema operativo); queda documentado como **`NOT_TESTED (limitación NTFS Windows)`**. La ruta de fallo de escritura en disco pre-firma sí se probó mediante fallo simulado en `_persistToFile` (`EXT-REAL-05-D-5`).

---

## 7. Verificación de Integridad de Evidencia (Nivel 1)

- Toda emisión mantiene `evidenceLevel: 'LEVEL_1_DIGEST_ONLY'`, `rawSoapVerified: false`, `arcaOriginVerified: false` y headers `X-Attestation-Evidence-Level` / `X-Attestation-Arca-Origin-Verified: false`.
- Bloqueados intentos por cuerpo y por headers HTTP (`EXT-REAL-05-F-1`), y confirmados fail-closed los stubs `Level2ASubmittedContentEvaluatorStub` y `Level2BIndependentObservedEvaluatorStub`.

---

## 8. Verificación de Hardening HTTP y Despliegue Contenerizado

- Verificados `405` (sin CORS), `404`, `415`, `400` (JSON duplicado, headers duplicados, `Host` inválido/no permitido, URI absolute-form), `413` (`PAYLOAD_TOO_LARGE`), `408` (`REQUEST_TIMEOUT` en body lento), streams abortados mid-body, sanitización completa en `503`/`500`, ausencia de secretos en `/health` y persistencia intacta tras `close()` + restart (`EXT-REAL-05-H-1`).
- **Contenedor Docker (`BLOCKED / NOT_TESTED`)**: Se verificó `docker info`; el daemon Docker Desktop no está activo en este host Windows (`open //./pipe/dockerDesktopLinuxEngine: El sistema no puede encontrar el archivo especificado`), por lo que no se construyó ni ejecutó el contenedor.

---

## 9. Fixes Aplicados durante EXT-REAL-05

1. [go-authorization.mjs](../src/go-authorization.mjs): `issuerAuthorityId` obligatorio (`GO_AUTHORIZATION_ISSUER_INVALID`).
2. [attestation-policy.mjs](../src/attestation-policy.mjs): verificación de `clientAuthVerifier.isProductionAuthVerifier()` en `STAGING`/`PRODUCTION`.
3. [authority-service.mjs](../src/authority-service.mjs): bloqueo de headers HTTP de elevación de evidencia (`EVIDENCE_LEVEL_ELEVATION_REJECTED`) y rechazo de tokens Bearer estáticos sin verificador en cualquier entorno no aislado (`DEVELOPMENT`/`STAGING`/`PRODUCTION` o `protectedMode`).
4. [contract.mjs](../src/contract.mjs): rechazo de getters/setters en `assertNoPrototypePollution`; exigencia de `Ed25519` y `attestationId === responseId` en `verifyServiceAttestationResponse`.
5. [service-anti-replay.mjs](../src/service-anti-replay.mjs): guardas `_assertNoSymlinks` en `filePath`/ancestros/`.lock`/tmp, archivos temporales `wx` con secuencia monotónica, detección de corrupción en tiempo real en `isHealthy()` y exigencia de `reserveOnce`/`hasGoAuthorizationId` en `distributedStore` dentro de `reserveBeforeSign`.
6. [http-server.mjs](../src/http-server.mjs) y [index.d.mts](../src/index.d.mts): bloqueo de headers críticos duplicados vía `rawHeaders`, validación de `Host`/`allowedHosts` y origin-form URL, handler `aborted`, temporizador explícito `408` para solicitudes lentas y sanitización estricta de errores internos/rutas de disco.
7. [server.mjs](../src/server.mjs): uso de `safeParseStrictJson` en `ATTESTATION_SIMULATED_CLIENT_TOKENS_JSON`.

---

## 10. Evidencia de Tests Adversariales

- Archivo independiente creado: [src/test/independentAttestationAuthorityAdversarialExt05.test.ts](../../../src/test/independentAttestationAuthorityAdversarialExt05.test.ts) (**23 tests**, Bloques A–H).
- Suite completa de regresiones:
  - `src/test/independentAttestationAuthorityAdversarialExt05.test.ts`: **23/23 PASS**
  - `src/test/independentAttestationAuthorityService.test.ts`: **38/38 PASS**
  - `src/test/fiscalPr02P0Collector.test.ts`: **186/186 PASS**
  - `src/test/fiscalPr02ParametersPlan.test.ts`: **17/17 PASS**
  - **Total observado post-fixes**: **264/264 PASS**
- Compilación y calidad:
  - `npx tsc --noEmit`: **PASS (exit 0)**
  - `npm run build`: **PASS (`built in 3.72s`)**
  - `npx oxlint services/ src/test/independentAttestationAuthorityService.test.ts src/test/independentAttestationAuthorityAdversarialExt05.test.ts`: **0 errors, 2 warnings preexistentes (`no-control-regex`)**
  - `git diff --check`: **PASS (exit 0)**

---

## 11. Estado del Anti-Replay

- **Host-local (`file`)**: endurecido contra carreras intra-proceso, carreras multi-proceso en mismo host, crashes en `RESERVED`/`kmsAttempted`, corrupción pre/post-arranque y ataques symlink/junction (`HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE`, `multiNodeAtomicGuaranteed: false`).
- **Distribuido multi-nodo (`distributed`)**: **NO implementado con almacenamiento real en infraestructura** (`DISTRIBUTED_ANTI_REPLAY_IMPLEMENTED = false`). Ahora `reserveBeforeSign` falla cerrado si un store distribuido inyectado omite `reserveOnce` o `hasGoAuthorizationId` atómicos.

---

## 12. Estado de Evidencia e Integridad

- **Nivel activo**: exclusivamente **Nivel 1 (`LEVEL_1_DIGEST_ONLY`)**, con `rawSoapVerified: false` y `arcaOriginVerified: false`.
- **Niveles futuros (`2A` / `2B`)**: únicamente stubs fail-closed (`EVIDENCE_LEVEL_2A_NOT_IMPLEMENTED`, `EVIDENCE_LEVEL_2B_NOT_IMPLEMENTED`).

---

## 13. Matriz Consolidada de Pruebas, Bloqueos y Pendientes

| Control | Estado Final | Evidencia / Condición |
|---|---|---|
| Criptografía GO Grant v1.1 + Ed25519 | **VERIFICADO (LOCAL)** | `EXT-REAL-05-A-1..A-4` PASS |
| Separación GO vs Attestation + Bloqueo Test Artifacts | **VERIFICADO (LOCAL)** | `EXT-REAL-05-B-1..B-3` PASS |
| Auth cliente, scopes y anti-TOCTOU | **VERIFICADO (LOCAL)** | `EXT-REAL-05-C-1..C-3` PASS |
| Anti-replay host-local (`100x` + `2 procesos OS` + crash/symlink) | **VERIFICADO (HOST-LOCAL)** | `EXT-REAL-05-D-1..D-5` PASS |
| Permisos POSIX `chmod` en directorio Windows NTFS | **NOT_TESTED** | Limitación NTFS (`FILE_ATTRIBUTE_READONLY` no bloquea writes propietario) |
| Hardening HTTP, anti-leakage, timeouts, E2E restart | **VERIFICADO (LOCAL)** | `EXT-REAL-05-E-1..E-2`, `F-1`, `G-1..G-4`, `H-1` PASS |
| Build y ejecución contenedor Docker | **BLOCKED / NOT_TESTED** | Daemon Docker inactivo en host Windows |
| OIDC / mTLS real, KMS/HSM real, DB distribuida real, Deployment cloud | **NO CONFIGURADO (`false`)** | Fuera de alcance LOCAL-ONLY; requiere provisión externa |

---

## 14. Prerrequisitos Reales Previos a Infraestructura y Despliegue

1. Conectar adaptador S2S OIDC Workload Identity o mTLS en `clientAuthVerifier` (`REAL_OIDC_CONFIGURED` / `REAL_MTLS_CONFIGURED`).
2. Conectar cliente SDK real no exportable en `ProductionKmsSigningProvider` (`PRODUCTION_KMS_CONFIGURED`).
3. Implementar `distributedStore` ACID multi-nodo (PostgreSQL/DynamoDB) implementando `reserveOnce` y `hasGoAuthorizationId` atómicos pre-firma (`DISTRIBUTED_ANTI_REPLAY_IMPLEMENTED`).
4. Construir y validar la imagen Docker sobre daemon activo, aprovisionar raíz pública GO no local y mantener invariantes fiscales sin cambios hasta autorización humana explícita.

---

## 15. Veredicto Final

```text
EXT_REAL_05_AUDIT = PASS_WITH_LIMITATIONS
SERVICE_CRYPTO_INTEGRITY = PASS
SERVICE_AUTHORITY_SEPARATION = PASS
SERVICE_CLIENT_AUTH_BOUNDARY = PASS
HOST_LOCAL_ANTI_REPLAY = PASS
PRE_SIGN_RESERVATION_GUARANTEE = PASS
LEVEL_1_EVIDENCE_INTEGRITY = PASS
HTTP_HARDENING = PASS
REAL_OIDC_CONFIGURED = false
REAL_MTLS_CONFIGURED = false
DISTRIBUTED_ANTI_REPLAY_IMPLEMENTED = false
PRODUCTION_KMS_CONFIGURED = false
EXTERNAL_AUTHORITY_DEPLOYED = false
P1_IMPORT_ALLOWED = false
PR02_READY_FOR_EMISSION_GO = false
```
