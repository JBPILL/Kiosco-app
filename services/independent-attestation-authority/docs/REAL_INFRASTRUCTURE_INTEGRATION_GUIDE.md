# Guía de Integración Controlada con Infraestructura Real — Autoridad Independiente de Atestación

> **Estado actual:** La infraestructura externa real **NO** está aprovisionada ni validada todavía (`EXTERNAL_AUTHORITY_DEPLOYED = false`). Toda integración real permanece deshabilitada por defecto mediante `ATTESTATION_REAL_INTEGRATION_ENABLED=false` y exige opt-in explícito.

---

## 1. Principios de Seguridad e Invariantes Obligatorios

1. **Opt-in explícito y cero llamadas de red por defecto:**
   Ninguna importación, prueba unitaria ni arranque por defecto ejecuta tráfico de red contra PostgreSQL remoto, DynamoDB, AWS KMS, GCP KMS o proveedores OIDC externos salvo que se establezca `ATTESTATION_REAL_INTEGRATION_ENABLED=true` de forma explícita.
2. **Aislamiento absoluto respecto del POS/Supabase fiscal:**
   - La base de datos PostgreSQL de anti-replay de la autoridad debe ser **dedicada e independiente**. `assertDedicatedPostgresUrl(...)` bloquea activamente cadenas de conexión que apunten a hosts compartidos de Supabase POS (`*.supabase.co`, `*.supabase.in`, `pooler.supabase.com`).
   - Ninguna credencial ARCA/WSAA, certificado AFIP o `service_role` de Supabase POS debe existir en este servicio (`PROHIBITED_FISCAL_CREDENTIALS`).
3. **Fail-Closed en todos los límites críticos:**
   - Error, timeout o pérdida de salud en almacenamiento distribuido -> `503 SERVICE_ANTI_REPLAY_UNAVAILABLE` (nunca se firma sin reserva previa).
   - Error, timeout, SPKI inconsistente o algoritmo inválido en KMS -> `503 PRODUCTION_KMS_UNAVAILABLE` (marca reserva en estado terminal `FAILED`, nunca hace fallback a clave local).
   - JWKS inalcanzable en OIDC/JWT -> `503 OIDC_JWKS_UNAVAILABLE` y `/readiness` en `503`.
   - Ausencia de TLS mutuo verificado por el socket -> `401 CLIENT_AUTH_MTLS_TLS_REQUIRED` (headers HTTP suplantados son ignorados).

---

## 2. Integración con PostgreSQL Dedicado (RDS / Cloud SQL / PG 16+)

### 2.1 Requisitos de instancia y red
- Instancia PostgreSQL dedicada exclusiva para la autoridad (red privada / VPC peering / Private Service Connect).
- TLS obligatorio en conexiones remotas (`sslmode=verify-full` recomendado con CA raíz explícita en `ATTESTATION_POSTGRES_SSL_CA_PEM`). `sslmode=disable` solo se tolera en `localhost`/`127.0.0.1` para tests controlados locales.
- Esquema definido en [`services/independent-attestation-authority/sql/001_distributed_anti_replay.sql`](../sql/001_distributed_anti_replay.sql).

### 2.2 Variables de entorno
```text
ATTESTATION_REAL_INTEGRATION_ENABLED=true
ATTESTATION_ANTI_REPLAY_MODE=distributed
ATTESTATION_POSTGRES_URL=postgres://<user>:<password>@<dedicated-pg-host>:5432/<dedicated_db>?sslmode=verify-full
ATTESTATION_POSTGRES_TABLE=attestation_distributed_anti_replay
ATTESTATION_POSTGRES_QUERY_TIMEOUT_MS=5000
ATTESTATION_POSTGRES_STATEMENT_TIMEOUT_MS=4000
ATTESTATION_POSTGRES_ISOLATION_LEVEL=READ COMMITTED
ATTESTATION_POSTGRES_POOL_MAX=10
```

