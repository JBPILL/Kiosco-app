# ==============================================================================
# Self-Contained Zero-Fixed-Cost Isolated VPC & Private Subnet Topology
#
# CRITICAL INVARIANTS (AWS-REAL-12C):
# - Dedicated isolated VPC (10.240.0.0/24 by default) separated from POS/Supabase
# - Two isolated private subnets across two Availability Zones for RDS Subnet Group
# - Zero Internet Gateway (aws_internet_gateway = 0)
# - Zero NAT Gateway (aws_nat_gateway = 0 -> $0 fixed hourly/data NAT cost)
# - Zero paid Interface VPC Endpoints unless explicitly authorized in a later phase
# - Default VPC security group locked down with zero ingress/egress rules
# - Dedicated runtime Security Group allowed to egress TCP 5432 only to RDS SG
# ==============================================================================

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "attestation_isolated" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name               = "kioskopos-attestation-isolated-vpc-${var.environment}"
    PostgresDedicated  = "true"
    SharedWithPos      = "false"
    ZeroFixedCostVpc   = "true"
    InternetGateway    = "NONE"
    NatGateway         = "NONE"
    PubliclyAccessible = "false"
  }
}

resource "aws_default_security_group" "isolated_default" {
  vpc_id = aws_vpc.attestation_isolated.id

  tags = {
    Name = "kioskopos-attestation-default-sg-locked-${var.environment}"
  }
}

resource "aws_subnet" "private_az_a" {
  vpc_id                  = aws_vpc.attestation_isolated.id
  cidr_block              = var.private_subnet_a_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = false

  tags = {
    Name               = "kioskopos-attestation-private-subnet-a-${var.environment}"
    SubnetTier         = "PRIVATE_ISOLATED"
    PubliclyAccessible = "false"
    SharedWithPos      = "false"
  }
}

resource "aws_subnet" "private_az_b" {
  vpc_id                  = aws_vpc.attestation_isolated.id
  cidr_block              = var.private_subnet_b_cidr
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = false

  tags = {
    Name               = "kioskopos-attestation-private-subnet-b-${var.environment}"
    SubnetTier         = "PRIVATE_ISOLATED"
    PubliclyAccessible = "false"
    SharedWithPos      = "false"
  }
}

resource "aws_route_table" "isolated_private" {
  vpc_id = aws_vpc.attestation_isolated.id

  tags = {
    Name            = "kioskopos-attestation-isolated-rt-${var.environment}"
    InternetGateway = "NONE"
    NatGateway      = "NONE"
  }
}

resource "aws_route_table_association" "private_az_a" {
  subnet_id      = aws_subnet.private_az_a.id
  route_table_id = aws_route_table.isolated_private.id
}

resource "aws_route_table_association" "private_az_b" {
  subnet_id      = aws_subnet.private_az_b.id
  route_table_id = aws_route_table.isolated_private.id
}

resource "aws_security_group" "attestation_runtime" {
  name        = "kioskopos-attestation-runtime-sg-${var.environment}"
  description = "Least-privilege Security Group for the Independent Attestation Authority runtime"
  vpc_id      = aws_vpc.attestation_isolated.id

  tags = {
    Name          = "kioskopos-attestation-runtime-sg-${var.environment}"
    ComponentRole = "ATTESTATION_RUNTIME"
    SharedWithPos = "false"
  }
}

resource "aws_vpc_security_group_egress_rule" "runtime_to_postgres" {
  security_group_id            = aws_security_group.attestation_runtime.id
  description                  = "Allow PostgreSQL TCP 5432 egress strictly to dedicated attestation RDS SG"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.attestation_postgres.id
}
