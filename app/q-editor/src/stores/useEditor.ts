import { defineStore } from "pinia";
import { isSurveyComName, type Status } from "@/types";
import {
  addOption,
  removeOption,
  setColor,
  setCurrentStatus,
  setIsUse,
  setItalic,
  setPicLinkByIndex,
  setPosition,
  setRateScoreDesc,
  setSize,
  setTextStatus,
  setWeight
} from "./actions";

export const useEditorStore = defineStore("editor", {
  state: () => ({
    currentComponentIndex: -1, // 当前选中的组件索引，一开始都没有选中，所以是-1
    surveyCount: 0, // 问卷题目的数量
    coms: [] as Status[] // 问卷题目组件数组
  }),
  actions: {
    setTextStatus,
    addOption,
    removeOption,
    setPosition,
    setCurrentStatus,
    setPicLinkByIndex,
    setSize,
    setWeight,
    setItalic,
    setColor,
    setIsUse,
    setRateScoreDesc,
    addCom(newCom: Status) {
      this.coms.push(newCom);
      this.currentComponentIndex = -1;
      if (isSurveyComName(newCom.name)) {
        this.surveyCount++;
      }
    },
    setCurrentComponentIndex(index: number) {
      this.currentComponentIndex = index;
    },
    removeCom(index: number) {
      // 先判断是否是问卷题目组件
      if (isSurveyComName(this.coms[index]!.name)) {
        this.surveyCount--;
      }
      this.coms.splice(index, 1);
    }
  }
});
