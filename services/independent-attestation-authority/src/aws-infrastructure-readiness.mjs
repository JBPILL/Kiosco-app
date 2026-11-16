// @ts-check
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateExternalConnectivityAuthorization } from './external-connectivity.mjs'
import {
  buildSafeConfigurationFingerprint,
  redactSensitiveConfigText,
  validateInfrastructureConfiguration,
} from './infrastructure-preflight.mjs'
import {
  isRealIntegrationDryRun,
  isRealIntegrationEnabled,
} from './real-integration.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_AWS_IAC_DIR = path.resolve(
  __dirname,
  '../../../infra/aws/independent-attestation-authority'
)

export const AWS_TARGET_ARCHITECTURE = Object.freeze({
  CLOUD_PROVIDER_TARGET: 'AWS',
  AWS_ARCHITECTURE_SELECTED: true,
  AWS_IAC_IMPLEMENTED: true,
  AWS_RESOURCES_PROVISIONED: false,
  AWS_REAL_CONNECTIVITY_TESTED: false,
  DYNAMODB_INCLUDED_IN_INITIAL_TARGET: false,
  OIDC_DEPLOYED_IN_INITIAL_TARGET: false,
  MTLS_DEPLOYED_IN_INITIAL_TARGET: false,
  PUBLIC_ENDPOINT_DEPLOYED: false,
  SIGNING_KEY_PURPOSE: 'ATTESTATION_SIGNING',
  SIGNING_KEY_SPEC: 'ECC_NIST_EDWARDS25519',
  SIGNING_KEY_USAGE: 'SIGN_VERIFY',
  SIGNING_PRIVATE_KEY_EXPORT: 'FORBIDDEN',
  SIGNING_PRIVATE_KEY_IN_REPOSITORY: false,
  SIGNING_PRIVATE_KEY_IN_RUNTIME_FILESYSTEM: false,
  SIGNING_KEY_REUSED_FOR_RDS: false,
  RDS_ENCRYPTION_KEY_REUSED_FOR_SIGNING: false,
  POSTGRES_DEDICATED: true,
  POSTGRES_SHARED_WITH_POS: false,
  POSTGRES_SUPABASE: false,
  PUBLICLY_ACCESSIBLE: false,
  TLS_REQUIRED: true,
  DATABASE_ENCRYPTED_AT_REST: true,
  DATABASE_NAME_DEDICATED: true,
  UNRESTRICTED_POSTGRES_INGRESS: false,
  INGRESS_0_0_0_0_5432: false,
  REPOSITORY_DATABASE_SECRET: false,
  HARDCODED_DATABASE_PASSWORD: false,
  DATABASE_URL_WITH_PASSWORD_IN_REPO: false,
})

export const AWS_PREFLIGHT_STATES = Object.freeze({
  CONFIGURATION_INVALID: 'CONFIGURATION_INVALID',
  CONFIGURATION_VALID: 'CONFIGURATION_VALID',
  AWS_CREDENTIALS_NOT_CHECKED: 'AWS_CREDENTIALS_NOT_CHECKED',
  AWS_CONNECTIVITY_NOT_CHECKED: 'AWS_CONNECTIVITY_NOT_CHECKED',
  AWS_RESOURCES_NOT_PROVISIONED: 'AWS_RESOURCES_NOT_PROVISIONED',
  READY_FOR_CONTROLLED_CONNECTIVITY_CHECK:
    'READY_FOR_CONTROLLED_CONNECTIVITY_CHECK',
})

export const AWS_IAC_CHECK_IDS = Object.freeze([
  'AWS10-01',
  'AWS10-02',
  'AWS10-03',
  'AWS10-04',
  'AWS10-05',
  'AWS10-06',
  'AWS10-07',
  'AWS10-08',
  'AWS10-09',
  'AWS10-10',
  'AWS10-11',
  'AWS10-12',
  'AWS10-13',
  'AWS10-14',
  'AWS10-15',
])

function cleanStr(val) {
  return typeof val === 'string' ? val.trim() : ''
}

function parseStrictBool(env, key) {
  const raw = cleanStr(env?.[key]).toLowerCase()
  if (!raw) return { defined: false, valid: true, value: false }
  if (raw === 'true') return { defined: true, valid: true, value: true }
  if (raw === 'false') return { defined: true, valid: true, value: false }
  return { defined: true, valid: false, value: false, raw }
}

