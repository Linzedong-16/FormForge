import { defineStore } from "pinia";
import {
  isSurveyComName,
  type Status,
  type SurveyDBData,
  type OptionsProps,
  type TextProps,
  type PicLink
} from "@/types";
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
import { saveSurvey, updateSurveyById } from "@/db/operation";
import { initStore } from "@/configs/defaultStatus/initStatus";
import { UndoManager, type Snapshot } from "@/utils/undoManager";
import { restoreComponentStatus } from "@/utils";
import { toRaw } from "vue";
import { v4 as uuidv4 } from "uuid";
import { validateRuleSet } from "monorepo-survey-engine";
import type { QuestionLogicConfig, RuleViolation } from "monorepo-survey-engine";

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
      // 新增题目生成稳定引用键 UUID v4，供动态表单规则引用；
      // 加载既有问卷走 setStore() 而非 addCom()，故已有 client_key 不会被此处覆盖
      if (!newCom.client_key) {
        newCom.client_key = uuidv4();
      }
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

    // ─── 按 client_key 索引的动态规则读写 ────────────────────────────────

    /** 按题目稳定标识查找对应组件，供规则编辑器/求值运行时按 client_key 定位题目 */
    getComByClientKey(clientKey: string): Status | undefined {
      return this.coms.find(com => com.client_key === clientKey);
    },

    /**
     * 确保指定下标的题目具备 client_key：存量问卷（发布于本功能上线前）的题目可能没有该字段，
     * 首次尝试为其配置动态规则时惰性补齐，不影响未打开规则面板的其他题目，不产生新的破坏性变更
     */
    ensureComClientKey(index: number): string {
      const com = this.coms[index];
      if (!com) return "";
      if (!com.client_key) {
        com.client_key = uuidv4();
        this.dirty = true;
      }
      return com.client_key;
    },

    /** 按题目稳定标识更新其动态规则配置（记录快照，可撤销） */
    setComLogicByClientKey(clientKey: string, logic: QuestionLogicConfig | null) {
      const target = this.coms.find(com => com.client_key === clientKey);
      if (!target) {
        console.warn(`setComLogicByClientKey: 未找到 client_key=${clientKey} 对应的题目`);
        return;
      }
      this._recordSnapshot();
      target.logic = logic;
    },

    /**
     * 查找所有引用了指定题目（按 client_key）的动态规则（FR-012 acceptance scenario 4）：
     * 复用 T044 的 validateRuleSet() 而非重新实现引用图遍历——只需把目标题目从传入的题目全集中
     * 排除掉，使其 client_key 不再存在于 fullKeys 全集中，validateRuleSet 内部现成的
     * danglingReference 检测就会自动捕获所有仍引用该 key 的规则，据此反推"删除会影响哪些规则"。
     * 与存量题目过滤先例（后端 T046）保持一致：跳过没有 client_key 的题目，避免空值碰撞误判。
     */
    findRuleReferencesTo(clientKey: string): RuleViolation[] {
      const components = this.coms
        .filter((com): com is typeof com & { client_key: string } => !!com.client_key && com.client_key !== clientKey)
        .map((com, index) => ({
          clientKey: com.client_key,
          orderIndex: index,
          logic: com.logic ?? null
        }));

      const { violations } = validateRuleSet(components);
      return violations.filter(v => v.type === "danglingReference" && v.involvedKeys.includes(clientKey));
    },

    /**
     * 反向查找：指定题目（按 client_key）自身的动态规则中，是否引用了当前已不存在的题目
     * （FR-009 Nice-to-have：为"被删除但仍被其他规则引用的题目"在属性面板增加持久提示）。
     * involvedKeys[0] 始终是规则拥有者（见 validator.ts checkReference），故直接匹配首位即可，
     * 无需像 findRuleReferencesTo 那样排除目标 key——这里不删除任何题目，只是原样体检当前全集。
     */
    getDanglingReferencesFrom(clientKey: string): RuleViolation[] {
      const components = this.coms
        .filter((com): com is typeof com & { client_key: string } => !!com.client_key)
        .map((com, index) => ({
          clientKey: com.client_key,
          orderIndex: index,
          logic: com.logic ?? null
        }));

      const { violations } = validateRuleSet(components);
      return violations.filter(v => v.type === "danglingReference" && v.involvedKeys[0] === clientKey);
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
