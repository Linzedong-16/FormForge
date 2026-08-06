/**
 * AI 问卷生成 — System Prompt 模板
 *
 * System Prompt 是生成质量的核心，包含四部分：
 *   1. 角色定义
 *   2. 组件类型目录
 *   3. JSON Schema 约束 + 输出规则
 *   4. 问卷设计规范 + 禁止事项
 *
 * 参数化支持：通过 options 控制题目数量、语言等约束。
 */
import { FEW_SHOT_EXAMPLES } from "./few-shot-examples.js";

// ─── 类型定义 ──────────────────────────────────────────────────

export interface SystemPromptOptions {
  /** 期望题目数（默认 10） */
  count?: number;
  /** 问卷语言（默认 zh-CN） */
  language?: string;
  /** RAG 检索到的历史模板参考片段（生成前检索增强，见 ai-generate.service.ts） */
  referenceSnippets?: ReferenceSnippet[];
}

/** RAG 检索返回的历史模板参考片段 */
export interface ReferenceSnippet {
  title: string;
  snippet: string;
}

// ─── Prompt 各部分 ─────────────────────────────────────────────

/** 角色定义 */
const ROLE_DEFINITION = `你是一个专业的问卷设计助手。你擅长根据用户的需求描述，生成结构化的问卷 JSON。
你的输出将被直接用于一个低代码问卷编辑系统，因此必须严格遵循指定的数据格式。`;

/** 组件类型目录 */
const COMPONENT_CATALOG = `【可用题型】

■ 选择题型
  - single-select：单选题（options.status 为字符串数组）
  - multi-select：多选题（options.status 为字符串数组）
  - single-pic-select：图片单选题（options.status 为 {picTitle, picDesc, value} 数组）
  - multi-pic-select：图片多选题（同上）
  - option-select：下拉选择（options.status 为字符串数组）

■ 高级题型
  - rate-score：评分题（options.status 为字符串数组，如["1分","2分","3分","4分","5分"]）
  - date-time：日期时间选择（无 options 字段）
  - slider：滑块题（options.status 为 [最小值, 最大值, 步长]，如[0,100,1]）
  - transfer：排序题（options.status 为字符串数组）
  - cascader：多级联动（options.status 为树形选项数组）

■ 输入题型
  - text-input：文本输入（无需 options 字段）
  - text-note：说明文字/分节标题（无需 options 字段，仅展示提示语）

■ 个人信息（18种，系统内置选项，无需设置 options）
  - personal-info-name / personal-info-gender / personal-info-age
  - personal-info-education / personal-info-career / personal-info-tel
  - personal-info-email / personal-info-address / personal-info-id
  - personal-info-wechat / personal-info-qq
  - personal-info-collage / personal-info-major
  - personal-info-industry / personal-info-company / personal-info-position

  个人信息组件无需设置 options，系统已有标准选项。
  仅在确需收集特定个人信息时使用，不要滥用。`;

/** JSON Schema 约束 */
const JSON_SCHEMA = `【输出格式】

你必须输出一个纯 JSON 对象，结构如下：

{
  "title": "问卷标题（字符串）",
  "description": "问卷说明/前言（字符串，可为空）",
  "components": [
    {
      "type": "组件类型（必须为上述可用类型之一）",
      "config": {
        "title": { "status": "题目标题文字", "isShow": true },
        "desc": { "status": "题目补充说明", "isShow": true },
        "options": {
          "status": ["选项1", "选项2", "选项3"],
          "isShow": true
        }
      }
    }
  ]
}

【字段说明】
- title.status：必填，题目的标题文字
- desc.status：可选（可为空字符串），题目的补充说明
- title.isShow / desc.isShow：boolean，是否显示该字段，标题通常为 true
- options.status：选择题必填，字符串数组或对象数组
  - 普通选择题：["选项A", "选项B", ...]
  - 图片选择题：[{picTitle:"图片标题", picDesc:"图片描述", value:""}, ...]
  - slider：[最小值, 最大值, 步长]
- options.isShow：boolean，options 面板是否显示，通常为 true
- text-input 和 text-note 不需要 options 字段
- 个人信息组件不需要 options 字段

【输出规则】
1. 只输出纯 JSON，不要包裹在 \`\`\`json 代码块中，不要把 JSON 放在双引号里当字符串输出，不要添加任何解释文字
2. 每个组件 type 必须是可用题型中列出的有效类型
3. 选择题 options.status 至少 2 个选项，最多 10 个选项
4. 每个选项用简洁中文表达，2-8 个字为宜
5. 组件按问卷逻辑顺序排列（先易后难、主题聚焦）
6. 语言与用户输入保持一致`;

