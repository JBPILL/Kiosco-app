# AWS Controlled Infrastructure Provisioning Guide (`AWS-REAL-10`)

> [!IMPORTANT]
> **Alcance de esta guía**: La fase `AWS-REAL-10` prepara exclusivamente la Infraestructura como Código (IaC Terraform/OpenTofu), las validaciones estáticas de seguridad (`AWS10-01` a `AWS10-15`) y el preflight opt-in sin mutaciones. **Ningún recurso AWS real ha sido provisionado ni autorizado para `apply` en esta fase.**

---

## 1. Arquitectura Seleccionada (`CLOUD_PROVIDER_TARGET = AWS`)

La arquitectura inicial seleccionada minimiza deliberadamente la superficie de ataque, el número de servicios distribuidos y la incertidumbre operacional:

```text
Independent Attestation Authority
            │
            ├── AWS RDS PostgreSQL 16 dedicado
            │       └── Anti-replay durable (aislado físicamente de POS / Supabase)
            │
            ├── AWS KMS
            │       ├── Clave asimétrica Ed25519 (ECC_NIST_EDWARDS25519 / SIGN_VERIFY)
            │       └── Clave simétrica separada (SYMMETRIC_DEFAULT / ENCRYPT_DECRYPT) para RDS y Secrets Manager
            │
            └── AWS Secrets Manager
                    └── Credenciales maestras RDS gestionadas automáticamente (manage_master_user_password = true)
```

### Decisiones de Alcance Inicial

- **NO incorpora DynamoDB** en esta primera provisión objetivo (`DYNAMODB_INCLUDED_IN_INITIAL_TARGET = false`).
- **NO despliega todavía OIDC real** (`OIDC_DEPLOYED_IN_INITIAL_TARGET = false`).
- **NO despliega todavía mTLS real** (`MTLS_DEPLOYED_IN_INITIAL_TARGET = false`).
- **NO crea un endpoint público** para la autoridad (`PUBLIC_ENDPOINT_DEPLOYED = false`).

---

## 2. Lo que esta Fase Prepara

1. **Definición IaC Terraform / OpenTofu** en [`infra/aws/independent-attestation-authority/`](../../../infra/aws/independent-attestation-authority/):
   - [`versions.tf`](../../../infra/aws/independent-attestation-authority/versions.tf): proveedor AWS con `allowed_account_ids = [var.aws_account_id]` y etiquetas obligatorias de aislamiento.
   - [`variables.tf`](../../../infra/aws/independent-attestation-authority/variables.tf): validaciones estrictas de entrada para cuenta AWS, región, VPC privada, al menos 2 subredes privadas, Security Groups de runtime y nombre de base de datos dedicado (`db_name` rechaza `postgres`, `kiosco`, `kioscopos`, `kiosco_pos`, `pos`, `supabase`, `arca`, `afip`).
   - [`kms.tf`](../../../infra/aws/independent-attestation-authority/kms.tf): separación estricta entre la clave asimétrica de firma Ed25519 (`aws_kms_key.attestation_ed25519_signing`, `ECC_NIST_EDWARDS25519`, `SIGN_VERIFY`) y la clave simétrica de cifrado en reposo (`aws_kms_key.rds_and_secrets_encryption`, `SYMMETRIC_DEFAULT`, `ENCRYPT_DECRYPT`).
   - [`rds.tf`](../../../infra/aws/independent-attestation-authority/rds.tf): instancia PostgreSQL 16 privada (`publicly_accessible = false`), ingreso TCP 5432 restringido exclusivamente a Security Groups autorizados (prohibido `0.0.0.0/0` y `::/0`), TLS 1.3 forzado (`rds.force_ssl = 1`), cifrado en reposo y credenciales gestionadas en AWS Secrets Manager (`manage_master_user_password = true`).
   - [`iam.tf`](../../../infra/aws/independent-attestation-authority/iam.tf): separación de políticas en 4 fronteras (`INFRASTRUCTURE_ADMIN`, `RUNTIME_SERVICE`, `DATABASE_ACCESS`, `SIGNING_ACCESS`) bajo principio de mínimo privilegio, sin comodines `Action = "*"` ni `Resource = "*"` y con `Deny` explícito para impedir que el runtime programe borrado de claves (`kms:ScheduleKeyDeletion`), modifique políticas KMS (`kms:PutKeyPolicy`) o altere instancias RDS.
   - [`outputs.tf`](../../../infra/aws/independent-attestation-authority/outputs.tf): expone únicamente identificadores y ARNs no sensibles; ningún secreto ni contraseña aparece en outputs.
