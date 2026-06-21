import { defineStore } from "pinia";
import {
  isSurveyComName,
  type Status,
  type SurveyDBData,
  type OptionsProps,
  type TextProps,
  type PicLink
} from "../types";
import {
  addOption as _addOption,
  removeOption as _removeOption,
  setColor as _setColor,
  setCurrentStatus as _setCurrentStatus,
  setIsUse as _setIsUse,
  setItalic as _setItalic,
  setPicLinkByIndex as _setPicLinkByIndex,
  setPosition as _setPosition,
  setRateScoreDesc as _setRateScoreDesc,
  setSize as _setSize,
  setTextStatus as _setTextStatus,
  setWeight as _setWeight,
  setCascaderOptions as _setCascaderOptions,
  type CascaderEditPayload
} from "./actions";
import { saveSurvey, updateSurveyById } from "../db/operation";
import { initStore } from "../configs/defaultStatus/initStatus";
import { UndoManager, type Snapshot } from "../utils/undoManager";
import { restoreComponentStatus } from "../utils";
import { toRaw } from "vue";

// ─── 模块级 UndoManager（非响应式，避免 Pinia reactive 代理干扰 structuredClone）───
const undoManager = new UndoManager();

export const useEditorStore = defineStore("editor", {
  state: () => ({
    // 维护当前选中的组件，用于编辑页面、预览页面的渲染
    currentComponentIndex: -1, // 当前选中的组件索引，一开始都没有选中，所以是-1
    surveyCount: 0, // 问卷题目的数量
    coms: [] as Status[], // 问卷题目组件数组（延迟初始化）
    pageSize: 10, // 分页配置：每页展示的组件数量（持久化）
    currentPage: 1, // 当前页码（仅运行时，不持久化）
    /** 最近一次更新的问卷 id（供 Layout 页 watch 触发同步状态刷新） */
    lastUpdatedId: null as number | null,
    /** 撤销/重做按钮可用态（响应式，由 _syncFlags 同步） */
    canUndo: false,
    canRedo: false,
    /** 编辑器版本号：undo/redo 时自增，供 RightSide 强制 EditPannel 重渲染 */
    editorVersion: 0,
    /** 是否有未保存的修改 */
    dirty: false,
    /** 当前问卷在 IndexedDB 中的 id（新建问卷首次保存后设置） */
    savedSurveyId: null as number | null,
    /** 当前问卷的远程问卷 ID（BigInt → string），首次同步后由后端返回 */
    remoteSurveyId: null as string | null
  }),
  actions: {
    // ─── 内部：快照记录与标志同步 ───────────────────────────────────────

    /** 对当前 coms 数组做深拷贝快照并压入撤销栈 */
    _recordSnapshot() {
      // 使用 JSON 序列化代替 structuredClone：Status.type 是 Vue 组件引用（函数），
      // structuredClone 无法克隆函数；JSON 会丢弃 type，恢复时由 undo()/redo() 调用
      // restoreComponentStatus() 通过 name 字段重新挂载组件引用
      const rawComs = toRaw(this.coms);
      const snapshottedComs = JSON.parse(JSON.stringify(rawComs)) as Status[];
      undoManager.push({
        coms: snapshottedComs,
        surveyCount: this.surveyCount,
        currentComponentIndex: this.currentComponentIndex
      });
      this.dirty = true;
      this._syncFlags();
    },

    /** 外部（如 Center.vue 拖拽）直接压入预构建的快照 */
    _pushSnapshot(snapshot: Snapshot) {
      undoManager.push(snapshot);
      this._syncFlags();
    },

    /** 将 UndoManager 的状态同步到响应式 state */
    _syncFlags() {
      this.canUndo = undoManager.canUndo;
      this.canRedo = undoManager.canRedo;
    },

    // ─── 撤销 / 重做 ────────────────────────────────────────────────────

    /** 撤销：恢复上一个快照 */
    undo() {
      const snapshot = undoManager.undo({
        coms: this.coms,
        surveyCount: this.surveyCount,
        currentComponentIndex: this.currentComponentIndex
      });
      if (snapshot) {
        this.coms = snapshot.coms;
        // 快照中 coms 的 type 字段被 JSON 丢弃，通过 name 重新挂载 Vue 组件引用
        restoreComponentStatus(this.coms);
        this.surveyCount = snapshot.surveyCount;
        this.currentComponentIndex = snapshot.currentComponentIndex;
        this.editorVersion++;
      }
      this._syncFlags();
    },

    /** 重做：恢复下一个快照 */
    redo() {
      const snapshot = undoManager.redo({
        coms: this.coms,
        surveyCount: this.surveyCount,
        currentComponentIndex: this.currentComponentIndex
      });
      if (snapshot) {
        this.coms = snapshot.coms;
        restoreComponentStatus(this.coms);
        this.surveyCount = snapshot.surveyCount;
        this.currentComponentIndex = snapshot.currentComponentIndex;
        this.editorVersion++;
      }
      this._syncFlags();
    },

    // ─── 初始化 / 重置 / 还原（清空历史）─────────────────────────────────

    initComs() {
      if (this.coms.length === 0) {
        this.coms = initStore();
        this.dirty = false;
        this.savedSurveyId = null;
        undoManager.clear();
        this._syncFlags();
      }
    },

    resetComs() {
      // 重置前记录快照（如果当前有内容可撤销）
      if (this.coms.length > 0) {
        this._recordSnapshot();
      }
      this.coms = initStore();
      this.currentComponentIndex = -1;
      this.surveyCount = 0;
      this.pageSize = 10;
      this.currentPage = 1;
      this.dirty = false;
      this.savedSurveyId = null;
      undoManager.clear();
      this._syncFlags();
    },

    /** 加载已有问卷数据，清空撤销历史 */
    setStore(data: SurveyDBData, surveyId?: number) {
      this.surveyCount = data.surveyCount;
      this.currentComponentIndex = -1;
      this.coms = data.coms;
      this.pageSize = data.pageSize ?? 10;
      this.currentPage = 1;
      this.dirty = false;
      this.savedSurveyId = surveyId ?? null;
      this.remoteSurveyId = data.remote_survey_id ?? null;
      undoManager.clear();
      this._syncFlags();
    },

    // ─── 分页 ──────────────────────────────────────────────────────────

    setPageSize(size: number) {
      this.pageSize = size;
    },

    setCurrentPage(page: number) {
      this.currentPage = page;
    },

    // ─── 组件增删（记录快照）─────────────────────────────────────────────

    addCom(newCom: Status) {
      this._recordSnapshot();
      this.coms.push(newCom);
      this.currentComponentIndex = -1;
      if (isSurveyComName(newCom.name)) {
        this.surveyCount++;
      }
    },

    removeCom(index: number) {
      this._recordSnapshot();
      if (isSurveyComName(this.coms[index]!.name)) {
        this.surveyCount--;
      }
      this.coms.splice(index, 1);
    },

    setCurrentComponentIndex(index: number) {
      this.currentComponentIndex = index;
    },

    // ─── 属性编辑（包装 actions.ts 函数，调用前记录快照）─────────────────

    setTextStatus(textProps: TextProps, text: string) {
      this._recordSnapshot();
      _setTextStatus(textProps, text);
    },

    addOption(optionProps: OptionsProps) {
      this._recordSnapshot();
      _addOption(optionProps);
    },

    removeOption(optionProps: OptionsProps, index: number) {
      this._recordSnapshot();
      return _removeOption(optionProps, index);
    },

    setCurrentStatus(optionProps: OptionsProps, index: number) {
      this._recordSnapshot();
      _setCurrentStatus(optionProps, index);
    },

    setPosition(optionProps: OptionsProps, index: number) {
      this._recordSnapshot();
      _setPosition(optionProps, index);
    },

    setSize(optionProps: OptionsProps, index: number) {
      this._recordSnapshot();
      _setSize(optionProps, index);
    },

    setWeight(optionProps: OptionsProps, weight: number) {
      this._recordSnapshot();
      _setWeight(optionProps, weight);
    },

    setItalic(optionProps: OptionsProps, italic: number) {
      this._recordSnapshot();
      _setItalic(optionProps, italic);
    },

    setColor(textProps: TextProps, color: string) {
      this._recordSnapshot();
      _setColor(textProps, color);
    },

    setPicLinkByIndex(optionProps: OptionsProps, payload: PicLink) {
      this._recordSnapshot();
      _setPicLinkByIndex(optionProps, payload);
    },

    setIsUse(optionProps: OptionsProps, isUse: boolean) {
      this._recordSnapshot();
      _setIsUse(optionProps, isUse);
    },

    setRateScoreDesc(optionProps: OptionsProps, payload: { index: number; val: string }) {
      this._recordSnapshot();
      _setRateScoreDesc(optionProps, payload);
    },

    setCascaderOptions(optionProps: OptionsProps, payload: CascaderEditPayload) {
      this._recordSnapshot();
      _setCascaderOptions(optionProps, payload);
    },

    /** 标记为已保存：清空 dirty + 清空撤销历史（避免把保存前的操作也撤销） */
    markClean() {
      this.dirty = false;
      undoManager.clear();
      this._syncFlags();
    },

    // ─── 持久化（不记录快照）─────────────────────────────────────────────

    async saveComs(survey: SurveyDBData) {
      const id = await saveSurvey(survey);
      this.savedSurveyId = id;
      this.markClean();
      return id;
    },

    async updateComs(id: number, data: SurveyDBData) {
      await updateSurveyById(id, data);
      this.markClean();
    },

    // ─── 远程同步状态 ──────────────────────────────────────────────

    /** 标记当前问卷已同步到远程 */
    setRemoteSynced(remoteId: string) {
      this.remoteSurveyId = remoteId;
    },

    /** 标记当前问卷未同步到远程 */
    setRemoteUnsynced() {
      this.remoteSurveyId = null;
    }
  }
});
