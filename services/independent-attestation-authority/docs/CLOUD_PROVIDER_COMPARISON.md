# Comparación de Proveedores Cloud y Estrategia KMS/HSM — Independent Attestation Authority

> [!IMPORTANT]
> Documento de arquitectura y decisión técnica correspondiente a **EXT-REAL-03** (fase **LOCAL-ONLY**).
> No se ha aprovisionado ningún proyecto, cuenta, red, base de datos ni clave KMS/HSM real.
> `CLOUD_RESOURCES_CREATED = 0`, `KMS_RESOURCES_CREATED = 0`, `AUTHORITY_REAL_WORLD_AVAILABLE = false`.

---

## 1. Criterios Técnicos de Evaluación

Para cumplir el contrato criptográfico vigente del servicio (`algorithm: "Ed25519"`, clave no exportable, `Public Key Pinning` por huella `ed25519-spki-<16-hex>` y operación fail-closed multi-instancia), cada proveedor se evalúa bajo:

1. **Soporte nativo de Ed25519 (`ECDSA/EdDSA PureEdDSA`)** en el KMS administrado vs necesidad de HSM dedicado/servicio externo.
2. **Custodia no exportable** (clave nunca legible desde disco ni memoria del contenedor).
3. **Nivel de protección acreditado**: distinción estricta entre clave en **Software KMS** vs **HSM FIPS 140-2/140-3 Level 3**.
4. **Identidad de servicio y autenticación S2S** (OIDC Workload Identity / IAM / mTLS).
5. **Terminación TLS 1.3 y mTLS en borde**.
6. **Persistencia transaccional ACID para anti-replay distribuido**.
7. **Auditabilidad criptográfica (Cloud Audit Logs / CloudTrail)**, rotación/revocación, costo y complejidad.
8. **Estado del adaptador en código actual**: `ProductionKmsSigningProvider` define el contrato `kmsClient.sign({ keyVersionName, data, algorithm: 'Ed25519' })`, pero **ningún SDK cloud concreto está implementado ni conectado todavía**.

---

## 2. Evaluación por Proveedor

### 2.1 Google Cloud Platform (GCP)

| Dimensión | Evaluación Verificada | Estado / Clasificación |
|---|---|---|
| **Cómputo** | **Cloud Run (Gen2)** ejecutando el `Dockerfile` no-root (`UID 10001`), `--no-allow-unauthenticated`, `min-instances`/`max-instances` configurables, shutdown por `SIGTERM`. | **Disponible (sin provisionar)** |
| **KMS / Firma Ed25519** | **Cloud KMS** soporta nativamente el algoritmo asimétrico `EC_SIGN_ED25519` (`ec-sign-ed25519` en `gcloud`, `purpose=ASYMMETRIC_SIGN`), modo PureEdDSA sobre Curve25519 recibiendo el payload crudo (no pre-hasheado). | **Firma Ed25519 nativa / Clave no exportable** |
| **HSM vs Software KMS** | Nivel `SOFTWARE` confirmado para `EC_SIGN_ED25519`. La disponibilidad de `--protection-level=hsm` / `hsm-single-tenant` para `EC_SIGN_ED25519` depende de la generación de HSM y la región destino; **debe verificarse en la región objetivo antes de elegir nivel HSM**. | `SOFTWARE`: Confirmado / `HSM`: **`UNVERIFIED` hasta validación regional** |
| **Adaptador en código** | `ProductionKmsSigningProvider` requiere construir el adaptador `@google-cloud/kms` `KeyManagementServiceClient.asymmetricSign` dentro de `services/independent-attestation-authority/`. | **Adaptador no implementado** |
| **Verificación desde POS** | Pública estándar SPKI Ed25519 verificada localmente con `node:crypto` (`verifyAttestationResponse`); cero SDK GCP requerido en POS. | **Implementado en cliente** |
| **Identidad y Auth S2S** | Service Account dedicada (`sa-attestation-authority`) + `roles/cloudkms.signerVerifier` restringido al recurso; invocación S2S mediante OIDC IAM (`roles/run.invoker`) o Cloud Load Balancing + mTLS. | **Requiere `clientAuthVerifier` OIDC/mTLS conectado en `server.mjs`** |
| **TLS y mTLS** | Google Front End / Cloud Run provee TLS 1.3 gestionado (`X-Forwarded-Proto: https`). Para **mTLS** estricto se requiere External Application Load Balancer con TrustConfig. | **TLS gestionado / mTLS requiere ALB** |
| **Anti-replay Distribuido** | **Cloud SQL (PostgreSQL 16/17)** con restricciones `UNIQUE` + transacciones ACID (o Firestore en modo nativo con transacciones multi-documento). | **Diseño listo; adaptador DB pendiente** |
| **Auditoría y Rotación** | Cloud Audit Logs (Data Access logs en `AsymmetricSign`), versionado de `CryptoKeyVersion` y deshabilitación/destrucción de versiones. | **Soportado por plataforma** |
| **Secret Manager** | Solo para credenciales de conexión DB si no se usa IAM DB Auth, jamás para claves privadas de firma. | **Uso mínimo acotado** |

