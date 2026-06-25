import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

export function s3(): S3Client {
  if (_client) return _client;
  const region = process.env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is not configured");
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in Convex env",
    );
  }
  _client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function bucketName(): string {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET is not configured");
  return name;
}
