# ==============================================================================
# Independent Attestation Authority — Dedicated AWS Infrastructure (IaC)
# Compatible with Terraform >= 1.6.0 and OpenTofu >= 1.6.0
#
# CRITICAL INVARIANTS:
# - Strictly isolated from KioskoPOS / Supabase / ARCA fiscal infrastructure
# - No DynamoDB, no public endpoints, no OIDC/mTLS deployment in this phase
# - No state files or credentials versioned in repository
# ==============================================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.23"
    }
  }
}

provider "aws" {
  region = var.aws_region

  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Service                    = "independent-attestation-authority"
      Environment                = var.environment
      ManagedBy                  = "terraform-opentofu"
      ArchitecturePhase          = "AWS-REAL-12C"
      DedicatedAuthorityInfra    = "true"
      SharedWithKioskoPos        = "false"
      SharedWithSupabase         = "false"
      ArcaConnectivityIntroduced = "false"
    }
  }
}
