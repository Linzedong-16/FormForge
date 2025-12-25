<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getUsers, getSystemInfo, getRandomData } from "@/apis/testApi";
import type { User, SystemInfo, RandomData } from "@/apis/testApi";
import { Button as ArcoButton, Message as ArcoMessage } from "@arco-design/web-vue";

// 数据状态
const users = ref<User[]>([]);
const systemInfo = ref<SystemInfo | null>(null);
const randomData = ref<RandomData | null>(null);
const loading = ref<boolean>(false);

// 获取用户列表
const fetchUsers = async () => {
  try {
    loading.value = true;
    const response = await getUsers();
    console.log("获取用户列表响应:", response);
    users.value = response;
    ArcoMessage.success("获取用户列表成功");
  } catch (error: any) {
    ArcoMessage.error(`获取用户列表失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

// 获取系统信息
const fetchSystemInfo = async () => {
  try {
    loading.value = true;
    const response = await getSystemInfo();
    systemInfo.value = response;
    ArcoMessage.success("获取系统信息成功");
  } catch (error: any) {
    ArcoMessage.error(`获取系统信息失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

// 获取随机数据
const fetchRandomData = async () => {
  try {
    loading.value = true;
    const response = await getRandomData();
    randomData.value = response;
    ArcoMessage.success("获取随机数据成功");
  } catch (error: any) {
    ArcoMessage.error(`获取随机数据失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

// 页面加载时自动获取数据
onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <div class="home-container">
    <h1>前后端交互测试</h1>

    <div class="button-group">
      <arco-button type="primary" :loading="loading" @click="fetchUsers"> 获取用户列表 </arco-button>
      <arco-button type="primary" :loading="loading" @click="fetchSystemInfo"> 获取系统信息 </arco-button>
      <arco-button type="primary" :loading="loading" @click="fetchRandomData"> 获取随机数据 </arco-button>
    </div>

    <!-- 用户列表 -->
    <div class="result-section">
      <h2>用户列表</h2>
      <div v-if="users.length > 0" class="user-list">
        <div v-for="user in users" :key="user.id" class="user-item">
          <p>ID: {{ user.id }}</p>
          <p>姓名: {{ user.name }}</p>
          <p>邮箱: {{ user.email }}</p>
        </div>
      </div>
      <p v-else>暂无用户数据</p>
    </div>

    <!-- 系统信息 -->
    <div class="result-section">
      <h2>系统信息</h2>
      <div v-if="systemInfo" class="system-info">
        <p>系统名称: {{ systemInfo.name }}</p>
        <p>版本: {{ systemInfo.version }}</p>
        <p>描述: {{ systemInfo.description }}</p>
        <p>运行时间: {{ systemInfo.uptime }}秒</p>
      </div>
      <p v-else>暂无系统信息</p>
    </div>

    <!-- 随机数据 -->
    <div class="result-section">
      <h2>随机数据</h2>
      <div v-if="randomData" class="random-data">
        <p>随机数: {{ randomData.number }}</p>
        <p>随机字符串: {{ randomData.string }}</p>
        <p>时间戳: {{ randomData.timestamp }}</p>
      </div>
      <p v-else>暂无随机数据</p>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.button-group {
  margin: 20px 0;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.result-section {
  margin: 30px 0;
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.user-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

.user-item {
  padding: 15px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.system-info,
.random-data {
  padding: 15px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>
