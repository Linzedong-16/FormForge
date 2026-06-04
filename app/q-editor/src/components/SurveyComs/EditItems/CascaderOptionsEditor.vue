<template>
  <div key="id">
    <!-- 模式开关：关闭为地址模式（省/市/区），开启为自定义级联模式 -->
    <div class="flex align-items-center mb-10">
      <div class="mr-10">自定义级联</div>
      <el-switch :model-value="isUse" @change="onToggle" />
    </div>
    <div v-if="isUse">
      <div class="flex align-items-center space-between mb-10">
        <span class="tip">最多 4 级</span>
        <el-button size="small" :icon="Plus" circle @click="onAddTop" />
      </div>
      <!-- 顶层节点，递归渲染整棵级联树 -->
      <CascaderOptionNode
        v-for="(node, i) in cascaderTree"
        :key="node.value"
        :node="node"
        :path="[i]"
        :depth="1"
        :config-key="configKey"
      />
    </div>
    <div v-else class="tip">当前为地址模式（省 / 市 / 区）</div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { Plus } from "@element-plus/icons-vue";
import CascaderOptionNode from "./CascaderOptionNode.vue";
import type { VueComType, UpdateStatus, OptionsStatusArr, CascaderStatusArr } from "@/types";

const props = defineProps<{
  id: string;
  isShow: boolean;
  isUse: boolean;
  currentStatus: number;
  status: OptionsStatusArr;
  configKey: string;
  editCom: VueComType;
  name: string;
}>();

const updateStatus = inject<UpdateStatus>("updateStatus");

// 自定义模式下的级联树
const cascaderTree = computed(() => props.status as CascaderStatusArr);

// 切换地址/自定义模式（boolean payload 在 updateStatus 中走 setIsUse）
const onToggle = (val: boolean) => {
  updateStatus?.(props.configKey, val);
};
// 添加一级选项（path 为空数组表示顶层）
const onAddTop = () => {
  updateStatus?.(props.configKey, { action: "add", path: [] });
};
</script>

<style scoped lang="scss">
.tip {
  color: var(--font-color-lighter);
  font-size: var(--font-size-sm);
}
</style>