### 2.2 Amazon Web Services (AWS)

| Dimensión | Evaluación Verificada | Estado / Clasificación |
|---|---|---|
| **Cómputo** | **AWS ECS Fargate** (o App Runner) en VPC aislada, Task Definition con root filesystem read-only + volumen/tmpfs efímero y IAM Task Role dedicado. | **Disponible (sin provisionar)** |
| **KMS / Firma Ed25519** | **AWS KMS** soporta nativamente la especificación de clave asimétrica **`ECC_NIST_EDWARDS25519`** (`KeyUsage: SIGN_VERIFY`) con algoritmo **`ED25519_SHA_512`** y `MessageType: RAW` (o `ED25519_PH_SHA_512` con `DIGEST`). Clave no exportable por API. | **Firma Ed25519 nativa / Clave no exportable** |
| **HSM vs Software KMS** | AWS KMS genera y protege las claves dentro de HSMs validados por AWS KMS; si se utiliza un **CloudHSM Custom Key Store** en modo FIPS estricto, el soporte de `ECC_NIST_EDWARDS25519` puede estar restringido por el perfil FIPS activo del cluster (`UNVERIFIED` para clúster específico hasta validar firmware). | **KMS nativo HSM-managed soportado / CloudHSM Custom Key Store FIPS: `UNVERIFIED`** |
| **Adaptador en código** | Requiere implementar adaptador `@aws-sdk/client-kms` (`SignCommand` con `SigningAlgorithm: 'ED25519_SHA_512'`, `MessageType: 'RAW'`) aislado dentro del servicio. | **Adaptador no implementado** |
| **Verificación desde POS** | Pública SPKI Ed25519 estándar verificada offline con `node:crypto`. Cero dependencia AWS en el POS. | **Implementado en cliente** |
| **Identidad y Auth S2S** | Cuenta AWS separada con SCPs + IAM Task Role limitado a `kms:Sign` y `kms:GetPublicKey` sobre el `KeyArn` específico. Auth S2S vía ALB mTLS (Trust Store) o API Gateway con IAM SigV4 / JWT authorizer. | **Requiere `clientAuthVerifier` en servicio o gateway** |
| **TLS y mTLS** | **ALB** o **API Gateway** con política TLS 1.3 (`ELBSecurityPolicy-TLS13-1-2-2021-06`) y soporte nativo de **mTLS en ALB / API Gateway**. | **Soportado nativamente** |
| **Anti-replay Distribuido** | **Amazon DynamoDB** con `TransactWriteItems` + expresiones condicionales `attribute_not_exists(pk)` (unicidad atómica de `requestId`, `requestSha256` y `attestationId`), o Aurora PostgreSQL. | **Diseño listo; adaptador DB pendiente** |
| **Auditoría y Rotación** | **AWS CloudTrail** registrando cada llamada `kms:Sign` con identidad IAM origen. Rotación mediante nuevo CMK/alias y retiro gradual en `KeyId` pineado del POS. *(Nota: AWS KMS asimétrico no hace rotación automática in-place de clave privada; requiere crear nueva KMS Key).* | **Soportado con rotación explícita por nueva clave** |

### 2.3 Microsoft Azure

