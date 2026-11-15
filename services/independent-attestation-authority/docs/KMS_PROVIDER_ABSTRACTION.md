# Abstracción de Proveedores KMS / HSM Externos (EXT-REAL-06)

> **Alcance y honestidad técnica:** Este documento especifica los adaptadores de firma KMS preparados en [`services/independent-attestation-authority/src/signing-providers.mjs`](../src/signing-providers.mjs) y su integración por entorno en [`server.mjs`](../src/server.mjs). **No existen credenciales cloud configuradas, no se crearon llaves KMS/HSM reales y no se realizaron llamadas reales a AWS KMS ni Google Cloud KMS.**

---

## 1. Clasificación de Madurez

| Elemento | Estado Real | Bandera / Garantía |
|---|---|---|
| Clase base abstracta `AttestationSigningProvider` + contrato `providerKind`, `isRealWorldTested()`, `getMetadata()` | **IMPLEMENTADO LOCALMENTE** | Prohibición estricta de `accessPrivateKey()` y `fallbackToLocal()` |
| `TestSigningProvider` (llaves efímeras exclusivamente para tests) | **SIMULADO / SOLO TESTS** | Bloqueado en `STAGING` y `PRODUCTION` |
| `ProductionKmsSigningProvider` (contrato genérico KMS con verificación SPKI Ed25519 post-firma) | **IMPLEMENTADO LOCALMENTE** | Verifica firma Ed25519 contra `publicKeySpki` antes de aceptar resultado |
| `AwsKmsSigningProvider` (adaptador AWS KMS `SignCommand` `MessageType=RAW`, `ED25519_SHA_512`) | **IMPLEMENTADO LOCALMENTE / PROBADO CON MOCK DE CONTRATO** | `PROVIDER_REAL_WORLD_TESTED = false` (`EXT06-KMS-01`) |
| `GcpKmsSigningProvider` (adaptador GCP Cloud KMS `asymmetricSign`) | **IMPLEMENTADO LOCALMENTE / PROBADO CON MOCK DE CONTRATO** | `PROVIDER_REAL_WORLD_TESTED = false` (`EXT06-KMS-01`) |
| Provisión de HSM/KMS en AWS o GCP y rotación automática real | **REQUIERE INFRAESTRUCTURA REAL** | `PRODUCTION_KMS_CONFIGURED = false` |

---

## 2. Separación Estricta de Llaves en Runtime

1. **Cero claves privadas en runtime del servicio:**
   - Tanto `AwsKmsSigningProvider` como `GcpKmsSigningProvider` heredan de `ProductionKmsSigningProvider`.
   - Llamar `accessPrivateKey()` o `fallbackToLocal()` dispara `KMS_PRIVATE_KEY_NON_EXPORTABLE` o `LOCAL_FALLBACK_SIGNING_FORBIDDEN`.
   - Si no se inyecta cliente KMS en `PRODUCTION`/`STAGING`, el servicio falla cerrado (`PRODUCTION_KMS_CLIENT_UNWIRED` o `PRODUCTION_KMS_NOT_READY`) sin descender jamás a firma local.
2. **Pinning criptográfico de clave pública:**
   - Exigen `keyId` (formato `ed25519-spki-<16-hex>` derivado del SHA-256 DER SPKI) y `publicKeySpki` PEM válidos y consistentes entre sí.
   - Después de recibir bytes de firma del cliente KMS (Buffer, hex, base64 o `{ signature }`), `normalizeEd25519SignatureToHex` exige longitud exacta de 64 bytes (128 caracteres hex) y `crypto.verify(null, data, pubObj, sigBuf)` verifica la firma contra el SPKI configurado. Si el KMS devuelve bytes corruptos o firmados con otra llave, lanza `KMS_PUBLIC_KEY_MISMATCH` (`EXT06-KMS-01`).
3. **Separación respecto a la Autoridad GO:**
   - La identidad `authorityId`, el `keyId` y el `publicKeySpki` de atestación jamás pueden coincidir con `trustedGoAuthorityId`, `trustedGoKeyId` o `trustedGoPublicKeySpki`.

---

## 3. Contratos Específicos de Proveedores

### 3.1 `AwsKmsSigningProvider`
- **Identificador:** `providerKind = EXTERNAL_SIGNING_PROVIDER_KINDS.AWS_KMS` (`'AWS_KMS'`), `signerType = 'PRODUCTION_KMS_SIGNER'`.
- **Parámetros aceptados:** `kmsKeyArn` (o `keyVersionName`), `region`, `awsSigningAlgorithm` (default `'ED25519_SHA_512'`), `awsKmsClient` (soporta `.send(...)` estilo AWS SDK v3 o `.sign(...)`), `keyId`, `publicKeySpki`, `authorityId`.
- **Helper sin red:** `buildAwsSignCommandInput(canonicalPayload)` genera `{ KeyId, Message, MessageType: 'RAW', SigningAlgorithm }` sin invocar red ni requerir `@aws-sdk/client-kms` como dependencia de runtime en esta fase.

### 3.2 `GcpKmsSigningProvider`
- **Identificador:** `providerKind = EXTERNAL_SIGNING_PROVIDER_KINDS.GCP_KMS` (`'GCP_KMS'`), `signerType = 'PRODUCTION_KMS_SIGNER'`.
- **Parámetros aceptados:** `keyVersionName` (`projects/.../cryptoKeys/.../cryptoKeyVersions/...`), `gcpKmsClient` (soporta `.asymmetricSign({ name, data })` retornando `[response]` o `{ signature }`, o `.sign(...)`), `keyId`, `publicKeySpki`, `authorityId`.
- **Helper sin red:** `buildGcpAsymmetricSignRequest(canonicalPayload)` construye `{ name, data }` sin realizar llamadas gRPC/REST.

### 3.3 Selección vía Entorno (`createConfiguredAuthorityFromEnv`)
En [`server.mjs`](../src/server.mjs):
- `ATTESTATION_SIGNING_PROVIDER=PRODUCTION_KMS_SIGNER` + `ATTESTATION_KMS_PROVIDER=AWS_KMS` -> instancia `AwsKmsSigningProvider`.
- `ATTESTATION_SIGNING_PROVIDER=PRODUCTION_KMS_SIGNER` + `ATTESTATION_KMS_PROVIDER=GCP_KMS` -> instancia `GcpKmsSigningProvider`.
- Otro valor -> `ProductionKmsSigningProvider` genérico.
- Variables soportadas documentadas en [`.env.example`](../.env.example).

---

## 4. Visibilidad en `/health` y `/readiness`

Tanto `GET /health` como `GET /readiness` exponen de forma explícita y honesta:
- `kmsProviderKind`: `'LOCAL_TEST' | 'EXTERNAL_KMS' | 'AWS_KMS' | 'GCP_KMS'`
- `kmsRealWorldTested`: `false` (proviene de `PROVIDER_REAL_WORLD_TESTED = false`)
- `kmsRealConfigured`: `false`
- `authorityRealWorldAvailable`: `false`
