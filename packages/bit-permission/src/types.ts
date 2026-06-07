/**
 * 权限配置项
 */
export interface PermissionConfig {
  /** 权限唯一标识 */
  id: string;
  /** 权限名称 */
  name: string;
  /** 权限位位置（0-63） */
  bit: number;
  /** 父级权限ID（用于层级关系） */
  parentId?: string;
  /** 权限描述 */
  description?: string;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 权限状态
 */
export interface PermissionState {
  /** 当前权限码 */
  code: bigint;
  /** 最后更新时间 */
  updatedAt: number;
  /** 权限配置版本 */
  version: string;
}

/**
 * 初始化选项
 */
export interface InitOptions {
  /** 是否启用权限继承 */
  enableInheritance?: boolean;
  /** 权限码存储key（用于localStorage） */
  storageKey?: string;
  /** 权限配置版本 */
  version?: string;
}

/**
 * 权限变更回调函数
 */
export type PermissionChangeCallback = (code: bigint) => void;
