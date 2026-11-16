# ==============================================================================
# AWS KMS Keys — Strict Separation Between Ed25519 Signing and RDS Encryption
#
# INVARIANTS:
# - KEY 1 (attestation_ed25519_signing): ECC_NIST_EDWARDS25519 / SIGN_VERIFY
#   - Private key material is generated inside AWS KMS and is NON-EXPORTABLE
#   - Never used for RDS or Secrets Manager encryption
#   - Automatic rotation disabled (asymmetric key; manual rotation via alias)
# - KEY 2 (rds_and_secrets_encryption): SYMMETRIC_DEFAULT / ENCRYPT_DECRYPT
#   - Used exclusively for RDS storage-at-rest and Secrets Manager encryption
#   - Never used for attestation signing
# ==============================================================================

resource "aws_kms_key" "attestation_ed25519_signing" {
  description              = "Dedicated Ed25519 asymmetric signing key for Independent Attestation Authority (SIGN_VERIFY only)"
  customer_master_key_spec = "ECC_NIST_EDWARDS25519"
  key_usage                = "SIGN_VERIFY"
  enable_key_rotation      = false
  deletion_window_in_days  = var.kms_key_deletion_window_in_days
  is_enabled               = true

  tags = {
    Name                         = "kioskopos-attestation-ed25519-signing-${var.environment}"
    KeyPurpose                   = "ATTESTATION_SIGNING"
    KeySpec                      = "ECC_NIST_EDWARDS25519"
    KeyUsage                     = "SIGN_VERIFY"
    SigningPrivateKeyExport      = "FORBIDDEN"
    SigningKeyReusedForRds       = "false"
    ManualRotationViaAlias       = "true"
  }
}

resource "aws_kms_alias" "attestation_ed25519_signing" {
  name          = "alias/kioskopos-attestation-signing-${var.environment}"
  target_key_id = aws_kms_key.attestation_ed25519_signing.key_id
}

data "aws_iam_policy_document" "attestation_ed25519_signing_key_policy" {
  statement {
    sid    = "AllowInfrastructureAdminKeyGovernanceOnly"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.infrastructure_admin.arn]
    }

    actions = [
      "kms:CreateAlias",
      "kms:DeleteAlias",
      "kms:DescribeKey",
      "kms:DisableKey",
      "kms:EnableKey",
      "kms:GetKeyPolicy",
      "kms:GetKeyRotationStatus",
      "kms:GetPublicKey",
      "kms:ListAliases",
      "kms:ListKeyPolicies",
      "kms:ListResourceTags",
      "kms:PutKeyPolicy",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion",
      "kms:TagResource",
      "kms:UntagResource",
      "kms:UpdateAlias",
      "kms:UpdateKeyDescription"
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowRuntimeLeastPrivilegeSignAndGetPublicKey"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.runtime_service.arn]
    }

    actions = [
      "kms:Sign",
      "kms:GetPublicKey",
      "kms:DescribeKey"
    ]

    resources = ["*"]

    condition {
      test     = "StringEqualsIfExists"
      variable = "kms:SigningAlgorithm"
      values   = ["ED25519_SHA_512"]
    }
  }

  statement {
    sid    = "DenyRuntimeKeyAdminAndDeletionAndEncryptionMisuse"
    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.runtime_service.arn]
    }

    actions = [
      "kms:PutKeyPolicy",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion",
      "kms:DeleteImportedKeyMaterial",
      "kms:ImportKeyMaterial",
      "kms:DisableKey",
      "kms:CreateGrant",
      "kms:RetireGrant",
      "kms:RevokeGrant",
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo",
      "kms:GenerateDataKey",
      "kms:GenerateDataKeyWithoutPlaintext"
    ]

    resources = ["*"]
  }
}

resource "aws_kms_key_policy" "attestation_ed25519_signing" {
  key_id = aws_kms_key.attestation_ed25519_signing.id
  policy = data.aws_iam_policy_document.attestation_ed25519_signing_key_policy.json
}

# ------------------------------------------------------------------------------
# Separate Symmetric KMS Key for RDS Storage & Secrets Manager Encryption
# ------------------------------------------------------------------------------

resource "aws_kms_key" "rds_and_secrets_encryption" {
  description              = "Dedicated symmetric KMS key for Independent Attestation Authority RDS PostgreSQL and Secrets Manager encryption"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage                = "ENCRYPT_DECRYPT"
  enable_key_rotation      = true
  deletion_window_in_days  = var.kms_key_deletion_window_in_days
  is_enabled               = true

  tags = {
    Name                            = "kioskopos-attestation-rds-encryption-${var.environment}"
    KeyPurpose                      = "RDS_ENCRYPTION"
    KeySpec                         = "SYMMETRIC_DEFAULT"
    KeyUsage                        = "ENCRYPT_DECRYPT"
    RdsEncryptionKeyReusedForSigning = "false"
    SigningKeyReusedForRds          = "false"
  }
}

resource "aws_kms_alias" "rds_and_secrets_encryption" {
  name          = "alias/kioskopos-attestation-rds-encryption-${var.environment}"
  target_key_id = aws_kms_key.rds_and_secrets_encryption.key_id
}

data "aws_iam_policy_document" "rds_and_secrets_encryption_key_policy" {
  statement {
    sid    = "AllowInfrastructureAdminSymmetricKeyGovernance"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.infrastructure_admin.arn]
    }

    actions = [
      "kms:CreateAlias",
      "kms:DeleteAlias",
      "kms:DescribeKey",
      "kms:DisableKey",
      "kms:EnableKey",
      "kms:EnableKeyRotation",
      "kms:GetKeyPolicy",
      "kms:GetKeyRotationStatus",
      "kms:ListAliases",
      "kms:ListResourceTags",
      "kms:PutKeyPolicy",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion",
      "kms:TagResource",
      "kms:UntagResource",
      "kms:UpdateAlias",
      "kms:UpdateKeyDescription"
    ]

    resources = ["*"]
  }

  statement {
    sid    = "AllowRdsAndSecretsManagerServiceUsageInAccount"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.infrastructure_admin.arn, aws_iam_role.runtime_service.arn]
    }

    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo",
      "kms:GenerateDataKey",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:CreateGrant",
      "kms:DescribeKey"
    ]

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [var.aws_account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values = [
        "rds.${var.aws_region}.amazonaws.com",
        "secretsmanager.${var.aws_region}.amazonaws.com"
      ]
    }
  }

  statement {
    sid    = "DenySigningOperationsOnRdsEncryptionKey"
    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "kms:Sign",
      "kms:Verify",
      "kms:GetPublicKey"
    ]

    resources = ["*"]
  }
}

resource "aws_kms_key_policy" "rds_and_secrets_encryption" {
  key_id = aws_kms_key.rds_and_secrets_encryption.id
  policy = data.aws_iam_policy_document.rds_and_secrets_encryption_key_policy.json
}
