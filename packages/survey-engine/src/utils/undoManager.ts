/**
 * 编辑器撤销/重做管理器 —— 全量快照策略
 *
 * 每次变更前通过 JSON 序列化深拷贝 coms 数组存入历史栈，
 * 撤销时从栈中弹出恢复。50 层上限，超出自动丢弃最旧快照。
 *
 * 注意：使用 JSON.parse(JSON.stringify()) 而非 structuredClone，
 * 因为 Status.type 是 Vue 组件引用（函数），structuredClone 无法克隆。
 * 快照恢复后由 store 调用 restoreComponentStatus() 通过 name 重新挂载组件引用。
 */
import type { Status } from "../types";

/** 快照数据结构：记录 coms 数组 + 辅助字段 */
export interface Snapshot {
  coms: Status[];
  surveyCount: number;
  currentComponentIndex: number;
}

/** JSON 深拷贝（兼容 Status 中无法被 structuredClone 的 Vue 组件引用） */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class UndoManager {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private readonly maxHistory = 50;

  /** 存入快照（深拷贝），同时清空重做栈 */
  push(snapshot: Snapshot): void {
    this.undoStack.push(deepClone(snapshot));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** 撤销：弹出 undoStack 栈顶，将当前态压入 redoStack */
  undo(current: Snapshot): Snapshot | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(deepClone(current));
    return this.undoStack.pop()!;
  }

  /** 重做：弹出 redoStack 栈顶，将当前态压入 undoStack */
  redo(current: Snapshot): Snapshot | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(deepClone(current));
    return this.redoStack.pop()!;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 清空所有历史 */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
