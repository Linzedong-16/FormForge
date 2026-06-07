import type { PermissionConfig, PermissionState, InitOptions, PermissionChangeCallback } from "./types";

/**
 * 基于二进制位运算的权限控制类
 * 采用单例模式设计，支持最小组件级别的权限控制粒度
 */
class BitPermission {
  private static instance: BitPermission | null = null;

  /** 权限配置列表 */
  private configs: PermissionConfig[] = [];

  /** 当前权限码 */
  private currentCode: bigint = 0n;

  /** 是否启用权限继承 */
  private enableInheritance: boolean = false;

  /** 权限码存储key */
  private storageKey: string = "bit_permission_code";

  /** 权限配置版本 */
  private version: string = "1.0.0";

  /** 权限变更回调函数列表 */
  private callbacks: PermissionChangeCallback[] = [];

  /** 权限检查结果缓存 */
  private permissionCache: Map<string, boolean> = new Map();

  /** 权限配置映射（ID -> 配置） */
  private configMap: Map<string, PermissionConfig> = new Map();

  /** 父权限 -> 子权限映射 */
  private parentChildrenMap: Map<string, PermissionConfig[]> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): BitPermission {
    if (!BitPermission.instance) {
      BitPermission.instance = new BitPermission();
    }
    return BitPermission.instance;
  }

  /**
   * 初始化权限插件
   * @param configs 权限配置列表
   * @param options 配置选项
   */
  public init(configs: PermissionConfig[], options?: InitOptions): void {
    // 验证权限配置
    this.validateConfigs(configs);

    this.configs = configs;
    this.enableInheritance = options?.enableInheritance ?? false;
    this.storageKey = options?.storageKey ?? "bit_permission_code";
    this.version = options?.version ?? "1.0.0";

    // 构建配置映射
    this.buildConfigMap();

    // 尝试从本地存储恢复权限码
    this.loadFromStorage();
  }

  /**
   * 验证权限配置
   */
  private validateConfigs(configs: PermissionConfig[]): void {
    const bitSet = new Set<number>();
    const idSet = new Set<string>();

    for (const config of configs) {
      // 验证权限位范围
      if (config.bit < 0 || config.bit > 63) {
        throw new Error(`权限位必须在 0-63 范围内: ${config.id}`);
      }

      // 验证权限位唯一性
      if (bitSet.has(config.bit)) {
        throw new Error(`权限位重复: ${config.bit}`);
      }
      bitSet.add(config.bit);

      // 验证权限ID唯一性
      if (idSet.has(config.id)) {
        throw new Error(`权限ID重复: ${config.id}`);
      }
      idSet.add(config.id);
    }
  }

  /**
   * 构建配置映射
   */
  private buildConfigMap(): void {
    this.configMap.clear();
    this.parentChildrenMap.clear();

    for (const config of this.configs) {
      this.configMap.set(config.id, config);

      // 构建父子关系
      if (config.parentId) {
        const children = this.parentChildrenMap.get(config.parentId) || [];
        children.push(config);
        this.parentChildrenMap.set(config.parentId, children);
      }
    }
  }

  /**
   * 从本地存储加载权限码
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.currentCode = BigInt(stored);
      }
    } catch {
      // localStorage 不可用（如在 SSR 环境）
    }
  }

  /**
   * 保存权限码到本地存储
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, this.currentCode.toString());
    } catch {
      // localStorage 不可用
    }
  }

  /**
   * 清空权限缓存
   */
  private clearCache(): void {
    this.permissionCache.clear();
  }

  /**
   * 触发权限变更事件
   */
  private emitChange(): void {
    this.clearCache();
    for (const callback of this.callbacks) {
      callback(this.currentCode);
    }
  }

  /**
   * 处理权限层级继承
   * @param enabledIds 原始启用权限ID
   * @returns 包含继承的完整权限ID列表
   */
  private resolveInheritance(enabledIds: string[]): string[] {
    if (!this.enableInheritance) {
      return enabledIds;
    }

    const result = new Set(enabledIds);

    const inherit = (parentId: string): void => {
      const children = this.parentChildrenMap.get(parentId) || [];
      for (const child of children) {
        if (!result.has(child.id)) {
          result.add(child.id);
          inherit(child.id);
        }
      }
    };

    for (const id of enabledIds) {
      inherit(id);
    }

    return Array.from(result);
  }

  /**
   * 检查单个权限
   * @param permissionId 权限ID
   * @returns 是否拥有该权限
   */
  public check(permissionId: string): boolean {
    // 优先从缓存获取
    if (this.permissionCache.has(permissionId)) {
      return this.permissionCache.get(permissionId)!;
    }

    const config = this.configMap.get(permissionId);
    if (!config || config.enabled === false) {
      this.permissionCache.set(permissionId, false);
      return false;
    }

    const bitMask = 1n << BigInt(config.bit);
    const result = (this.currentCode & bitMask) !== 0n;
    this.permissionCache.set(permissionId, result);

    return result;
  }

  /**
   * 检查多个权限（全部满足）
   * @param permissionIds 权限ID列表
   * @returns 是否拥有所有权限
   */
  public checkAll(permissionIds: string[]): boolean {
    return permissionIds.every(id => this.check(id));
  }

  /**
   * 检查多个权限（满足任一）
   * @param permissionIds 权限ID列表
   * @returns 是否拥有任一权限
   */
  public checkAny(permissionIds: string[]): boolean {
    return permissionIds.some(id => this.check(id));
  }

  /**
   * 获取当前权限码
   * @returns 当前权限码（bigint）
   */
  public getCode(): bigint {
    return this.currentCode;
  }

  /**
   * 设置权限码
   * @param code 权限码（bigint | number | string）
   */
  public setCode(code: bigint | number | string): void {
    this.currentCode = BigInt(code);
    this.saveToStorage();
    this.emitChange();
  }

  /**
   * 设置单个权限状态
   * @param permissionId 权限ID
   * @param enabled 是否启用
   */
  public set(permissionId: string, enabled: boolean): void {
    const config = this.configMap.get(permissionId);
    if (!config || config.enabled === false) {
      return;
    }

    const bitMask = 1n << BigInt(config.bit);

    if (enabled) {
      this.currentCode |= bitMask;
    } else {
      this.currentCode &= ~bitMask;
    }

    this.saveToStorage();
    this.emitChange();
  }

  /**
   * 批量设置权限
   * @param permissionIds 权限ID列表
   * @param enabled 是否启用
   */
  public setBatch(permissionIds: string[], enabled: boolean): void {
    for (const id of permissionIds) {
      this.set(id, enabled);
    }
  }

  /**
   * 重置权限码为0
   */
  public reset(): void {
    this.currentCode = 0n;
    this.saveToStorage();
    this.emitChange();
  }

  /**
   * 订阅权限变更事件
   * @param callback 回调函数
   * @returns 取消订阅函数
   */
  public onChange(callback: PermissionChangeCallback): () => void {
    this.callbacks.push(callback);

    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * 获取权限配置列表
   * @returns 权限配置列表
   */
  public getConfigs(): PermissionConfig[] {
    return [...this.configs];
  }

  /**
   * 根据ID获取权限配置
   * @param permissionId 权限ID
   * @returns 权限配置
   */
  public getConfig(permissionId: string): PermissionConfig | undefined {
    return this.configMap.get(permissionId);
  }

  /**
   * 获取当前启用的权限ID列表
   * @returns 启用的权限ID列表
   */
  public getEnabledPermissions(): string[] {
    const enabledIds: string[] = [];

    for (const config of this.configs) {
      if (config.enabled !== false) {
        const bitMask = 1n << BigInt(config.bit);
        if ((this.currentCode & bitMask) !== 0n) {
          enabledIds.push(config.id);
        }
      }
    }

    return this.enableInheritance ? this.resolveInheritance(enabledIds) : enabledIds;
  }

  /**
   * 权限码转换为字符串（用于传输）
   * @param code 权限码
   * @returns 字符串表示
   */
  public codeToString(code: bigint): string {
    return code.toString();
  }

  /**
   * 字符串转换为权限码
   * @param str 字符串表示
   * @returns 权限码
   */
  public stringToCode(str: string): bigint {
    return BigInt(str);
  }

  /**
   * 获取当前权限状态
   * @returns 权限状态
   */
  public getState(): PermissionState {
    return {
      code: this.currentCode,
      updatedAt: Date.now(),
      version: this.version
    };
  }

  /**
   * 动态注册新权限
   * @param config 权限配置
   * @returns 是否注册成功
   */
  public register(config: PermissionConfig): boolean {
    // 检查权限位是否已被占用
    if (this.configMap.has(config.id)) {
      return false;
    }

    // 检查权限位是否重复
    for (const existing of this.configs) {
      if (existing.bit === config.bit) {
        return false;
      }
    }

    this.configs.push(config);
    this.buildConfigMap();

    return true;
  }

  /**
   * 批量注册权限
   * @param configs 权限配置列表
   */
  public registerBatch(configs: PermissionConfig[]): void {
    for (const config of configs) {
      this.register(config);
    }
  }

  /**
   * 权限码合并
   * @param code1 权限码1
   * @param code2 权限码2
   * @returns 合并后的权限码
   */
  public mergeCodes(code1: bigint, code2: bigint): bigint {
    return code1 | code2;
  }

  /**
   * 权限码交集
   * @param code1 权限码1
   * @param code2 权限码2
   * @returns 交集权限码
   */
  public intersectCodes(code1: bigint, code2: bigint): bigint {
    return code1 & code2;
  }

  /**
   * 权限码差集
   * @param code1 权限码1
   * @param code2 权限码2
   * @returns code1独有的权限码
   */
  public diffCodes(code1: bigint, code2: bigint): bigint {
    return code1 & ~code2;
  }
}

