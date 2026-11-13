# Independent Attestation Authority Service

> [!CAUTION]
> **Aviso de Seguridad Fundamental**: Una implementación local del servicio **NO** constituye una autoridad externa independiente.
> La ejecución de este servicio en el mismo host, red local o contenedor Docker del runtime del POS no provee la separación de privilegios, cómputo ni custodia de claves exigida para elevar el modelo de confianza a `INDEPENDENT_ATTESTED`.

---

## 1. Arquitectura

El servicio **Independent Attestation Authority** es un microservicio autónomo y desacoplado, diseñado para residir en una cuenta de infraestructura cloud separada (ej. Cloud Run en Google Cloud Platform o AWS Lambda).

```
+---------------------------------------------------------------------------------------------------+
|                        ARQUITECTURA DE LA AUTORIDAD EXTERNA DE ATESTACIÓN                         |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ KioskoPOS Runtime / Colector P0 ]                                                              |
|                  |                                                                                |
|                  | HTTPS (TLS 1.3 WAN)                                                            |
|                  | POST /attestations (Payload Canónico JCS RFC 8785)                             |
|                  v                                                                                |
|  +---------------------------------------------------------------------------------------------+  |
|  |  Independent Attestation Authority Service (Cloud Run / Container)                         |  |
|  |                                                                                             |  |
|  |  1. Escaneo de Secretos Prohibidos                                                          |  |
|  |  2. Validación de Contrato JSON Schema 1.0                                                  |  |
|  |  3. Recálculo Criptográfico de requestSha256                                                |  |
|  |  4. Validación de Política de Alcance (PR02_P0_OFFICIAL_EVIDENCE_COLLECTION / HOMOLOGACION)    |  |
|  |  5. Separación Criptográfica de Autoridades (GO Authority != Attestation Authority)         |  |
|  |  6. Guardia Anti-Replay del Servidor (requestId / requestSha256 / attestationId)            |  |
|  |  7. Construcción Canónica de Respuesta                                                      |  |
|  |  8. Invocación Asimétrica a KMS / HSM Externo                                               |  |
|  |       |                                                                                     |  |
|  |       v                                                                                     |  |
|  |  +---------------------------------------------------------------------------------------+  |  |
|  |  | Cloud KMS / HSM (HSM-backed si plataforma lo acredita, sino software KMS)             |  |  |
|  |  | Clave Privada Ed25519 (No Exportable) -> crypto.sign -> Firma de 64 bytes             |  |  |
|  |  +---------------------------------------------------------------------------------------+  |  |
|  |                                                                                             |  |
|  |  9. Registro de Anti-Replay Durable                                                         |  |
|  |  10. Emisión de Respuesta Firmada 200 OK con Header Cache-Control: no-store                |  |
|  +---------------------------------------------------------------------------------------------+  |
|                  |                                                                                |
|                  v                                                                                |
|  [ Verificación en Cliente vía Clave Pública Pineada Ed25519 (node:crypto) ]                      |
|  [ Consumo Atómico en Registro Anti-Replay Host-Local (HOST_LOCAL_DURABLE_ONE_TIME_USE) ]         |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Modelo de Amenazas

1. **Replay de Solicitudes**: Un adversario intenta presentar el mismo paquete de evidencia dos veces.
   - *Control*: El servicio valida unicidad de `requestId` y `requestSha256` en `ServiceAntiReplayGuard`.
2. **Alteración de Evidencia en Tránsito (Tampering)**: Se alteran hashes de artefactos SOAP o metadatos de proceso.
   - *Control*: Recálculo canónico de `requestSha256`; si difiere en un bit, se rechaza inmediatamente (`ATTESTATION_REQUEST_HASH_MISMATCH`).
3. **Fuga o Exposición de Clave Privada**:
   - *Control*: `ProductionKmsSigningProvider` no almacena claves privadas en memoria ni en disco; delega la operación de firma al HSM.
4. **Colapso de Autoridades (GO Authority == Attestation Authority)**:
   - *Control*: Validación estricta que impide que la misma clave o identidad de gobernanza firme atestaciones técnicas (`COLLAPSED_AUTHORITIES_REJECTED`).
5. **Inyección de Secretos Fiscales**:
   - *Control*: Escaneo de tokens de acceso, certificados, claves de AFIP/ARCA o Supabase. Si se detecta un patrón prohibido, la solicitud se aborta con error 400.
6. **Elevación No Autorizada a Producción o P1**:
   - *Control*: La política restringe estrictamente `executionScope === 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'` y `environment === 'HOMOLOGACION'`. Cualquier intento de atestar `PRODUCTION` o habilitar `P1_IMPORT_ALLOWED` es rechazado con error 403.

---

## 3. Trust Boundaries

- **Frontera Externa**: Comunicación exclusivamente a través de WAN sobre TLS 1.3 con certificados X.509 validados.
- **Frontera de Datos**: Cero acceso a la base de datos PostgreSQL/Supabase de KioskoPOS ni a las credenciales fiscales ARCA.
- **Frontera Criptográfica**: Las operaciones de firma ocurren dentro del límite físico del hardware HSM del proveedor KMS.

---

## 4. Gestión de Claves

- **Algoritmo**: Ed25519 (PureEdDSA sobre Curve25519, RFC 8032).
- **Custodia**: Clave generada y retenida en Cloud KMS sin exportación al runtime. Debe distinguirse explícitamente según la verificación real de la plataforma:
  - **HSM-backed**: Solo cuando el proveedor cloud acredite `ProtectionLevel: HSM` (ej. CloudHSM / Cloud KMS HSM con atestación verificada).
  - **SOFTWARE-backed**: Cuando el proveedor resguarda la clave en KMS administrado por software; no se debe declarar garantía física HSM/FIPS sin evidencia de plataforma.