/**
 * Strips `#` and `//` single-line comments from HCL text so static checks
 * inspect actual configuration statements rather than comments.
 * @param {string} hcl
 * @returns {string}
 */
function stripHclComments(hcl) {
  return String(hcl || '')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        return ''
      }
      if (/^(?:description|error_message)\s*=\s*"[^"]*"$/.test(trimmed)) {
        return ''
      }
      return line
    })
    .join('\n')
}

/**
 * Loads IaC files from disk or from an injected `files` map.
 * @param {{ iacDir?: string, files?: Record<string, string> }} [options]
 */
function loadIacFiles(options = {}) {
  if (options.files && typeof options.files === 'object') {
    const entries = Object.entries(options.files)
    return {
      iacDir: options.iacDir || 'IN_MEMORY_IAC_FIXTURE',
      fileNames: entries.map(([name]) => name),
      filesMap: { ...options.files },
    }
  }

  const iacDir = options.iacDir || DEFAULT_AWS_IAC_DIR
  if (!fs.existsSync(iacDir)) {
    throw new Error(
      `AWS_IAC_DIRECTORY_MISSING: No existe el directorio IaC '${iacDir}'`
    )
  }

  const entries = fs.readdirSync(iacDir, { withFileTypes: true })
  const fileNames = []
  /** @type {Record<string, string>} */
  const filesMap = {}

  for (const entry of entries) {
    if (entry.isDirectory()) {
      fileNames.push(`${entry.name}/`)
      continue
    }
    fileNames.push(entry.name)
    const fullPath = path.join(iacDir, entry.name)
    filesMap[entry.name] = fs.readFileSync(fullPath, 'utf8')
  }

  return { iacDir, fileNames, filesMap }
}

/**
 * Validates the AWS Terraform/OpenTofu IaC definition statically (`AWS10-01`..`AWS10-15`)
 * without executing `terraform apply`, `tofu apply`, or any AWS API call.
 *
 * @param {{ iacDir?: string, files?: Record<string, string> }} [options]
 */
