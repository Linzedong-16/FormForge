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
import { onMounted } from "vue";
import Header from "@/components/Common/Header.vue";
import LeftSide from "@/views/EditorView/LeftSide/Index.vue";
import Center from "@/views/EditorView/Center.vue";
import RightSide from "@/views/EditorView/RightSide.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { getSurveyById } from "@/db/operation";
import { restoreComponentStatus } from "@/utils";
const route = useRoute();
// 仓库
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();

const id = computed(() => (route.params.id ? String(route.params.id) : ""));

onMounted(() => {
  if (id.value) {
    // 根据 id 获取存储的问卷题目
    getSurveyById(Number(id.value)).then(res => {
      if (res) {
        restoreComponentStatus(res.coms);
        store.setStore(res);
      }
    });
  } else {
    // 新建问卷，初始化组件列表
    store.initComs();
  }
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