2. **Validador Estático y Preflight AWS sin Mutaciones** en [`src/aws-infrastructure-readiness.mjs`](../src/aws-infrastructure-readiness.mjs):
   - `validateAwsIacStaticReadiness`: verifica determinísticamente las 15 reglas `AWS10-01` a `AWS10-15`.
   - `evaluateAwsControlledPreflight`: capa de preflight AWS `OPT_IN = true` con `MUTATING_OPERATIONS = 0` y `awsApiCallsExecuted = 0`.

---

## 3. Lo que esta Fase NO Ejecuta

En cumplimiento estricto de las reglas de gobernanza:

- **NO ejecuta** `terraform apply`, `tofu apply`, `cdk deploy` ni `pulumi up`.
- **NO crea, modifica ni elimina** recursos en AWS (`AWS_RESOURCE_CREATION = 0`, `AWS_RESOURCE_MODIFICATION = 0`, `AWS_RESOURCE_DELETION = 0`).
- **NO abre conexiones** hacia instancias RDS reales (`REAL_POSTGRESQL_CONNECTED = false`).
- **NO ejecuta operaciones** `Sign` ni `GetPublicKey` contra AWS KMS real (`REAL_KMS_CONNECTED = false`).
- **NO realiza llamadas** a ARCA (`WSAA`, `WSFE`, `LoginCms`, `FECAESolicitar`) ni modifica Supabase POS.

---

## 4. Procedimiento Futuro de Rotación Manual de Clave Asimétrica (`MANUAL_ASYMMETRIC_KEY_ROTATION`)

Las claves asimétricas `ECC_NIST_EDWARDS25519` en AWS KMS no soportan rotación automática (`enable_key_rotation = false`). Para permitir la rotación controlada sin acoplar permanentemente el código a un `KeyId` estático, se utiliza el alias estable `alias/kioskopos-attestation-signing-${environment}`:

1. **Provisión de nueva clave (`v2`)**: mediante cambio controlado en IaC por `INFRASTRUCTURE_ADMIN`, crear un segundo recurso `aws_kms_key` con `customer_master_key_spec = "ECC_NIST_EDWARDS25519"` y `key_usage = "SIGN_VERIFY"`.
2. **Extracción y pineado de clave pública**: obtener el SPKI DER mediante `kms:GetPublicKey`, calcular el nuevo `keyId` (`ed25519-spki-<16-hex>`) y registrarlo en el catálogo de claves públicas confiables del verificador.
3. **Actualización de alias**: reasignar `aws_kms_alias.attestation_ed25519_signing` al nuevo `target_key_id` y actualizar `ATTESTATION_KMS_KEY_ID` / `ATTESTATION_PUBLIC_KEY_SPKI` en la configuración del servicio.
4. **Retención para verificación histórica**: mantener la clave anterior habilitada para consulta pública o deshabilitada para nuevas firmas durante la ventana de auditoría antes de cualquier programación de borrado aprobada por gobernanza.

*(Este procedimiento es exclusivamente documental en `AWS-REAL-10` y no se ejecuta en esta fase).*

---

## 5. Variables Necesarias para una Futura Provisión (Sin Valores Reales)

### Variables IaC (`terraform.tfvars.example`)

| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `aws_account_id` | `string` | ID de cuenta AWS dedicada de 12 dígitos (nunca compartida con entornos no autorizados). |
| `aws_region` | `string` | Región AWS seleccionada para la infraestructura dedicada. |
| `environment` | `string` | Entorno objetivo (`staging` o `production`). |
| `vpc_id` | `string` | ID de la VPC dedicada (`vpc-...`). |
| `private_subnet_ids` | `list(string)` | Lista de al menos 2 subredes privadas (`subnet-...`) sin ruta directa desde Internet. |
| `allowed_runtime_security_group_ids` | `list(string)` | Lista de Security Groups (`sg-...`) del runtime autorizados para conectar al puerto `5432`. |
| `db_name` | `string` | Nombre de base de datos dedicado (por defecto `attestation_anti_replay`). |
| `db_master_username` | `string` | Usuario maestro dedicado (por defecto `attestation_admin`; contraseña gestionada por Secrets Manager). |

### Variables de Entorno del Servicio (`.env.example`)

```text
ATTESTATION_ENVIRONMENT=STAGING
ATTESTATION_SIGNING_PROVIDER=PRODUCTION_KMS_SIGNER
ATTESTATION_KMS_PROVIDER=AWS_KMS
ATTESTATION_AWS_REGION=<APPROVED_AWS_REGION>
ATTESTATION_KMS_KEY_ID=<DERIVED_ED25519_SPKI_KEY_ID>
ATTESTATION_KMS_KEY_VERSION_NAME=<AWS_KMS_KEY_ARN>
ATTESTATION_PUBLIC_KEY_SPKI=<PEM_PUBLIC_KEY_SPKI>
ATTESTATION_ANTI_REPLAY_MODE=distributed
ATTESTATION_ANTI_REPLAY_PROVIDER=POSTGRESQL
ATTESTATION_POSTGRES_URL=<RESOLVED_AT_RUNTIME_FROM_SECRETS_MANAGER_WITH_SSLMODE_VERIFY_FULL>
ATTESTATION_REAL_INTEGRATION_ENABLED=false
ATTESTATION_AWS_PREFLIGHT_ENABLED=false
```

---

## 6. Prerrequisitos Humanos Futuros

Antes de iniciar cualquier comando de provisión real deben cumplirse y documentarse los siguientes prerrequisitos humanos:

```text
AWS_ACCOUNT_APPROVED = required
AWS_REGION_SELECTED = required
DEDICATED_NETWORK_AVAILABLE = required
VPC_AND_PRIVATE_SUBNETS_APPROVED = required
BILLING_APPROVED = required
IAM_ADMIN_APPROVED = required
```

---

## 7. Secuencia Futura de Provisión Controlada

```text
1. Human authorization
2. AWS identity verification
3. terraform/tofu init
4. terraform/tofu plan
5. human review of plan
6. explicit approval
7. apply (NO AUTORIZADO TODAVÍA EN ESTA FASE)
8. real connectivity tests (read-only)
9. evidence review
10. separate production decision
```

> [!WARNING]
> **Compuerta de Gobernanza**: El paso `7. apply` **NO está autorizado en `AWS-REAL-10`**. Toda provisión de recursos requiere una orden humana separada y explícita tras la revisión del `plan`.

---

## 8. Estado Actual de Madurez e Infraestructura

```text
CLOUD_PROVIDER_TARGET = AWS
AWS_ARCHITECTURE_SELECTED = true
AWS_IAC_IMPLEMENTED = true
AWS_RESOURCES_PROVISIONED = false
AWS_REAL_CONNECTIVITY_TESTED = false

REAL_POSTGRESQL_CONNECTED = false
REAL_KMS_CONNECTED = false
REAL_OIDC_CONNECTED = false
REAL_MTLS_CONNECTED = false

EXTERNAL_AUTHORITY_DEPLOYED = false
AUTHORITY_REAL_WORLD_AVAILABLE = false
PRODUCTION_VALIDATED = false
PRODUCTION_APPROVED = false
P1_IMPORT_ALLOWED = false
PR02_READY_FOR_EMISSION_GO = false
REMOTE_GO = DENIED
```