export function validateAwsIacStaticReadiness(options = {}) {
  const { iacDir, fileNames, filesMap } = loadIacFiles(options)

  const tfFiles = Object.entries(filesMap)
    .filter(([name]) => name.endsWith('.tf'))
    .map(([name, content]) => ({
      name,
      raw: content,
      code: stripHclComments(content),
    }))

  const combinedCode = tfFiles.map((f) => f.code).join('\n')
  const combinedRaw = Object.values(filesMap).join('\n')
  const rdsCode = stripHclComments(filesMap['rds.tf'] || combinedCode)
  const kmsCode = stripHclComments(filesMap['kms.tf'] || combinedCode)
  const iamCode = stripHclComments(filesMap['iam.tf'] || combinedCode)
  const varsCode = stripHclComments(filesMap['variables.tf'] || combinedCode)
  const outputsCode = stripHclComments(filesMap['outputs.tf'] || '')
  const gitignoreContent = String(filesMap['.gitignore'] || '')

  /** @type {Array<{ id: string, title: string, passed: boolean, reason: string }>} */
  const checks = []

  // AWS10-01: No RDS publicly accessible
  const hasRdsInstance = /resource\s+"aws_db_instance"\s+"attestation_postgres"/.test(
    rdsCode
  )
  const hasPubliclyAccessibleFalse = /publicly_accessible\s*=\s*false/.test(rdsCode)
  const hasPubliclyAccessibleTrue = /publicly_accessible\s*=\s*true/.test(
    combinedCode
  )
  const aws10_01 =
    hasRdsInstance && hasPubliclyAccessibleFalse && !hasPubliclyAccessibleTrue
  checks.push({
    id: 'AWS10-01',
    title: 'No RDS publicly accessible',
    passed: aws10_01,
    reason: aws10_01
      ? 'aws_db_instance.attestation_postgres enforces publicly_accessible = false'
      : 'RDS instance is missing publicly_accessible = false or sets publicly_accessible = true',
  })

  // AWS10-02: No PostgreSQL ingress from 0.0.0.0/0 or ::/0
  const hasOpenIpv4Ingress = /0\.0\.0\.0\/0/.test(combinedCode)
  const hasOpenIpv6Ingress = /::\/0/.test(combinedCode)
  const hasScopedSgIngress =
    /resource\s+"aws_vpc_security_group_ingress_rule"\s+"postgres_from_runtime"/.test(
      rdsCode
    ) &&
    /referenced_security_group_id\s*=/.test(rdsCode) &&
    !/cidr_ipv4\s*=/.test(rdsCode) &&
    !/cidr_blocks\s*=/.test(rdsCode)
  const aws10_02 =
    !hasOpenIpv4Ingress && !hasOpenIpv6Ingress && hasScopedSgIngress
  checks.push({
    id: 'AWS10-02',
    title: 'No PostgreSQL ingress from 0.0.0.0/0',
    passed: aws10_02,
    reason: aws10_02
      ? 'PostgreSQL TCP 5432 ingress is restricted to referenced_security_group_id with zero 0.0.0.0/0 or ::/0 rules'
      : 'Detected unrestricted CIDR (0.0.0.0/0 or ::/0) or missing security-group-scoped ingress rule',
  })

  // AWS10-03: Dedicated database requirement present
  const hasDbNameVarValidation =
    /variable\s+"db_name"/.test(varsCode) &&
    /kiosco_pos/.test(varsCode) &&
    /supabase/.test(varsCode)
  const hasDedicatedDbTags =
    /PostgresDedicated\s*=\s*"true"/.test(rdsCode) &&
    /PostgresSharedWithPos\s*=\s*"false"/.test(rdsCode) &&
    /PostgresSupabase\s*=\s*"false"/.test(rdsCode)
  const aws10_03 = hasDbNameVarValidation && hasDedicatedDbTags
  checks.push({
    id: 'AWS10-03',
    title: 'Dedicated database requirement present',
    passed: aws10_03,
    reason: aws10_03
      ? 'Dedicated database validation and isolation tags reject shared POS/Supabase databases'
      : 'Missing dedicated db_name validation or isolation tags',
  })

  // AWS10-04: RDS encryption at rest required
  const hasStorageEncryptedTrue = /storage_encrypted\s*=\s*true/.test(rdsCode)
  const hasStorageEncryptedFalse = /storage_encrypted\s*=\s*false/.test(
    combinedCode
  )
  const hasRdsKmsBinding =
    /kms_key_id\s*=\s*aws_kms_key\.rds_and_secrets_encryption\.arn/.test(rdsCode)
  const aws10_04 =
    hasStorageEncryptedTrue && !hasStorageEncryptedFalse && hasRdsKmsBinding
  checks.push({
    id: 'AWS10-04',
    title: 'RDS encryption at rest required',
    passed: aws10_04,
    reason: aws10_04
      ? 'storage_encrypted = true bound to aws_kms_key.rds_and_secrets_encryption.arn'
      : 'RDS encryption at rest is missing, disabled, or unbound to dedicated KMS key',
  })

  // AWS10-05: TLS/SSL enforcement prepared
  const hasForceSslParam =
    /name\s*=\s*"rds\.force_ssl"[\s\S]{0,120}?value\s*=\s*"1"/.test(rdsCode)
  const hasForceSslZero =
    /name\s*=\s*"rds\.force_ssl"[\s\S]{0,120}?value\s*=\s*"0"/.test(combinedCode)
  const hasTls13Min =
    /name\s*=\s*"ssl_min_protocol_version"[\s\S]{0,120}?value\s*=\s*"TLSv1\.3"/.test(
      rdsCode
    )
  const aws10_05 = hasForceSslParam && !hasForceSslZero && hasTls13Min
  checks.push({
    id: 'AWS10-05',
    title: 'TLS/SSL enforcement prepared',
    passed: aws10_05,
    reason: aws10_05
      ? 'aws_db_parameter_group enforces rds.force_ssl = 1 and ssl_min_protocol_version = TLSv1.3'
      : 'Missing rds.force_ssl = 1 or TLSv1.3 enforcement in parameter group',
  })

  // AWS10-06: Ed25519 signing key uses SIGN_VERIFY semantics
  const hasEd25519Key =
    /resource\s+"aws_kms_key"\s+"attestation_ed25519_signing"[\s\S]*?customer_master_key_spec\s*=\s*"ECC_NIST_EDWARDS25519"[\s\S]*?key_usage\s*=\s*"SIGN_VERIFY"[\s\S]*?enable_key_rotation\s*=\s*false/.test(
      kmsCode
    )
  const hasSigningAlias =
    /resource\s+"aws_kms_alias"\s+"attestation_ed25519_signing"/.test(kmsCode)
  const aws10_06 = hasEd25519Key && hasSigningAlias
  checks.push({
    id: 'AWS10-06',
    title: 'Ed25519 signing key uses SIGN_VERIFY semantics',
    passed: aws10_06,
    reason: aws10_06
      ? 'aws_kms_key.attestation_ed25519_signing uses ECC_NIST_EDWARDS25519, SIGN_VERIFY, enable_key_rotation = false, and stable alias'
      : 'Ed25519 signing key spec, SIGN_VERIFY usage, rotation setting, or alias is invalid',
  })

  // AWS10-07: Signing key is distinct from RDS encryption key
  const hasSeparateRdsKey =
    /resource\s+"aws_kms_key"\s+"rds_and_secrets_encryption"[\s\S]*?customer_master_key_spec\s*=\s*"SYMMETRIC_DEFAULT"[\s\S]*?key_usage\s*=\s*"ENCRYPT_DECRYPT"/.test(
      kmsCode
    )
  const rdsUsesSigningKey =
    /kms_key_id\s*=\s*aws_kms_key\.attestation_ed25519_signing/.test(rdsCode)
  const rdsKeyDeniesSigning =
    /sid\s*=\s*"DenySigningOperationsOnRdsEncryptionKey"[\s\S]*?effect\s*=\s*"Deny"[\s\S]*?"kms:Sign"/.test(
      kmsCode
    )
  const aws10_07 =
    hasSeparateRdsKey && !rdsUsesSigningKey && rdsKeyDeniesSigning
  checks.push({
    id: 'AWS10-07',
    title: 'Signing key is distinct from RDS encryption key',
    passed: aws10_07,
    reason: aws10_07
      ? 'Ed25519 signing key and symmetric RDS encryption key are strictly separated'
      : 'Signing key and RDS encryption key are conflated or missing cross-purpose Deny guard',
  })

  // AWS10-08: No private key material exists in IaC
  const hasPemPrivateKey =
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(combinedRaw)
  const hasImportedKeyMaterial = /aws_kms_external_key|key_material_base64/i.test(
    combinedCode
  )
  const aws10_08 = !hasPemPrivateKey && !hasImportedKeyMaterial
  checks.push({
    id: 'AWS10-08',
    title: 'No private key material exists in IaC',
    passed: aws10_08,
    reason: aws10_08
      ? 'Zero PEM private keys or imported key material in IaC files'
      : 'Detected private key material or external key import in IaC',
  })

  // AWS10-09: No secrets appear in outputs or IaC
  const usesManagedMasterPassword =
    /manage_master_user_password\s*=\s*true/.test(rdsCode)
  const hasPlaintextDbPasswordAttr = /\bpassword\s*=\s*"[^"]+"/.test(
    combinedCode
  )
  const outputsExposeSecretValue =
    /secret_string|password|DATABASE_URL|postgres:\/\//i.test(outputsCode)
  const hasHardcodedAwsAccessKey = /\bAKIA[0-9A-Z]{16}\b/.test(combinedRaw)
  const aws10_09 =
    usesManagedMasterPassword &&
    !hasPlaintextDbPasswordAttr &&
    !outputsExposeSecretValue &&
    !hasHardcodedAwsAccessKey
  checks.push({
    id: 'AWS10-09',
    title: 'No secrets appear in outputs',
    passed: aws10_09,
    reason: aws10_09
      ? 'Credentials managed by Secrets Manager (manage_master_user_password = true) and outputs expose zero secrets'
      : 'Detected plaintext password, secret output, or AWS access key in IaC',
  })

  // AWS10-10: Runtime IAM is least-privilege
  const hasFourIamBoundaries =
    /resource\s+"aws_iam_role"\s+"infrastructure_admin"/.test(iamCode) &&
    /resource\s+"aws_iam_role"\s+"runtime_service"/.test(iamCode) &&
    /resource\s+"aws_iam_policy"\s+"database_access"/.test(iamCode) &&
    /resource\s+"aws_iam_policy"\s+"signing_access"/.test(iamCode)
  const hasWildcardActionInIam = /actions\s*=\s*\[\s*"\*"\s*\]/.test(iamCode)
  const hasWildcardResourceInIam = /resources\s*=\s*\[\s*"\*"\s*\]/.test(
    iamCode
  )
  const aws10_10 =
    hasFourIamBoundaries && !hasWildcardActionInIam && !hasWildcardResourceInIam
  checks.push({
    id: 'AWS10-10',
    title: 'Runtime IAM is least-privilege',
    passed: aws10_10,
    reason: aws10_10
      ? 'Separate INFRASTRUCTURE_ADMIN, RUNTIME_SERVICE, DATABASE_ACCESS, and SIGNING_ACCESS policies with zero wildcard actions or resources'
      : 'IAM policies contain wildcard Action/Resource or lack required role separation',
  })

  // AWS10-11: Runtime cannot schedule KMS key deletion or modify policies
  const hasRuntimeDenyKmsDeletion =
    /sid\s*=\s*"DenyRuntimeKmsKeyCreationDeletionAndPolicyChanges"[\s\S]*?effect\s*=\s*"Deny"[\s\S]*?"kms:ScheduleKeyDeletion"[\s\S]*?"kms:PutKeyPolicy"[\s\S]*?"kms:DeleteImportedKeyMaterial"/.test(
      iamCode
    ) &&
    /sid\s*=\s*"DenyRuntimeKeyAdminAndDeletionAndEncryptionMisuse"[\s\S]*?effect\s*=\s*"Deny"[\s\S]*?"kms:ScheduleKeyDeletion"/.test(
      kmsCode
    )
  const aws10_11 = hasRuntimeDenyKmsDeletion
  checks.push({
    id: 'AWS10-11',
    title: 'Runtime cannot schedule KMS key deletion',
    passed: aws10_11,
    reason: aws10_11
      ? 'Both IAM policy and KMS Key Policy explicitly Deny kms:ScheduleKeyDeletion, kms:PutKeyPolicy, and kms:DeleteImportedKeyMaterial for runtime'
      : 'Missing explicit Deny for kms:ScheduleKeyDeletion / kms:PutKeyPolicy on runtime role',
  })

  // AWS10-12: Supabase/POS infrastructure is excluded
  const hasSupabaseOrDynamoResource =
    /aws_dynamodb_table|supabase\.co|pooler\.supabase\.com/i.test(combinedCode)
  const aws10_12 = !hasSupabaseOrDynamoResource
  checks.push({
    id: 'AWS10-12',
    title: 'Supabase/POS infrastructure is excluded',
    passed: aws10_12,
    reason: aws10_12
      ? 'Zero Supabase/POS resources or DynamoDB tables in initial dedicated AWS IaC'
      : 'Detected Supabase/POS reference or unexpected DynamoDB resource in IaC',
  })

  // AWS10-13: No Terraform/OpenTofu state file is versioned
  const hasStateOrLockDir = fileNames.some(
    (name) =>
      name.endsWith('.tfstate') ||
      name.includes('.tfstate.') ||
      name === '.terraform/' ||
      name.endsWith('.tfplan') ||
      (name.endsWith('.tfvars') && name !== 'terraform.tfvars.example')
  )
  const gitignoreProtectsState =
    gitignoreContent.includes('*.tfstate') &&
    gitignoreContent.includes('.terraform/') &&
    gitignoreContent.includes('!terraform.tfvars.example')
  const aws10_13 = !hasStateOrLockDir && gitignoreProtectsState
  checks.push({
    id: 'AWS10-13',
    title: 'No Terraform/OpenTofu state file is versioned',
    passed: aws10_13,
    reason: aws10_13
      ? 'No .tfstate, .tfplan, .terraform/, or secret .tfvars files exist and .gitignore blocks them'
      : 'Detected versioned state/vars file or missing .gitignore protections',
  })

  // AWS10-14: Real AWS provisioning commands are not executed by tests or IaC
  const hasProvisioningExecInIac =
    /local-exec|remote-exec|terraform\s+apply|tofu\s+apply|cdk\s+deploy|pulumi\s+up/i.test(
      combinedCode
    )
  const aws10_14 = !hasProvisioningExecInIac
  checks.push({
    id: 'AWS10-14',
    title: 'Real AWS provisioning commands are not executed by tests',
    passed: aws10_14,
    reason: aws10_14
      ? 'Zero local-exec/remote-exec provisioners or apply commands in IaC'
      : 'Detected provisioner or apply execution inside IaC',
  })

  // AWS10-15: No ARCA connectivity is introduced
  const hasArcaReference =
    /afip\.gov\.ar|arca\.gob\.ar|wsaa|wsfev1|FECAESolicitar|LoginCms/i.test(
      combinedCode
    )
  const aws10_15 = !hasArcaReference
  checks.push({
    id: 'AWS10-15',
    title: 'No ARCA connectivity is introduced',
    passed: aws10_15,
    reason: aws10_15
      ? 'Zero ARCA/AFIP/WSAA/WSFE endpoints or fiscal operations in IaC'
      : 'Detected ARCA/AFIP fiscal endpoint or operation in IaC',
  })

  const failedChecks = checks.filter((c) => !c.passed)
  const allPassed = failedChecks.length === 0

  return Object.freeze({
    valid: allPassed,
    status: allPassed ? 'AWS_IAC_STATIC_VALID' : 'AWS_IAC_STATIC_INVALID',
    iacDir,
    cloudProviderTarget: 'AWS',
    totalChecks: checks.length,
    passedChecks: checks.length - failedChecks.length,
    failedChecks: failedChecks.length,
    checks: Object.freeze(checks.map((c) => Object.freeze({ ...c }))),
    invariants: Object.freeze({
      ...AWS_TARGET_ARCHITECTURE,
      NO_PUBLIC_POSTGRES: aws10_01 ? 'PASS' : 'FAIL',
      NO_UNRESTRICTED_POSTGRES_INGRESS: aws10_02 ? 'PASS' : 'FAIL',
      RDS_ENCRYPTION_CONFIGURED: aws10_04 ? 'PASS' : 'FAIL',
      RDS_TLS_REQUIRED: aws10_05 ? 'PASS' : 'FAIL',
      ED25519_SIGNING_KEY_SEPARATED: aws10_06 && aws10_07 ? 'PASS' : 'FAIL',
      NO_SECRETS_IN_IAC: aws10_08 && aws10_09 ? 'PASS' : 'FAIL',
      NO_TERRAFORM_STATE_VERSIONED: aws10_13 ? 'PASS' : 'FAIL',
      AWS_RESOURCE_CREATION: 0,
      AWS_RESOURCE_MODIFICATION: 0,
      AWS_RESOURCE_DELETION: 0,
    }),
  })
}

