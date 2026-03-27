# ============================================================
# api.tf — Lambda Function + IAM Role + API Gateway REST API
#
# Resources:
#   1. IAM role + policies for Lambda
#   2. CloudWatch log group for Lambda
#   3. Lambda function (VPC-enabled)
#   4. API Gateway REST API (proxy+)
#   5. API key + usage plan + stage throttling
#   6. WAF WebACL association
# ============================================================

# ── 1. IAM Role for Lambda ────────────────────────────────────
resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.project_name}-lambda-role" }
}

# VPC network interface management (required for VPC Lambda)
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# X-Ray tracing
resource "aws_iam_role_policy_attachment" "lambda_xray" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# Inline policy: Secrets Manager, OpenSearch, Bedrock, SageMaker, S3 (batch)
resource "aws_iam_role_policy" "lambda_inline" {
  name = "${var.project_name}-lambda-policy-${var.environment}"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Secrets Manager — read all project secrets
      {
        Sid      = "SecretsRead"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.usps.arn,
          aws_secretsmanager_secret.databricks.arn,
          aws_secretsmanager_secret.redis.arn,
          aws_secretsmanager_secret.opensearch.arn
        ]
      },
      # OpenSearch — full access to domain
      {
        Sid      = "OpenSearchAccess"
        Effect   = "Allow"
        Action   = ["es:ESHttp*"]
        Resource = "${aws_opensearch_domain.main.arn}/*"
      },
      # Bedrock — invoke models (Claude + Titan)
      {
        Sid    = "BedrockInvoke"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws-us-gov:bedrock:${var.aws_region}::foundation-model/anthropic.claude-3-5-haiku*",
          "arn:aws-us-gov:bedrock:${var.aws_region}::foundation-model/anthropic.claude-3-sonnet*",
          "arn:aws-us-gov:bedrock:${var.aws_region}::foundation-model/amazon.titan-embed*"
        ]
      },
      # SageMaker — invoke real-time endpoints
      {
        Sid    = "SageMakerInvoke"
        Effect = "Allow"
        Action = ["sagemaker:InvokeEndpoint"]
        Resource = [
          "arn:aws-us-gov:sagemaker:${var.aws_region}:*:endpoint/${var.sagemaker_ner_endpoint_name}",
          "arn:aws-us-gov:sagemaker:${var.aws_region}:*:endpoint/${var.sagemaker_score_endpoint_name}"
        ]
      },
      # SageMaker — create batch transform jobs (for /batch endpoint)
      {
        Sid    = "SageMakerBatch"
        Effect = "Allow"
        Action = [
          "sagemaker:CreateTransformJob",
          "sagemaker:DescribeTransformJob",
          "sagemaker:StopTransformJob"
        ]
        Resource = "arn:aws-us-gov:sagemaker:${var.aws_region}:*:transform-job/*"
      },
      # S3 — batch job staging bucket
      {
        Sid    = "S3BatchStaging"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.site.arn,
          "${aws_s3_bucket.site.arn}/*"
        ]
      },
      # CloudWatch Logs (supplementing the managed policy)
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws-us-gov:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.project_name}-*"
      }
    ]
  })
}

# ── 2. CloudWatch Log Group ───────────────────────────────────
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-verify-${var.environment}"
  retention_in_days = 90   # FedRAMP AU-11: retain audit logs ≥ 90 days
}

# ── 3. Lambda Function ────────────────────────────────────────
resource "aws_lambda_function" "verify" {
  function_name = "${var.project_name}-verify-${var.environment}"
  description   = "Address Verification — USPS + Bedrock + SageMaker + Redis + OpenSearch + Databricks"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = "${path.module}/../../lambda-package/lambda.zip"
  timeout       = var.lambda_timeout_sec
  memory_size   = var.lambda_memory_mb

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  environment {
    variables = {
      # Redis
      REDIS_HOST       = aws_elasticache_replication_group.redis.primary_endpoint_address
      REDIS_PORT       = "6379"
      REDIS_SECRET_ARN = aws_secretsmanager_secret.redis.arn

      # OpenSearch
      OPENSEARCH_ENDPOINT = aws_opensearch_domain.main.endpoint

      # Databricks
      DATABRICKS_SECRET_ARN  = aws_secretsmanager_secret.databricks.arn
      DATABRICKS_CATALOG     = var.databricks_catalog
      DATABRICKS_SCHEMA      = var.databricks_schema

      # USPS
      USPS_SECRET_ARN   = aws_secretsmanager_secret.usps.arn
      USPS_API_BASE_URL = var.usps_api_base_url

      # Bedrock
      BEDROCK_MODEL_HAIKU  = var.bedrock_model_haiku
      BEDROCK_MODEL_SONNET = var.bedrock_model_sonnet
      BEDROCK_MODEL_EMBED  = var.bedrock_model_embed
      BEDROCK_KNN_ENABLED  = var.enable_bedrock_knn ? "true" : "false"

      # SageMaker
      SAGEMAKER_NER_ENDPOINT_NAME   = var.sagemaker_ner_endpoint_name
      SAGEMAKER_SCORE_ENDPOINT_NAME = var.sagemaker_score_endpoint_name

      # CORS
      CORS_ORIGIN = var.cors_origin

      # Region
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_vpc,
    aws_cloudwatch_log_group.lambda
  ]

  tags = {
    Name        = "${var.project_name}-verify-${var.environment}"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]  # Managed by deploy workflow
  }
}

