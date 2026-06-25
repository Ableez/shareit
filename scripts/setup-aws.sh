#!/usr/bin/env bash
# scripts/setup-aws.sh
#
# Provisions the AWS resources Shareit needs: a private S3 bucket plus an
# IAM user with the minimum permissions Convex needs to mint presigned URLs.
#
# Requires: awscli v2 (https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)
#
# Usage:
#   AWS_PROFILE=myaccount ./scripts/setup-aws.sh <bucket-name> <region>
#   ./scripts/setup-aws.sh shareit-prod us-east-1
#
# After it finishes, set:
#   AWS_ACCESS_KEY_ID      → from the printed "AccessKey" line
#   AWS_SECRET_ACCESS_KEY  → from the printed "SecretKey" line
#   S3_BUCKET              → the bucket name you passed in
#   AWS_REGION             → the region you passed in
#
# Then either:
#   npx convex env set AWS_ACCESS_KEY_ID ...
#   npx convex env set AWS_SECRET_ACCESS_KEY ...
#   npx convex env set S3_BUCKET <bucket>
#   npx convex env set AWS_REGION <region>
# or put them in .env.local for the Next.js side.

set -euo pipefail

BUCKET="${1:-}"
REGION="${2:-us-east-1}"
USER_NAME="shareit-convex-${BUCKET}"

if [[ -z "$BUCKET" ]]; then
  echo "Usage: $0 <bucket-name> <region>" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html" >&2
  exit 1
fi

echo ">>> Verifying caller identity"
aws sts get-caller-identity --output table

echo ">>> Creating private bucket s3://${BUCKET} in ${REGION}"
if [[ "$REGION" == "us-east-1" ]]; then
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION"
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi

echo ">>> Blocking all public access"
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo ">>> Enforcing SSL on every request"
cat > /tmp/shareit-bucket-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::${BUCKET}",
        "arn:aws:s3:::${BUCKET}/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
JSON
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/shareit-bucket-policy.json
rm -f /tmp/shareit-bucket-policy.json

echo ">>> Setting CORS so the dashboard can PUT/GET via presigned URLs"
cat > /tmp/shareit-cors.json <<'JSON'
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
JSON
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration file:///tmp/shareit-cors.json
rm -f /tmp/shareit-cors.json

echo ">>> Enabling server-side encryption by default"
aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

echo ">>> Setting lifecycle rule: abort incomplete multipart uploads after 1 day"
cat > /tmp/shareit-lifecycle.json <<'JSON'
{
  "Rules": [
    {
      "ID": "abort-stale-mpu",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
JSON
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" \
  --lifecycle-configuration file:///tmp/shareit-lifecycle.json
rm -f /tmp/shareit-lifecycle.json

echo ">>> Tagging the bucket"
aws s3api put-bucket-tagging \
  --bucket "$BUCKET" \
  --tagging "TagSet=[{Key=app,Value=shareit},{Key=managed-by,Value=setup-aws.sh}]"

echo ">>> Creating IAM policy ${USER_NAME}-policy"
POLICY_ARN=$(aws iam create-policy \
  --policy-name "${USER_NAME}-policy" \
  --policy-document "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${BUCKET}"]
    },
    {
      "Sid": "ReadWriteObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": ["arn:aws:s3:::${BUCKET}/*"]
    }
  ]
}
JSON
)" \
  --query 'Policy.Arn' --output text)

echo ">>> Creating IAM user ${USER_NAME}"
aws iam create-user --user-name "$USER_NAME" || echo "(user may already exist)"

echo ">>> Attaching policy to user"
aws iam attach-user-policy --user-name "$USER_NAME" --policy-arn "$POLICY_ARN"

echo ">>> Creating access key"
KEY_JSON=$(aws iam create-access-key --user-name "$USER_NAME" --output json)
ACCESS_KEY=$(echo "$KEY_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['AccessKey']['AccessKeyId'])")
SECRET_KEY=$(echo "$KEY_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['AccessKey']['SecretAccessKey'])")

cat <<EOF

================================================================
  Shareit AWS setup complete
================================================================

  Bucket:       s3://${BUCKET}  (region ${REGION})
  Bucket policy: TLS-only, no public access, AES-256 default
  CORS:         GET/PUT/HEAD from any origin (presigned URLs)
  Lifecycle:    1-day abort for incomplete multipart uploads
  IAM user:     ${USER_NAME}
  IAM policy:   ${POLICY_ARN}

  AccessKey:    ${ACCESS_KEY}
  SecretKey:    ${SECRET_KEY}

  >>> Push to Convex (run from the project root):
  npx convex env set AWS_ACCESS_KEY_ID "${ACCESS_KEY}"
  npx convex env set AWS_SECRET_ACCESS_KEY "${SECRET_KEY}"
  npx convex env set S3_BUCKET "${BUCKET}"
  npx convex env set AWS_REGION "${REGION}"

  >>> Or paste into .env.local for the Next.js side:
  AWS_ACCESS_KEY_ID=${ACCESS_KEY}
  AWS_SECRET_ACCESS_KEY=${SECRET_KEY}
  S3_BUCKET=${BUCKET}
  AWS_REGION=${REGION}

  >>> Verify it works:
  aws s3api put-object --bucket "${BUCKET}" --key smoke-test.txt --body <(echo hi) --region "${REGION}"
  aws s3api delete-object --bucket "${BUCKET}" --key smoke-test.txt --region "${REGION}"

  >>> Tear-down (only if you ever want to nuke the setup):
  aws iam detach-user-policy --user-name "${USER_NAME}" --policy-arn "${POLICY_ARN}"
  aws iam delete-access-key --user-name "${USER_NAME}" --access-key-id "${ACCESS_KEY}"
  aws iam delete-user --user-name "${USER_NAME}"
  aws iam delete-policy --policy-arn "${POLICY_ARN}"
  aws s3 rb "s3://${BUCKET}" --force

================================================================
EOF
