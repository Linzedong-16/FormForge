<template>
  <div>
    <div class="container flex self-start align-items-center border-box">
      <!-- 分为三个部分 -->
      <div class="left flex justify-content-center align-items-center">
        <el-button :icon="ArrowLeft" circle size="small" @click="goHome" />
        <!-- 撤销/重做按钮 —— 仅在编辑器页面生效 -->
        <template v-if="isEditor">
          <el-button
            :icon="RefreshLeft"
            circle
            size="small"
            :disabled="!store.canUndo"
            :title="t('editor.undo')"
            @click="store.undo()"
          />
          <el-button
            :icon="RefreshRight"
            circle
            size="small"
            :disabled="!store.canRedo"
            :title="t('editor.redo')"
            @click="store.redo()"
          />
        </template>
      </div>
      <div class="center flex align-items-center space-between pl-15 pr-15">
        <div v-if="isEditor" class="flex align-items-center">
          <!-- 说明是编辑器，需要显示额外的按钮 -->
          <div v-if="id">
            <el-button type="warning" size="small" @click="editorDoSave">{{ t("editor.updateSurvey") }}</el-button>
          </div>
          <div v-else>
            <el-button type="danger" size="small" @click="reset">{{ t("editor.resetSurvey") }}</el-button>
            <el-button type="success" size="small" @click="editorDoSave">{{ t("editor.saveSurvey") }}</el-button>
          </div>
          <!-- 分页器：紧邻保存/更新按钮右侧，绑定仓库的分页配置 -->
          <SurveyPagination
            v-model:current-page="store.currentPage"
            v-model:page-size="store.pageSize"
            :total="store.coms.length"
            class="ml-15"
          />
          <!-- AI 功能按钮组 -->
          <div class="ai-btn-group ml-15 flex align-items-center">
            <!-- 按钮已禁用，靠原生 title 说明禁用原因，无需自定义 tooltip -->
            <el-button size="small" plain disabled title="该功能模块还在开发中">{{ t("editor.aiPolish") }}</el-button>
            <el-button size="small" type="primary" plain @click="aiGenPanelRef?.open()">
              {{ t("editor.aiGenerate") }}
            </el-button>
          </div>
        </div>
        <div v-if="isEditor" class="mr-10">
          <el-button type="primary" size="small" plain @click="previewAsFiller">
            {{ t("editor.previewAsFiller") }}
          </el-button>
        </div>
        <div v-if="id">
          <el-button type="primary" size="small" @click="preview">{{ t("editor.preview") }}</el-button>
        </div>
      </div>
      <div class="right flex justify-content-center align-items-center">
        <UserProfile />
      </div>
    </div>

    <!-- AI 一键生成面板（Drawer，通过 ref 控制） 占位 -->
    <!-- append-to-body：挂载到 body，避免嵌套在带 backdrop-filter 的 .header 内时，
         其 fixed 定位被 backdrop-filter 创建的新 containing block 影响而错位 -->
    <el-dialog v-model="templateDialogVisible" :title="t('editor.templateDialogTitle')" width="500px" append-to-body>
      <el-form :model="templateForm" label-width="100px">
        <el-form-item :label="t('editor.templateCategory')" required>
          <el-select
            v-model="templateForm.category"
            :placeholder="t('editor.templateCategoryRequired')"
            style="width: 100%"
          >
            <el-option :label="t('editor.templateCategoryEducation')" value="education" />
            <el-option :label="t('editor.templateCategoryMarket')" value="market" />
            <el-option :label="t('editor.templateCategoryHr')" value="hr" />
            <el-option :label="t('editor.templateCategoryCustomer')" value="customer" />
            <el-option :label="t('editor.templateCategoryEvent')" value="event" />
            <el-option :label="t('editor.templateCategoryOther')" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('editor.templateSubmitMessage')">
          <el-input
            v-model="templateForm.submit_message"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            :placeholder="t('editor.templateSubmitMessage')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">{{ t("editor.cancelButton") }}</el-button>
        <el-button type="primary" :loading="templateApplying" @click="submitApplyTemplate">
          {{ t("editor.templateSubmit") }}
        </el-button>
      </template>
    </el-dialog>

    <!-- AI 一键生成面板（Drawer，通过 ref 控制） -->
    <AIGenPanel ref="aiGenPanelRef" />
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, RefreshLeft, RefreshRight } from "@element-plus/icons-vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
const router = useRouter();
const { t } = useI18n();
import { ref, inject } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useEditorStore } from "@/stores/useEditor";
import SurveyPagination from "@/components/Common/SurveyPagination.vue";
import UserProfile from "@/components/Common/UserProfile.vue";
import AIGenPanel from "@/extension/components/AI-GenPanel.vue";
import { applyTemplate, serializeComponents } from "@/api/modules/survey";
import type { TemplateCategory } from "@common/survey/survey.interface";

