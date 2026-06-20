/**
 * 对称加密工具 — AES-256-GCM
 *
 * 用于保护敏感配置数据（如 SMTP 密码）的存储安全。
 * 密钥由环境变量 CRYPTO_ENCRYPTION_KEY 注入，必须为 32 字节（256 位）的 hex 字符串。
 *
 * 使用方式：
 *   import { encrypt, decrypt } from "../utils/crypto.js";
 *   const ciphertext = encrypt(plaintext);   // 返回 hex 编码的密文（含 IV + authTag）
 *   const plaintext  = decrypt(ciphertext);  // 解密回明文
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ─── 配置 ──────────────────────────────────────────────────

/** 加密算法 */
const ALGORITHM = "aes-256-gcm";
/** IV 长度（字节），GCM 推荐 12 */
const IV_LENGTH = 12;
/** Auth Tag 长度（字节），GCM 推荐 16 */
const AUTH_TAG_LENGTH = 16;

/** 获取加密密钥 — 必须为 32 字节 hex 字符串 */
function getKey(): Buffer {
  const hex = process.env.CRYPTO_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("CRYPTO_ENCRYPTION_KEY 环境变量未配置，无法进行加密操作");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("CRYPTO_ENCRYPTION_KEY 必须为 64 位 hex 字符串（32 字节）");
  }
  return key;
}

// ─── 公开方法 ──────────────────────────────────────────────

/**
 * 加密明文
 * @param plaintext 明文
 * @returns hex 编码的密文，格式：IV(12字节) + 密文 + AuthTag(16字节)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // IV + 密文 + AuthTag，全部 hex 编码
  return Buffer.concat([iv, encrypted, authTag]).toString("hex");
}

/**
 * 解密密文
 * @param ciphertext encrypt() 返回的 hex 密文
 * @returns 明文
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertext, "hex");

  // 按顺序提取 IV、密文、AuthTag
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
