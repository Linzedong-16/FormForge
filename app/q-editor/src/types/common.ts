import type { defineComponent } from "vue";
import type { OptionsProps, TextProps } from "@/types/editProps";
import type { Material } from "./material";
// 动态表单规则配置类型以 packages/survey-engine 为权威来源
import type { QuestionLogicConfig } from "monorepo-survey-engine";

// 导出 vue 组件类型
export type VueComType = ReturnType<typeof defineComponent>;

export interface Status {
  type: VueComType;
  name: Material;
  id: string;
  status: {
    [key: string]: TextProps | OptionsProps;
  };
  /**
   * 题目稳定标识：供动态表单规则引用题目，与后端 survey_components.client_key 对应
   * 新增题目由 useEditor.ts 的 addCom() 统一生成 UUID v4，既有题目由 setStore() 原样加载透传
   */
  client_key?: string;
  /** 该题目的动态规则配置，未启用规则时为 null/undefined */
  logic?: QuestionLogicConfig | null;
}
