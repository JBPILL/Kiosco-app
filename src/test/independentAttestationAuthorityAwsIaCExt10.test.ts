// @vitest-environment node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  AWS_IAC_CHECK_IDS,
  AWS_PREFLIGHT_STATES,
  AWS_TARGET_ARCHITECTURE,
  evaluateAwsControlledPreflight,
  validateAwsIacStaticReadiness,
} from '../../services/independent-attestation-authority/src/index.mjs'

const IAC_DIR = path.resolve(
  __dirname,
  '../../infra/aws/independent-attestation-authority'
)

function loadRealIacFilesMap(): Record<string, string> {
  const entries = fs.readdirSync(IAC_DIR, { withFileTypes: true })
  const map: Record<string, string> = {}
  for (const entry of entries) {
    if (entry.isFile()) {
      map[entry.name] = fs.readFileSync(path.join(IAC_DIR, entry.name), 'utf8')
    }
  }
  return map
}

function buildValidAwsStagingEnv(): Record<string, string> {
  const kmsPair = crypto.generateKeyPairSync('ed25519')
  const goPair = crypto.generateKeyPairSync('ed25519')
  const kmsSpki = kmsPair.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString()
    .trim()
  const goSpki = goPair.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString()
    .trim()
  const kmsId = `ed25519-spki-${crypto
    .createHash('sha256')
    .update(kmsPair.publicKey.export({ format: 'der', type: 'spki' }))
    .digest('hex')
    .slice(0, 16)}`
  const goId = `ed25519-spki-${crypto
    .createHash('sha256')
    .update(goPair.publicKey.export({ format: 'der', type: 'spki' }))
    .digest('hex')
    .slice(0, 16)}`

  return {
    ATTESTATION_ENVIRONMENT: 'STAGING',
    ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
    ATTESTATION_KMS_PROVIDER: 'AWS_KMS',
    ATTESTATION_AWS_REGION: 'sa-east-1',
    ATTESTATION_KMS_KEY_ID: kmsId,
    ATTESTATION_KMS_KEY_VERSION_NAME:
      'arn:aws:kms:sa-east-1:210987654321:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ATTESTATION_PUBLIC_KEY_SPKI: kmsSpki,
    ATTESTATION_GO_AUTHORITY_ID: 'kioskopos-go-governance-staging-v1',
    ATTESTATION_GO_KEY_ID: goId,
    ATTESTATION_GO_PUBLIC_KEY_SPKI: goSpki,
    ATTESTATION_ALLOWED_PROJECT_REF: 'acoyfwwmhaeruciyedri',
    ATTESTATION_ALLOWED_COMMIT_SHA: '52bc3c3be0ad784e05dba314d81efa7be87b2323',
    ATTESTATION_ANTI_REPLAY_MODE: 'distributed',
    ATTESTATION_ANTI_REPLAY_PROVIDER: 'POSTGRESQL',
    ATTESTATION_POSTGRES_URL:
      'postgres://attestation_admin:SyntheTicPass!99@kioskopos-attestation-antireplay-staging.internal:5432/attestation_anti_replay?sslmode=verify-full',
    ATTESTATION_POSTGRES_TABLE: 'attestation_distributed_anti_replay',
    ATTESTATION_POSTGRES_ISOLATION_LEVEL: 'SERIALIZABLE',
    ATTESTATION_CLIENT_AUTH_MODE: 'OIDC_JWT',
    ATTESTATION_OIDC_ISSUER: 'https://auth.internal.kioskopos.invalid',
    ATTESTATION_OIDC_AUDIENCE: 'independent-attestation-authority',
    ATTESTATION_OIDC_JWKS_URI:
      'https://auth.internal.kioskopos.invalid/.well-known/jwks.json',
    ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS: 'auth.internal.kioskopos.invalid',
    ATTESTATION_REQUIRE_HTTPS: 'true',
    ATTESTATION_REAL_INTEGRATION_ENABLED: 'false',
    ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
    ATTESTATION_AWS_PREFLIGHT_ENABLED: 'false',
  }
}

