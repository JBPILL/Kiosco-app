# Guía de Provisionamiento y Despliegue Cloud — Independent Attestation Authority

> [!IMPORTANT]
> Este documento describe el **diseño reproducible** para aprovisionar la autoridad en infraestructura cloud real en una fase posterior.
> Durante `EXT-REAL-02`, **NO se ha desplegado ningún recurso cloud**, **NO existe KMS configurado**, y `AUTHORITY_REAL_WORLD_AVAILABLE` permanece en `false`.
> Una instancia ejecutada localmente o sin backend KMS/HSM ni separación de infraestructura **NO constituye una autoridad externa independiente**.

---

## 1. Separación de Proyectos / Cuentas (Requisito Mandatorio)

Para garantizar independencia real de infraestructura, identidades y custodia:

| Componente | Proyecto / Cuenta Aislada | Propiedad y Acceso |
|---|---|---|
| **KioskoPOS Runtime & Supabase** | Proyecto POS (`kioskopos-prod`) | Desarrolladores POS, credenciales fiscales ARCA, base de datos comercial |
| **GO Authority (Humana)** | Custodia Offline / Hardware Key separada | Propietario / Responsable de Gobernanza (clave privada Ed25519 independiente) |
| **Independent Attestation Authority** | Proyecto Dedicado (`kioskopos-attestation-authority`) | Equipo de Seguridad / Plataforma únicamente; **cero** acceso a Supabase o certificados ARCA |

---

## 2. Opción A — Google Cloud Run + Cloud KMS (Recomendada)

### Recursos Requeridos
1. **Proyecto GCP dedicado**: aislado del proyecto POS (`kioskopos-attestation-authority`).
2. **Artifact Registry**: repositorio privado para imágenes firmadas del contenedor construido desde `services/independent-attestation-authority/Dockerfile`.
3. **Cloud KMS KeyRing + CryptoKey Asimétrica**:
   - Algoritmo requerido: `EC_SIGN_ED25519` (Ed25519 puro, verificar soporte regional vigente en GCP KMS; o curva compatible únicamente si el contrato del cliente se actualiza explícitamente).
   - **Nivel de Protección (`ProtectionLevel`)**:
     - `HSM-backed` (`--protection-level=hsm`): La clave reside en módulos FIPS 140-2 Level 3 dedicados de Google Cloud. Debe verificarse en los metadatos del `CryptoKeyVersion` (`protectionLevel === "HSM"` y existencia de `attestation` del HSM).
     - `SOFTWARE-backed` (`--protection-level=software`): La clave reside cifrada en software KMS sin módulo HSM dedicado. **No debe afirmarse garantía HSM/FIPS física cuando el recurso sea software-backed.**
4. **Cloud Run Service (Gen2)**:
   - Ejecución como usuario no-root (`UID 10001`, definido en `Dockerfile`).
   - `ATTESTATION_TRUST_PROXY_HTTPS=true` (terminación TLS manejada por Google Front End con mínimo TLS 1.2/1.3).
   - Sin montaje de claves privadas; solo variables públicas e identificadores de recurso.
5. **Cloud Armor + Ingress Control**: Restricción de IP/mTLS/IAM y rate limiting en borde.

### Permisos IAM Mínimos (Principio de Mínimo Privilegio)
- **Identidad de Runtime** (`sa-attestation-runtime@kioskopos-attestation-authority.iam.gserviceaccount.com`):
  - `roles/cloudkms.signerVerifier` limitado exclusivamente mediante IAM Condition al `CryptoKey` de atestación específico.
  - `roles/logging.logWriter` para logs estructurados sin secretos.
  - **PROHIBIDO**: `roles/cloudkms.admin`, acceso a `kioskopos-prod`, acceso a secretos ARCA/Supabase.
- **Identidad Autorizada a Invocar** (`sa-pos-p0-collector`):
  - Si se usa Cloud Run IAM Invoker + OIDC Workload Identity: permiso exclusivo `roles/run.invoker`.
  - Nunca otorgar `cloudkms.*` al runtime POS.

---

## 3. Opción B — AWS ECS Fargate / Lambda + AWS KMS

### Recursos Requeridos
1. **Cuenta AWS dedicada** (bajo AWS Organizations con SCP impidiendo acceso cruzado a datos POS/ARCA).
2. **AWS KMS Asimétrico o CloudHSM**:
   - Nota crítica: Si AWS KMS estándar no ofrece firma Ed25519 nativa en la región objetivo, utilizar **AWS CloudHSM** (`HSM-backed`, FIPS 140-3 Level 3) o verificar previamente compatibilidad de curva antes del provisioning.
   - Distinguir explícitamente en auditoría si el proveedor utilizado es `HSM-backed` (CloudHSM) o KMS administrado.
3. **IAM Execution Role & Key Policy**:
   - `kms:Sign` y `kms:GetPublicKey` restringidos exclusivamente al ARN del rol del contenedor de atestación.
   - Prohibición explícita de `kms:ScheduleKeyDeletion` o `kms:PutKeyPolicy` al rol de runtime.
4. **Application Load Balancer (ALB) / API Gateway**: Terminación TLS 1.3 mínima con política `ELBSecurityPolicy-TLS13-1-2-2021-06` y forwarding de `X-Forwarded-Proto: https`.

---

## 4. Ciclo de Claves, Rotación, Revocación y Public Key Pinning

