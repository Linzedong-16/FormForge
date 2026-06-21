/**
 * 对称加密工具 — AES-256-GCM
 *
 * 用于保护敏感配置数据（如 SMTP 密码、DeepSeek API Key）的存储安全。
 * 密钥由环境变量 CRYPTO_ENCRYPTION_KEY 注入，必须为 32 字节（256 位）的 hex 字符串。
 *
 * 密文格式：ENC:<hex>
 *   - ENC: 前缀用于标识加密数据，替代启发式长度判断
 *   - 解密时自动去除前缀，向前兼容旧格式（无前缀密文）
 *
 * 使用方式：
 *   import { encrypt, decrypt, isEncrypted } from "../utils/crypto.js";
 *   const ciphertext = encrypt(plaintext);   // "ENC:a1b2c3..."
 *   const plaintext  = decrypt(ciphertext);  // 解密回明文
 *   if (isEncrypted(value)) { ... }          // 安全判断是否为密文
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ─── 配置 ──────────────────────────────────────────────────

/** 密文前缀标记（用于区分明文/密文，替代长度启发式） */
const ENC_PREFIX = "ENC:";
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
 * @returns "ENC:<hex>" 格式的密文，含前缀标记 + IV(12字节) + 密文 + AuthTag(16字节)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // ENC:前缀 + IV + 密文 + AuthTag，全部 hex 编码
  return ENC_PREFIX + Buffer.concat([iv, encrypted, authTag]).toString("hex");
}

/**
 * 判断值是否为加密密文（不含解密验证，仅检测前缀）
 * @param value 待检测的值
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/**
 * 解密密文
 * @param ciphertext encrypt() 返回的密文（含 ENC: 前缀）；也兼容旧格式无前缀密文
 * @returns 明文
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  // 向前兼容：去除 ENC: 前缀（新格式），无前缀则按旧格式处理
  const hex = ciphertext.startsWith(ENC_PREFIX) ? ciphertext.slice(ENC_PREFIX.length) : ciphertext;
  const data = Buffer.from(hex, "hex");

  // 按顺序提取 IV、密文、AuthTag
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
