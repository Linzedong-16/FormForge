/**
 * 文件上传工具 — 基于 MinIO (S3 兼容) 对象存储
 *
 * 使用场景：用户头像、问卷封面、配置文件等静态资源
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";

// ─── Bucket 常量 ─────────────────────────────────────────────

const BUCKET = process.env.MINIO_BUCKET ?? "questionnaire";

// ─── 工具函数 ────────────────────────────────────────────────

/** 生成唯一对象名，保留原始扩展名 */
function objectKey(prefix: string, originalName: string): string {
  const ext = path.extname(originalName) || "";
  return `${prefix}/${randomUUID()}${ext}`;
}

// ─── 导出方法 ────────────────────────────────────────────────

/**
 * 上传文件到 MinIO
 *
 * @param fastify   Fastify 实例
 * @param file      multipart 上传的文件 buffer
 * @param prefix    存储路径前缀（如 "avatars", "covers"）
 * @param fileName 原始文件名（用于提取扩展名）
 * @param mimeType 文件 MIME 类型
 * @returns 可公开访问的文件 URL（MinIO 需配置 public bucket policy）
 */
export async function uploadToMinio(
  fastify: FastifyInstance,
  file: Buffer,
  prefix: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  const key = objectKey(prefix, fileName);

  await fastify.minio.putObject(BUCKET, key, file, file.length, {
    "Content-Type": mimeType
  });

  return buildUrl(key);
}

/**
 * 上传文件到 MinIO（使用预计算的对象键）
 *
 * 与 uploadToMinio 的区别：不自动生成 UUID，而是使用调用方传入的完整 key。
 * 适用于需要精确控制对象键的场景（如原图/缩略图配对命名）。
 *
 * @param fastify   Fastify 实例
 * @param file      文件 buffer
 * @param key       完整的 MinIO 对象键（如 "avatars/uuid_original.jpg"）
 * @param mimeType  文件 MIME 类型
 * @returns 可公开访问的文件 URL
 */
export async function uploadToMinioWithKey(
  fastify: FastifyInstance,
  file: Buffer,
  key: string,
  mimeType: string
): Promise<string> {
  await fastify.minio.putObject(BUCKET, key, file, file.length, {
    "Content-Type": mimeType
  });

  return buildUrl(key);
}

/** 根据对象键构造 MinIO 访问 URL */
function buildUrl(key: string): string {
  const endpoint = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = process.env.MINIO_PORT ?? "9000";
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const protocol = useSSL ? "https" : "http";

  // 如果 endpoint 已包含端口号（如 "localhost:9000"），则不再拼接 MINIO_PORT
  const host = endpoint.includes(":") ? endpoint : `${endpoint}:${port}`;
  const baseUrl = `${protocol}://${host}`;
  const url = new URL(`/${BUCKET}/${key}`, baseUrl);
  return url.href;
}

/**
 * 生成预签名下载 URL（适用于私有 Bucket）
 *
 * @param fastify  Fastify 实例
 * @param objectPath MinIO 对象路径（含 Bucket）
 * @param expirySeconds 有效期秒数（默认 3600 = 1 小时）
 */
export async function getPresignedUrl(
  fastify: FastifyInstance,
  objectPath: string,
  expirySeconds = 3600
): Promise<string> {
  // objectPath 格式: "bucket/key" → 提取 key
  const normalizedPath = objectPath.startsWith(`${BUCKET}/`) ? objectPath.slice(BUCKET.length + 1) : objectPath;

  return fastify.minio.presignedGetObject(BUCKET, normalizedPath, expirySeconds);
}

/**
 * 删除 MinIO 文件
 *
 * @param fastify    Fastify 实例
 * @param objectPath MinIO 对象路径
 */
export async function deleteFromMinio(fastify: FastifyInstance, objectPath: string): Promise<void> {
  const key = objectPath.startsWith(`${BUCKET}/`) ? objectPath.slice(BUCKET.length + 1) : objectPath;

  await fastify.minio.removeObject(BUCKET, key);
}

/**
 * 从 URL 字符串中提取 MinIO 对象 key
 *
 * @example
 *   extractKey("http://localhost:9000/questionnaire/avatars/uuid.png")
 *   // → "avatars/uuid.png"
 */
export function extractKey(url: string): string | null {
  try {
    const pathname = new URL(url).pathname; // "/questionnaire/avatars/uuid.png"
    const parts = pathname.split("/").filter(Boolean); // ["questionnaire", "avatars", "uuid.png"]
    if (parts.length >= 2 && parts[0] === BUCKET) {
      return parts.slice(1).join("/"); // "avatars/uuid.png"
    }
    return null;
  } catch {
    return null;
  }
}
