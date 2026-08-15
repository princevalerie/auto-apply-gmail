// Neon S3 Storage client for file uploads (CV & Portfolio)
// Files are stored as binary in S3, metadata stored in PostgreSQL

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const BUCKET_NAME = "autoapply-files";

function getS3Client() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-2";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 credentials tidak tersedia. Set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY di environment.");
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

// ─── Upload File to S3 ──────────────────────────────────────

export async function uploadFileToS3(params: {
  userId: string;
  fileType: "cv" | "portfolio";
  fileName: string;
  fileBuffer: Buffer;
  mimeType?: string;
}): Promise<{ key: string; url: string }> {
  const s3 = getS3Client();

  // Generate unique key: users/{userId}/{fileType}/{timestamp}_{fileName}
  const timestamp = Date.now();
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `users/${params.userId}/${params.fileType}/${timestamp}_${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: params.fileBuffer,
      ContentType: params.mimeType || "application/pdf",
    })
  );

  // Construct the URL
  const endpoint = process.env.AWS_ENDPOINT_URL_S3!;
  const url = `${endpoint}/${BUCKET_NAME}/${key}`;

  console.log(`[S3] Uploaded: ${key} (${params.fileBuffer.length} bytes)`);

  return { key, url };
}

// ─── Download File from S3 ──────────────────────────────────

export async function downloadFileFromS3(key: string): Promise<Buffer> {
  const s3 = getS3Client();

  const result = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );

  if (!result.Body) {
    throw new Error(`File not found in S3: ${key}`);
  }

  // Convert ReadableStream to Buffer
  const chunks: Uint8Array[] = [];
  const reader = result.Body.transformToWebStream().getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

// ─── Download File from S3 URL ──────────────────────────────

export async function downloadFileFromS3Url(fileUrl: string): Promise<Buffer> {
  // Extract key from URL: https://endpoint/bucket/key
  const endpoint = process.env.AWS_ENDPOINT_URL_S3!;
  const prefix = `${endpoint}/${BUCKET_NAME}/`;

  if (!fileUrl.startsWith(prefix)) {
    throw new Error(`Invalid S3 URL: ${fileUrl}`);
  }

  const key = fileUrl.slice(prefix.length);
  return downloadFileFromS3(key);
}

// ─── Delete File from S3 ────────────────────────────────────

export async function deleteFileFromS3(key: string): Promise<void> {
  const s3 = getS3Client();

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );

  console.log(`[S3] Deleted: ${key}`);
}
