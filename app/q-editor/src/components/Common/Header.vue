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
            <el-button size="small" plain disabled>{{ t("editor.aiPolish") }}</el-button>
            <el-popover
              placement="bottom"
              trigger="click"
              :width="320"
              :show-arrow="false"
              :offset="8"
              popper-class="ai-generate-popover"
            >
              <template #reference>
                <el-button size="small" type="primary" plain>{{ t("editor.aiGenerate") }}</el-button>
              </template>
              <div class="ai-generate-panel">
                <el-input v-model="aiInput" type="textarea" :rows="3" :placeholder="t('editor.aiInputPlaceholder')" />
                <div class="ai-actions">
                  <el-button size="small" @click="onAiClear">{{ t("editor.aiClear") }}</el-button>
                  <el-button size="small" type="primary" @click="onAiSubmit">{{ t("editor.aiSubmit") }}</el-button>
                </div>
              </div>
            </el-popover>
          </div>
          <!-- 模板市场 -->
          <el-button size="small" type="warning" plain class="ml-10" @click="onApplyShareTemplate">
            {{ t("editor.applyShareTemplate") }}
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

    <!-- 申请共享模板对话框 -->
    <el-dialog v-model="templateDialogVisible" :title="t('editor.templateDialogTitle')" width="500px">
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

const goHome = () => {
  router.push({ name: "home" });
};

// ─── AI 功能 ─────────────────────────────────────────────────

const aiInput = ref("");

const onAiClear = () => {
  aiInput.value = "";
};

const onAiSubmit = () => {
  // TODO: 对接 AI 生成接口
  const trimmed = aiInput.value.trim();
  if (!trimmed) {
    ElMessage.warning(t("editor.aiInputPlaceholder"));
    return;
  }
  ElMessage.success(t("common.success"));
};

// ─── 模板市场 ────────────────────────────────────────────────

const templateDialogVisible = ref(false);
const templateApplying = ref(false);
const templateForm = ref({
  category: "" as string,
  submit_message: ""
});

const resetTemplateForm = () => {
  templateForm.value = { category: "", submit_message: "" };
};

const onApplyShareTemplate = () => {
  resetTemplateForm();
  templateDialogVisible.value = true;
};

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
