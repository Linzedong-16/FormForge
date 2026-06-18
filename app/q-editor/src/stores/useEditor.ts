import { defineStore } from "pinia";
import { isSurveyComName, type Status, type SurveyDBData } from "@/types";
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
  setWeight,
  setCascaderOptions
} from "./actions";
import { saveSurvey, updateSurveyById } from "@/db/operation";
import { initStore } from "@/configs/defaultStatus/initStatus";

// 编辑器初始化状态

export const useEditorStore = defineStore("editor", {
  state: () => ({
    // 维护当前选中的组件，用于编辑页面、预览页面的渲染
    currentComponentIndex: -1, // 当前选中的组件索引，一开始都没有选中，所以是-1
    surveyCount: 0, // 问卷题目的数量
    coms: [] as Status[], // 问卷题目组件数组（延迟初始化）
    pageSize: 10, // 分页配置：每页展示的组件数量（持久化）
    currentPage: 1, // 当前页码（仅运行时，不持久化）
    /** 最近一次更新的问卷 id（供 Layout 页 watch 触发同步状态刷新） */
    lastUpdatedId: null as number | null
  }),
  actions: {
    // 初始化组件列表（在 i18n 就绪后调用）
    initComs() {
      if (this.coms.length === 0) {
        this.coms = initStore();
      }
    },
    resetComs() {
      this.coms = initStore();
      this.currentComponentIndex = -1;
      this.surveyCount = 0;
      this.pageSize = 10;
      this.currentPage = 1;
    },
    // 设置每页组件数量
    setPageSize(size: number) {
      this.pageSize = size;
    },
    // 设置当前页码
    setCurrentPage(page: number) {
      this.currentPage = page;
    },
    saveComs(survey: SurveyDBData) {
      return saveSurvey(survey);
    },
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
    setCascaderOptions,
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
    },
    // 还原仓库状态
    setStore(data: SurveyDBData) {
      this.surveyCount = data.surveyCount;
      this.currentComponentIndex = -1;
      this.coms = data.coms;
      // 旧数据可能没有 pageSize 字段，兜底为 10
      this.pageSize = data.pageSize ?? 10;
      this.currentPage = 1;
    },
    // 更新问卷
    updateComs(id: number, data: SurveyDBData) {
      return updateSurveyById(id, data);
    }
  }
});
