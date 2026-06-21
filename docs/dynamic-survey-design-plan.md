# 动态问卷功能技术规划设计方案

## 文档信息

| 项目     | 内容                                                                |
| -------- | ------------------------------------------------------------------- |
| 文档名称 | 动态问卷（条件显示/分支跳转）功能技术规划设计方案                    |
| 版本     | v1.0                                                                |
| 适用范围 | `app/q-editor` / `app/q-server` / `packages`                        |
| 编写日期 | 2026-06-21                                                          |

---

## 目录

1. [需求背景与目标](#1-需求背景与目标)
2. [现有架构分析](#2-现有架构分析)
3. [总体设计方案](#3-总体设计方案)
4. [系统架构设计](#4-系统架构设计)
5. [数据模型设计](#5-数据模型设计)
6. [核心功能流程设计](#6-核心功能流程设计)
7. [接口规范定义](#7-接口规范定义)
8. [模块划分](#8-模块划分)
9. [技术选型](#9-技术选型)
10. [性能与安全设计](#10-性能与安全设计)
11. [扩展性设计](#11-扩展性设计)
12. [风险与注意事项](#12-风险与注意事项)

---

## 1. 需求背景与目标

### 1.1 需求描述

当前问卷系统采用**扁平线性排列**的组件结构，所有题目按 `order_index` 依次展示，各题目之间无相互依赖关系。需要在现有架构基础上引入**动态问卷**能力，即：

- **条件显示（Conditional Display）**：根据用户对前置题目的回答，动态决定后续题目是否显示
- **分支跳转（Branch Jump）**：根据前置选项，跳转到不同的题目分支
- **保留现有兼容性**：未配置条件规则的题目行为不变（`alwaysShow = true`）

### 1.2 典型场景

| 场景                   | 示例                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **筛选题型**           | 问题1："您是否购买过该产品？" → 选择"是"显示问题2"满意度评价"，选择"否"跳转到问题5       |
| **年龄分层**           | 问题1："您的年龄段？" → 18-25岁显示学生相关题目，26-35岁显示职场相关题目                  |
| **多选交叉**           | 多选题"您使用过哪些功能？" → 勾选"A"显示A功能满意度，勾选"B"显示B功能建议                 |
| **评分阈值**           | NPS评分题 → 0-6分显示"不满原因"，9-10分显示"推荐原因"                                    |
| **签名确认**           | 当某个选项被选中时，自动展示电子签名组件要求确认                                          |

### 1.3 设计目标

| 维度           | 目标                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| **编辑体验**   | 可视化配置条件规则，所见即所得，非技术人员可操作                               |
| **填答体验**   | 条件判断在客户端实时执行，避免服务端往返延迟；题目隐藏/显示有平滑过渡          |
| **数据一致性** | 确保隐藏题目不要求必填验证；条件规则随问卷数据完整保存和同步                    |
| **向后兼容**   | 无条件的组件行为不变；已有问卷数据可正常打开和编辑                              |
| **存储扩展**   | 条件规则存储在 `survey_components.config` JSON 中，无需变更数据库 Schema       |
| **多端复用**   | 规则评估引擎独立于渲染层，编辑器和填答端可共享                                  |

---

## 2. 现有架构分析

### 2.1 项目整体结构

```
questionnaireSys/
├── app/q-editor/          # 前端：问卷编辑器（Vue 3 + TypeScript + Pinia + Element Plus）
├── app/q-server/          # 后端：API 服务（Fastify + Prisma + PostgreSQL + Redis + MinIO）
├── packages/
│   ├── common/            # 前后端共享类型定义
│   ├── survey-engine/     # 独立发布的问卷引擎包（与 q-editor 代码镜像）
│   ├── components/        # 共享 Vue 组件库
│   └── utils/             # 共享工具函数库
└── docs/                  # 项目文档
```

### 2.2 核心系统组件关系

```
┌──────────────┐    HTTP/SSE    ┌──────────────┐    Prisma    ┌────────────────┐
│   q-editor   │ ←───────────→ │   q-server   │ ←─────────→ │  PostgreSQL    │
│  (Vue 3)     │               │  (Fastify)   │             │  (主数据库)     │
└──────┬───────┘               └──────┬───────┘             └────────────────┘
       │                              │
       │ Pinia State                  │ MinIO / Redis / RabbitMQ
       ▼                              ▼
┌──────────────┐               ┌──────────────┐
│  IndexedDB   │               │  MinIO       │
│  (本地缓存)   │               │  (文件存储)   │
└──────────────┘               └──────────────┘
```

### 2.3 问卷数据模型（现有）

#### 2.3.1 后端 — 核心表结构

| 表名                 | 关键字段                                          | 说明                           |
| -------------------- | ------------------------------------------------- | ------------------------------ |
| `surveys`            | id, user_id, title, status, page_size, ...        | 问卷元数据                     |
| `survey_components`  | id, survey_id, type, **config (Json)**, order_index, required | 组件配置，**config 为普适 Json** |
| `responses`          | id, survey_id, user_id, anonymous_id, status      | 答卷记录                       |
| `answers`            | id, response_id, component_id, value, values (Json) | 单题答案                       |

**关键设计特征**：
- `survey_components.config` 使用 Prisma `Json` 类型，支持存储任意 JSON 结构，**无需 Schema 变更即可扩展字段**
- `answers.values` 使用 `Json` 类型存储多选题答案数组
- 组件按 `order_index` 排序，无层级或父子关系
- 题目总数通过 `countQuestions()` 函数排除非题目组件（如 `text_note`）后计算

#### 2.3.2 前端 — 状态数据结构

```
Status[]
  ├── type: VueComType          # 业务组件引用
  ├── name: string              # 组件名称（kebab-case）
  ├── id: string (UUID)         # 前端临时标识
  └── status: {                 # 可编辑属性集合
        ├── title: TextProps    # 标题
        ├── desc: TextProps     # 描述
        ├── options: OptionsProps  # 选项数组（选择题专用）
        ├── position: OptionsProps
        ├── titleSize/descSize: OptionsProps
        ├── titleWeight/descWeight: OptionsProps
        ├── titleItalic/descItalic: OptionsProps
        ├── titleColor/descColor: TextProps
        └── ...（扩展点）
      }
```

**OptionsProps 选项数组的三种形态**：

| 形态                   | 结构                               | 适用组件             |
| ---------------------- | ---------------------------------- | -------------------- |
| `StringStatusArr`      | `string[]`                         | 普通选择题           |
| `ValueStatusArr`       | `Array<{ value, status }>`         | 带键值的下拉选择     |
| `PicTitleDescStatusArr` | `Array<{ picTitle, picDesc, value }>` | 图片选择题           |
| `CascaderStatusArr`    | `Array<{ label, value, children? }>` | 多级联动（树形结构） |

#### 2.3.3 现有数据流向

```
[编辑器]

添加组件 → defaultStatusMap[name]() → store.coms.push()
编辑属性 → updateStatus(key, payload) → store.setXxx() → _recordSnapshot()
保存问卷 → JSON.stringify(store.coms) → IndexedDB(本地) → POST /surveys(远程)

[填答端]

加载问卷 → GET /surveys/:id → deserializeSurveyDetail() → quizData.coms
提交答案 → serializeAnswers() → POST /responses → answers 表

[数据传递机制]

EditorView/index.vue → provide("getSurveyId")        → 上传时获取 remoteSurveyId
RightSide.vue        → provide("updateStatus")       → 编辑面板统一数据操作
Center.vue           → provide("getLink")(全局兜底)   → 图片选择组件上传URL
ComItemProvider.vue  → provide("getLink")(作用域化)   → 每个组件的独立 URL 写入
```

### 2.4 现有组件生态

| 分类       | 组件                                               | 是否有 options 数组 |
| ---------- | -------------------------------------------------- | ------------------- |
| **选择题** | SingleSelect / MultiSelect / OptionSelect          | 是                  |
|           | SinglePicSelect / MultiPicSelect                   | 是                  |
| **高级题** | RateScore / Cascader / Slider / Transfer           | 有专用属性          |
|           | DateTime / Signature                               | 无                  |
| **输入题** | TextInput                                          | 无                  |
| **说明**   | TextNote                                           | 无                  |
| **矩阵**   | MatrixSingle                                       | 是（rows/columns）  |
| **个人信息** | 12种（name/gender/age/education...）              | 部分                |

**现状总结**：
1. 所有组件扁平存储，无层级/父子关系
2. 组件配置 (`status`) 在 IndexedDB 中以 JSON 序列化存储，在 PostgreSQL 中以 `survey_components.config` Json 字段存储
3. 系统已有 16 个组件配置文件（`configs/defaultStatus/`）和 14 种编辑组件
4. 数据操作通过 `updateStatus(key, payload)` 统一入口，Pinia store 管理状态
5. 撤销/重做基于全量快照策略（`UndoManager`）
6. 支持离线编辑（IndexedDB）+ 在线同步（POST/PUT /surveys）

---

## 3. 总体设计方案

### 3.1 方案选型对比

| 方案                 | 数据库变更 | API变更 | 前端改动量 | 编辑体验   | 实现周期 | 推荐度   |
| -------------------- | ---------- | ------- | ---------- | ---------- | -------- | -------- |
| **A. 显示规则方案**  | 无         | 无      | 中         | 可视化     | 短       | ★★★★★    |
| B. 组件树方案       | 新增字段   | 小      | 大         | 拖拽+树    | 长       | ★★★      |
| C. 后端动态渲染方案  | 新增字段   | 中      | 小         | 无         | 长       | ★★       |

**推荐方案A — 组件级显示规则（Display Logic）**，理由：
- `survey_components.config` 已是普适 Json 类型，**零数据库变更**
- 条件判断在客户端实时执行，**零 API 往返延迟**
- 与现有低代码架构、编辑面板模式**高度契合**
- 可通过扩展规则评估引擎平滑升级到方案B

### 3.2 方案核心思想

在现有扁平数组中为每个组件增加 `displayConfig` 配置，定义其**显示条件**。前端渲染时，规则评估引擎根据已有答案动态控制每个组件的可见性。

```
┌───────┐    ┌───────┐    ┌──────────┐    ┌───────┐    ┌──────────┐
│ 组件1  │ → │ 组件2  │ → │ 组件3     │ → │ 组件4  │ → │ 组件5     │
│ 性别   │   │ 年龄   │   │ (条件显示) │   │ 职业   │   │ (条件显示) │
│        │   │        │   │ 满意度     │   │        │   │ 推荐理由   │
└───┬───┘   └───┬───┘   └─────┬────┘   └───────┘   └─────┬────┘
    │           │              │                          │
    └─ 选"男" ──┘              │ condition:               │
                  └─ 小于25岁 ──┤ sourceIndex: 1           │
                               │ optionIndex: 0           │
                               │ operator: eq             │
                               │ targetValue: "18-25"     │
                               └──────────────────────────┘
```

---

## 4. 系统架构设计

### 4.1 整体架构图

```
┌────────────────────────────────────────────────────────────────┐
│                         问卷编辑器 (q-editor)                    │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │ LeftSide │   │   Center     │   │       RightSide          │ │
│  │ 题型列表  │   │  渲染画布     │   │      编辑面板             │ │
│  │          │   │              │   │                          │ │
│  │ 点击添加  │   │ ComItemProv- │   │ ┌──────────────────────┐ │ │
│  │ ────────→│   │ ider(n)      │   │ │ DisplayRuleEditor    │ │ │
│  │          │   │  ↓ provide   │   │ │ ┌─ 关联题目选择器 ──┐ │ │ │
│  │          │   │ getLink(n)   │   │ │ │ ┌─ 选项选择器 ──┐ │ │ │ │
│  │          │   │              │   │ │ │ │ ┌运算符选择器┐ │ │ │ │
│  │          │   │ <component>  │ ← │ │ │ │ │            │ │ │ │ │
│  │          │   │  renderAll   │   │ │ │ │ └────────────┘ │ │ │ │
│  │          │   └──────────────┘   │ │ │ └────────────────┘ │ │ │
│  └──────────┘                      │ │ └────────────────────┘ │ │
│                                    │ └──────────────────────┘ │
│  ┌──────────────────────────────┐  └──────────────────────────┘ │
│  │     Pinia store (useEditor)  │                                │
│  │  coms: Status[]              │                                │
│  │  └─ status.displayConfig     │  ← displayConfig 融入现有状态  │
│  └──────────────────────────────┘                                │
│                     │                                            │
│         JSON.stringify / IndexedDB / POST /surveys                │
└─────────────────────┼────────────────────────────────────────────┘
                      │
┌─────────────────────┼────────────────────────────────────────────┐
│                     ▼             问卷服务 (q-server)              │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              survey_components.config (Json)                  │ │
│  │  {                                                            │ │
│  │    "title": { "status": "..." },                              │ │
│  │    "options": { "status": [...] },                            │ │
│  │    "displayConfig": {        ← 随 config 字段持久化，透明传输   │ │
│  │      "alwaysShow": false,                                     │ │
│  │      "rules": [ ... ],                                        │ │
│  │      "ruleLogic": "any"                                       │ │
│  │    }                                                           │ │
│  │  }                                                             │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 渲染端架构（填答端 + 预览端）

```
┌───────────────────────────────────────────────────────────────────┐
│                 display-logic.ts (规则评估引擎)                    │
│                                                                    │
│  shouldDisplay(comIndex, com, answers) → boolean                  │
│                                                                    │
│  输入：                                                            │
│    - comIndex: 组件在数组中的位置                                  │
│    - com: Status (含 displayConfig)                               │
│    - answers: Record<componentIndex, answer>                      │
│  输出：                                                            │
│    - true: 组件应渲染并展示                                        │
│    - false: 组件应隐藏                                            │
│                                                                    │
│  评估逻辑：                                                        │
│    1. 无 displayConfig 或 alwaysShow === true → true              │
│    2. rules.length === 0 → true                                   │
│    3. 遍历 rules，对每条 rule：                                    │
│       a. 获取 sourceIndex 对应的 results[sourceIndex]             │
│       b. 若该答案尚未填写 → false                                 │
│       c. 根据 operator 执行比较                                   │
│    4. ruleLogic === "any" → results.some(Boolean)                 │
│       ruleLogic === "all" → results.every(Boolean)                │
└───────────────────────────────────────────────────────────────────┘
```

### 4.3 核心模块交互

```
┌────────────────────┐     ┌────────────────────┐     ┌─────────────────────┐
│  DisplayRuleEditor │     │  Pinia              │     │  渲染视图            │
│  (编辑组件)         │     │  (状态管理)         │     │  (SurveyView/Preview)│
└────────┬───────────┘     └─────────┬──────────┘     └──────────┬──────────┘
         │                           │                           │
         │ 用户配置规则              │ 存储 displayConfig        │ 调用 shouldDisplay()
         │ updateStatus(            │ store.coms[n]             │ ↓
         │   "displayConfig",       │  .status                  │ display-logic.ts
         │   rulePayload            │  .displayConfig           │ ↓
         │ )                        │                           │ v-show="isVisible(i)"
         │                           │                           │
         ▼                           ▼                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    序列化层 (JSON.stringify / deserialize)                   │
│                                                                            │
│  displayConfig 作为 status 的一个属性参与序列化，无需特殊处理                  │
│  路径：前端 Status[] → IndexedDB → POST /surveys → survey_components.config │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 数据模型设计

### 5.1 显示规则类型定义

```typescript
/**
 * 条件运算符
 */
type DisplayOperator = 
  | "eq"             // 等于（目标值 === 答案值）
  | "neq"            // 不等于
  | "contains"       // 包含（多选答案中包含目标值）
  | "not_contains"   // 不包含
  | "gt"             // 大于（数值比较）
  | "gte"            // 大于等于
  | "lt"             // 小于
  | "lte";           // 小于等于

/**
 * 单条显示规则
 */
interface DisplayRule {
  /** 依赖的源组件在 coms 数组中的索引（0-based，渲染端使用） */
  sourceIndex: number;

  /** 源组件的选项索引（用于选择题/评分题等有序选项的组件） */
  sourceOptionIndex?: number;

  /** 条件运算符 */
  operator: DisplayOperator;

  /** 匹配的目标值（单值或多值数组） */
  targetValue: string | string[];

  /** 规则描述（可选，供编辑器展示人类可读的规则摘要） */
  description?: string;
}

/**
 * 组件显示配置
 */
interface DisplayConfig {
  /** 是否始终显示（默认 true，向后兼容） */
  alwaysShow: boolean;

  /** 显示规则数组 */
  rules: DisplayRule[];

  /** 规则逻辑关系：any 满足任一即显示 / all 满足全部才显示 */
  ruleLogic: "any" | "all";
}
```

### 5.2 数据存储位置

| 存储层       | 存储位置                                                         | 格式   |
| ------------ | ---------------------------------------------------------------- | ------ |
| 前端 Pinia   | `store.coms[n].status.displayConfig: DisplayConfig`              | JS对象 |
| 本地 IndexedDB | `surveys.coms[n].status.displayConfig`                          | JSON   |
| 后端 PostgreSQL | `survey_components.config` 中的 `displayConfig` 字段             | Json   |
| 前后端共享类型 | `packages/common/src/survey/survey.interface.ts`                 | TS类型 |

### 5.3 存储示例

**组件配置 JSON（survey_components.config 完整示例）**：

```json
{
  "title": {
    "id": "uuid-001",
    "status": "您的年龄段？",
    "isShow": true,
    "name": "title-editor",
    "editCom": {}
  },
  "options": {
    "id": "uuid-002",
    "status": [
      { "value": "", "status": "18-25岁" },
      { "value": "", "status": "26-35岁" },
      { "value": "", "status": "36岁以上" }
    ],
    "currentStatus": 0,
    "isShow": true,
    "name": "options-editor",
    "editCom": {}
  },
  "displayConfig": {
    "alwaysShow": false,
    "rules": [
      {
        "sourceIndex": 1,
        "sourceOptionIndex": 0,
        "operator": "eq",
        "targetValue": "18-25"
      }
    ],
    "ruleLogic": "any"
  }
}
```

### 5.4 数据库影响评估

| 项目           | 变更情况                                         |
| -------------- | ------------------------------------------------ |
| Prisma Schema  | **无需变更** — `config` 为 `Json` 类型，天然支持  |
| 数据库迁移     | **无**                                           |
| API接口        | **无需变更** — config 随请求体/响应体透明传输      |
| 缓存策略       | **无影响** — Redis 缓存策略不变                   |
| 审计日志       | **无影响** — 操作日志结构不变                     |

---

## 6. 核心功能流程设计

### 6.1 编辑器 — 配置显示规则

```
┌─ 用户操作 ────────────────────┐      ┌─ 系统处理 ───────────────────────────────┐
│                               │      │                                          │
│ 1. 选中某个组件（点击）       │ →    │ store.currentComponentIndex = index      │
│                               │      │                                          │
│ 2. 右侧面板显示 DisplayRule   │ →    │ EditPannel 渲染 DisplayRuleEditor        │
│    Editor 编辑组件            │      │ (仅在 com.status 含 displayConfig 时)    │
│                               │      │                                          │
│ 3. 设置"总是显示"开关         │ →    │ updateStatus("displayConfig", {           │
│                               │      │   alwaysShow: false                      │
│    [关闭] 总是显示             │      │ })                                        │
│                               │      │                                          │
│ 4. 添加规则：                 │      │                                          │
│    关联题目：[下拉选别的题目]   │ →    │ 下拉列表从 store.coms 中过滤出可选组件   │
│    关联选项：[该题的第1项]     │ →    │ 读取源组件的 options.status 数组          │
│    运算符：[等于]             │ →    │ 枚举值选择                               │
│    目标值：自动填充           │      │ 根据源选项自动匹配                        │
│                               │      │                                          │
│ 5. 保存配置                   │ →    │ store._recordSnapshot()                  │
│                               │      │ displayConfig 写入 store.coms[n].status  │
│                               │      │                                          │
│ 6. 保存问卷 (Ctrl+S)          │ →    │ JSON.stringify(store.coms) → IndexedDB   │
│                               │      │ → POST /api/surveys                     │
└───────────────────────────────┘      └──────────────────────────────────────────┘
```

### 6.2 填答端 — 条件渲染

```
┌─ 填答端渲染流程 ────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  const isVisible = (index: number): boolean => {                                │
│    // 1. 分页检查                                                               │
│    if (!isInCurrentPage(index)) return false;                                   │
│                                                                                 │
│    // 2. 显示规则检查                                                            │
│    const com = surveyData.value.coms[index];                                    │
│    return shouldDisplay(index, com, answers.value);                             │
│  };                                                                             │
│                                                                                 │
│  模板：                                                                         │
│  <div v-for="(com, index) in coms" v-show="isVisible(index)" :key="index">      │
│    <component :is="com.type" :status="com.status" @update-answer="..." />       │
│  </div>                                                                         │
│                                                                                 │
│  ┌─ 规则评估 (shouldDisplay) ────────────────────────────────┐                  │
│  │                                                            │                  │
│  │  用户选择 问题1 → "男"                                     │                  │
│  │       ↓                                                    │                  │
│  │  answers.value[1] = "男"                                   │                  │
│  │       ↓                                                    │                  │
│  │  Vue 响应式触发 isVisible() 重新计算                        │                  │
│  │       ↓                                                    │                  │
│  │  问题3.displayConfig.rules = [{                            │                  │
│  │    sourceIndex: 1,                                         │                  │
│  │    operator: "eq",                                         │                  │
│  │    targetValue: "男"                                       │                  │
│  │  }]                                                        │                  │
│  │       ↓                                                    │                  │
│  │  shouldDisplay(3, com3, answers)                           │                  │
│  │    = answers[1] === "男"                                   │                  │
│  │    = true                                                  │                  │
│  │       ↓                                                    │                  │
│  │  v-show="true" → 问题3 渲染并展示                           │                  │
│  │                                                            │                  │
│  └────────────────────────────────────────────────────────────┘                  │
│                                                                                 │
│  ┌─ 必填校验适配 ────────────────────────────────────────────┐                  │
│  │                                                            │                  │
│  │  提交时只校验可见题目的必填：                               │                  │
│  │                                                             │                  │
│  │  const visibleComs = filteredComs.filter((_, i) =>          │                  │
│  │    shouldDisplay(i, coms[i], answers.value)                 │                  │
│  │  );                                                         │                  │
│  │                                                             │                  │
│  │  for (const com of visibleComs) {                           │                  │
│  │    if (com.required && !answers[com.index]) {               │                  │
│  │      ElMessage.warning(`请完成第 ${i+1} 题`);              │                  │
│  │      return;                                                │                  │
│  │    }                                                        │                  │
│  │  }                                                          │                  │
│  └────────────────────────────────────────────────────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 数据持久化流程

```
┌─ 保存流程 ─────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  store.coms (内存)                                                              │
│       │                                                                         │
│       │ JSON.parse(JSON.stringify(store.coms))                                  │
│       ▼                                                                         │
│  纯对象 coms[] (含 displayConfig)                                                │
│       │                                                                         │
│       ├─→ IndexedDB: surveys.update(id, { coms, ... })   ← 本地保存             │
│       │                                                                         │
│       └─→ serializeComponents(coms) → SurveyComponentPayload[]                  │
│              │                                                                  │
│              └─→ POST/PUT /api/surveys                                         │
│                     │                                                           │
│                     └─→ Prisma: survey_components.upsert/update                 │
│                            config = JSON (含 displayConfig)                     │
│                                                                                 │
│  ┌─ 加载流程 ──────────────────────────────────────────────────────┐           │
│  │                                                                  │           │
│  │  GET /api/surveys/:id                                            │           │
│  │       │                                                         │           │
│  │       ▼                                                         │           │
│  │  deserializeSurveyDetail(detail.components)                     │           │
│  │       │  snake_case type → kebab-case name                      │           │
│  │       │  保持 config 完整的 JSON 结构（含 displayConfig）        │           │
│  │       ▼                                                         │           │
│  │  restoreComponentStatus(coms)                                    │           │
│  │       │  按 name 挂载 Vue 组件引用                               │           │
│  │       ▼                                                         │           │
│  │  store.setStore(data) → 渲染组件                                 │           │
│  │                                                                  │           │
│  └──────────────────────────────────────────────────────────────────┘           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 撤销/重做兼容

当前 `UndoManager` 通过 `JSON.parse(JSON.stringify(toRaw(store.coms)))` 创建快照，`displayConfig` 为纯数据字段，天然兼容：

```
操作前 → _recordSnapshot()    // 快照含 displayConfig
执行  → store.coms[n].status.displayConfig = newValue
撤销  → undo() → 恢复到上一个快照（displayConfig 随快照完整恢复）
重做  → redo() → 恢复到下一个快照
```

---

## 7. 接口规范定义

### 7.1 无需变更的接口

| 接口                           | 方法   | 说明                                          |
| ------------------------------ | ------ | --------------------------------------------- |
| `POST /api/surveys`            | 创建   | config 整体序列化传输，含 displayConfig        |
| `PUT /api/surveys/:id`         | 更新   | 同上                                          |
| `GET /api/surveys/:id`         | 详情   | response.components 含完整 config              |
| `POST /api/surveys/:id/responses` | 提交 | answers 仅含可见题目答案                       |
| 文件上传接口                   | 上传   | 无关联                                        |

### 7.2 组件配置 JSON 结构规范（扩展后）

```typescript
/**
 * 组件配置规范（survey_components.config）
 * 
 * 顶层为组件的各属性键值对，每个属性遵循 BaseProps 接口：
 * { id, isShow, name, editCom } + 特定字段
 * 
 * displayConfig 为可选扩展字段，定位与其他属性平级
 */
interface ComponentConfig {
  title: TextConfig;
  desc: TextConfig;
  position: OptionConfig;
  titleSize: OptionConfig;
  descSize: OptionConfig;
  titleWeight: OptionConfig;
  descWeight: OptionConfig;
  titleItalic: OptionConfig;
  descItalic: OptionConfig;
  titleColor: TextConfig;
  descColor: TextConfig;
  options?: OptionConfig;         // 选择题组件有
  cascaderOptions?: OptionConfig; // Cascader 组件有
  matrixRows?: OptionConfig;      // Matrix 组件有
  matrixColumns?: OptionConfig;   // Matrix 组件有
  // ... 其他组件特定配置
  
  // === 动态问卷扩展字段 ===
  displayConfig?: DisplayConfig;  // 显示规则配置
}
```

### 7.3 前端 Pinia Store Actions（新增）

| Action                  | 参数                                  | 说明                                     |
| ----------------------- | ------------------------------------- | ---------------------------------------- |
| `setDisplayConfig`      | `(optionsProps, payload: DisplayConfig)` | 设置组件的显示规则配置                   |
| `addDisplayRule`        | `(optionsProps, rule: DisplayRule)`   | 添加一条显示规则                         |
| `removeDisplayRule`     | `(optionsProps, ruleIndex: number)`   | 删除一条显示规则                         |
| `updateDisplayRule`     | `(optionsProps, ruleIndex, rule)`     | 更新一条显示规则                         |
| `resetDisplayConfig`    | `(optionsProps)`                      | 重置为默认（alwaysShow: true, rules: []） |

### 7.4 updateStatus 扩展

```typescript
// 现有 updateStatus 的 switch-case 中新增分支
case "displayConfig": {
  if (isDisplayConfigPayload(payload)) {
    store.setDisplayConfig(
      currentCom.value!.status[configKey] as OptionsProps, 
      payload
    );
  } else if (isDisplayRulePayload(payload)) {
    // 单条规则的增/删/改操作
    store.updateDisplayRule(
      currentCom.value!.status[configKey] as OptionsProps,
      payload
    );
  }
  break;
}
```

---

## 8. 模块划分

### 8.1 新增文件清单

```
packages/common/src/survey/
├── survey.interface.ts          [修改] 新增 DisplayRule / DisplayConfig 类型

packages/survey-engine/src/utils/
├── display-logic.ts             [新增] 规则评估引擎 (shouldDisplay)

app/q-editor/src/utils/
├── display-logic.ts             [新增] 与 survey-engine 保持一致的规则评估引擎

app/q-editor/src/types/
├── editProps.ts                 [修改] BaseStatus 增加 displayConfig?: DisplayConfig

app/q-editor/src/components/SurveyComs/EditItems/
├── DisplayRuleEditor.vue        [新增] 显示规则编辑器

app/q-editor/src/configs/defaultStatus/
├── */ (所有组件默认状态)        [修改] 增加 displayConfig: { alwaysShow: true, rules: [], ruleLogic: "any" }
```

### 8.2 修改文件清单

| 文件 | 位置 | 修改内容 |
|------|------|---------|
| `EditPannel.vue` | `app/q-editor/src/components/SurveyComs/EditItems/` | 渲染 `DisplayRuleEditor` |
| `componentMap.ts` | `app/q-editor/src/configs/` | 注册 `display-rule-editor` |
| `useEditor.ts` | `packages/survey-engine/src/stores/` | 新增 `setDisplayConfig`/`updateDisplayRule` 等 actions |
| `actions.ts` | `packages/survey-engine/src/stores/` | 新增 displayConfig 相关的同步变异函数 |
| `RightSide.vue` | `app/q-editor/src/views/EditorView/` | `updateStatus` 增加 `displayConfig` 分支 |
| `Layout.vue` | `app/q-editor/src/views/MaterialsView/` | `updateStatus` 增加 `displayConfig` 分支 |
| `SurveyView.vue` | `app/q-editor/src/views/online/` | 渲染逻辑增加 `shouldDisplay`；提交时过滤隐藏题目 |
| `preview/index.vue` | `app/q-editor/src/views/preview/` | 渲染逻辑增加 `shouldDisplay` |
| `index.ts` | `app/q-editor/src/types/` | 导出新的 `DisplayConfig` 相关类型 |
| `editProps.ts` | `packages/survey-engine/src/types/` | BaseStatus 增加 `displayConfig?` |
| `store.ts` | `packages/survey-engine/src/types/` | Actions 接口增加 displayConfig 方法签名 |
| `index.ts` | `packages/survey-engine/src/types/` | 导出新的 `DisplayConfig` 相关类型 |
| `survey.interface.ts` | `packages/common/src/survey/` | 新增 `DisplayRule`/`DisplayConfig` 类型导出 |
| `index.ts` | `packages/common/src/` | 导出新的动态问卷类型 |

### 8.3 模块职责

| 模块                  | 职责                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| **display-logic.ts**  | 纯函数模块，输入 coms/answers，输出可见性布尔值，无副作用，可在编辑器/填答端复用    |
| **DisplayRuleEditor** | Vue 组件，提供可视化配置界面，通过 inject("updateStatus") 操作状态                |
| **EditPannel**        | 根据 `com.status` 动态渲染编辑组件，新增 displayConfig 编辑入口                     |
| **Pinia store**       | 状态管理，新增 4 个 displayConfig 相关 actions，维持 undo/redo 兼容性              |
| **SurveyView**        | 填答端渲染，集成 shouldDisplay 条件判断，过滤隐藏题目的必填校验                    |
| **Preview**           | 预览端渲染，与填答端共享 shouldDisplay 逻辑                                       |
| **api/modules/survey** | 透明传输，displayConfig 作为 config 的一部分序列化/反序列化                       |

---

## 9. 技术选型

### 9.1 规则评估引擎

| 维度       | 选型                                                    | 理由                                   |
| ---------- | ------------------------------------------------------- | -------------------------------------- |
| 实现方式   | 纯函数 TypeScript 模块                                  | 无框架依赖，编辑器/填答端/预览端复用   |
| 响应式集成 | 利用 Vue 3 的 `computed` / `v-show`                     | 答案变化自动触发规则重评估             |
| 性能优化   | 规则预编译 + 惰性评估（首次渲染时只评估当前页可见组件）  | 100+组件问卷不卡顿                     |
| 序列化     | JSON.stringify / JSON.parse                              | 与现有 UndoManager / IndexedDB 兼容    |

### 9.2 编辑组件

| 维度       | 选型                                                    | 理由                                   |
| ---------- | ------------------------------------------------------- | -------------------------------------- |
| 框架       | Vue 3 Composition API + `<script setup>`                | 与现有编辑组件模式一致                 |
| UI组件     | Element Plus (el-select, el-switch, el-radio-group)     | 与现有编辑面板风格统一                 |
| 数据传递   | `inject("updateStatus")`                                | 沿用现有 provide/inject 机制           |
| 类型安全   | TypeScript 严格模式 + `isDisplayConfigPayload` 类型守卫  | 编译时类型校验                         |

### 9.3 存储层

| 维度       | 选型                                                    | 理由                                   |
| ---------- | ------------------------------------------------------- | -------------------------------------- |
| 本地存储   | IndexedDB (Dexie.js) + Pinia 响应式                     | 现有架构，无需改                        |
| 远程存储   | PostgreSQL Json 字段 (Prisma ORM)                        | `survey_components.config` 存 displayConfig |
| 缓存策略   | Redis Cache-Aside (现有)                                 | displayConfig 作为 config 子字段无需独立缓存 |

---

## 10. 性能与安全设计

### 10.1 性能考虑

| 场景               | 策略                                                           |
| ------------------ | -------------------------------------------------------------- |
| 大量题目（100+）   | 规则评估引擎 O(n*m)，n=显示组件数，m=规则数；预编译规则表达式  |
| 频繁答案变更       | 利用 Vue 响应式的依赖追踪，仅重新评估依赖变更的组件             |
| 首屏渲染           | 分页 + 惰性评估，只计算当前页可见组件                            |
| 配置加载           | displayConfig 作为 config 子字段随组件一同加载，无额外请求       |

**规则预编译优化**：规则在组件 `created` 时预编译为闭包函数，避免每次评估时解析对象：

```
原始（每次评估解析对象）：
  rule.operator === "eq" && getAnswer(rule.sourceIndex) === rule.targetValue

预编译后（直接执行函数）：
  compiledRule(answer) → boolean
```

### 10.2 安全考虑

| 层面           | 措施                                                                 |
| -------------- | -------------------------------------------------------------------- |
| **注入防御**   | displayConfig 中 targetValue 为字符串，不执行 eval                     |
| **循环引用**   | rule.sourceIndex 指向前置组件，限制只能引用 order_index 比自己小的组件 |
| **数据校验**   | 服务端 Zod Schema 不对 config JSON 做深度校验，依赖前端保证结构一致性   |
| **向后兼容**   | 加载旧问卷时 displayConfig 为 undefined，shouldDisplay 默认返回 true   |
| **规则上限**   | 单个组件 displayConfig.rules 上限 10 条，防止极端配置                  |

---

## 11. 扩展性设计

### 11.1 近中期扩展

| 扩展方向             | 实现路径                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| **跳转分支**         | 在 displayConfig 基础上增加 `redirectIndex` 字段，跳转到指定组件          |
| **多组规则（嵌套）**  | 规则组支持 AND/OR 嵌套（当前只支持平级 rules + ruleLogic）               |
| **自定义函数规则**   | 支持简单的 JS 表达式（沙箱执行），如 `"answer > 18 && answer < 60"`      |
| **规则模板**         | 预设常用规则模板（性别分支、年龄分层、NPS阈值），一键应用                 |
| **规则预览**         | 编辑器中点击规则可高亮源组件和影响范围                                    |

### 11.2 远期扩展（分支组方案）

当显示规则不足以满足复杂需求时，可演进为**分支组（Branch Group）**方案：

```
survey_components 表新增字段：
  branch_group_id     BigInt?     ← 分支组标识
  branch_trigger_index Int?       ← 触发本分支的源组件 index
  branch_option_index Int?        ← 触发本分支的源选项 index
```

分支组功能：
- 多个组件属于同一分支组，共享触发条件
- 支持嵌套分支（子分支）
- 支持"分支组容器"概念，编辑器中可视化为一个卡片区域

### 11.3 组件生态扩展

| 扩展方向             | 说明                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| **新题型适配**       | 新题型默认 `alwaysShow: true`，编辑后自动拥有条件配置能力               |
| **第三方组件**        | 遵循 BaseStatus 接口的组件自动获得 displayConfig 支持                   |
| **规则调试工具**     | 编辑器中的规则可视化面板，高亮展示当前规则生效状态                       |
| **批量规则编辑**     | 支持选择多个组件统一设置显示条件                                        |

---

## 12. 风险与注意事项

### 12.1 已知风险

| 风险                   | 影响       | 缓解措施                                                        |
| ---------------------- | ---------- | --------------------------------------------------------------- |
| sourceIndex 在拖拽排序后失效 | 规则指向错误组件 | 拖拽时自动更新所有依赖此组件的 sourceIndex |
| 循环引用               | 无限等待   | 限制 sourceIndex < 当前组件 index（只能依赖前置组件）            |
| 隐藏题目的必填校验     | 无法提交   | 提交时排除隐藏题目的必填检查                                     |
| 多选答案的 contains 语义 | 逻辑错误 | 明确 `contains` 语义：多选答案数组中包含任一 targetValue          |
| 大问卷性能             | 卡顿       | 首屏仅评估当前页 + 预编译规则                                    |

### 12.2 兼容性保障

| 场景               | 行为                                              |
| ------------------ | ------------------------------------------------- |
| 旧问卷加载         | displayConfig 为 undefined → shouldDisplay 返回 true |
| 旧编辑器版本       | displayConfig 字段被忽略，不影响编辑和保存          |
| API 版本回退       | 后端 Json 字段无 schema 约束，向后兼容              |
| Undo/Redo          | 快照包含完整 displayConfig，撤销恢复完整状态        |
| 模板市场           | displayConfig 随模板导出/导入，条件规则被保留        |
| PDF导出            | 已有 `isPrinting` 模式，条件规则不影响全部展示       |

---

## 附录A：实施路线图

| 阶段 | 内容                                           | 涉及模块                                      |
|------|-----------------------------------------------|---------------------------------------------|
| P0   | 共享类型定义 + 规则评估引擎                     | packages/common, packages/survey-engine     |
| P1   | 编辑器集成（DisplayRuleEditor + updateStatus）  | app/q-editor (EditPannel, RightSide, store) |
| P2   | 填答端集成（SurveyView + 必填校验适配）         | app/q-editor (views/online)                 |
| P3   | 预览端集成 + PDF导出兼容                        | app/q-editor (views/preview)                |
| P4   | 默认状态更新 + 回归测试                         | app/q-editor (configs/defaultStatus)        |

---

## 附录B：与现有系统的关系总结

| 系统模块             | 关系                                               |
| -------------------- | -------------------------------------------------- |
| Low-code 架构        | 复用 — displayConfig 是 status 的新属性              |
| Pinia 状态管理        | 复用 — 新增 4 个 actions，不影响现有                 |
| provide/inject       | 复用 — updateStatus 新增 displayConfig 分支          |
| Undo/Redo            | 兼容 — 快照自动包含 displayConfig                    |
| IndexedDB            | 兼容 — JSON 序列化自动包含                           |
| PostgreSQL           | 兼容 — Json 字段天然支持                             |
| Redis 缓存           | 复用 — config 整体缓存，无需变更                     |
| 模板市场              | 兼容 — 模板导出时包含 displayConfig                  |
| 微前端架构            | 无影响 — 规则引擎独立于框架                          |
| 国际化 (i18n)         | 新增 — DisplayRuleEditor 的标签文案                      |
| 色弱/暗黑模式         | 复用 — DisplayRuleEditor 沿用现有 CSS 变量系统        |

---

**文档结束**
