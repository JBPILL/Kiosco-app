# ==============================================================================
# Least-Privilege IAM Architecture — Independent Attestation Authority
#
# Strictly separated IAM boundaries:
# 1. INFRASTRUCTURE_ADMIN : Provisioning and key governance role (human-approved ops)
# 2. RUNTIME_SERVICE      : Execution role for the Independent Attestation Authority
# 3. DATABASE_ACCESS      : Scoped policy for reading the dedicated RDS Secret in Secrets Manager
# 4. SIGNING_ACCESS       : Scoped policy for Ed25519 KMS Sign / GetPublicKey / DescribeKey only
#
# CRITICAL INVARIANTS:
# - Zero wildcard Action = "*" or Resource = "*" in runtime policies
# - Runtime is explicitly denied KMS key creation/deletion/policy modification
# - Runtime is explicitly denied RDS instance creation/deletion/modification
# - Zero access to POS / Supabase / ARCA resources
# ==============================================================================

data "aws_iam_policy_document" "infrastructure_admin_assume_role" {
  statement {
    sid     = "AllowDedicatedAccountAdminPrincipalsWithMfa"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.aws_account_id}:root"]
    }

    condition {
      test     = "Bool"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role" "infrastructure_admin" {
  name               = "kioskopos-attestation-infra-admin-${var.environment}"
  description        = "INFRASTRUCTURE_ADMIN role for controlled provisioning and manual key governance"
  assume_role_policy = data.aws_iam_policy_document.infrastructure_admin_assume_role.json

  tags = {
    RolePurpose = "INFRASTRUCTURE_ADMIN"
  }
}

data "aws_iam_policy_document" "infrastructure_admin_policy" {
  statement {
    sid    = "AllowScopedKmsAndRdsGovernance"
    effect = "Allow"

    actions = [
      "kms:CreateAlias",
      "kms:UpdateAlias",
      "kms:DeleteAlias",
      "kms:DescribeKey",
      "kms:GetKeyPolicy",
      "kms:GetPublicKey",
      "kms:ListAliases",
      "kms:ListResourceTags",
      "rds:DescribeDBInstances",
      "rds:DescribeDBSubnetGroups",
      "rds:DescribeDBParameterGroups",
      "secretsmanager:DescribeSecret"
    ]

    resources = [
      aws_kms_key.attestation_ed25519_signing.arn,
      aws_kms_key.rds_and_secrets_encryption.arn,
      aws_db_instance.attestation_postgres.arn
    ]
  }
}

resource "aws_iam_policy" "infrastructure_admin" {
  name        = "kioskopos-attestation-infra-admin-policy-${var.environment}"
  description = "INFRASTRUCTURE_ADMIN least-privilege governance policy"
  policy      = data.aws_iam_policy_document.infrastructure_admin_policy.json
}

resource "aws_iam_role_policy_attachment" "infrastructure_admin" {
  role       = aws_iam_role.infrastructure_admin.name
  policy_arn = aws_iam_policy.infrastructure_admin.arn
}

# ------------------------------------------------------------------------------
# 2. RUNTIME_SERVICE Role
# ------------------------------------------------------------------------------