| Dimensión | Evaluación Verificada | Estado / Clasificación |
|---|---|---|
| **Cómputo** | **Azure Container Apps** o AKS aislado con Managed Identity. | **Disponible (sin provisionar)** |
| **KMS / Firma Ed25519** | **Azure Key Vault y Azure Key Vault Managed HSM NO soportan nativamente claves Ed25519 (`EdDSA`)** para la operación `SIGN` (únicamente soportan `RSA` y curvas NIST/Koblitz `P-256`, `P-256K`, `P-384`, `P-521`). Almacenar una clave privada Ed25519 en Key Vault Secrets requeriría leerla en memoria del contenedor (clave exportable), violando el invariante de custodia. Solo **Azure Dedicated HSM** (appliances Thales Luna dedicados fuera del plano Key Vault REST) ofrece soporte Ed25519 vía PKCS#11/firmware especializado. | **No soportado nativamente en Key Vault / Managed HSM (requeriría clave exportable o Dedicated HSM de alto costo)** |
| **Verificación desde POS** | Si se cambiara de algoritmo a `P-256` (`ES256`), obligaría a modificar todo el contrato criptográfico ya validado en POS y colector P0. | **Incompatibilidad con contrato Ed25519 vigente** |
| **Anti-replay Distribuido** | Azure Database for PostgreSQL Flexible Server o Cosmos DB transaccional. | **Soportado** |
| **Riesgos y Complejidad** | Muy alto costo fijo en Dedicated HSM o ruptura del invariante de clave no exportable si se usa Key Vault Secrets. | **Descartada para MVP / Fase inicial** |

---

## 3. Matriz Comparativa Consolidada

| Criterio | Google Cloud (Cloud Run + Cloud KMS) | AWS (ECS Fargate / App Runner + AWS KMS) | Azure (Container Apps + Key Vault / HSM) |
|---|---|---|---|
| **Ed25519 nativo no exportable en KMS** | **SÍ** (`EC_SIGN_ED25519`, PureEdDSA) | **SÍ** (`ECC_NIST_EDWARDS25519`, `ED25519_SHA_512`) | **NO** en Key Vault ni Managed HSM (`Dedicated HSM` requerido) |
| **HSM real acreditado para Ed25519** | `SOFTWARE` confirmado; `HSM` **`UNVERIFIED` por región** | KMS HSM-managed soportado; CloudHSM modo FIPS **`UNVERIFIED`** | Solo Dedicated HSM (Thales Luna, alto costo fijo) |
| **mTLS nativo sencillo en borde** | Requiere Cloud External ALB + TrustConfig sobre Cloud Run | Nativo en **ALB** y **API Gateway** | Nativo en Azure Front Door / App Gateway |
| **Auth S2S nativa serverless** | OIDC IAM Token nativa en Cloud Run | IAM SigV4 / API Gateway / ALB mTLS | Managed Identity + Entra ID |
| **Anti-replay atómico sin servidor DB permanente** | Firestore ACID (pago por uso) o Cloud SQL PostgreSQL (costo base) | **DynamoDB** `TransactWriteItems` (serverless, pago por uso, ACID multi-item) | Cosmos DB / Azure SQL |
| **Rotación Ed25519** | Nueva `CryptoKeyVersion` en el mismo `CryptoKey` | Nuevo `KeyId` asimétrico + actualización de Alias/env | No aplicable en Key Vault nativo |
| **Dependencia / Lock-in del adaptador** | SDK `@google-cloud/kms` detrás de `ProductionKmsSigningProvider` | SDK `@aws-sdk/client-kms` detrás de `ProductionKmsSigningProvider` | Alto lock-in si PKCS#11 Thales o cambio de algoritmo a P-256 |
| **Complejidad operativa inicial** | **Baja** (si IAM OIDC basta; media con ALB+mTLS+Cloud SQL) | **Media** (ECS + ALB + KMS + DynamoDB) | **Alta** (por limitación Ed25519 en Key Vault) |

---

## 4. Estimación Aproximada de Costos Operativos

### Supuestos Explícitos de Dimensionamiento

Los valores siguientes son órdenes de magnitud de lista pública referencial (no presupuestos contractuales ni precios regionales exactos verificados para Argentina/USD finales):
- Tráfico bajo/esporádico de control y gobernanza fiscal: `< 5.000` solicitudes/mes (`POST /attestations` + `GET /readiness`/`/health`).
- 1 instancia activa mínima (`min-instances = 0` o `1`, 0.25–0.5 vCPU, 256–512 MB RAM).
- 1 clave asimétrica activa Ed25519 + logs de auditoría retención mínima.