### 2.3 Ejecución controlada del harness real de PostgreSQL
Para validar la integración real contra una base PostgreSQL dedicada cuando exista infraestructura aprobada:
```powershell
$env:ATTESTATION_REAL_INTEGRATION_ENABLED = "true"
$env:ATTESTATION_POSTGRES_URL = "postgres://..."
npx vitest run independentAttestationAuthorityRealIntegrationExt07
```
Sin ambas variables explícitas, el bloque `EXT07-REAL-PG-01` permanece omitido (`SKIPPED`) de forma segura.

---

## 3. Integración con AWS DynamoDB (Opcional)

### 3.1 Diseño de tabla y permisos IAM mínimos
- Tabla única con Partition Key `pk` (`STRING`), Billing Mode `PAY_PER_REQUEST`, Point-in-Time Recovery habilitado (`PITR = true`) y Deletion Protection activa.
- Cuatro familias de ítems atómicos dentro de `TransactWriteItems` con `ConditionExpression: attribute_not_exists(pk)` e idempotencia adicional por `ClientRequestToken`:
  - `REQ#<requestId>` (registro autoritativo de estado `RESERVED | CONSUMED | FAILED | EXPIRED`, lease y metadatos)
  - `ATT#<attestationId>`
  - `HASH#<requestSha256>`
  - `AUTH#<authorizationId>`
- TTL opcional en DynamoDB configurable mediante `ATTESTATION_DYNAMODB_RETENTION_TTL_SECONDS` (atributo numérico Unix epoch `ttlEpochSeconds`).
- Permisos IAM mínimos sobre el ARN de la tabla: `dynamodb:ConditionCheckItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:GetItem`, `dynamodb:DescribeTable`.

### 3.2 Dependencias SDK requeridas únicamente al habilitar integración AWS DynamoDB
El microservicio mantiene cero dependencias de runtime por defecto. Al habilitar integración real AWS DynamoDB en un despliegue dedicado, instalar en el runtime del servicio `@aws-sdk/client-dynamodb` y `@aws-sdk/lib-dynamodb` y configurar:
```text
ATTESTATION_REAL_INTEGRATION_ENABLED=true
ATTESTATION_ANTI_REPLAY_MODE=distributed
ATTESTATION_DYNAMODB_TABLE=kioskopos_attestation_anti_replay
ATTESTATION_AWS_REGION=sa-east-1
```

---

## 4. Integración con AWS KMS / GCP Cloud KMS (Ed25519)

### 4.1 Invariantes de clave y verificación post-firma
- Clave asimétrica **Ed25519** generada y custodiada dentro del HSM del KMS (**jamás exportable**).
- El servicio fija por configuración pública:
  - `ATTESTATION_AUTHORITY_ID`
  - `ATTESTATION_KMS_KEY_ID` (`ed25519-spki-<16-hex>`)
  - `ATTESTATION_KMS_KEY_VERSION_NAME` (ARN de AWS KMS o resource name completo de GCP `CryptoKeyVersion`)
  - `ATTESTATION_PUBLIC_KEY_SPKI` / `ATTESTATION_KMS_PUBLIC_KEY_SPKI` (clave pública PEM SPKI)
- Cada firma devuelta por KMS verifica:
  1. Timeout acotado (`ATTESTATION_KMS_TIMEOUT_MS`, por defecto `5000 ms`).
  2. Coincidencia del algoritmo (`ED25519_SHA_512` en AWS KMS / `Ed25519` en GCP) y del identificador de clave devuelto por la respuesta KMS.
  3. Verificación criptográfica Ed25519 contra el SPKI público fijado antes de responder al cliente.
- Si el cliente KMS expone `getPublicKey` o `healthCheck`, `/readiness` y el pre-check de `handleRequest` verifican consistencia SPKI antes de reservar en base de datos.