- **Flags Criptográficos**: `SIGN_VERIFY_ONLY`, `EXTRACTABLE = FALSE`.
- **Acceso Administrativo**: Exclusivo para Service Accounts con rol mínimo `roles/cloudkms.signerVerifier`.
- **Guía Completa**: Ver [CLOUD_DEPLOYMENT_GUIDE.md](./docs/CLOUD_DEPLOYMENT_GUIDE.md).

---

## 5. Rotación de Claves

- **Cadencia**: Programada cada 180 días.
- **Procedimiento**:
  1. Generar nueva versión de clave en Cloud KMS (`v2`).
  2. Extraer clave pública SPKI PEM y calcular nuevo `keyId`.
  3. Desplegar actualización en el cliente POS incorporando el nuevo `keyId` en su catálogo pineado.
  4. Conmutar versión activa en el microservicio de atestación.
  5. Deshabilitar operaciones de firma en la versión anterior (`v1`), manteniendo capacidad de verificación histórica.

---

## 6. Revocación de Emergencia

En caso de sospecha de compromiso de credenciales IAM:
1. Deshabilitar inmediatamente la versión de clave en Cloud KMS (`DestroyCryptoKeyVersion` o deshabilitar permisos IAM).
2. Agregar el `keyId` a la lista de exclusión en caliente del cliente POS.
3. El cliente POS fallará en modo cerrado (`KEY_REVOKED_FAIL_CLOSED`), impidiendo la aceptación de cualquier atestación firmada por la clave comprometida.

---

## 7. Formato de `keyId`

El `keyId` es determinístico y se calcula canónicamente a partir de la representación binaria DER SubjectPublicKeyInfo (SPKI) de la clave pública:

```text
keyId = "ed25519-spki-" + sha256(spkiDerBytes).slice(0, 16)
```

Cualquier discrepancia entre el `keyId` reportado y la huella real de la clave pública resulta en `PUBLIC_KEY_SUBSTITUTION_REJECTED`.

---

## 8. Disaster Recovery

- **Multi-Región Cloud KMS**: Las claves de firma se replican en configuraciones multi-región del proveedor cloud (ej. `nam4` o `eur5`).
- **Redundancia Serverless**: El servicio ejecuta sobre infraestructura serverless sin estado (stateless container), con escalado automático multi-zona.

---

## 9. Procedimiento de Despliegue

1. Configurar las variables públicas y de entorno según [`.env.example`](./.env.example) (cero secretos en repositorio).
2. Construir la imagen Docker aislada desde el contexto exclusivo del servicio (`docker build ./services/independent-attestation-authority` usando [`Dockerfile`](./Dockerfile)): no copia código POS, ni `node_modules` de frontend, ni scripts fiscales.
3. Firmar la imagen de contenedor (Cosign / Sigstore).
4. Desplegar en Cloud Run / AWS ECS siguiendo [CLOUD_DEPLOYMENT_GUIDE.md](./docs/CLOUD_DEPLOYMENT_GUIDE.md) con terminación TLS 1.3 obligatoria.
5. Verificar liveness en `GET /health` (`status: "HEALTHY"`) y readiness operativa en `GET /readiness` (`ready: true` solo cuando KMS y almacenamiento anti-replay están activos).

---

## 10. Rollback

Si una nueva versión del microservicio falla:
- Revertir el tráfico hacia la revisión anterior en el plano de control serverless.
- Cero impacto en el runtime POS, ya que el verificador en cliente opera fail-closed y rechaza firmas corruptas o caídas de endpoint.

---

## 11. Procedimiento de Verificación

Para certificar que una instancia desplegada es operativa:
1. `GET /health` responde 200 con `status: "HEALTHY"` (liveness, sin exponer secretos).
2. `GET /readiness` responde 200 con `ready: true` solo cuando el firmante y el backend anti-replay cumplen los invariantes del entorno (`PRODUCTION`/`STAGING` rechazan `TEST_SIGNER` o KMS sin cliente con `503 Service Unavailable`, `ready: false`).
3. Enviar solicitud sintética de prueba a `POST /attestations` (bajo HTTPS y autenticación de cliente configurada).
4. Validar que la respuesta contenga `verdict: "ATTESTED_VALID"`.
5. Verificar la firma con `node:crypto.verify(null, canonicalPayload, publicKey, signature) === true`.

---

## 12. Qué debe ocurrir si KMS falla

Si el proveedor Cloud KMS no está disponible, experimenta latencia o retorna un error 5xx:
- El microservicio captura el fallo y responde `500 Internal Server Error` con código `PRODUCTION_KMS_UNAVAILABLE`.
- El servicio **NO** intenta utilizar claves de contingencia locales en software.
- El cliente POS captura el error de transporte o HTTP 500 y **aborta la ejecución en modo cerrado (fail-closed)**. Cero evidencia es autorizada.

---

## 13. Qué debe ocurrir si la base anti-replay falla

Si el backend de almacenamiento de anti-replay no puede ser consultado o persistido:
- El microservicio **rechaza firmar la solicitud** y responde con `500 Internal Server Error` (`SERVICE_ANTI_REPLAY_STORAGE_ERROR`).
- **Bajo ninguna circunstancia** se autoriza la firma ignorando la verificación anti-replay.