| Concepto | GCP (Cloud Run + Cloud KMS + Firestore) | AWS (ECS Fargate / Lambda + AWS KMS + DynamoDB) | Azure (Dedicated HSM + Container Apps) |
|---|---|---|---|
| **Cómputo serverless** | USD 0–15 / mes (`min-instances=0` vs `1`) | USD 0–15 / mes (Lambda prácticamente libre; Fargate 0.25 vCPU ~USD 9/mes) | USD 0–15 / mes |
| **KMS Clave Ed25519** | ~USD 0.06–1 / versión clave / mes + ops mínimas (HSM tier puede tener costo mínimo por versión) | ~USD 1 / CMK / mes + USD 0.03 / 10k ops | **Dedicated HSM**: miles de USD/mes por appliance dedicado |
| **Anti-replay transaccional** | Firestore: ~USD 0–2 / mes a bajo volumen (Cloud SQL micro: ~USD 10–25 / mes) | DynamoDB On-Demand: ~USD 0–2 / mes a bajo volumen | Postgres / Cosmos DB: ~USD 15–30 / mes |
| **Balanceador / mTLS opcional** | Cloud External ALB + Cloud Armor: ~USD 18–30+ / mes fijo si se exige mTLS en ALB | ALB (~USD 16–22 / mes) o API Gateway HTTP/REST (~USD 1–4 / mes con mTLS custom domain) | Application Gateway WAF: ~USD 20–150+ / mes |
| **Orden de magnitud total estimado (sin ALB mTLS dedicado / con mTLS)** | **~USD 5–20 / mes** (OIDC + Firestore) / **~USD 30–55 / mes** (ALB mTLS + Cloud SQL) | **~USD 5–20 / mes** (Lambda/API GW + DynamoDB) / **~USD 25–45 / mes** (ECS + ALB mTLS + DynamoDB) | **Inviable por costo/compatibilidad Ed25519** |

---

## 5. Recomendación Técnica Condicionada

No se elige proveedor de forma unilateral en esta fase; la decisión final pertenece al responsable humano / infraestructura en función de dos caminos técnicos sólidos:

1. **Opción 1 — AWS (ECS Fargate o Lambda + AWS KMS `ECC_NIST_EDWARDS25519` + DynamoDB `TransactWriteItems` + API Gateway/ALB mTLS)**:
   - *Cuándo elegirla*: Si se prioriza **soporte Ed25519 asimétrico no exportable nativo en KMS administrado** junto con **anti-replay atómico multi-ítem serverless sin administrar servidores SQL (`DynamoDB TransactWriteItems`)** y **mTLS nativo** en API Gateway / ALB a bajo costo fijo.
2. **Opción 2 — Google Cloud (Cloud Run + Cloud KMS `EC_SIGN_ED25519` + Cloud SQL PostgreSQL o Firestore + OIDC IAM)**:
   - *Cuándo elegirla*: Si se prefiere operar sobre GCP aprovechando el modelo estándar de versiones de clave (`CryptoKeyVersion`) de `Cloud KMS EC_SIGN_ED25519` y OIDC IAM nativo en Cloud Run; condicionada a: (a) verificar previamente en `EXT-REAL-04` si la región requerida admite `--protection-level=hsm` para `EC_SIGN_ED25519` o si se acepta explícitamente `SOFTWARE-backed KMS`, y (b) definir si el anti-replay irá en Cloud SQL (`UNIQUE` SQL) o Firestore.
3. **Azure**: **Descartada** salvo que el proyecto decida migrar el contrato criptográfico fuera de Ed25519 hacia `ECDSA P-256` o costear un `Dedicated HSM`.

> **Brecha común obligatoria en ambos candidatos**: El código actual de `ProductionKmsSigningProvider`, `ServiceAntiReplayGuard` y `createConfiguredAuthorityFromEnv` está listo como frontera fail-closed, pero **el adaptador real de SDK KMS (`@aws-sdk/client-kms` o `@google-cloud/kms`), el backend distribuido de anti-replay y el `clientAuthVerifier` OIDC/mTLS deberán implementarse únicamente en el bloque posterior aprobado tras elegir plataforma**.
