# ============================================================
# ml.tf — Bedrock IAM policies + SageMaker endpoints +
#         EventBridge nightly batch scheduler
# ============================================================

# ── Bedrock ──────────────────────────────────────────────────
# Bedrock is accessed via the Lambda role policy in api.tf.
# No additional Terraform resources needed for model access —
# foundation models are fully managed by AWS.
# This file documents the IAM boundary and adds the
# Bedrock Batch Inference execution role.

resource "aws_iam_role" "bedrock_batch" {
  name = "${var.project_name}-bedrock-batch-role-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "bedrock_batch_s3" {
  name = "${var.project_name}-bedrock-batch-s3-${var.environment}"
  role = aws_iam_role.bedrock_batch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket"]
        Resource = ["${aws_s3_bucket.site.arn}/batch-input/*", aws_s3_bucket.site.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.site.arn}/batch-output/*"
      }
    ]
  })
}

# ── SageMaker IAM Role ────────────────────────────────────────
resource "aws_iam_role" "sagemaker" {
  name = "${var.project_name}-sagemaker-role-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sagemaker.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "sagemaker_full" {
  role       = aws_iam_role.sagemaker.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/AmazonSageMakerFullAccess"
}

resource "aws_iam_role_policy" "sagemaker_s3" {
  name = "${var.project_name}-sagemaker-s3-${var.environment}"
  role = aws_iam_role.sagemaker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
      Resource = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
    }]
  })
}

# ── SageMaker Model (NER — HuggingFace BERT fine-tuned on USPS CASS data) ──
# Deploys the fine-tuned model artifact from train.py using the HuggingFace
# PyTorch inference container.
#
# Prerequisites before uncommenting:
#   1. Run train.py to produce a trained model artifact
#   2. Upload model.tar.gz to S3: s3://<bucket>/models/address-ner/model.tar.gz
#   3. Set var.sagemaker_ner_endpoint_name in terraform.tfvars
#
# The inference.py handler in infrastructure/ml/ner/inference.py is bundled
# inside the model.tar.gz by the training script.

resource "aws_sagemaker_model" "ner" {
  count              = var.enable_sagemaker_ner ? 1 : 0
  name               = "${var.project_name}-ner-${var.environment}"
  execution_role_arn = aws_iam_role.sagemaker.arn

  primary_container {
    # HuggingFace PyTorch inference container (GovCloud ECR mirror)
    image          = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/huggingface-pytorch-inference:2.1.0-transformers4.37.0-cpu-py310-ubuntu22.04"
    model_data_url = "s3://${aws_s3_bucket.site.bucket}/models/address-ner/model.tar.gz"

    environment = {
      HF_TASK                    = "token-classification"
      SAGEMAKER_CONTAINER_LOG_LEVEL = "20"
    }
  }

  tags = { Name = "${var.project_name}-ner-${var.environment}" }
}

resource "aws_sagemaker_endpoint_configuration" "ner" {
  count = var.enable_sagemaker_ner ? 1 : 0
  name  = "${var.project_name}-ner-cfg-${var.environment}"

  production_variants {
    variant_name = "primary"
    model_name   = aws_sagemaker_model.ner[0].name

    # Serverless Inference — scales to zero, no idle cost
    serverless_config {
      memory_size_in_mb = var.sagemaker_ner_memory_mb
      max_concurrency   = 10
    }
  }

  tags = { Name = "${var.project_name}-ner-cfg-${var.environment}" }
}

resource "aws_sagemaker_endpoint" "ner" {
  count                = var.enable_sagemaker_ner ? 1 : 0
  name                 = var.sagemaker_ner_endpoint_name != "" ? var.sagemaker_ner_endpoint_name : "${var.project_name}-ner-${var.environment}"
  endpoint_config_name = aws_sagemaker_endpoint_configuration.ner[0].name

  tags = { Name = "${var.project_name}-ner-${var.environment}" }
}

# ── SageMaker Model (XGBoost confidence scorer) ──────────────
resource "aws_sagemaker_model" "scorer" {
  count              = var.enable_sagemaker_scorer ? 1 : 0
  name               = "${var.project_name}-scorer-${var.environment}"
  execution_role_arn = aws_iam_role.sagemaker.arn

  primary_container {
    # AWS Scikit-learn container (includes XGBoost)
    image          = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/sagemaker-scikit-learn:1.2-1-cpu-py3"
    model_data_url = "s3://${aws_s3_bucket.site.bucket}/models/address-scorer/model.tar.gz"

    environment = {
      SAGEMAKER_CONTAINER_LOG_LEVEL = "20"
      SAGEMAKER_PROGRAM             = "train.py"
    }
  }

  tags = { Name = "${var.project_name}-scorer-${var.environment}" }
}

resource "aws_sagemaker_endpoint_configuration" "scorer" {
  count = var.enable_sagemaker_scorer ? 1 : 0
  name  = "${var.project_name}-scorer-cfg-${var.environment}"

  production_variants {
    variant_name = "primary"
    model_name   = aws_sagemaker_model.scorer[0].name

    serverless_config {
      memory_size_in_mb = 512
      max_concurrency   = 20
    }
  }

  tags = { Name = "${var.project_name}-scorer-cfg-${var.environment}" }
}

resource "aws_sagemaker_endpoint" "scorer" {
  count                = var.enable_sagemaker_scorer ? 1 : 0
  name                 = var.sagemaker_score_endpoint_name != "" ? var.sagemaker_score_endpoint_name : "${var.project_name}-scorer-${var.environment}"
  endpoint_config_name = aws_sagemaker_endpoint_configuration.scorer[0].name

  tags = { Name = "${var.project_name}-scorer-${var.environment}" }
}

data "aws_caller_identity" "current" {}

# ── SageMaker CloudWatch Alarms ───────────────────────────────
# (Activated once real endpoints are deployed)

# ── EventBridge — Nightly batch scheduler ────────────────────
resource "aws_cloudwatch_event_rule" "nightly_batch" {
  name                = "${var.project_name}-nightly-batch-${var.environment}"
  description         = "Trigger SageMaker Batch Transform nightly at 02:00 UTC"
  schedule_expression = "cron(0 2 * * ? *)"
  is_enabled          = var.enable_nightly_batch
}

resource "aws_cloudwatch_event_target" "nightly_batch_lambda" {
  rule      = aws_cloudwatch_event_rule.nightly_batch.name
  target_id = "NightlyBatchLambda"
  arn       = aws_lambda_function.verify.arn
  input     = jsonencode({ path = "/batch", httpMethod = "POST", body = "{}" })
}

resource "aws_lambda_permission" "eventbridge_batch" {
  statement_id  = "AllowEventBridgeBatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly_batch.arn
}

# ── EventBridge — Bedrock overnight correction (03:00 UTC) ───
resource "aws_cloudwatch_event_rule" "bedrock_correction" {
  name                = "${var.project_name}-bedrock-correction-${var.environment}"
  description         = "Run Bedrock batch correction on low-confidence records at 03:00 UTC"
  schedule_expression = "cron(0 3 * * ? *)"
  is_enabled          = var.enable_nightly_batch
}

resource "aws_cloudwatch_event_target" "bedrock_correction_lambda" {
  rule      = aws_cloudwatch_event_rule.bedrock_correction.name
  target_id = "BedrockCorrectionLambda"
  arn       = aws_lambda_function.verify.arn
  input     = jsonencode({ path = "/batch", httpMethod = "POST", body = "{\"mode\":\"bedrock-correction\"}" })
}

resource "aws_lambda_permission" "eventbridge_bedrock" {
  statement_id  = "AllowEventBridgeBedrock"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.bedrock_correction.arn
}

# ── CloudWatch Dashboard ──────────────────────────────────────
resource "aws_cloudwatch_dashboard" "verify" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          title  = "Lambda Invocations & Errors"
          period = 300
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.verify.function_name],
            ["AWS/Lambda", "Errors",      "FunctionName", aws_lambda_function.verify.function_name],
            ["AWS/Lambda", "Duration",    "FunctionName", aws_lambda_function.verify.function_name, { stat = "p99" }]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "API Gateway 4xx / 5xx"
          period = 300
          metrics = [
            ["AWS/ApiGateway", "4XXError", "ApiName", aws_api_gateway_rest_api.verify.name],
            ["AWS/ApiGateway", "5XXError", "ApiName", aws_api_gateway_rest_api.verify.name]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "Redis Cache Hits"
          period = 300
          metrics = [
            ["AWS/ElastiCache", "CacheHits",   "CacheClusterId", "${var.project_name}-redis-${var.environment}-0001-001"],
            ["AWS/ElastiCache", "CacheMisses",  "CacheClusterId", "${var.project_name}-redis-${var.environment}-0001-001"]
          ]
        }
      }
    ]
  })
}
