# 契约：提交答卷接口新增答案跳过状态

## `POST /api/surveys/:surveyId/responses`

既有请求体结构（`answers[]`，每项包含 `component_id`/`value`/`values`）不变，新增可选字段：

### Request Body

```ts
interface AnswerItem {
  component_id: string; // 既有字段，BigInt 序列化为字符串
  value?: string;
  values?: unknown[];
  /**
   * 0 = 正常作答（省略该字段时按 0 处理，兼容未升级的前端调用方）
   * 1 = 因动态规则被隐藏/跳过（填写者从未看到该题目）
   * 2 = 展示但主动留空
   */
  answer_status?: 0 | 1 | 2;
}
```

### 服务端处理（`submitResponse()` 变更）

现状：仅为"有值"的题目插入 `Answer` 行（真值过滤，约现有 1031-1046 行）。

变更后：以填写端计算出的 `visibleComs`（可见题目集合，前端随请求一并按上述 `answer_status` 语义提交）为准，对**问卷全部题目**都产出一行：

| 场景                              | `answer_status` | `value`/`values` |
| --------------------------------- | --------------- | ---------------- |
| 填写者正常作答                    | 0               | 实际答案值       |
| 可见但填写者未填写（非必答题）    | 2               | `NULL`           |
| 因规则被隐藏/跳过，填写者从未看到 | 1               | `NULL`           |

若客户端未升级（不携带 `answer_status`，即历史前端）：服务端保持现状行为（仅为有值题目插入 `answer_status=0` 的行，不新增“可见未答”与“隐藏跳过”行），确保存量客户端与本功能上线前完全等价（FR-010）。

### Response

不变。

### 统计/导出侧联动（不在本接口契约内，仅记录依赖关系）

`survey-stats.service.ts` 的统计口径同步从"是否存在 `Answer` 行"改为读取 `answer_status`，以正确区分 FR-011 要求的两种缺失语义；该变更范围属于 `survey-stats` 模块内部实现，接口路径与响应结构不变，故不单列契约文件。
