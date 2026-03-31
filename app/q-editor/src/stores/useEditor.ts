import { defineStore } from "pinia";
import { isSurveyComName, type Status } from "@/types";
import { addOption, removeOption, setCurrentStatus, setPicLinkByIndex, setPosition, setTextStatus } from "./actions";

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
    addCom(newCom: Status) {
      this.coms.push(newCom);
      this.currentComponentIndex = -1;
      if (isSurveyComName(newCom.name)) {
        this.surveyCount++;
      }
    }
  }
});
