<script setup lang="ts">
import { Plus, Compass } from '@element-plus/icons-vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const tableData = ref([])

const router = useRouter()
</script>

<template>
  <div class="container">
    <div class="pt-20 pb-20 pl-20 pr-20">
      <h1 class="font-weight-100 text-center">问卷系统</h1>
      <!-- 按钮组 -->
      <div class="mb-15">
        <el-button type="primary" :icon="Plus" @click="router.push({ name: 'editor' })"
          >创建问卷</el-button
        >
        <el-button type="success" :icon="Compass" @click="router.push({ name: 'materials' })"
          >组件市场</el-button
        >
      </div>

      <el-table :data="tableData" style="width: 100%" border>
        <el-table-column fixed prop="createDate" label="创建日期" width="150" />
        <el-table-column prop="title" label="问卷标题" />
        <el-table-column prop="surveyCount" label="题目数" width="150" align="center" />
        <el-table-column prop="updateDate" label="最近更新日期" width="150" align="center" />
        <el-table-column fixed="right" label="操作" width="300" align="center">
          <template #default>
            <el-button link type="primary" size="small">查看问卷</el-button>
            <el-button link type="primary" size="small">编辑</el-button>
            <el-button link type="primary" size="small">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.container {
  padding: 20px;
}
</style>
