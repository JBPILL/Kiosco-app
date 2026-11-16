# ==============================================================================
# Non-Sensitive Outputs — Independent Attestation Authority Dedicated AWS IaC
#
# CRITICAL INVARIANT:
# - No secrets, passwords, private keys, or credential-bearing DATABASE_URL
#   are ever exposed in outputs.
# ==============================================================================

output "attestation_ed25519_signing_key_arn" {
  description = "ARN of the dedicated Ed25519 asymmetric signing key in AWS KMS (SIGN_VERIFY only)"
  value       = aws_kms_key.attestation_ed25519_signing.arn
  sensitive   = false
}

output "attestation_ed25519_signing_key_id" {
  description = "Key ID of the dedicated Ed25519 asymmetric signing key in AWS KMS"
  value       = aws_kms_key.attestation_ed25519_signing.key_id
  sensitive   = false
}

output "attestation_ed25519_signing_key_alias" {
  description = "Stable alias of the dedicated Ed25519 asymmetric signing key for manual rotation"
  value       = aws_kms_alias.attestation_ed25519_signing.name
  sensitive   = false
}

output "rds_and_secrets_encryption_key_arn" {
  description = "ARN of the separate symmetric KMS key used exclusively for RDS and Secrets Manager encryption"
  value       = aws_kms_key.rds_and_secrets_encryption.arn
  sensitive   = false
}

output "rds_postgres_instance_identifier" {
  description = "Identifier of the dedicated anti-replay RDS PostgreSQL instance"
  value       = aws_db_instance.attestation_postgres.identifier
  sensitive   = false
}

output "rds_postgres_host" {
  description = "Private hostname of the dedicated anti-replay RDS PostgreSQL instance (no credentials)"
  value       = aws_db_instance.attestation_postgres.address
  sensitive   = false
}

output "rds_postgres_port" {
  description = "TCP port of the dedicated anti-replay RDS PostgreSQL instance"
  value       = aws_db_instance.attestation_postgres.port
  sensitive   = false
}

output "rds_postgres_database_name" {
  description = "Dedicated PostgreSQL database name for anti-replay records"
  value       = aws_db_instance.attestation_postgres.db_name
  sensitive   = false
}

output "rds_master_user_secret_arn" {
  description = "ARN reference (metadata only, no secret value) of the RDS-managed Secret in AWS Secrets Manager"
  value       = aws_db_instance.attestation_postgres.master_user_secret[0].secret_arn
  sensitive   = false
}

output "runtime_service_iam_role_arn" {
  description = "ARN of the least-privilege RUNTIME_SERVICE IAM execution role"
  value       = aws_iam_role.runtime_service.arn
  sensitive   = false
}

output "infrastructure_admin_iam_role_arn" {
  description = "ARN of the INFRASTRUCTURE_ADMIN governance IAM role"
  value       = aws_iam_role.infrastructure_admin.arn
  sensitive   = false
}