# ── 4. API Gateway REST API ───────────────────────────────────
resource "aws_api_gateway_rest_api" "verify" {
  name        = "${var.project_name}-api-${var.environment}"
  description = "Address Verification API — ${var.environment}"

  endpoint_configuration { types = ["REGIONAL"] }

  tags = { Name = "${var.project_name}-api-${var.environment}" }
}

# ── 4a. Proxy resource {proxy+} ──────────────────────────────
resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.verify.id
  parent_id   = aws_api_gateway_rest_api.verify.root_resource_id
  path_part   = "{proxy+}"
}

# ANY method — Lambda handles routing internally
resource "aws_api_gateway_method" "proxy_any" {
  rest_api_id      = aws_api_gateway_rest_api.verify.id
  resource_id      = aws_api_gateway_resource.proxy.id
  http_method      = "ANY"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "proxy" {
  rest_api_id             = aws_api_gateway_rest_api.verify.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.verify.invoke_arn
}

# Root resource
resource "aws_api_gateway_method" "root_any" {
  rest_api_id      = aws_api_gateway_rest_api.verify.id
  resource_id      = aws_api_gateway_rest_api.verify.root_resource_id
  http_method      = "ANY"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "root" {
  rest_api_id             = aws_api_gateway_rest_api.verify.id
  resource_id             = aws_api_gateway_rest_api.verify.root_resource_id
  http_method             = aws_api_gateway_method.root_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.verify.invoke_arn
}

# ── 4b. Lambda permission for API Gateway ────────────────────
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.verify.execution_arn}/*/*"
}

# ── 4c. Deployment + Stage ────────────────────────────────────
resource "aws_api_gateway_deployment" "verify" {
  rest_api_id = aws_api_gateway_rest_api.verify.id

  triggers = {
    redeploy = sha1(jsonencode([
      aws_api_gateway_resource.proxy.id,
      aws_api_gateway_method.proxy_any.id,
      aws_api_gateway_integration.proxy.id
    ]))
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = 90
}

resource "aws_api_gateway_stage" "verify" {
  deployment_id = aws_api_gateway_deployment.verify.id
  rest_api_id   = aws_api_gateway_rest_api.verify.id
  stage_name    = var.environment

  xray_tracing_enabled = var.enable_xray

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
    })
  }

  default_route_settings {
    # Throttling at stage level
    throttling_burst_limit = 500
    throttling_rate_limit  = 200
  }

  tags = { Name = "${var.project_name}-stage-${var.environment}" }

  depends_on = [aws_cloudwatch_log_group.apigw]
}

# ── 4d. CloudWatch logging role for API Gateway ───────────────
resource "aws_api_gateway_account" "this" {
  cloudwatch_role_arn = aws_iam_role.apigw_cw.arn
}

resource "aws_iam_role" "apigw_cw" {
  name = "${var.project_name}-apigw-cw-role-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apigw_cw" {
  role       = aws_iam_role.apigw_cw.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# ── 5. API Key + Usage Plan ───────────────────────────────────
resource "aws_api_gateway_api_key" "admin" {
  name    = "${var.project_name}-admin-key-${var.environment}"
  enabled = true
}

resource "aws_api_gateway_api_key" "user" {
  name    = "${var.project_name}-user-key-${var.environment}"
  enabled = true
}

resource "aws_api_gateway_usage_plan" "verify" {
  name        = "${var.project_name}-usage-plan-${var.environment}"
  description = "Address Verification API — ${var.environment}"

  api_stages {
    api_id = aws_api_gateway_rest_api.verify.id
    stage  = aws_api_gateway_stage.verify.stage_name
  }

  throttle_settings {
    burst_limit = 500
    rate_limit  = 200
  }

  quota_settings {
    limit  = 100000
    period = "MONTH"
  }
}

resource "aws_api_gateway_usage_plan_key" "admin" {
  key_id        = aws_api_gateway_api_key.admin.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.verify.id
}

resource "aws_api_gateway_usage_plan_key" "user" {
  key_id        = aws_api_gateway_api_key.user.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.verify.id
}

# ── 6. WAF WebACL + Association ───────────────────────────────
resource "aws_wafv2_web_acl" "api" {
  count = var.enable_api_waf ? 1 : 0
  name  = "${var.project_name}-api-waf-${var.environment}"
  scope = "REGIONAL"

  default_action { allow {} }

  # AWS Managed Rules — Common Rule Set (OWASP Top 10)
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Known Bad Inputs (Log4j, Spring4Shell, etc.)
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  # SQL Injection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLiRuleSet"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-api-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${var.project_name}-api-waf-${var.environment}" }
}

resource "aws_wafv2_web_acl_association" "api" {
  count        = var.enable_api_waf ? 1 : 0
  resource_arn = aws_api_gateway_stage.verify.arn
  web_acl_arn  = aws_wafv2_web_acl.api[0].arn
}

# ── CloudWatch Alarms ─────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.project_name}-lambda-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Lambda error rate elevated"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.verify.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "${var.project_name}-lambda-p99-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  extended_statistic  = "p99"
  threshold           = 10000    # 10 seconds p99
  alarm_description   = "Lambda p99 latency exceeds 10s"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.verify.function_name
  }
}
