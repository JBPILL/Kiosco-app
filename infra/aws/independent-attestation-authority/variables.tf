# ==============================================================================
# Input Variables — Independent Attestation Authority Dedicated AWS IaC
# No Account ID, Region, Password, or URL hardcoded
# ==============================================================================

variable "aws_account_id" {
  description = "Dedicated 12-digit AWS Account ID authorized for Independent Attestation Authority"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id)) && var.aws_account_id != "000000000000" && var.aws_account_id != "123456789012"
    error_message = "aws_account_id must be a valid non-placeholder 12-digit AWS Account ID."
  }
}

variable "aws_region" {
  description = "Explicit AWS region for the dedicated attestation infrastructure (must not be hardcoded)"
  type        = string

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[1-9][0-9]*$", var.aws_region))
    error_message = "aws_region must be a valid AWS region identifier."
  }
}

variable "environment" {
  description = "Deployment environment identifier (staging or production)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either 'staging' or 'production'."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the dedicated isolated VPC (no Internet Gateway, no NAT Gateway)"
  type        = string
  default     = "10.240.0.0/24"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && var.vpc_cidr != "0.0.0.0/0"
    error_message = "vpc_cidr must be a valid private IPv4 CIDR block."
  }
}

variable "private_subnet_a_cidr" {
  description = "CIDR block for isolated private subnet A (AZ 1)"
  type        = string
  default     = "10.240.0.0/26"

  validation {
    condition     = can(cidrhost(var.private_subnet_a_cidr, 0)) && var.private_subnet_a_cidr != "0.0.0.0/0"
    error_message = "private_subnet_a_cidr must be a valid private IPv4 CIDR block."
  }
}

variable "private_subnet_b_cidr" {
  description = "CIDR block for isolated private subnet B (AZ 2)"
  type        = string
  default     = "10.240.0.64/26"

  validation {
    condition     = can(cidrhost(var.private_subnet_b_cidr, 0)) && var.private_subnet_b_cidr != "0.0.0.0/0" && var.private_subnet_b_cidr != var.private_subnet_a_cidr
    error_message = "private_subnet_b_cidr must be a valid private IPv4 CIDR block distinct from subnet A."
  }
}

variable "db_name" {
  description = "Dedicated PostgreSQL database name for anti-replay state (forbidden to share POS/Supabase names)"
  type        = string
  default     = "attestation_anti_replay"

  validation {
    condition = (
      can(regex("^[a-z][a-z0-9_]{2,62}$", var.db_name)) &&
      !contains(["postgres", "kiosco", "kioscopos", "kiosco_pos", "pos", "supabase", "arca", "afip"], lower(var.db_name))
    )
    error_message = "db_name must be a dedicated identifier and must never use reserved or shared POS/Supabase database names."
  }
}

variable "db_master_username" {
  description = "Master username for the dedicated RDS PostgreSQL instance (password managed by AWS Secrets Manager)"
  type        = string
  default     = "attestation_admin"

  validation {
    condition = (
      can(regex("^[a-z][a-z0-9_]{2,62}$", var.db_master_username)) &&
      !contains(["postgres", "root", "admin", "supabase_admin", "kiosco"], lower(var.db_master_username))
    )
    error_message = "db_master_username must be a dedicated identifier and not a generic/shared username."
  }
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance class (deliberately minimal starting footprint)"
  type        = string
  default     = "db.t4g.micro"

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.db_instance_class))
    error_message = "db_instance_class must be a valid RDS instance class (e.g. db.t4g.micro)."
  }
}

variable "db_allocated_storage_gb" {
  description = "Allocated gp3 storage in GiB for dedicated anti-replay RDS PostgreSQL"
  type        = number
  default     = 20

  validation {
    condition     = var.db_allocated_storage_gb >= 20 && var.db_allocated_storage_gb <= 1000
    error_message = "db_allocated_storage_gb must be between 20 and 1000 GiB."
  }
}

variable "db_backup_retention_days" {
  description = "Automated RDS backup retention period in days"
  type        = number
  default     = 7

  validation {
    condition     = var.db_backup_retention_days >= 7 && var.db_backup_retention_days <= 35
    error_message = "db_backup_retention_days must be between 7 and 35 days."
  }
}

variable "db_deletion_protection" {
  description = "Enforces accidental deletion protection on the dedicated RDS PostgreSQL instance"
  type        = bool
  default     = true

  validation {
    condition     = var.db_deletion_protection == true
    error_message = "db_deletion_protection must remain true to prevent accidental database destruction."
  }
}

variable "kms_key_deletion_window_in_days" {
  description = "Waiting period in days before a scheduled KMS key deletion takes effect"
  type        = number
  default     = 30

  validation {
    condition     = var.kms_key_deletion_window_in_days >= 7 && var.kms_key_deletion_window_in_days <= 30
    error_message = "kms_key_deletion_window_in_days must be between 7 and 30 days."
  }
}
