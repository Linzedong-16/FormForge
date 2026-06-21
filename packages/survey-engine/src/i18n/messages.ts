/**
 * i18n 消息导出 — 供外部项目（如 frontend）合并翻译
 *
 * 问卷渲染引擎的 Vue 组件内部使用 useI18n() 获取翻译文案，
 * 外部项目需要将这些消息合并到自己的 i18n 实例中。
 */
import zhCommon from "./zh-CN/common";
import zhComponents from "./zh-CN/components";
import zhEditor from "./zh-CN/editor";
import zhMaterials from "./zh-CN/materials";
import zhPreview from "./zh-CN/preview";

import enCommon from "./en-US/common";
import enComponents from "./en-US/components";
import enEditor from "./en-US/editor";
import enMaterials from "./en-US/materials";
import enPreview from "./en-US/preview";

import jaCommon from "./ja-JP/common";
import jaComponents from "./ja-JP/components";
import jaEditor from "./ja-JP/editor";
import jaMaterials from "./ja-JP/materials";
import jaPreview from "./ja-JP/preview";

export const engineMessages = {
  "zh-CN": { common: zhCommon, components: zhComponents, editor: zhEditor, materials: zhMaterials, preview: zhPreview },
  "en-US": { common: enCommon, components: enComponents, editor: enEditor, materials: enMaterials, preview: enPreview },
  "ja-JP": { common: jaCommon, components: jaComponents, editor: jaEditor, materials: jaMaterials, preview: jaPreview }
};