const props = defineProps({
  isEditor: {
    type: Boolean,
    required: true
  },
  id: {
    type: String,
    default: ""
  }
});
const store = useEditorStore();

// 统一的保存/更新回调（由 EditorView 通过 provide 注入，确保 Ctrl+S 与按钮走同一逻辑）
// 返回序列化后的组件列表，供后续操作复用
const editorDoSave = inject<() => Promise<ReturnType<typeof serializeComponents>>>("editorDoSave", () =>
  Promise.resolve([])
);

// 重置问卷
const reset = () => {
  ElMessageBox.confirm(t("editor.confirmReset"), t("editor.confirmTitle"), {
    confirmButtonText: t("editor.confirmButton"),
    cancelButtonText: t("editor.cancelButton"),
    type: "warning"
  })
    .then(() => {
      store.resetComs();
      ElMessage.success(t("editor.resetSuccess"));
    })
    .catch(() => {
      ElMessage.info(t("editor.resetCancelled"));
    });
};

// 预览问卷
const preview = () => {
  ElMessageBox.confirm(t("editor.previewConfirm"), t("editor.confirmTitle"), {
    confirmButtonText: t("editor.confirmButton"),
    cancelButtonText: t("editor.cancelButton"),
    type: "info"
  })
    .then(async () => {
      await editorDoSave();
      router.push({
        path: `/preview/${props.id}`,
        state: { from: "editor" }
      });
    })
    .catch(() => {
      ElMessage.info(t("editor.previewCancelled"));
    });
};

// 填写者视角预览（T049）：无需先保存问卷，直接复用 SurveyView.vue 渲染编辑器内存中的最新配置，
// 依据同页面 SPA 路由导航不会销毁 Vue 应用实例、Pinia store 在导航前后保持同一实例这一特性，
// 通过 query 参数 preview=1 告知 SurveyView.vue 切换为预览数据源，不发起真实提交请求
const previewAsFiller = () => {
  router.push({
    path: `/survey/${props.id || "preview"}`,
    query: { preview: "1" }
  });
};

const goHome = () => {
  router.push({ name: "home" });
};

// ─── AI 功能 ─────────────────────────────────────────────────

const aiGenPanelRef = ref<InstanceType<typeof AIGenPanel> | null>(null);

// ─── 模板市场 ────────────────────────────────────────────────

const templateDialogVisible = ref(false);
const templateApplying = ref(false);
const templateForm = ref({
  category: "" as string,
  submit_message: ""
});

/** 提交申请共享模板 */
const submitApplyTemplate = async () => {
  if (!templateForm.value.category) {
    ElMessage.warning(t("editor.templateCategoryRequired"));
    return;
  }

  if (!store.remoteSurveyId) {
    ElMessage.warning(t("editor.templateSyncFirst"));
    return;
  }

  templateApplying.value = true;
  try {
    // 先保存并同步到远程，复用同步返回的序列化组件
    const components = await editorDoSave();

    // 确保已有 remoteSurveyId（save 可能刚创建）
    if (!store.remoteSurveyId) {
      ElMessage.error(t("editor.templateNeedSync"));
      return;
    }

    const res = await applyTemplate(store.remoteSurveyId, {
      category: templateForm.value.category as TemplateCategory,
      components,
      submit_message: templateForm.value.submit_message || undefined
    });

    if (res.code === 0) {
      templateDialogVisible.value = false;
      ElMessage.success(t("editor.templateApplySuccess"));
    } else {
      ElMessage.error(res.msg || t("editor.templateApplyFailed"));
    }
  } catch {
    ElMessage.error(t("editor.templateApplyFailed"));
  } finally {
    templateApplying.value = false;
  }
};
</script>

<style scoped lang="scss">
.container {
  width: 100%;
  height: 50px;
  border-bottom: 1px solid var(--border-color);
  .left {
    width: 140px;
    height: 100%;
    gap: 4px;
  }
  .center {
    flex: 1;
    height: 100%;
    border-left: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
  }
  .right {
    width: 80px;
    height: 100%;
  }
}

.ai-btn-group {
  gap: 6px;
}

.ai-generate-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

<!-- 非 scoped：覆盖 el-popover 弹层 -->
<style lang="scss">
.ai-generate-popover.el-popover.el-popper {
  padding: 12px;
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--border-color);
}
</style>
