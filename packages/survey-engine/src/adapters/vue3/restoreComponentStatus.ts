// adapters/vue3/restoreComponentStatus.ts —— 迁移自 src/utils/index.ts 的 restoreComponentStatus（T014）。
//
// 迁移动机（修复潜在循环依赖）：
//   原 utils/index.ts 引入 componentMap 后，会与 Materials 业务组件反向引入
//   "../../utils" 中的纯工具函数（getTextStatus 等）形成循环依赖：
//     componentMap.ts → 业务组件.vue → utils/index.ts → componentMap.ts
//   当同一模块图中同时静态加载业务组件与 componentMap（例如测试文件、渲染层）时，
//   处于循环中间态的组件引用会取到 undefined，导致 markRaw() 报错。
//   将本函数迁移至 adapters/vue3/ 后，utils/index.ts 不再引入 componentMap，彻底切断该环。
//
// 对外行为与旧实现等价：入参 Status[] 原地挂载 type/editCom 组件引用，供既有调用方
// （stores/useEditor.ts、src/index.ts 对外导出）替换调用来源后直接复用。
// 内部改为通过 resolveVue3Component 走 Vue3 组件工厂查表（T012），不再直接索引 componentMap 字面量。
//
// 字段级编辑器标识说明：现状字段配置对象的 name 字段（BaseProps.name）实际存放的是
// 编辑器组件标识（如 "title-editor"），并非该字段自身的业务名；新格式 FieldConfig 额外补充了
// 语义更明确的 editComName 字段承载同一份标识。故此处优先取 editComName，取不到时回退到 name，
// 以同时兼容新旧两种数据形态。
import { resolveVue3Component } from "./componentFactory";
import type { Status } from "../../types";

export const restoreComponentStatus = (coms: Status[]) => {
  coms.forEach(com => {
    // 顶层组件引用还原：按 name 查表得到题型组件引用
    const component = resolveVue3Component(com.name);
    if (component) {
      com.type = component;
    } else {
      // FR-008 降级处理：题型标识未在组件工厂中注册时，com.type 保持 undefined，
      // 渲染层 <component :is="undefined"> 天然会跳过该题，此处仅补充明确告警，
      // 便于排查问卷数据中混入的未知/废弃题型标识（quickstart.md 场景 5）
      console.warn(`[survey-engine] 未找到题型 "${com.name}" 对应的渲染组件，该题将被跳过渲染`);
    }

    if (!com.status || typeof com.status !== "object") return;

    for (const key in com.status) {
      const prop = com.status[key];
      if (!prop || typeof prop !== "object") continue;

      const propRecord = prop as unknown as Record<string, unknown>;
      const editComName = (propRecord.editComName as string | undefined) ?? (propRecord.name as string | undefined);
      if (!editComName) continue;

      const editCom = resolveVue3Component(editComName);
      if (editCom) {
        propRecord.editCom = editCom;
      }
    }
  });
};
