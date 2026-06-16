/**
 * MinIO 对象存储插件
 *
 * 提供 S3 兼容的文件上传/下载/删除能力。
 * 使用场景：用户头像、问卷封面、配置文件等静态资源存储。
 *
 * 装饰：fastify.minio — MinIO 客户端实例
 */
import fp from "fastify-plugin";
import { Client as MinioClient } from "minio";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    minio: MinioClient;
  }
}

// ─── 工具：确保 Bucket 存在 ──────────────────────────────────

async function ensureBucket(client: MinioClient, bucket: string, region: string): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket, region);
    fastifyLog("info", `Bucket 已创建: ${bucket}`);
  }
}

// 临时引用，因 fp 包装后 this 指向 fastify
let fastifyLog: (level: string, msg: string) => void;

// ─── 插件主体 ────────────────────────────────────────────────

const minioPlugin: FastifyPluginAsync = async fastify => {
  fastifyLog = (level, msg) => fastify.log[level as "info" | "warn" | "error"](msg);

  const endpointEnv = process.env.MINIO_ENDPOINT ?? "localhost:9000";
  const accessKey = process.env.MINIO_ACCESS_KEY ?? "questionnaire";
  const secretKey = process.env.MINIO_SECRET_KEY ?? "questionnaire123";
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const bucket = process.env.MINIO_BUCKET ?? "questionnaire";
  const region = process.env.MINIO_REGION ?? "us-east-1";

  // 解析 endpoint，支持两种格式：
  // 1. localhost:9000 (包含端口)
  // 2. localhost (不含端口，使用默认端口)
  const [endPoint, endpointPort] = endpointEnv.split(":");
  const port = endpointPort ? Number(endpointPort) : useSSL ? 443 : 9000;

  const client = new MinioClient({
    endPoint,
    port: useSSL ? 443 : port,
    useSSL,
    accessKey,
    secretKey
  });

  try {
    await ensureBucket(client, bucket, region);
    fastify.log.info(`MinIO 已连接 → ${endPoint}:${port}/${bucket}`);
  } catch (err) {
    // MinIO 不可用不应阻断业务启动（本地开发可能未启动 Docker）
    fastify.log.warn(`MinIO 连接失败（文件上传将不可用）: ${(err as Error).message}`);
  }

  fastify.decorate("minio", client);

  // 无需 onClose 清理：MinIO 客户端是无状态 HTTP，无连接池
};

export default fp(minioPlugin, { name: "minio" });