1. **Derivación del `keyId`**:
   - Calculado de forma determinística desde los bytes DER SubjectPublicKeyInfo (SPKI):
     `ed25519-spki-<primeros 16 hex SHA-256(spkiDer)>`.
2. **Rotación Programada (180 días)**:
   - Crear nueva `CryptoKeyVersion` (`v2`) en Cloud KMS en el proyecto de autoridad.
   - Exportar únicamente la clave pública SPKI PEM de `v2` y calcular su `keyId`.
   - Actualizar el catálogo pineado en el cliente POS para aceptar transitoriamente `[v1, v2]`.
   - Actualizar `ATTESTATION_KMS_KEY_VERSION`, `ATTESTATION_PUBLIC_KEY_ID` y `ATTESTATION_PUBLIC_KEY_SPKI` en el despliegue de la autoridad.
   - Deshabilitar (`DISABLED`) la versión `v1` en KMS tras completar la ventana de transición.
3. **Revocación de Emergencia**:
   - Deshabilitar o programar destrucción de la `CryptoKeyVersion` comprometida en KMS.
   - Remover el `keyId` revocado de `allowedKeyIds` / `PINNED_ATTESTATION_PUBLIC_KEYS` en el cliente POS.
   - El cliente fallará cerrado (`ATTESTATION_KEY_ID_MISMATCH` / `PUBLIC_KEY_SUBSTITUTION_REJECTED`) ante cualquier firma residual de la clave revocada.

---

## 5. Red, TLS 1.3 y Autenticación del Cliente

### Política de Transporte
- **TLS Mínimo**: TLS 1.3 obligatorio en terminación directa (`https.createServer({ minVersion: 'TLSv1.3' })`) o en Load Balancer/Ingress gestionado.
- **Rechazo de HTTP plano**:
  - `IndependentAttestationHttpServer` prohíbe arrancar en `STAGING` o `PRODUCTION` sin `requireHttps: true` o `trustProxyHttps: true`.
  - Con `trustProxyHttps: true`, cualquier request que llegue sin `x-forwarded-proto: https` es rechazado con HTTP `403 INSECURE_TRANSPORT_REJECTED`.
- **Headers de Seguridad**: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- **Límites**: Tamaño máximo de cuerpo `1 MB` (`413 PAYLOAD_TOO_LARGE`), `requestTimeout=10s`, `headersTimeout=5s`, rate limiting en WAF/Cloud Armor (ej. 10 req/min por IP de origen autorizada).

### Autenticación del Cliente (`PR02 Runtime -> Attestation Authority`)
- **Mecanismos Aprobados**:
  1. **mTLS (Mutual TLS)**: Certificados X.509 de cliente emitidos por CA privada dedicada, validados por el ingress/proxy y verificados por `clientAuthVerifier` (nunca reutilizar certificados fiscales de AFIP/ARCA).
  2. **Signed Request Authentication / Workload Identity**: Token OIDC efímero firmado por el proveedor de identidad del runner/host o firma asimétrica dedicada del cliente de transporte vinculada al digest de solicitud.
- **Mecanismo Rechazado**:
  - Tokens estáticos `Authorization: Bearer <secret>` sin modelo de custodia, expiración corta ni rotación. El servicio los rechaza explícitamente en `STAGING`/`PRODUCTION` con `UNMODELED_BEARER_TOKEN_REJECTED`.
- **Aislamiento de Credenciales Fiscales**: Cualquier header que transporte tokens WSAA, CMS, certificados AFIP o claves Supabase (`x-wsaa-token`, `x-arca-cms`, `x-supabase-key`) dispara rechazo inmediato `403 PROHIBITED_FISCAL_CREDENTIALS_IN_HEADERS`.

---

## 6. Evolución de Anti-Replay: Host-Local vs Distribuido

| Modo (`storageType`) | Nivel Reportado Honestamente | Apto para Autoscaling / Multi-Nodo |
|---|---|---|
| `memory` | `HOST_LOCAL_SERVICE_IN_MEMORY_ONE_TIME_USE` | **NO**. Prohibido en `STAGING` y `PRODUCTION`. |
| `file` | `HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE` | **NO** (solo instancia única con volumen persistente atómico). |
| `distributed` | `DISTRIBUTED_MULTI_NODE_ONE_TIME_USE` | **SÍ**, únicamente cuando se inyecta un `distributedStore` real transaccional. |

### Opciones Recomendadas para Backend Distribuido Real
El servicio define la interfaz asincrónica `distributedStore` (`hasRequestId`, `hasRequestHash`, `hasAttestationId`, `recordOnce`, `isHealthy`) lista para conectar en fase futura con:
1. **Cloud SQL (PostgreSQL)**: Tabla `attestation_anti_replay` con restricciones `PRIMARY KEY (request_id)` y `UNIQUE (request_sha256)`, `UNIQUE (attestation_id)` mediante `INSERT ... ON CONFLICT DO NOTHING`.
2. **Firestore**: Transacciones ACID creando documentos inmutables por clave `req_<requestId>` y `hash_<requestSha256>` en una sola transacción.
3. **AWS DynamoDB**: `TransactWriteItems` con `attribute_not_exists(pk)` garantizando atomicidad multi-región.
4. **Redis Persistente (AOF `appendfsync always` + Lua script atómico)**: Solo si la persistencia sincrónica está habilitada para evitar pérdida ante reinicio inmediato.

> Si el almacén anti-replay falla o pierde conectividad, el servicio retorna `500` / `503` y **jamás firma** (comportamiento fail-closed absoluto).
