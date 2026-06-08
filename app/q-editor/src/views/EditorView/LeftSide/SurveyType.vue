<template>
  <div class="survey-type-container">
    <SurveyComGroup v-for="(group, index) in surveyComsList" :key="index" v-bind="group" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SurveyComGroup from "@/components/Editor/SurveyComGroup.vue";
import { getSurveyComsList } from "@/configs/SurveyGroupConfig";

const surveyComsList = computed(() => getSurveyComsList());
</script>

<style scoped lang="scss">
.survey-type-container {
  height: calc(100vh - 50px - 40px);
  overflow: hidden;
}
</style>