data "aws_iam_policy_document" "runtime_service_assume_role" {
  statement {
    sid     = "AllowIsolatedAttestationComputeTaskAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_iam_role" "runtime_service" {
  name               = "kioskopos-attestation-runtime-${var.environment}"
  description        = "RUNTIME_SERVICE execution role for Independent Attestation Authority (strict least privilege)"
  assume_role_policy = data.aws_iam_policy_document.runtime_service_assume_role.json

  tags = {
    RolePurpose = "RUNTIME_SERVICE"
  }
}

# ------------------------------------------------------------------------------
# 3. DATABASE_ACCESS Policy (attached to RUNTIME_SERVICE)
# ------------------------------------------------------------------------------

data "aws_iam_policy_document" "database_access" {
  statement {
    sid    = "AllowReadDedicatedRdsManagedSecretOnly"
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]

    resources = [
      aws_db_instance.attestation_postgres.master_user_secret[0].secret_arn
    ]
  }

  statement {
    sid    = "AllowDecryptDedicatedRdsSecretViaSecretsManager"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:DescribeKey"
    ]

    resources = [
      aws_kms_key.rds_and_secrets_encryption.arn
    ]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }

  statement {
    sid    = "DenyRdsControlPlaneAndSecretMutations"
    effect = "Deny"

    actions = [
      "rds:CreateDBInstance",
      "rds:DeleteDBInstance",
      "rds:ModifyDBInstance",
      "rds:ModifyDBParameterGroup",
      "rds:DeleteDBParameterGroup",
      "rds:CreateDBSnapshot",
      "rds:DeleteDBSnapshot",
      "rds:RestoreDBInstanceFromDBSnapshot",
      "secretsmanager:PutSecretValue",
      "secretsmanager:DeleteSecret",
      "secretsmanager:UpdateSecret",
      "secretsmanager:RotateSecret"
    ]

    resources = [
      "arn:aws:rds:${var.aws_region}:${var.aws_account_id}:db:*",
      "arn:aws:rds:${var.aws_region}:${var.aws_account_id}:pg:*",
      "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:*"
    ]
  }
}

resource "aws_iam_policy" "database_access" {
  name        = "kioskopos-attestation-database-access-${var.environment}"
  description = "DATABASE_ACCESS least-privilege policy for reading dedicated RDS anti-replay credentials from Secrets Manager"
  policy      = data.aws_iam_policy_document.database_access.json

  tags = {
    PolicyPurpose = "DATABASE_ACCESS"
  }
}

resource "aws_iam_role_policy_attachment" "runtime_database_access" {
  role       = aws_iam_role.runtime_service.name
  policy_arn = aws_iam_policy.database_access.arn
}

# ------------------------------------------------------------------------------
# 4. SIGNING_ACCESS Policy (attached to RUNTIME_SERVICE)
# ------------------------------------------------------------------------------

data "aws_iam_policy_document" "signing_access" {
  statement {
    sid    = "AllowEd25519SignGetPublicKeyDescribeKeyOnly"
    effect = "Allow"

    actions = [
      "kms:Sign",
      "kms:GetPublicKey",
      "kms:DescribeKey"
    ]

    resources = [
      aws_kms_key.attestation_ed25519_signing.arn
    ]

    condition {
      test     = "StringEqualsIfExists"
      variable = "kms:SigningAlgorithm"
      values   = ["ED25519_SHA_512"]
    }
  }

  statement {
    sid    = "DenyRuntimeKmsKeyCreationDeletionAndPolicyChanges"
    effect = "Deny"

    actions = [
      "kms:CreateKey",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion",
      "kms:PutKeyPolicy",
      "kms:DeleteImportedKeyMaterial",
      "kms:ImportKeyMaterial",
      "kms:DisableKey",
      "kms:EnableKey",
      "kms:CreateGrant",
      "kms:RetireGrant",
      "kms:RevokeGrant",
      "kms:DeleteAlias",
      "kms:UpdateAlias"
    ]

    resources = [
      "arn:aws:kms:${var.aws_region}:${var.aws_account_id}:key/*",
      "arn:aws:kms:${var.aws_region}:${var.aws_account_id}:alias/*"
    ]
  }
}

resource "aws_iam_policy" "signing_access" {
  name        = "kioskopos-attestation-signing-access-${var.environment}"
  description = "SIGNING_ACCESS least-privilege policy for Ed25519 signing and public key verification via AWS KMS"
  policy      = data.aws_iam_policy_document.signing_access.json

  tags = {
    PolicyPurpose = "SIGNING_ACCESS"
  }
}

resource "aws_iam_role_policy_attachment" "runtime_signing_access" {
  role       = aws_iam_role.runtime_service.name
  policy_arn = aws_iam_policy.signing_access.arn
}
