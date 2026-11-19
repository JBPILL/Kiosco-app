# ==============================================================================
# Dedicated AWS RDS PostgreSQL for Independent Attestation Authority Anti-Replay
#
# INVARIANTS:
# - POSTGRES_DEDICATED = true
# - POSTGRES_SHARED_WITH_POS = false
# - POSTGRES_SUPABASE = false
# - PUBLICLY_ACCESSIBLE = false
# - TLS_REQUIRED = true (rds.force_ssl = 1)
# - DATABASE_ENCRYPTED_AT_REST = true (encrypted with aws_kms_key.rds_and_secrets_encryption)
# - DATABASE_NAME_DEDICATED = true
# - UNRESTRICTED_POSTGRES_INGRESS = false
# - INGRESS_0_0_0_0_5432 = false
# - Credentials managed by AWS Secrets Manager (manage_master_user_password = true)
# ==============================================================================

resource "aws_db_subnet_group" "attestation_postgres" {
  name        = "kioskopos-attestation-pg-subnets-${var.environment}"
  description = "Isolated private subnet group across 2 AZs exclusively for Independent Attestation Authority PostgreSQL"
  subnet_ids = [
    aws_subnet.private_az_a.id,
    aws_subnet.private_az_b.id
  ]

  tags = {
    Name               = "kioskopos-attestation-pg-subnets-${var.environment}"
    PostgresDedicated  = "true"
    SharedWithPos      = "false"
    PubliclyAccessible = "false"
  }
}

resource "aws_security_group" "attestation_postgres" {
  name        = "kioskopos-attestation-pg-sg-${var.environment}"
  description = "Restricts PostgreSQL TCP 5432 ingress strictly to the Independent Attestation Authority runtime security group"
  vpc_id      = aws_vpc.attestation_isolated.id

  tags = {
    Name                        = "kioskopos-attestation-pg-sg-${var.environment}"
    UnrestrictedPostgresIngress = "false"
    Ingress0000Port5432         = "false"
  }
}

resource "aws_vpc_security_group_ingress_rule" "postgres_from_runtime" {
  security_group_id            = aws_security_group.attestation_postgres.id
  description                  = "Allow PostgreSQL TCP 5432 strictly from dedicated attestation runtime security group"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.attestation_runtime.id
}

resource "aws_db_parameter_group" "attestation_postgres16" {
  name        = "kioskopos-attestation-pg16-params-${var.environment}"
  family      = "postgres16"
  description = "Enforces mandatory TLS/SSL and bounded statement timeouts for Independent Attestation Authority PostgreSQL"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "ssl_min_protocol_version"
    value        = "TLSv1.3"
    apply_method = "immediate"
  }

  parameter {
    name         = "statement_timeout"
    value        = "4000"
    apply_method = "immediate"
  }

  parameter {
    name         = "idle_in_transaction_session_timeout"
    value        = "5000"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_connections"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_disconnections"
    value        = "1"
    apply_method = "immediate"
  }

  tags = {
    Name        = "kioskopos-attestation-pg16-params-${var.environment}"
    TlsRequired = "true"
  }
}

resource "aws_db_instance" "attestation_postgres" {
  identifier     = "kioskopos-attestation-antireplay-${var.environment}"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds_and_secrets_encryption.arn

  db_name  = var.db_name
  username = var.db_master_username

  # Managed exclusively via AWS Secrets Manager — no plaintext password in Terraform variables or state
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.rds_and_secrets_encryption.key_id

  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.attestation_postgres.name
  vpc_security_group_ids = [aws_security_group.attestation_postgres.id]
  parameter_group_name   = aws_db_parameter_group.attestation_postgres16.name
  port                   = 5432
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  backup_retention_period    = var.db_backup_retention_days
  deletion_protection        = var.db_deletion_protection
  skip_final_snapshot        = false
  final_snapshot_identifier  = "kioskopos-attestation-antireplay-${var.environment}-final"
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  multi_az                   = var.environment == "production"

  tags = {
    Name                    = "kioskopos-attestation-antireplay-${var.environment}"
    Purpose                 = "INDEPENDENT_ATTESTATION_AUTHORITY_ANTI_REPLAY"
    PostgresDedicated       = "true"
    PostgresSharedWithPos   = "false"
    PostgresSupabase        = "false"
    PubliclyAccessible      = "false"
    TlsRequired             = "true"
    DatabaseEncryptedAtRest = "true"
    DatabaseNameDedicated   = "true"
  }
}