### 4.2 Dependencias SDK opcionales al desplegar en nube
- AWS KMS: `@aws-sdk/client-kms` + identidad IAM/IRSA con `kms:Sign` y `kms:GetPublicKey` restringidos al ARN de la clave.
- GCP Cloud KMS: `@google-cloud/kms` + Service Account Workload Identity con `roles/cloudkms.signerVerifier` restringido al recurso `CryptoKey`.

---

## 5. Autenticación S2S Real (OIDC/JWT y mTLS)

### 5.1 OIDC / JWT (`ATTESTATION_CLIENT_AUTH_MODE=OIDC_JWT`)
- Algoritmos permitidos exclusivamente: `EdDSA`, `RS256`, `ES256` (`alg=none`, `HS256` y JWKs `kty=oct` se rechazan sin excepciones).
- `ATTESTATION_OIDC_JWKS_URI` exige `https://` salvo pruebas locales explícitas con `allowInsecureLocalhostHttp=true`.
- Valida `iss`, `aud`, `exp`, `nbf`, `iat`, `sub`, `jti`, `client_id` contra allowlist y scopes requeridos (`PR02_P0_OFFICIAL_EVIDENCE_COLLECTION`).
- En caída/timeout de JWKS responde `503 OIDC_JWKS_UNAVAILABLE` y marca `/readiness` como `503 CLIENT_AUTH_VERIFIER_UNHEALTHY`.

### 5.2 mTLS (`ATTESTATION_CLIENT_AUTH_MODE=MTLS`)
- Requiere HTTPS real terminado en el servidor Node (`IndependentAttestationHttpServer` con `ca`, `requestCert: true`, `rejectUnauthorized: true` por defecto) validando `req.socket.authorized` y `req.socket.getPeerCertificate()`.
- Exige coincidencia con `ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON` (fingerprint SHA-256 del certificado, Common Name y/o SAN DNS/URI).
- Rechaza cualquier cabecera HTTP inyectada (`x-mtls-verified`, `x-client-cert-*`) cuando no existe contexto TLS mutuo real en el socket.

---

## 6. Matriz de Prerrequisitos Previos a Habilitar Operación Real (P0 / GO)

1. Aprobar diseño e infraestructura física dedicada (PostgreSQL + KMS + OIDC/mTLS + VPC aislada).
2. Ejecutar suite `EXT07-REAL-PG-01` y smoke tests de KMS/OIDC/mTLS sobre infraestructura real sin tráfico fiscal ARCA ni mutaciones Supabase.
3. Registrar y fijar públicamente `trustedAttestationKeyId`, `trustedAttestationPublicKeySpki` y par separado de `GoAuthorization` authority en la política verificadora.
4. Mantener bloqueados hasta autorización explícita posterior: `P1_IMPORT_ALLOWED = false`, `PV2_ENABLED = false`, `HISTORICAL_042_REEMISSION_FORBIDDEN = true`, `REMOTE_GO = DENIED`.

---

## 7. Estado de Selección Arquitectónica AWS (`AWS-REAL-10`)

Consulte [`AWS_CONTROLLED_INFRASTRUCTURE_PROVISIONING_GUIDE.md`](./AWS_CONTROLLED_INFRASTRUCTURE_PROVISIONING_GUIDE.md) y la definición IaC en [`infra/aws/independent-attestation-authority/`](../../../infra/aws/independent-attestation-authority/).

```text
CLOUD_PROVIDER_TARGET = AWS
AWS_ARCHITECTURE_SELECTED = true
AWS_IAC_IMPLEMENTED = true
AWS_RESOURCES_PROVISIONED = false
AWS_REAL_CONNECTIVITY_TESTED = false
REAL_POSTGRESQL_CONNECTED = false
REAL_KMS_CONNECTED = false
EXTERNAL_AUTHORITY_DEPLOYED = false
PRODUCTION_VALIDATED = false
PRODUCTION_APPROVED = false
```
