# ============================================================
# cache.tf — ElastiCache Redis (GovCloud)
#
# Creates:
#   • Subnet group (private subnets from vpc.tf)
#   • Redis 7.x replication group (TLS + AUTH)
#   • Parameter group (optimized for address caching workload)
# ============================================================

# ── Parameter Group ──────────────────────────────────────────
resource "aws_elasticache_parameter_group" "redis" {
  name        = "${var.project_name}-redis-params-${var.environment}"
  family      = "redis7"
  description = "Address Tool Redis parameters"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"   # Evict least-recently-used keys when memory full
  }

  parameter {
    name  = "timeout"
    value = "300"           # Close idle connections after 5 minutes
  }
}

# ── Subnet Group ─────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.project_name}-redis-subnets-${var.environment}"
  description = "Private subnets for ElastiCache Redis"
  subnet_ids  = aws_subnet.private[*].id
}

# ── Replication Group (Redis Cluster) ────────────────────────
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project_name}-redis-${var.environment}"
  description          = "Address Verification Redis cache — ${var.environment}"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  # Replication (HA)
  num_cache_clusters         = var.redis_num_replicas + 1   # 1 primary + N replicas
  automatic_failover_enabled = var.redis_num_replicas > 0
  multi_az_enabled           = var.redis_num_replicas > 0

  # Encryption
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                  = random_password.redis_auth.result

  # Maintenance
  apply_immediately          = var.environment != "prod"
  auto_minor_version_upgrade = true
  maintenance_window         = "sun:05:00-sun:06:00"
  snapshot_window            = "04:00-05:00"
  snapshot_retention_limit   = var.environment == "prod" ? 7 : 1

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = {
    Name        = "${var.project_name}-redis-${var.environment}"
    Environment = var.environment
  }

  depends_on = [aws_secretsmanager_secret_version.redis]
}

# ── CloudWatch Log Group for slow queries ────────────────────
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/${var.project_name}-${var.environment}/slow-log"
  retention_in_days = 30
}