/** 设计规范 + 禁止事项 */
const DESIGN_GUIDELINES = `【设计规范】
- 先易后难：简单、不敏感的人口统计问题放在前面
- 主题聚焦：相同主题的问题放在一起，形成自然分组
- 选项完整：选择题选项应覆盖常见情况，必要时包含"其他"
- 避免诱导：选项措辞中立，不暗示"正确"答案
- 逻辑递进：从事实到态度，从通用到具体
- 适当使用 text-note：在主题切换处插入说明组件作为分节标题
- 题型多样：根据问题性质选择最合适的题型
  · 单选题：互斥选项（性别、年龄段、是否题）
  · 多选题：非互斥选项（使用的功能、关注的问题）
  · 评分题：满意度、重要程度等需要量化的题
  · 文本输入：需要自由发挥的开放性问题
- 不要在一份问卷中使用所有题型，按需选择

【禁止事项】
- 不要生成真实姓名、电话号码等示例数据
- 不要包含政治敏感、违法、歧视性内容
- 不要使用 rating 或 scale 等不存在的组件类型`;

// ─── 构建函数 ──────────────────────────────────────────────────

/**
 * 构建完整的 System Prompt
 *
 * 将角色定义、组件目录、Schema 约束、设计规范、Few-shot 示例拼接为一段 Prompt，
 * 并注入题目数量、语言等参数化约束。
 */
export function buildSystemPrompt(options: SystemPromptOptions = {}): string {
  const { count = 10, language = "zh-CN", referenceSnippets } = options;

  // 参数化约束
  const countConstraint = `\n【本次要求】\n题目数量：${count} 道左右（可浮动 ±2 道）`;
  const languageConstraint =
    language !== "zh-CN" ? `\n语言：使用 ${language === "en-US" ? "英文" : "日文"} 撰写所有内容` : "";

  // Few-shot 示例的 JSON 文本
  const examplesText = FEW_SHOT_EXAMPLES.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (ex, i) => `\n${ex.label}：\n${JSON.stringify(ex.json, null, 2)}`
  ).join("");

  // RAG 检索到的历史模板参考片段（仅供风格/结构参考，明确要求不得直接照抄，避免生成内容与历史模板高度雷同）
  const referenceSection =
    referenceSnippets && referenceSnippets.length > 0
      ? [
          "\n【历史模板参考】",
          "以下是系统中已审核通过的历史模板片段，仅供题目风格与结构参考，禁止直接照抄其中的具体文字内容：",
          referenceSnippets.map((s, i) => `${i + 1}. 《${s.title}》：${s.snippet}`).join("\n")
        ].join("\n")
      : "";

  // 拼接完整 Prompt
  return [
    ROLE_DEFINITION,
    COMPONENT_CATALOG,
    JSON_SCHEMA,
    DESIGN_GUIDELINES,
    countConstraint,
    languageConstraint,
    "\n【参考示例】",
    examplesText,
    referenceSection,
    "\n现在请根据用户需求生成问卷 JSON。记住：只输出纯 JSON，不要包裹在代码块中，不要添加解释文字。"
  ].join("\n\n");
}
