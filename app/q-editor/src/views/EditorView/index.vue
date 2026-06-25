<template>
  <div>
    <div class="header">
      <Header :id="id" :is-editor="true" />
    </div>
    <!-- 编辑器主体区域 -->
    <div class="container" :class="{ 'center-hidden': !centerVisible }">
      <LeftSide />
      <RightSide />
    </div>
    <div v-show="centerVisible">
      <Center />
    </div>

    <!-- 居中视图切换按钮 -->
    <div class="center-toggle" @click="centerVisible = !centerVisible">
      <el-icon :size="16">
        <ArrowLeft v-if="centerVisible" />
        <ArrowRight v-else />
      </el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref, watch } from "vue";
import Header from "@/components/Common/Header.vue";
import LeftSide from "@/views/EditorView/LeftSide/Index.vue";
import Center from "@/views/EditorView/Center.vue";
import RightSide from "@/views/EditorView/RightSide.vue";
import { computed } from "vue";
import { useRoute, onBeforeRouteLeave } from "vue-router";
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import { getSurveyById, updateSurveyById } from "@/db/operation";
import { restoreComponentStatus } from "@/utils";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import type { SurveyDBData, TextProps } from "@/types";
// 远程 API
import { createSurvey, updateSurvey, serializeComponents, extractSurveyMetadata } from "@/api/modules/survey";

const route = useRoute();
const { t } = useI18n();
// 仓库
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();

const id = computed(() => (route.params.id ? String(route.params.id) : ""));

// ─── 居中视图显隐控制 ──────────────────────────────────────────
const centerVisible = ref(true);
// 进入模板市场时自动隐藏居中视图，切换回其他 Tab 时恢复
watch(
  () => route.name,
  name => {
    if (name === "template-market") {
      centerVisible.value = false;
    } else if (name === "survey-type" || name === "outline") {
      centerVisible.value = true;
    }
  }
);

// ─── 快捷键保存处理 ──────────────────────────────────────────

interface PromptItem {
  value: string;
}

/** 将本地问卷同步到远程数据库，返回序列化后的组件供后续复用 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function syncToRemote(localId: number): Promise<ReturnType<typeof serializeComponents>> {
  try {
    const components = serializeComponents(store.coms as Parameters<typeof serializeComponents>[0]);
    const { title, description } = extractSurveyMetadata(store.coms as Parameters<typeof extractSurveyMetadata>[0]);

    // 确保标题非空：优先使用组件提取的标题，回退到本地存储的标题
    let safeTitle = title;
    if (!safeTitle && store.savedSurveyId) {
      const local = await getSurveyById(store.savedSurveyId);
      safeTitle = local?.title || "";
    }
    if (!safeTitle) {
      safeTitle = "未命名问卷";
    }

    if (store.remoteSurveyId) {
      // 更新已有远程记录
      const res = await updateSurvey(store.remoteSurveyId, {
        title: safeTitle,
        description,
        components,
        page_size: store.pageSize
      });
      if (res.code === 0) {
        store.setRemoteSynced(store.remoteSurveyId);
        // 同步成功后更新本地 IndexedDB 的标题和同步状态
        if (store.savedSurveyId) {
          await updateSurveyById(store.savedSurveyId, {
            title: safeTitle,
            syncStatus: "synced"
          });
        }
      } else {
        console.warn("[Editor] 远程同步失败:", res.msg);
      }
    } else {
      // 首次创建远程记录
      const res = await createSurvey({
        title: safeTitle,
        description,
        components,
        page_size: store.pageSize
      });
      if (res.code === 0 && res.data) {
        store.setRemoteSynced(res.data.survey_id);
        // 将远程 questionnaire_id 写回本地 IndexedDB，同时确保标题与后端一致
        if (store.savedSurveyId) {
          await updateSurveyById(store.savedSurveyId, {
            remote_survey_id: res.data.survey_id,
            title: safeTitle,
            syncStatus: "synced"
          });
        }
      } else {
        console.warn("[Editor] 远程同步失败:", res.msg);
      }
    }

    return components;
  } catch (err) {
    // 远程同步失败不阻塞本地保存流程
    console.warn("[Editor] 远程同步异常:", err);
    return [];
  }
}

/** 统一的保存/更新逻辑：已有 id 直接更新，新建则提示标题。保存后自动同步到远程，返回序列化组件 */
async function doSave(): Promise<ReturnType<typeof serializeComponents>> {
  const surveyId = store.savedSurveyId || (id.value ? Number(id.value) : null);

  if (surveyId) {
    // 从组件中提取当前标题，确保 IndexedDB 中的标题与编辑器内容一致
    const { title: currentTitle } = extractSurveyMetadata(store.coms as Parameters<typeof extractSurveyMetadata>[0]);
    // 已有问卷：直接更新本地 IndexedDB
    await store.updateComs(surveyId, {
      title: currentTitle || undefined,
      updateDate: new Date().getTime(),
      surveyCount: store.surveyCount,
      coms: JSON.parse(JSON.stringify(store.coms)),
      pageSize: store.pageSize,
      syncStatus: "unsynced"
    } as SurveyDBData);
    store.lastUpdatedId = surveyId;

    // 同步到远程
    const components = await syncToRemote(surveyId);
    ElMessage.success(t("editor.updateSuccess"));
    return components;
  } else {
    // 新建问卷：第一次保存需输入标题
    const item = await ElMessageBox.prompt(t("editor.savePromptTitle"), t("editor.confirmTitle"), {
      confirmButtonText: t("editor.confirmButton"),
      cancelButtonText: t("editor.cancelButton"),
      type: "info"
    }).catch(() => null);

    if (!item) return [];

    const safeItem = item as unknown as PromptItem;
    const userTitle = safeItem?.value as string;

    // 将提示对话框输入的标题同步到 text-note 组件，确保 UI 与数据一致
    const textNoteCom = store.coms[0];
    if (textNoteCom?.status?.title) {
      store.setTextStatus(textNoteCom.status.title as TextProps, userTitle);
    }

    const newId = await store.saveComs({
      createDate: new Date().getTime(),
      title: userTitle,
      updateDate: new Date().getTime(),
      surveyCount: store.surveyCount,
      coms: JSON.parse(JSON.stringify(store.coms)),
      pageSize: store.pageSize,
      syncStatus: "unsynced"
    });
    // 同步到远程
    const components = await syncToRemote(newId);
    ElMessage.success(t("editor.saveSuccess"));
    return components;
  }
}

