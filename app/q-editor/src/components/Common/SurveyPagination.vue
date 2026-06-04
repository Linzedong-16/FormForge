<template>
  <!-- 问卷分页器：编辑页 Header、预览页、在线问卷三处复用 -->
  <el-pagination
    v-model:current-page="currentPage"
    v-model:page-size="pageSize"
    :total="total"
    :page-sizes="[10, 20, 50]"
    :pager-count="5"
    size="small"
    background
    layout="sizes, prev, pager, next"
    class="survey-pagination"
  />
</template>

<script setup lang="ts">
// 当前页码与每页组件数量通过 v-model 双向绑定，由调用方提供数据源（pinia 或本地 ref）
const currentPage = defineModel<number>("currentPage", { required: true });
const pageSize = defineModel<number>("pageSize", { required: true });
// 组件（题目）总数，用于计算总页数
defineProps<{
  total: number;
}>();
</script>

<style scoped lang="scss">
.survey-pagination {
  // 紧凑排布，适配 Header 等空间有限的场景
  flex-wrap: nowrap;
  white-space: nowrap;
}
</style>
