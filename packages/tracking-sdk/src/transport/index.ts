/**
 * 传输层统一导出
 *
 * @module transport
 */

export { sendBatch, sendSingleWithKeepalive } from "./fetch.js";
export { sendBeacon, sendBeaconBatch } from "./beacon.js";
export { imageBeacon } from "./fallback.js";