// 创建单例实例
const permission = BitPermission.getInstance();

// 导出便捷方法
export const initPermission = (configs: PermissionConfig[], options?: InitOptions) => {
  permission.init(configs, options);
};

export const checkPermission = (permissionId: string) => {
  return permission.check(permissionId);
};

export const checkAllPermissions = (permissionIds: string[]) => {
  return permission.checkAll(permissionIds);
};

export const checkAnyPermission = (permissionIds: string[]) => {
  return permission.checkAny(permissionIds);
};

export const getPermissionCode = () => {
  return permission.getCode();
};

export const setPermissionCode = (code: bigint | number | string) => {
  permission.setCode(code);
};

export const setPermission = (permissionId: string, enabled: boolean) => {
  permission.set(permissionId, enabled);
};

export const setPermissions = (permissionIds: string[], enabled: boolean) => {
  permission.setBatch(permissionIds, enabled);
};

export const resetPermissions = () => {
  permission.reset();
};

export const onPermissionChange = (callback: PermissionChangeCallback) => {
  return permission.onChange(callback);
};

export const getPermissionConfigs = () => {
  return permission.getConfigs();
};

export const getPermissionConfig = (permissionId: string) => {
  return permission.getConfig(permissionId);
};

export const getEnabledPermissions = () => {
  return permission.getEnabledPermissions();
};

export const codeToString = (code: bigint) => {
  return permission.codeToString(code);
};

export const stringToCode = (str: string) => {
  return permission.stringToCode(str);
};

export const getPermissionState = () => {
  return permission.getState();
};

export const registerPermission = (config: PermissionConfig) => {
  return permission.register(config);
};

export const registerPermissions = (configs: PermissionConfig[]) => {
  permission.registerBatch(configs);
};

export const mergePermissionCodes = (code1: bigint, code2: bigint) => {
  return permission.mergeCodes(code1, code2);
};

export const intersectPermissionCodes = (code1: bigint, code2: bigint) => {
  return permission.intersectCodes(code1, code2);
};

export const diffPermissionCodes = (code1: bigint, code2: bigint) => {
  return permission.diffCodes(code1, code2);
};

// 导出单例实例（供高级使用）
export { permission as BitPermission };
