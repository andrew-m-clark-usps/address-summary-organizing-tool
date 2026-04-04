# ============================================================
# vpc.tf — VPC, Subnets, NAT Gateway
#
# Creates the private networking layer required for:
#   • Lambda (VPC-enabled for Redis + OpenSearch access)
#   • ElastiCache Redis (private subnets only)
#   • OpenSearch Service (VPC endpoint, private subnets)
#   • NAT Gateway (Lambda → Internet: USPS API, Databricks, Bedrock)
#
# Architecture:
#   AZ-1: private subnet (10.0.1.0/24) + public subnet (10.0.0.0/24)
#   AZ-2: private subnet (10.0.2.0/24) + public subnet (10.0.3.0/24)
# ============================================================

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ── VPC ──────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.project_name}-vpc-${var.environment}"
    Environment = var.environment
  }
}

# ── Internet Gateway ─────────────────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-igw-${var.environment}" }
}

# ── Public Subnets (one per AZ — for NAT Gateways) ───────────
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.project_name}-public-${count.index + 1}-${var.environment}"
    Tier = "public"
  }
}

# ── Private Subnets (Lambda, Redis, OpenSearch) ───────────────
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = local.azs[count.index]

  tags = {
    Name = "${var.project_name}-private-${count.index + 1}-${var.environment}"
    Tier = "private"
  }
}

# ── Elastic IPs for NAT Gateways ─────────────────────────────
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : 2) : 0
  domain = "vpc"
  tags   = { Name = "${var.project_name}-nat-eip-${count.index + 1}" }
}

# ── NAT Gateways ─────────────────────────────────────────────
resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : 2) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = { Name = "${var.project_name}-nat-${count.index + 1}-${var.environment}" }

  depends_on = [aws_internet_gateway.main]
}

# ── Route Tables ─────────────────────────────────────────────

# Public route table → Internet Gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${var.project_name}-rt-public-${var.environment}" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route tables → NAT Gateway
resource "aws_route_table" "private" {
  count  = var.enable_nat_gateway ? 2 : 1
  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = var.single_nat_gateway
        ? aws_nat_gateway.main[0].id
        : aws_nat_gateway.main[count.index].id
    }
  }

  tags = { Name = "${var.project_name}-rt-private-${count.index + 1}-${var.environment}" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = var.enable_nat_gateway
    ? aws_route_table.private[var.single_nat_gateway ? 0 : count.index].id
    : aws_route_table.private[0].id
}

# ── VPC Endpoints (optional — avoid NAT cost for AWS services) ─
resource "aws_vpc_endpoint" "s3" {
  vpc_id          = aws_vpc.main.id
  service_name    = "com.amazonaws.${var.aws_region}.s3"
  route_table_ids = aws_route_table.private[*].id
  tags            = { Name = "${var.project_name}-vpce-s3" }
}

resource "aws_vpc_endpoint" "secrets_manager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  tags                = { Name = "${var.project_name}-vpce-sm" }
}

# ── Security Groups ───────────────────────────────────────────

resource "aws_security_group" "lambda" {
  name        = "${var.project_name}-sg-lambda-${var.environment}"
  description = "Lambda function — outbound to Redis, OpenSearch, internet"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound (NAT Gateway → internet services)"
  }

  tags = { Name = "${var.project_name}-sg-lambda" }
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-sg-redis-${var.environment}"
  description = "ElastiCache Redis — allow Lambda inbound"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
    description     = "Redis from Lambda"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-sg-redis" }
}

resource "aws_security_group" "opensearch" {
  name        = "${var.project_name}-sg-opensearch-${var.environment}"
  description = "OpenSearch — allow Lambda inbound HTTPS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
    description     = "OpenSearch HTTPS from Lambda"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-sg-opensearch" }
}

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.project_name}-sg-vpce-${var.environment}"
  description = "Interface VPC Endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  tags = { Name = "${var.project_name}-sg-vpce" }
}