/**
 * Evaluates the non-mutating AWS preflight readiness posture (Fase 9).
 *
 * - OPT_IN = true
 * - MUTATING_OPERATIONS = 0
 * - Never executes AWS network calls during npm test, vitest, npm run build, or server startup.
 * - Explicitly distinguishes CONFIGURATION_VALID, AWS_CREDENTIALS_NOT_CHECKED,
 *   AWS_CONNECTIVITY_NOT_CHECKED, and AWS_RESOURCES_NOT_PROVISIONED from
 *   AWS_PRODUCTION_READY, PRODUCTION_VALIDATED, and REAL_INTEGRATION_TESTED.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ iacDir?: string, files?: Record<string, string>, checkAmbientFiscalVars?: boolean }} [options]
 */
export function evaluateAwsControlledPreflight(
  env = process.env,
  options = {}
) {
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  const iacReport = validateAwsIacStaticReadiness({
    iacDir: options.iacDir,
    files: options.files,
  })
  const configValidation = validateInfrastructureConfiguration(env, {
    requireCompleteForEnv: false,
    checkAmbientFiscalVars: options.checkAmbientFiscalVars,
  })
  const connectivityAuth = evaluateExternalConnectivityAuthorization(env, {
    checkAmbientFiscalVars: options.checkAmbientFiscalVars,
  })

  const awsPreflightFlag = parseStrictBool(
    env,
    'ATTESTATION_AWS_PREFLIGHT_ENABLED'
  )
  const realIntegrationEnabled = isRealIntegrationEnabled(env)
  const dryRunActive = isRealIntegrationDryRun(env)

  const errors = []
  if (!awsPreflightFlag.valid) {
    errors.push(
      Object.freeze({
        code: 'AWS_PREFLIGHT_FLAG_INVALID',
        message: redactSensitiveConfigText(
          "ATTESTATION_AWS_PREFLIGHT_ENABLED debe ser 'true' o 'false'"
        ),
      })
    )
  }

  for (const issue of configValidation.issues) {
    errors.push(
      Object.freeze({
        code: issue.code,
        message: redactSensitiveConfigText(issue.message),
      })
    )
  }

  for (const check of iacReport.checks) {
    if (!check.passed) {
      errors.push(
        Object.freeze({
          code: `IAC_${check.id}_FAILED`,
          message: check.reason,
        })
      )
    }
  }

  const antiReplayProvider = cleanStr(
    env?.ATTESTATION_ANTI_REPLAY_PROVIDER || env?.ATTESTATION_ANTI_REPLAY_BACKEND
  ).toUpperCase()
  const kmsProvider = cleanStr(env?.ATTESTATION_KMS_PROVIDER).toUpperCase()

  if (antiReplayProvider === 'DYNAMODB') {
    errors.push(
      Object.freeze({
        code: 'AWS10_DYNAMODB_NOT_IN_INITIAL_TARGET',
        message:
          'AWS-REAL-10 define AWS RDS PostgreSQL dedicado como único almacén anti-replay objetivo inicial (DynamoDB excluido de la primera provisión)',
      })
    )
  }

  if (kmsProvider === 'GCP_KMS' || kmsProvider === 'GCP-KMS') {
    errors.push(
      Object.freeze({
        code: 'AWS10_PROVIDER_MISMATCH',
        message:
          'CLOUD_PROVIDER_TARGET = AWS; GCP_KMS no corresponde a la arquitectura AWS-REAL-10',
      })
    )
  }

  const configurationValid =
    errors.length === 0 &&
    iacReport.valid &&
    configValidation.valid &&
    connectivityAuth.configurationValid

  const optInEnabled =
    awsPreflightFlag.value === true &&
    realIntegrationEnabled === true &&
    !dryRunActive &&
    connectivityAuth.authorizedToConnect === true

  const state = !configurationValid
    ? AWS_PREFLIGHT_STATES.CONFIGURATION_INVALID
    : optInEnabled
      ? AWS_PREFLIGHT_STATES.READY_FOR_CONTROLLED_CONNECTIVITY_CHECK
      : AWS_PREFLIGHT_STATES.CONFIGURATION_VALID

  return Object.freeze({
    status: state,
    cloudProviderTarget: 'AWS',
    optInRequired: true,
    optInEnabled,
    mutatingOperationsExecuted: 0,
    awsApiCallsExecuted: 0,
    configurationValid,
    iacStaticValid: iacReport.valid,
    states: Object.freeze({
      CONFIGURATION_VALID: configurationValid,
      AWS_CREDENTIALS_NOT_CHECKED: true,
      AWS_CONNECTIVITY_NOT_CHECKED: true,
      AWS_RESOURCES_NOT_PROVISIONED: true,
      AWS_PRODUCTION_READY: false,
      PRODUCTION_VALIDATED: false,
      PRODUCTION_APPROVED: false,
      REAL_INTEGRATION_TESTED: false,
      REAL_POSTGRESQL_CONNECTED: false,
      REAL_KMS_CONNECTED: false,
      REAL_OIDC_CONNECTED: false,
      REAL_MTLS_CONNECTED: false,
      EXTERNAL_AUTHORITY_DEPLOYED: false,
      AUTHORITY_REAL_WORLD_AVAILABLE: false,
      P1_IMPORT_ALLOWED: false,
      PR02_READY_FOR_EMISSION_GO: false,
      REMOTE_GO: 'DENIED',
    }),
    iacReport,
    safeFingerprint,
    errors: Object.freeze(errors),
  })
}
