/**
 * Vitest 全局 setup
 *
 * 解决测试环境中 Vue SFC 文件无法被正确解析的问题：
 * componentMap / initStatus 等模块通过 markRaw 引用 Vue 组件，测试环境（happy-dom）中
 * 这些 .vue 文件导入会解析为 undefined，导致 markRaw(undefined) 报错。
 *
 * 使用 vi.mock 对这些模块进行 mock，避免实际加载 Vue SFC。
 */
import { vi } from "vitest";

// Mock componentMap — 测试中不需要真实的 Vue 组件引用
// 注意：componentMap 已随迁移改由 monorepo-survey-engine 提供，该包同时导出
// useEditorStore/uploadSurveyFile 等其他真实实现，因此这里必须保留 importOriginal
// 返回的其余导出、仅覆盖 componentMap 一项，避免整包被静默替换为 undefined
vi.mock("monorepo-survey-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("monorepo-survey-engine")>();
  return {
    ...actual,
    componentMap: {}
  };
});

// Mock initStore — 返回符合 Status[] 结构的最小有效数据
// 注意：initStore/genderStatus 等已随迁移改由 monorepo-survey-engine 提供，其物理文件路径为
// packages/survey-engine/src/configs/defaultStatus/initStatus.ts，借助该包 "./*": "./src/*"
// 的 exports 通配声明按同一物理文件单独 mock（与 T027 处理 db/operation 的手法一致）
vi.mock("monorepo-survey-engine/configs/defaultStatus/initStatus", () => ({
  initStore: () => [
    {
      id: "init-1",
      name: "text-note",
      type: {},
      status: {
        type: { currentStatus: 0, status: [], isShow: true, name: "text-type-editor" },
        title: { status: "问卷标题", isShow: true, name: "title-editor" },
        desc: { status: "", isShow: false, name: "desc-editor" },
        position: { currentStatus: 0, status: [], isShow: false, name: "position-editor" },
        titleSize: { currentStatus: 0, status: [], isShow: true, name: "size-editor" },
        descSize: { currentStatus: 0, status: [], isShow: false, name: "size-editor" },
        titleWeight: { currentStatus: 1, status: [], isShow: true, name: "weight-editor" },
        descWeight: { currentStatus: 1, status: [], isShow: false, name: "weight-editor" },
        titleItalic: { currentStatus: 1, status: [], isShow: true, name: "italic-editor" },
        descItalic: { currentStatus: 1, status: [], isShow: false, name: "italic-editor" },
        titleColor: { status: "#000", isShow: true, name: "color-editor" },
        descColor: { status: "#909399", isShow: false, name: "color-editor" }
      }
    },
    {
      id: "init-2",
      name: "text-note",
      type: {},
      status: {
        type: { currentStatus: 1, status: [], isShow: true, name: "text-type-editor" },
        title: { status: "", isShow: false, name: "title-editor" },
        desc: { status: "欢迎语", isShow: true, name: "desc-editor" },
        position: { currentStatus: 0, status: [], isShow: true, name: "position-editor" },
        titleSize: { currentStatus: 0, status: [], isShow: false, name: "size-editor" },
        descSize: { currentStatus: 0, status: [], isShow: true, name: "size-editor" },
        titleWeight: { currentStatus: 1, status: [], isShow: false, name: "weight-editor" },
        descWeight: { currentStatus: 1, status: [], isShow: true, name: "weight-editor" },
        titleItalic: { currentStatus: 1, status: [], isShow: false, name: "italic-editor" },
        descItalic: { currentStatus: 1, status: [], isShow: true, name: "italic-editor" },
        titleColor: { status: "#000", isShow: false, name: "color-editor" },
        descColor: { status: "#909399", isShow: true, name: "color-editor" }
      }
    }
  ],
  genderStatus: () => ["男", "女", "保密"],
  educationStatus: () => ["初中及以下", "高中", "大专", "本科", "硕士及以上"],
  careerStatus: () => [
    "学生",
    "政府/机关",
    "管理者",
    "专业人员",
    "职员",
    "工人",
    "服务业",
    "自雇",
    "自由职业",
    "农业",
    "退休",
    "失业",
    "其他"
  ],
  ageStatus: () => ["18岁以下", "25-30岁", "31-40岁", "41-50岁", "51-60岁", "61岁以上"]
}));
