/**
 * 会话管理模块
 *
 * - session_id：浏览器标签页级别，存 sessionStorage，关闭即失效
 * - device_id：设备级别，存 localStorage，长期稳定
 * - anonymous_id：匿名用户标识，存 localStorage，用于未登录用户追踪
 *
 * @module core/session
 */

import { uuidv7 } from "../utils/uuid.js";

/** sessionStorage 存储键 */
const SESSION_KEY = "__track_sid";

/** localStorage 存储键 */
const DEVICE_KEY = "__track_did";
const ANON_KEY = "__track_aid";

/** 会话空闲超时（毫秒），超过后视为新会话，默认 30 分钟 */
const SESSION_IDLE_TIMEOUT = 30 * 60 * 1000;

/**
 * 会话管理器。
 *
 * 负责创建和维护会话 ID、设备 ID、匿名用户 ID。
 * 会话在浏览器标签页级别唯一，空闲超过 30 分钟后自动续期。
 */
class SessionManager {
  private _sessionId: string;
  private _deviceId: string;
  private _anonymousId: string;
  private _lastActivity: number;

  constructor(deviceId?: string) {
    this._deviceId = this.resolveDeviceId(deviceId);
    this._anonymousId = this.resolveAnonymousId();
    this._sessionId = this.resolveSessionId();
    this._lastActivity = Date.now();
  }

  /** 获取当前会话 ID */
  get sessionId(): string {
    this.touchIfIdle();
    return this._sessionId;
  }

  /** 获取设备 ID */
  get deviceId(): string {
    return this._deviceId;
  }

  /** 获取匿名用户 ID */
  get anonymousId(): string {
    return this._anonymousId;
  }

  /**
   * 续期会话：如果距离上次活动超过空闲超时阈值，
   * 则生成新的会话 ID 并更新 sessionStorage。
   */
  private touchIfIdle(): void {
    const now = Date.now();
    if (now - this._lastActivity > SESSION_IDLE_TIMEOUT) {
      this._sessionId = this.createAndStore(SESSION_KEY);
    }
    this._lastActivity = now;
  }

  /**
   * 获取或创建设备 ID。
   *
   * 优先级：
   * 1. 构造函数传入的自定义 deviceId（仅本次会话有效）
   * 2. localStorage 中持久化的设备 ID
   * 3. 新生成的 UUID v7 并写入 localStorage
   *
   * @param customId - 可选的预设设备 ID
   * @returns 设备 ID
   */
  private resolveDeviceId(customId?: string): string {
    if (customId) return customId;
    return this.getOrCreate(DEVICE_KEY);
  }

  /**
   * 获取或创建匿名用户 ID。
   *
   * @returns 匿名用户 ID
   */
  private resolveAnonymousId(): string {
    return this.getOrCreate(ANON_KEY);
  }

  /**
   * 获取或创建会话 ID（tab 级别）。
   *
   * @returns 会话 ID
   */
  private resolveSessionId(): string {
    return this.getOrCreate(SESSION_KEY);
  }

  /**
   * 从 storage 读取 key，不存在则创建并持久化。
   *
   * @param key - storage 键名
   * @returns 存储的值
   */
  private getOrCreate(key: string): string {
    const storage = key === SESSION_KEY ? sessionStorage : localStorage;
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = uuidv7();
        storage.setItem(key, value);
      }
      return value;
    } catch {
      // storage 不可用（隐私模式 / 配额满）→ 降级为内存值
      return uuidv7();
    }
  }

  /**
   * 创建新 ID 并持久化到 storage。
   *
   * @param key - storage 键名
   * @returns 新生成的 ID
   */
  private createAndStore(key: string): string {
    const value = uuidv7();
    const storage = key === SESSION_KEY ? sessionStorage : localStorage;
    try {
      storage.setItem(key, value);
    } catch {
      // storage 不可用，忽略
    }
    return value;
  }

  /**
   * 刷新匿名用户 ID（用户注销时调用）。
   * 生成新的匿名 ID 并更新 localStorage。
   *
   * @returns 新的匿名 ID
   */
  refreshAnonymousId(): string {
    this._anonymousId = uuidv7();
    try {
      localStorage.setItem(ANON_KEY, this._anonymousId);
    } catch {
      // 忽略
    }
    return this._anonymousId;
  }
}

/** 单例实例 */
let instance: SessionManager | null = null;

/**
 * 获取或创建 SessionManager 单例。
 *
 * @param deviceId - 可选的预设设备 ID（仅首次创建时生效）
 * @returns SessionManager 实例
 */
export function getSessionManager(deviceId?: string): SessionManager {
  if (!instance) {
    instance = new SessionManager(deviceId);
  }
  return instance;
}

/**
 * 重置会话管理器（测试用）。
 */
export function resetSessionManager(): void {
  instance = null;
}
