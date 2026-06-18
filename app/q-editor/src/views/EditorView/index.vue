<template>
  <div>
    <div class="header">
      <Header :id="id" :is-editor="true" />
    </div>
    <!-- 编辑器主体区域 -->
    <div class="container">
      <LeftSide />
      <RightSide />
    </div>
    <div>
      <Center />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, provide } from "vue";
import Header from "@/components/Common/Header.vue";
import LeftSide from "@/views/EditorView/LeftSide/Index.vue";
import Center from "@/views/EditorView/Center.vue";
import RightSide from "@/views/EditorView/RightSide.vue";
import { computed } from "vue";
import { useRoute, onBeforeRouteLeave } from "vue-router";
import { getSurveyById } from "@/db/operation";
import { restoreComponentStatus } from "@/utils";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import type { SurveyDBData } from "@/types";

const route = useRoute();
const { t } = useI18n();
// 仓库
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();

const id = computed(() => (route.params.id ? String(route.params.id) : ""));

// ─── 快捷键保存处理 ──────────────────────────────────────────

interface PromptItem {
  value: string;
}

/** 统一的保存/更新逻辑：已有 id 直接更新，新建则提示标题 */
async function doSave() {
  const surveyId = store.savedSurveyId || (id.value ? Number(id.value) : null);

  if (surveyId) {
    // 已有问卷：直接更新，无需提示
    await store.updateComs(surveyId, {
      updateDate: new Date().getTime(),
      surveyCount: store.surveyCount,
      coms: JSON.parse(JSON.stringify(store.coms)),
      pageSize: store.pageSize,
      syncStatus: "unsynced"
    } as SurveyDBData);
    store.lastUpdatedId = surveyId;
    ElMessage.success(t("editor.updateSuccess"));
  } else {
    // 新建问卷：第一次保存需输入标题
    await ElMessageBox.prompt(t("editor.savePromptTitle"), t("editor.confirmTitle"), {
      confirmButtonText: t("editor.confirmButton"),
      cancelButtonText: t("editor.cancelButton"),
      type: "info"
    })
      .then(async item => {
        const safeItem = item as unknown as PromptItem;
        await store.saveComs({
          createDate: new Date().getTime(),
          title: safeItem?.value as string,
          updateDate: new Date().getTime(),
          surveyCount: store.surveyCount,
          coms: JSON.parse(JSON.stringify(store.coms)),
          pageSize: store.pageSize
        });
        ElMessage.success(t("editor.saveSuccess"));
      })
      .catch(() => {
        // 取消输入标题，不报错
      });
  }
}

// 提供给 Header 使用，使头部的保存/更新按钮与 Ctrl+S 走同一逻辑
provide("editorDoSave", doSave);

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
</style>
