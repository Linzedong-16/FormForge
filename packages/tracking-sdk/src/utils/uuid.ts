/**
 * UUID v7 生成工具
 *
 * UUID v7 使用 UNIX 时间戳作为前 48 位，保证时间有序性，
 * 非常适合作为 ClickHouse 排序键。
 *
 * 参考 RFC 9562。
 *
 * @module utils/uuid
 */

/** 上一次生成的时间戳（毫秒），用于单调递增保证 */
let lastTimestamp = 0;
let counter = 0;

/**
 * 生成 UUID v7 格式的唯一标识符。
 *
 * UUID v7 结构：tttttttt-tttt-7xxx-yxxx-xxxxxxxxxxxx
 * - 前 48 位：UNIX 时间戳（毫秒）
 * - 版本号：7
 * - 变体号：10xx
 * - 剩余位：随机数 + 计数器
 *
 * @returns UUID v7 字符串
 *
 * @example
 * ```ts
 * const id = uuidv7();
 * // => '019a6f80-1234-7abc-8def-0123456789ab'
 * ```
 */
export function uuidv7(): string {
  const now = Date.now();

  // 确保同一毫秒内单调递增
  if (now === lastTimestamp) {
    counter++;
  } else {
    counter = 0;
    lastTimestamp = now;
  }

  const timestampHex = now.toString(16).padStart(12, "0");
  const counterHex = counter.toString(16).padStart(4, "0");

  // 生成随机部分（10 字节）
  const randomBytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    // 降级方案：Math.random
    for (let i = 0; i < 10; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  const randHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // 组装 UUID v7
  const p1 = timestampHex.slice(0, 8); // time_high
  const p2 = timestampHex.slice(8, 12); // time_mid
  const p3 = "7" + counterHex.slice(1, 4); // version(4bit) + counter_low(12bit)
  const p4 = "8" + randHex.slice(0, 3); // variant(2bit) + rand
  const p5 = randHex.slice(3, 15); // remaining random

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}
