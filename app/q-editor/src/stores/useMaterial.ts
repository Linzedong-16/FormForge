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
  setColor,
  setPicLinkByIndex
} from "./actions";
import type { Material, Status } from "@/types";
import { updateInitStatusBeforeAdd } from "@/utils";

// 哪些业务组件需要初始化
const keyToInit = ["personal-info-gender", "personal-info-education"] as Material[];

// 初始化后的状态
const initializedStates: { [key: string]: Status } = {};

keyToInit.forEach(key => {
  const defaultStatus = defaultStatusMap[key as string]!() as Status;
  updateInitStatusBeforeAdd(defaultStatus, key);
  initializedStates[key] = defaultStatus;
});

export const useMaterialStore = defineStore("materialStore", {
  state: () => ({
    currentMaterialCom: "single-select", // 当前选中的组件
    // 记录所有的业务组件
    coms: {
      "single-select": defaultStatusMap["single-select"]!(),
      "single-pic-select": defaultStatusMap["single-pic-select"]!(),
      "multi-select": defaultStatusMap["multi-select"]!(),
      "option-select": defaultStatusMap["option-select"]!(),
      "multi-pic-select": defaultStatusMap["multi-pic-select"]!(),
      // 备注组件
      "text-node": defaultStatusMap["text-node"]!(),
      // 输入框组件
      "text-input": defaultStatusMap["text-input"]!(),
      // 个人信息组件
      "personal-info-gender": initializedStates["personal-info-gender"],
      "personal-info-education": initializedStates["personal-info-education"]
    } as Record<string, ReturnType<(typeof defaultStatusMap)[string]>>
  }),
  actions: {
    setCurrentMaterialCom(com: string) {
      this.currentMaterialCom = com;
    },
    setTextStatus,
    setPicLinkByIndex,
    setWeight,
    setItalic,
    setColor,
    addOption,
    removeOption,
    setPosition,
    setSize
  }
});