describe('AWS-REAL-10 — Infraestructura AWS Dedicada, IaC Estático y Preflight Controlado', () => {
  it('AWS10-01: No RDS publicly accessible', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-01')?.passed).toBe(true)
    expect(report.invariants.NO_PUBLIC_POSTGRES).toBe('PASS')

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': baseFiles['rds.tf']!.replace(
          'publicly_accessible    = false',
          'publicly_accessible    = true'
        ),
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-01')?.passed).toBe(false)
    expect(mutated.invariants.NO_PUBLIC_POSTGRES).toBe('FAIL')
  })

  it('AWS10-02: No PostgreSQL ingress from 0.0.0.0/0', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-02')?.passed).toBe(true)
    expect(report.invariants.NO_UNRESTRICTED_POSTGRES_INGRESS).toBe('PASS')

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': `${baseFiles['rds.tf']}\nresource "aws_vpc_security_group_ingress_rule" "bad" {\n  cidr_ipv4 = "0.0.0.0/0"\n}\n`,
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-02')?.passed).toBe(false)
    expect(mutated.invariants.NO_UNRESTRICTED_POSTGRES_INGRESS).toBe('FAIL')
  })

  it('AWS10-03: Dedicated database requirement present', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-03')?.passed).toBe(true)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': baseFiles['rds.tf']!.replace(
          'PostgresSharedWithPos   = "false"',
          'PostgresSharedWithPos   = "true"'
        ),
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-03')?.passed).toBe(false)
  })

  it('AWS10-04: RDS encryption at rest required', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-04')?.passed).toBe(true)
    expect(report.invariants.RDS_ENCRYPTION_CONFIGURED).toBe('PASS')

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': baseFiles['rds.tf']!.replace(
          'storage_encrypted = true',
          'storage_encrypted = false'
        ),
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-04')?.passed).toBe(false)
    expect(mutated.invariants.RDS_ENCRYPTION_CONFIGURED).toBe('FAIL')
  })

  it('AWS10-05: TLS/SSL enforcement prepared', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-05')?.passed).toBe(true)
    expect(report.invariants.RDS_TLS_REQUIRED).toBe('PASS')

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': baseFiles['rds.tf']!.replace(
          'value        = "1"',
          'value        = "0"'
        ),
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-05')?.passed).toBe(false)
    expect(mutated.invariants.RDS_TLS_REQUIRED).toBe('FAIL')
  })

  it('AWS10-06: Ed25519 signing key uses SIGN_VERIFY semantics', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-06')?.passed).toBe(true)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'kms.tf': baseFiles['kms.tf']!.replace(
          'customer_master_key_spec = "ECC_NIST_EDWARDS25519"',
          'customer_master_key_spec = "RSA_2048"'
        ),
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-06')?.passed).toBe(false)
  })

  it('AWS10-07: Signing key is distinct from RDS encryption key', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-07')?.passed).toBe(true)
    expect(report.invariants.ED25519_SIGNING_KEY_SEPARATED).toBe('PASS')

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': baseFiles['rds.tf']!.replace(
          'kms_key_id        = aws_kms_key.rds_and_secrets_encryption.arn',
          'kms_key_id        = aws_kms_key.attestation_ed25519_signing.arn'
        ),
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-07')?.passed).toBe(false)
    expect(mutated.invariants.ED25519_SIGNING_KEY_SEPARATED).toBe('FAIL')
  })

  it('AWS10-08: No private key material exists in IaC', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-08')?.passed).toBe(true)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'kms.tf': `${baseFiles['kms.tf']}\n# -----BEGIN PRIVATE KEY-----\n`,
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-08')?.passed).toBe(false)
    expect(mutated.invariants.NO_SECRETS_IN_IAC).toBe('FAIL')
  })

  it('AWS10-09: No secrets appear in outputs', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-09')?.passed).toBe(true)
    expect(report.invariants.NO_SECRETS_IN_IAC).toBe('PASS')

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'outputs.tf': `${baseFiles['outputs.tf']}\noutput "DATABASE_URL" {\n  value = "postgres://admin:secret@host:5432/db"\n}\n`,
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-09')?.passed).toBe(false)
    expect(mutated.invariants.NO_SECRETS_IN_IAC).toBe('FAIL')
  })

  it('AWS10-10: Runtime IAM is least-privilege', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-10')?.passed).toBe(true)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'iam.tf': `${baseFiles['iam.tf']}\ndata "aws_iam_policy_document" "bad" {\n  statement {\n    actions = ["*"]\n    resources = ["*"]\n  }\n}\n`,
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-10')?.passed).toBe(false)
  })

  it('AWS10-11: Runtime cannot schedule KMS key deletion', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-11')?.passed).toBe(true)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'iam.tf': baseFiles['iam.tf']!.replace(
          '"kms:ScheduleKeyDeletion",',
          ''
        ),
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-11')?.passed).toBe(false)
  })

  it('AWS10-12: Supabase/POS infrastructure is excluded', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-12')?.passed).toBe(true)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': `${baseFiles['rds.tf']}\nresource "aws_dynamodb_table" "unexpected" {}\n`,
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-12')?.passed).toBe(false)
  })

  it('AWS10-13: No Terraform/OpenTofu state file is versioned', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-13')?.passed).toBe(true)
    expect(report.invariants.NO_TERRAFORM_STATE_VERSIONED).toBe('PASS')

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'terraform.tfstate': '{"version": 4}',
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-13')?.passed).toBe(false)
    expect(mutated.invariants.NO_TERRAFORM_STATE_VERSIONED).toBe('FAIL')
  })

  it('AWS10-14: Real AWS provisioning commands are not executed by tests', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-14')?.passed).toBe(true)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': `${baseFiles['rds.tf']}\nprovisioner "local-exec" {\n  command = "terraform apply -auto-approve"\n}\n`,
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-14')?.passed).toBe(false)
  })

  it('AWS10-15: No ARCA connectivity is introduced', () => {
    const report = validateAwsIacStaticReadiness({ iacDir: IAC_DIR })
    expect(report.checks.find((c) => c.id === 'AWS10-15')?.passed).toBe(true)
    expect(report.checks.map((c) => c.id)).toEqual(AWS_IAC_CHECK_IDS)

    const baseFiles = loadRealIacFilesMap()
    const mutated = validateAwsIacStaticReadiness({
      files: {
        ...baseFiles,
        'rds.tf': `${baseFiles['rds.tf']}\nlocals {\n  arca_endpoint = "https://wsaa.afip.gov.ar/ws/services/LoginCms"\n}\n`,
      },
    })
    expect(mutated.valid).toBe(false)
    expect(mutated.checks.find((c) => c.id === 'AWS10-15')?.passed).toBe(false)
  })

  it('AWS10-PREFLIGHT-01: preflight AWS es opt-in, 0 mutaciones, y distingue estados no verificados de producción validada', () => {
    const env = buildValidAwsStagingEnv()

    expect(AWS_TARGET_ARCHITECTURE.CLOUD_PROVIDER_TARGET).toBe('AWS')
    expect(AWS_TARGET_ARCHITECTURE.AWS_RESOURCES_PROVISIONED).toBe(false)

    const preflightDefault = evaluateAwsControlledPreflight(env, {
      iacDir: IAC_DIR,
    })
    expect(preflightDefault.status).toBe(
      AWS_PREFLIGHT_STATES.CONFIGURATION_VALID
    )
    expect(preflightDefault.optInRequired).toBe(true)
    expect(preflightDefault.optInEnabled).toBe(false)
    expect(preflightDefault.mutatingOperationsExecuted).toBe(0)
    expect(preflightDefault.awsApiCallsExecuted).toBe(0)
    expect(preflightDefault.configurationValid).toBe(true)
    expect(preflightDefault.iacStaticValid).toBe(true)
    expect(preflightDefault.states).toEqual({
      CONFIGURATION_VALID: true,
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
    })
    expect(JSON.stringify(preflightDefault)).not.toContain('SyntheTicPass!99')

    const dynamoPreflight = evaluateAwsControlledPreflight(
      {
        ...env,
        ATTESTATION_ANTI_REPLAY_PROVIDER: 'DYNAMODB',
      },
      { iacDir: IAC_DIR }
    )
    expect(dynamoPreflight.status).toBe(
      AWS_PREFLIGHT_STATES.CONFIGURATION_INVALID
    )
    expect(
      dynamoPreflight.errors.some(
        (e) => e.code === 'AWS10_DYNAMODB_NOT_IN_INITIAL_TARGET'
      )
    ).toBe(true)

    const gcpPreflight = evaluateAwsControlledPreflight(
      {
        ...env,
        ATTESTATION_KMS_PROVIDER: 'GCP_KMS',
      },
      { iacDir: IAC_DIR }
    )
    expect(gcpPreflight.status).toBe(AWS_PREFLIGHT_STATES.CONFIGURATION_INVALID)
    expect(
      gcpPreflight.errors.some((e) => e.code === 'AWS10_PROVIDER_MISMATCH')
    ).toBe(true)
  })
})
