import type { defineComponent } from "vue";
import type { OptionsProps, TextProps } from "../types/editProps.js";
import type { Material } from "./material.js";

// 导出 vue 组件类型
export type VueComType = ReturnType<typeof defineComponent>;

export interface Status {
  type: VueComType;
  name: Material;
  id: string;
  status: {
    [key: string]: TextProps | OptionsProps;
  };
}
