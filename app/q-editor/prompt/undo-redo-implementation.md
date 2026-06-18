# 编辑器撤销/重做功能实现方案

> 版本：1.0  
> 日期：2026-06-18  
> 方案：全量快照  
> 适用范围：q-editor 编辑器模块

---

## 1. 方案概述

采用**全量快照**策略实现撤销/重做。每次变更前通过 `structuredClone()` 深拷贝 `coms` 数组存入历史栈，撤销时从栈中弹出恢复。

**选型理由**：问卷题目数量通常在几十到几百道，单次快照体积小（几十 KB），`structuredClone` 耗时毫秒级，50 层栈总量约 2-5MB，方案简单可靠。

---

## 2. 新建文件

### 2.1 `src/utils/undoManager.ts`

创建 `UndoManager` 类，核心接口如下：

```typescript
// 快照数据结构：记录 coms 数组 + 辅助字段
interface Snapshot {
  coms: Status[];
  surveyCount: number;
  currentComponentIndex: number;
}

class UndoManager {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private readonly maxHistory = 50;

  // 存入快照（深拷贝），同时清空 redoStack
  push(snapshot: Snapshot): void {
    this.undoStack.push(structuredClone(snapshot));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  // 撤销：弹出 undoStack 栈顶，将当前态压入 redoStack
  undo(current: Snapshot): Snapshot | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(structuredClone(current));
    return this.undoStack.pop()!;
  }

  // 重做：弹出 redoStack 栈顶，将当前态压入 undoStack
  redo(current: Snapshot): Snapshot | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(structuredClone(current));
    return this.redoStack.pop()!;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
```

**要求**：导出单例或由 store 实例化持有，禁止全局变量。

---

## 3. 改造现有文件

### 3.1 `src/stores/useEditor.ts`

**改动点**：

1. 引入 `UndoManager`，在 store 内部创建实例，**不暴露到 state 中**（避免被 Pinia 响应式代理）
2. 新增私有方法 `_recordSnapshot()`：构造 `{ coms, surveyCount, currentComponentIndex }` 调用 `undoManager.push()`
3. 新增 4 个 action：

```typescript
// 撤销：恢复上一个快照并更新 store
undo() {
  const snapshot = this.undoManager.undo({
    coms: this.coms,
    surveyCount: this.surveyCount,
    currentComponentIndex: this.currentComponentIndex,
  });
  if (snapshot) {
    this.coms = snapshot.coms;
    this.surveyCount = snapshot.surveyCount;
    this.currentComponentIndex = snapshot.currentComponentIndex;
  }
}

// 重做：恢复下一个快照并更新 store
redo() {
  const snapshot = this.undoManager.redo({
    coms: this.coms,
    surveyCount: this.surveyCount,
    currentComponentIndex: this.currentComponentIndex,
  });
  if (snapshot) {
    this.coms = snapshot.coms;
    this.surveyCount = snapshot.surveyCount;
    this.currentComponentIndex = snapshot.currentComponentIndex;
  }
}

// 获取器（getter）
canUndo: (state) => state._undoManager?.canUndo ?? false,
canRedo: (state) => state._undoManager?.canRedo ?? false,
```

4. 在以下 action 中**调用 `_recordSnapshot()`**（在修改数据之前）：
   - `addCom`、`removeCom`、`resetComs`、`setStore`（仅 `setStore` 在恢复后调用 `_undoManager.clear()`）
   - 所有从 `actions.ts` 导入的 action，在 `useEditor.ts` 中通过包装函数注入快照记录

5. `resetComs()` 和 `initComs()` 中调用 `_undoManager.clear()`

**store 中包装 action 的推荐方式**：不在 `actions.ts` 中的每个函数里加记录逻辑，而是在 `useEditor.ts` 中通过 `this._recordSnapshot()` 统一在调用前记录。如果 action 是从 `actions.ts` 导入的独立函数，则需要在 `useEditor.ts` 中定义同名包装 action：

```typescript
// 示例：包装 setTextStatus
setTextStatus(textProps: TextProps, text: string) {
  this._recordSnapshot();
  setTextStatus(textProps, text);
}
```

### 3.2 `src/views/EditorView/Center.vue`

**改动点**：拖拽排序由 `vuedraggable` 直接 mutate `coms` 数组，不会经过 store action。需在拖拽**开始前**记录快照。

```html
<draggable :list="store.coms" @start="onDragStart" @change="onDragChange"></draggable>
```

