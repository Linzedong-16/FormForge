// 组件市场里面所有组件状态的仓库
import { defineStore } from "pinia";
import { defaultStatusMap } from "@/configs/defaultStatus/defaultStatusMap";
import {
  addOption,
  removeOption,
  setTextStatus,
  setPosition,
  setSize,
  setWeight,
  setItalic,
  setColor
} from "./actions";

export const useMaterialStore = defineStore("materialStore", {
  state: () => ({
    currentMaterialCom: "single-select", // 当前选中的组件
    // 记录所有的业务组件
    coms: {
      "single-select": defaultStatusMap["single-select"]!()
    } as Record<string, ReturnType<(typeof defaultStatusMap)[string]>>
  }),
  actions: {
    setTextStatus,
    setWeight,
    setItalic,
    setColor,
    addOption,
    removeOption,
    setPosition,
    setSize
  }
});
