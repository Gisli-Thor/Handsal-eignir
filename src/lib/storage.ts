/**
 * S3-compatible object storage (SPEC §2): MinIO in local dev, R2/S3 in
 * production. Binaries never touch Postgres — rows store keys only.
 * Uploads happen browser → storage via presigned PUT; downloads via
 * short-lived signed GET URLs (SPEC §13 security).
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

const globalForStorage = globalThis as unknown as {
  s3Client?: S3Client;
  s3BucketEnsured?: boolean;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export function getS3(): S3Client {
  if (!globalForStorage.s3Client) {
    globalForStorage.s3Client = new S3Client({
      endpoint: required("S3_ENDPOINT"),
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY_ID"),
        secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      },
    });
  }
  return globalForStorage.s3Client;
}

export function getBucket(): string {
  return required("S3_BUCKET");
}

/** Create the bucket if it does not exist (dev/MinIO convenience). */
export async function ensureBucket(): Promise<void> {
  if (globalForStorage.s3BucketEnsured) return;
  const s3 = getS3();
  const Bucket = getBucket();
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket }));
  }
  globalForStorage.s3BucketEnsured = true;
}

/** Presigned browser upload URL. The signature pins content type. */
export async function presignUpload(
  key: string,
  contentType: string,
): Promise<string> {
  await ensureBucket();
  return getSignedUrl(
    getS3(),
    new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

/** Short-lived signed download URL; `filename` forces a download dialog. */
export async function presignDownload(
  key: string,
  filename?: string,
): Promise<string> {
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ...(filename
        ? {
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          }
        : {}),
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const response = await getS3().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!response.Body) throw new Error(`Object ${key} has no body`);
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await ensureBucket();
  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObjects(keys: Array<string | null | undefined>): Promise<void> {
  const s3 = getS3();
  const Bucket = getBucket();
  await Promise.all(
    keys
      .filter((key): key is string => Boolean(key))
      .map((Key) => s3.send(new DeleteObjectCommand({ Bucket, Key }))),
  );
}