```typescript
let dragSnapshot: Snapshot | null = null;

const onDragStart = () => {
  dragSnapshot = {
    coms: structuredClone(toRaw(store.coms)),
    surveyCount: store.surveyCount,
    currentComponentIndex: store.currentComponentIndex
  };
};

const onDragChange = () => {
  if (dragSnapshot) {
    store._undoManager.push(dragSnapshot);
    dragSnapshot = null;
  }
};
```

> **注意**：`@start` 时 `coms` 尚未被修改，此时记录的快照即为拖拽前状态。`@change` 时 `coms` 已被 vuedraggable 修改，将 `@start` 时保存的快照 push 到 undoManager 即可。

### 3.3 `src/views/EditorView/index.vue`

**改动点**：注册全局键盘快捷键。

在 `onMounted` 中添加：

```typescript
const handleKeydown = (e: KeyboardEvent) => {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (!isCtrlOrCmd) return;

  if (e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    store.undo();
  } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
    e.preventDefault();
    store.redo();
  }
};

document.addEventListener("keydown", handleKeydown);
```

在 `onUnmounted` 中移除监听。

### 3.4 `src/components/Common/Header.vue`

**改动点**：在左侧返回按钮旁边添加撤销/重做按钮。

```html
<el-button :icon="RefreshLeft" circle size="small" :disabled="!store.canUndo" @click="store.undo()" />
<el-button :icon="RefreshRight" circle size="small" :disabled="!store.canRedo" @click="store.redo()" />
```

**图标来源**：`@element-plus/icons-vue` 的 `RefreshLeft` 和 `RefreshRight`。

### 3.5 `src/i18n/` 三种语言文件

在 `editor.ts` 中新增（zh-CN / en-US / ja-JP）：

| key    | zh-CN | en-US | ja-JP    |
| ------ | ----- | ----- | -------- |
| `undo` | 撤销  | Undo  | 元に戻す |
| `redo` | 重做  | Redo  | やり直す |

---

## 4. 变更清单汇总

| 文件                               | 操作     | 说明                                                          |
| ---------------------------------- | -------- | ------------------------------------------------------------- |
| `src/utils/undoManager.ts`         | **新建** | UndoManager 类                                                |
| `src/stores/useEditor.ts`          | **修改** | 集成 undoManager，新增 undo/redo/canUndo/canRedo，包装 action |
| `src/views/EditorView/Center.vue`  | **修改** | vuedraggable 拖拽拦截                                         |
| `src/views/EditorView/index.vue`   | **修改** | 键盘快捷键 Ctrl+Z / Ctrl+Y                                    |
| `src/components/Common/Header.vue` | **修改** | 撤销/重做按钮（仅 `isEditor` 时显示）                         |
| `src/i18n/zh-CN/editor.ts`         | **修改** | 新增 `undo`、`redo`                                           |
| `src/i18n/en-US/editor.ts`         | **修改** | 新增 `undo`、`redo`                                           |
| `src/i18n/ja-JP/editor.ts`         | **修改** | 新增 `undo`、`redo`                                           |

---

## 5. 边界处理规则

| 场景                          | 行为                                                    |
| ----------------------------- | ------------------------------------------------------- |
| 撤销后执行新操作              | `_recordSnapshot()` 中 `redoStack` 被清空，重做历史丢弃 |
| 加载已有问卷（`setStore`）    | 调用 `_undoManager.clear()` 清空历史                    |
| 重置问卷（`resetComs`）       | 重置前记录快照，重置后 `clear()`                        |
| 新建问卷（`initComs`）        | 调用 `_undoManager.clear()`                             |
| 无历史时点击撤销              | `canUndo === false`，按钮 disabled                      |
| 超出 50 层上限                | 自动丢弃最旧快照（`shift()`）                           |
| 编辑器外页面（非 `isEditor`） | 不显示撤销/重做按钮，不注册快捷键                       |

---

## 6. 注意事项

1. **深拷贝必须用 `structuredClone()`**，不要用 `JSON.parse(JSON.stringify())`，因为 `Status.type` 是 Vue 组件引用，`JSON` 序列化会丢失。
2. **`undoManager` 不能放在 Pinia state 中**，否则会被 `reactive()` 代理导致 `structuredClone` 行为异常。用 `_undoManager` 私有属性持有。
3. **拖拽快照必须用 `toRaw()` 获取原始对象**，避免克隆 Pinia 代理对象。
4. **必须修改所有 action 的调用方式**，确保每个 mutation 前都调用了 `_recordSnapshot()`。如果遗漏某个 action，该操作的撤销会导致状态跳跃（回退到上一个快照，跳过了该操作）。
5. 撤销/重做按钮和快捷键仅在编辑器页面（`isEditor === true`）生效。
