# Arquitectura de Confianza y Autorización Criptográfica (GO ↔ POS ↔ Attestation Authority)

> [!NOTE]
> **Actualización EXT-REAL-04 (Estado local `v1.1` implementado con claves de prueba)**:
> A partir de EXT-REAL-04, el servicio implementa verificación criptográfica Ed25519 del contrato `GoAuthorizationGrant` (`v1.1`, `go-authorization.mjs`) con separación de dominio (`KIOSKOPOS_GO_AUTHORIZATION_GRANT_V1_1`), vinculación total al request (`authorizationId`, `requestId`, `processId`, `executionScope`, `environment`, `projectRef`, `commitSha`, `requestSha256`), vigencia temporal y consumo único pre-firma (`service-anti-replay.mjs`). En modo protegido (`DEVELOPMENT`/`STAGING`/`PRODUCTION`) exige `clientAuthVerifier` y `trustedGoPublicKeySpki` sin fallback silencioso. **Pendiente de integración real**: emisión GO desde KMS/HSM humano real y autenticación cliente S2S OIDC/mTLS real (actualmente probados con `TestOnlyGoAuthorityIssuer` y `createSimulatedClientAuthVerifier` bloqueados en `STAGING`/`PRODUCTION`).

---

## 1. Dominios de Confianza Separados

| Dominio | Controlador / Custodia | Secretos que posee | Secretos que NUNCA posee |
|---|---|---|---|
| **1. Runtime POS / Colector P0** | Entorno operativo POS (`kioskopos-prod`) | Certificados WSAA/ARCA (en backend autorizado), credenciales Supabase | Clave privada GO Authority; clave privada Attestation Authority |
| **2. GO Authority (Gobernanza Humana)** | Responsable humano / hardware key offline | Clave privada Ed25519 de GO Authority (`GO_PUBLIC_KEY_ID` pineada) | Clave privada Attestation Authority; tokens WSAA |
| **3. External Attestation Authority** | Cuenta cloud separada + KMS/HSM dedicado | Acceso `kms:Sign` a clave privada Ed25519 en KMS; DB anti-replay | Credenciales WSAA/CMS/ARCA; claves Supabase; clave privada GO |

```text
  [ GO Authority Offline / Hardware Key ]
                    |
                    | Firma Ed25519 (GoAuthorizationGrant de uso único y corto vencimiento)
                    v
  [ KioskoPOS Colector P0 ] --(TLS 1.3 + OIDC/mTLS + Request + GoAuthorizationGrant)--> [ Attestation Authority ]
                                                                                              |
                                                                1. Autentica cliente (OIDC/mTLS)
                                                                2. Verifica firma Ed25519 del GO Grant
                                                                3. Valida 11 vínculos + expiración + scope P0
                                                                4. Consume single-use GO Grant + requestId (ATÓMICO)
                                                                5. Firma respuesta en KMS/HSM externo
```

---

## 2. Respuestas Estructurales a los 10 Puntos de Confianza

1. **¿Quién solicita una atestación?**
   El colector oficial P0 (`collectorIdentity: "scripts/fiscal/execute-pr02-p0-official-evidence.mjs"`), ejecutado por un operador o runner CI controlado tras obtener evidencia P0 de homologación y una autorización GO válida.
2. **¿Cómo se autentica el solicitante?**
   En capa de transporte S2S mediante **mTLS** (certificado X.509 de cliente emitido por CA privada dedicada, distinto del certificado fiscal AFIP/ARCA) o **OIDC Workload Identity Token** emitido por la plataforma de ejecución autorizada. El token estático `Authorization: Bearer` sin verificador es rechazado en `STAGING`/`PRODUCTION` (`UNMODELED_BEARER_TOKEN_REJECTED`), pero en `v1.0` falta conectar un `clientAuthVerifier` concreto obligatorio en `server.mjs`.
3. **¿Cómo se autoriza una solicitud?**
   Mediante un objeto firmado criptográficamente por la GO Authority (**`GoAuthorizationGrant`**, ver Sección 3). Ningún booleano plano enviado por el POS (`GO_APPROVED=true`, `authorized: true`) tiene valor de autorización.
4. **¿Cómo se demuestra la existencia de un GO válido?**
   El solicitante adjunta el `GoAuthorizationGrant` completo (o la autoridad consulta el registro firmado inmutable si existiera), cuya huella SHA-256 coincide con `goAuthorizationDocumentSha256` y cuya firma Ed25519 verifica contra la clave pública pineada de la GO Authority (`ATTESTATION_GO_PUBLIC_KEY_SPKI`) en configuración del servidor de atestación.
5. **¿Cómo se verifica criptográficamente la autorización?**
   La autoridad calcula el payload canónico determinístico del `GoAuthorizationGrant`, recalcula `sha256(canonicalGrantPayload)` comparándolo contra `goAuthorizationDocumentSha256`, verifica `crypto.verify(null, canonicalGrantBytes, goPublicKeySpki, grantSignature)` == `true`, valida ventana temporal (`now >= issuedAt && now <= expiresAt`) y valida igualdad estricta de cada campo vinculado contra el `AttestationRequestPackage`.
6. **¿Cómo se evita que el POS pueda autoaprobarse?**
   - El servidor de atestación **nunca lee ni confía** en `TRUSTED_GO_PUBLIC_KEY_SPKI` enviada dentro de la solicitud HTTP; solo confía en la clave pública GO cargada en su propio entorno administrativo independiente.
   - `verifyRuntimeSigningIsolation` en el POS prohíbe presencia de claves privadas en runtime POS.
   - El payload de solicitud no puede incluir `selfAttested`, flags de elevación ni firmas autogeneradas.
