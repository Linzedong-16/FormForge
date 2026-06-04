<template>
  <div class="cascader-node">
    <div class="flex align-items-center mb-5">
      <!-- 节点名称：编辑即通过 updateStatus 以路径定位更新 -->
      <el-input :model-value="node.label" size="small" placeholder="选项名称" @input="onEdit" />
      <!-- 删除当前节点 -->
      <el-button type="danger" size="small" :icon="Minus" circle class="ml-5" @click="onRemove" />
      <!-- 添加子级：仅在深度小于 4 时可用（最多 4 级） -->
      <el-button v-if="depth < 4" size="small" :icon="Plus" circle class="ml-5" @click="onAddChild" />
    </div>
    <!-- 子节点递归渲染，缩进展示层级 -->
    <div v-if="node.children && node.children.length" class="children">
      <CascaderOptionNode
        v-for="(child, i) in node.children"
        :key="child.value"
        :node="child"
        :path="[...path, i]"
        :depth="depth + 1"
        :config-key="configKey"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { Plus, Minus } from "@element-plus/icons-vue";
import type { CascaderOptionItem, UpdateStatus } from "@/types";

// 自引用递归组件，需声明 name
defineOptions({ name: "CascaderOptionNode" });

const props = defineProps<{
  node: CascaderOptionItem;
  path: number[]; // 当前节点在级联树中的索引路径
  depth: number; // 当前深度（顶层为 1）
  configKey: string;
}>();

const updateStatus = inject<UpdateStatus>("updateStatus");

// 编辑节点名称
const onEdit = (label: string) => {
  updateStatus?.(props.configKey, { action: "edit", path: props.path, label });
};
// 删除当前节点
const onRemove = () => {
  updateStatus?.(props.configKey, { action: "remove", path: props.path });
};
// 在当前节点下添加子级
const onAddChild = () => {
  updateStatus?.(props.configKey, { action: "add", path: props.path });
};
</script>

<style scoped lang="scss">
.children {
  padding-left: 14px;
  margin-left: 6px;
  border-left: 1px dashed var(--border-color);
}
</style>
