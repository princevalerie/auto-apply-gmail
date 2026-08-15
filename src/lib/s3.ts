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

// ─── Extract S3 Key from URL / Path ─────────────────────────

export function extractS3Key(fileUrl: string): string {
  if (!fileUrl) return "";

  // 1. If URL contains /<bucket_name>/...
  if (fileUrl.includes(`/${BUCKET_NAME}/`)) {
    return fileUrl.split(`/${BUCKET_NAME}/`)[1];
  }

  // 2. If URL contains users/<userId>/...
  if (fileUrl.includes("users/")) {
    return fileUrl.slice(fileUrl.indexOf("users/"));
  }

  // 3. If it's a full URL (https://endpoint/bucket/key or path-style)
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    try {
      const urlObj = new URL(fileUrl);
      const pathname = urlObj.pathname.replace(/^\/+/, ""); // remove leading slash
      if (pathname.startsWith(`${BUCKET_NAME}/`)) {
        return pathname.slice(BUCKET_NAME.length + 1);
      }
      return pathname;
    } catch {
      // Ignore parse error and fallback
    }
  }

  // 4. Return as-is if it's already a relative key
  return fileUrl.replace(/^\/+/, "");
}

// ─── Download File from S3 URL ──────────────────────────────

export async function downloadFileFromS3Url(fileUrl: string): Promise<Buffer> {
  const key = extractS3Key(fileUrl);
  if (!key) {
    throw new Error(`Tidak dapat mengekstrak S3 key dari URL: ${fileUrl}`);
  }

  console.log(`[S3] Downloading from extracted key: "${key}" (original: "${fileUrl}")`);
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

// ─── Delete File from S3 URL ────────────────────────────────

export async function deleteFileFromS3Url(fileUrl: string): Promise<void> {
  const key = extractS3Key(fileUrl);
  if (!key) {
    console.warn(`[S3] Could not extract key to delete: ${fileUrl}`);
    return;
  }
  return deleteFileFromS3(key);
}