// 提供给 Header 使用，使头部的保存/更新按钮与 Ctrl+S 走同一逻辑
// 返回值：序列化后的组件列表，供后续操作（如申请模板）复用
provide<() => Promise<ReturnType<typeof serializeComponents>>>("editorDoSave", doSave);

// ─── 键盘快捷键：Ctrl+Z/Y 撤销重做 + Ctrl+S 保存 ─────────────

const handleKeydown = (e: KeyboardEvent) => {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (!isCtrlOrCmd) return;

  if (e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    store.undo();
  } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
    e.preventDefault();
    store.redo();
  } else if (e.key === "s") {
    e.preventDefault();
    doSave();
  }
};

// ─── 页面刷新/关闭前拦截 ────────────────────────────────────

const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (store.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
};

// ─── 路由跳转前拦截 ─────────────────────────────────────────

onBeforeRouteLeave(async (_to, _from, next) => {
  if (!store.dirty) {
    next();
    return;
  }

  try {
    await ElMessageBox.confirm(t("editor.unsavedMessage"), t("editor.unsavedTitle"), {
      confirmButtonText: t("editor.saveAndLeave"),
      cancelButtonText: t("editor.leaveWithoutSave"),
      distinguishCancelAndClose: true,
      type: "warning"
    });
    // 用户点击"保存并离开"
    await doSave();
    next();
  } catch (action: unknown) {
    if (action === "cancel") {
      // 用户点击"不保存"：销毁当前问卷，不持久化
      store.resetComs();
      next();
    }
    // 关闭弹框 / 点 X：取消导航
  }
});

// ─── 生命周期 ────────────────────────────────────────────────

onMounted(() => {
  if (id.value) {
    // 根据 id 获取存储的问卷题目
    getSurveyById(Number(id.value)).then(res => {
      if (res) {
        restoreComponentStatus(res.coms);
        store.setStore(res, Number(id.value));
      }
    });
  } else {
    // 新建问卷，初始化组件列表
    store.initComs();
  }

  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("beforeunload", handleBeforeUnload);
});
</script>

<style scoped lang="scss">
.header {
  width: 100%;
  background-color: var(--white);
  position: fixed;
  top: 0;
  z-index: 10;
}
.container {
  width: calc(100vw - 40px);
  padding: 20px;
  // Header的高度50px，上下padding 20px
  height: calc(100vh - 50px - 40px);
  background: url("@/assets/imgs/editor_background.jpg") no-repeat center center / cover;
  background-color: var(--white);
  position: fixed;
  top: 50px;
}

/* 居中视图隐藏时，左侧面板宽度翻倍 */
.center-hidden {
  --editor-left-width: calc(300px * 2);
}

/* 居中视图切换按钮 */
.center-toggle {
  position: fixed;
  right: calc(var(--editor-right-width) + var(--editor-gap) + 8px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 11;
  width: 28px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid var(--border-color);
  border-radius: 0 6px 6px 0;
  cursor: pointer;
  transition: background-color 0.2s ease;
  color: var(--font-color-light);

  &:hover {
    background: rgba(255, 255, 255, 0.95);
    color: var(--primary-color);
  }
}
</style>