7. **¿Cómo se comprueba la separación entre quien autoriza (GO) y quien firma (Attestation)?**
   - A nivel de arranque (`authority-service.mjs:_assertSeparationOfAuthorities`), se rechaza el arranque si `trustedGoKeyId === keyId` o si `normalize(trustedGoPublicKeySpki) === normalize(signingProvider.publicKeySpki)` (`COLLAPSED_AUTHORITIES_REJECTED`).
   - En cada solicitud (`authority-service.mjs:335-345`), se rechaza si `authorizationId === authorityId`.
   - En diseño `v1.1`, además se validará en cada request que `grant.goKeyId !== signingProvider.keyId` y `grant.goAuthorityId !== service.authorityId`.
8. **¿Cómo se verifica la identidad de la autoridad externa desde el POS?**
   El POS usa URL HTTPS explícita sin auto-discovery y exige coincidencia exacta con un conjunto pineado (`PINNED_ATTESTATION_PUBLIC_KEYS`) de `{ authorityId, keyId, publicKeySpki }`, donde `keyId === "ed25519-spki-" + sha256(spkiDer).slice(0, 16)`. Cualquier sustitución de clave dispara `PUBLIC_KEY_SUBSTITUTION_REJECTED` (`plan-pr02-parameters.mjs`).
9. **¿Cómo se revocan las claves?**
   - **Clave de Attestation Authority**: Deshabilitar/destruir `CryptoKeyVersion` (GCP) o programar eliminación/denegar `KeyPolicy` (AWS KMS) + retirar el `keyId` de la allowlist pineada en el cliente POS.
   - **Clave de GO Authority**: Retirar la clave pública comprometida de `ATTESTATION_GO_PUBLIC_KEY_SPKI` / lista revocada en la Attestation Authority, invalidando inmediatamente cualquier nuevo `GoAuthorizationGrant` emitido con esa clave.
10. **¿Cómo se registra la auditoría?**
    Cada solicitud aprobada o rechazada emite un registro JSON estructurado append-only en el servicio (`ATTESTATION_ISSUED` / `ATTESTATION_REJECTED`) con `{ requestId, attestationId, keyId, goAuthorizationId, clientPrincipal, timestamp, environment, executionScope, resultado, errorCode }`, prohibiendo estrictamente headers, tokens, payloads completos y claves privadas. Simultáneamente, Cloud KMS / AWS KMS registra `Cloud Audit Logs` / `CloudTrail` por cada invocación de firma.

---

## 3. Especificación del `GoAuthorizationGrant` (Diseño v1.1)

```json
{
  "schemaVersion": "1.0",
  "authorizationId": "go-auth-uuid-...",
  "goAuthorityId": "kioskopos-go-governance-v1",
  "goKeyId": "ed25519-spki-...",
  "requestId": "att-req-uuid-...",
  "processId": "proc-uuid-...",
  "executionScope": "PR02_P0_OFFICIAL_EVIDENCE_COLLECTION",
  "environment": "HOMOLOGACION",
  "projectRef": "acoyfwwmhaeruciyedri",
  "commitSha": "<40-hex-commit-sha>",
  "requestSha256": "<64-hex-sha256-of-attestation-request>",
  "issuedAt": "2026-11-13T15:00:00.000Z",
  "expiresAt": "2026-11-13T15:15:00.000Z",
  "singleUse": true,
  "algorithm": "Ed25519",
  "signature": "<128-hex-ed25519-signature-over-canonical-grant>"
}
```

### Reglas Fail-Closed Obligatorias del Grant

| Regla | Condición Verificada | Código de Rechazo |
|---|---|---|
| **Firma criptográfica** | `Ed25519.verify` contra clave GO pineada en servidor de autoridad | `GO_AUTHORIZATION_SIGNATURE_INVALID` (403) |
| **Vinculación total de campos** | Todos los campos (`authorizationId`, `requestId`, `executionScope`, `environment`, `projectRef`, `commitSha`, `processId`, `requestSha256`) deben coincidir exactamente con el request y con los allowlists del entorno (`PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`, `HOMOLOGACION`, `projectRef` esperado) | `GO_AUTHORIZATION_BINDING_MISMATCH` (403) |
| **Integridad documental** | `sha256(canonicalGrantWithoutSignature) === request.goAuthorizationDocumentSha256` | `GO_AUTHORIZATION_DIGEST_MISMATCH` (403) |
| **Vigencia temporal** | `singleUse === true`, TTL máximo <= 15 minutos (`expiresAt - issuedAt <= 900s`), `now >= issuedAt - 30s && now <= expiresAt` | `GO_AUTHORIZATION_EXPIRED` (403) |
| **Uso único durable** | `authorizationId` se registra en la misma transacción atómica distribuida que `requestId` y `requestSha256`; un segundo uso falla cerrado | `GO_AUTHORIZATION_REPLAY_DETECTED` (409) |
| **Anti-autoaprobación** | `grant.goKeyId !== attestationProvider.keyId` y `grant.goAuthorityId !== attestationAuthority.authorityId`; rechazo explícito si no hay clave GO pineada configurada en servidor (`PRODUCTION`/`STAGING`) | `COLLAPSED_AUTHORITIES_REJECTED` / `GO_TRUST_ANCHOR_NOT_CONFIGURED` (500/403) |
| **Flags falsos rechazados** | Solicitudes con `GO_APPROVED`, `forceApproved`, `selfSigned` son rechazadas por allowlist estricta | `UNEXPECTED_REQUEST_FIELD` (400) |
