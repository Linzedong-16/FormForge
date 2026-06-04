<template>
  <div>
    <div class="container flex self-start align-items-center border-box">
      <!-- 分为三个部分 -->
      <div class="left flex justify-content-center align-items-center">
        <el-button :icon="ArrowLeft" circle size="small" @click="goHome" />
      </div>
      <div class="center flex align-items-center space-between pl-15 pr-15">
        <div v-if="isEditor" class="flex align-items-center">
          <!-- 说明是编辑器，需要显示额外的按钮 -->
          <div v-if="id">
            <el-button type="warning" size="small" @click="updateSurvey">更新问卷</el-button>
          </div>
          <div v-else>
            <el-button type="danger" size="small" @click="reset">重置问卷</el-button>
            <el-button type="success" size="small" @click="saveSurvey">保存问卷</el-button>
          </div>
          <!-- 分页器：紧邻保存/更新按钮右侧，绑定仓库的分页配置 -->
          <SurveyPagination
            v-model:current-page="store.currentPage"
            v-model:page-size="store.pageSize"
            :total="store.coms.length"
            class="ml-15"
          />
        </div>
        <div v-if="id">
          <el-button type="primary" size="small" @click="preview">预览</el-button>
        </div>
      </div>
      <div class="right flex justify-content-center align-items-center">
        <el-avatar :size="30" :src="avatar" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft } from "@element-plus/icons-vue";
import { useRouter } from "vue-router";
const router = useRouter();
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useEditorStore } from "@/stores/useEditor";
import type { SurveyDBData } from "@/types";
import SurveyPagination from "@/components/Common/SurveyPagination.vue";
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

// 重置问卷
const reset = () => {
  ElMessageBox.confirm("确定要重置问卷吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  })
    .then(() => {
      store.resetComs();
      ElMessage.success("重置成功");
    })
    .catch(() => {
      ElMessage.info("已取消重置");
    });
};

interface PromptItem {
  value: string;
}
// 保存问卷
const saveSurvey = () => {
  ElMessageBox.prompt("请输入问卷的标题", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "info"
  })
    .then(item => {
      const safeItem = item as unknown as PromptItem;
      const surveyToSave = {
        createDate: new Date().getTime(),
        title: safeItem?.value as string,
        updateDate: new Date().getTime(),
        surveyCount: store.surveyCount,
        coms: JSON.parse(JSON.stringify(store.coms)),
        pageSize: store.pageSize
      };
      store
        .saveComs(surveyToSave)
        .then(() => {
          console.log(store.coms);
          ElMessage.success("问卷已保存");
        })
        .catch(() => {
          ElMessage.error("问卷保存失败");
        });
    })
    .catch(() => {
      ElMessage.info("已取消保存");
    });
};

// 更新问卷
const updateSurvey = () => {
  store
    .updateComs(Number(props.id), {
      updateDate: new Date().getTime(),
      surveyCount: store.surveyCount,
      coms: JSON.parse(JSON.stringify(store.coms)),
      pageSize: store.pageSize
    } as SurveyDBData)
    .then(() => {
      ElMessage.success("问卷已更新");
    })
    .catch(() => {
      ElMessage.error("问卷更新失败");
    });
};

// 预览问卷
const preview = () => {
  ElMessageBox.confirm("预览会自动保存问卷，是否跳转预览？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "info"
  })
    .then(() => {
      updateSurvey();
      router.push({
        path: `/preview/${props.id}`,
        state: { from: "editor" }
      });
    })
    .catch(() => {
      ElMessage.info("已取消跳转");
    });
};

const goHome = () => {
  router.push("/");
};

const avatar = ref("http://47.94.168.252/upload/1759642363899.gif");
</script>

<style scoped lang="scss">
.container {
  width: 100%;
  height: 50px;
  border-bottom: 1px solid var(--border-color);
  .left {
    width: 60px;
    height: 100%;
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
</style>
