<template>
  <div>
    <MaterialsHeader />
    <div class="radio-group">
      <el-radio-group>
        <el-radio :value="1">选项1</el-radio>
        <el-radio :value="2">选项2</el-radio>
        <el-radio :value="3">选项3</el-radio>
        <el-radio :value="4">选项4</el-radio>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import MaterialsHeader from '@/components/SurveyComs/Common/MaterialsHeader.vue'
</script>

<style scoped></style>
