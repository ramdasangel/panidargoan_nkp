import {
  S3Client, PutObjectCommand, GetObjectCommand,
  HeadBucketCommand, CreateBucketCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { config } from "./config.js";

export const s3 = new S3Client({
  endpoint: config.minioEndpoint || undefined,
  region: config.minioRegion,
  credentials: {
    accessKeyId: config.minioAccessKey,
    secretAccessKey: config.minioSecretKey,
  },
  // MinIO needs path-style URLs (bucket in path, not vhost).
  forcePathStyle: true,
});

export async function ensureBucket(): Promise<void> {
  if (!config.minioEndpoint) {
    console.warn("[storage] MINIO_ENDPOINT not set — uploads disabled");
    return;
  }
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.minioBucket }));
    console.log(`[storage] bucket "${config.minioBucket}" ready`);
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: config.minioBucket }));
      console.log(`[storage] created bucket "${config.minioBucket}"`);
    } catch (e) {
      console.error("[storage] could not create bucket:", e);
    }
  }
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: config.minioBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function getObjectStream(key: string): Promise<{
  body: Readable;
  contentType?: string;
  contentLength?: number;
}> {
  const result = await s3.send(new GetObjectCommand({ Bucket: config.minioBucket, Key: key }));
  return {
    body: result.Body as Readable,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.minioBucket, Key: key }));
}
