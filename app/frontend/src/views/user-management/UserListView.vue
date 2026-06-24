<template>
  <div class="user-list-page">
    <!-- 页面标题 + 操作 -->
    <div class="page-toolbar">
      <div>
        <h3 class="page-title">用户列表</h3>
        <span class="page-subtitle">管理系统所有注册用户，支持添加、封禁、删除等操作</span>
      </div>
      <a-space>
        <a-input-search
          v-model="searchKeyword"
          placeholder="搜索用户名/邮箱"
          style="width: 240px"
          allow-clear
          @search="handleSearch"
          @clear="handleSearch"
        />
        <a-button type="primary" @click="handleAdd">
          <template #icon><icon-plus /></template>
          添加用户
        </a-button>
      </a-space>
    </div>

    <!-- 用户表格 -->
    <a-table
      :data="userList"
      :loading="loading"
      :pagination="pagination"
      :stripe="true"
      :bordered="{ wrapper: true, cell: true }"
      column-resizable
      row-key="id"
      @page-change="handlePageChange"
    >
      <template #columns>
        <a-table-column title="ID" data-index="id" :width="70" align="center" />
        <a-table-column title="用户名" data-index="username" :width="120" />
        <a-table-column title="邮箱" data-index="email" :width="200" :ellipsis="true" />
        <a-table-column title="角色" :width="120" align="center">
          <template #cell="{ record }">
            <a-tag :color="roleColor(record.role)" size="small">{{ roleLabel(record.role) }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="状态" :width="110" align="center">
          <template #cell="{ record }">
            <a-tag v-if="record.isBanned" color="red" size="small">
              封禁中
              <a-tooltip v-if="record.banRemaining" :content="formatBanRemaining(record.banRemaining)">
                <span style="margin-left: 4px; cursor: help">ⓘ</span>
              </a-tooltip>
            </a-tag>
            <a-tag v-else-if="record.status === 0" color="orange" size="small">已禁用</a-tag>
            <a-tag v-else color="green" size="small">正常</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="注册时间" data-index="created_at" :width="170" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.created_at) }}
          </template>
        </a-table-column>
        <a-table-column title="最后登录" data-index="last_login_at" :width="170" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.last_login_at) }}
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="240" align="center" fixed="right">
          <template #cell="{ record }">
            <a-space :size="0">
              <a-button type="text" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button v-if="canBan(record)" type="text" size="small" status="warning" @click="handleBan(record)">
                封禁
              </a-button>
              <a-button v-if="canUnban(record)" type="text" size="small" status="success" @click="handleUnban(record)">
                解封
              </a-button>
              <a-button v-if="canDelete(record)" type="text" size="small" status="danger" @click="handleDelete(record)"
                >删除</a-button
              >
            </a-space>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <!-- 创建/编辑用户弹窗 -->
    <a-modal
      v-model:visible="formVisible"
      :title="isEditing ? '编辑用户' : '添加用户'"
      width="500px"
      :ok-loading="formSubmitting"
      @ok="handleFormSubmit"
      @cancel="resetForm"
    >
      <a-form :model="form" layout="vertical">
        <a-form-item label="用户名" required>
          <a-input v-model="form.username" placeholder="请输入用户名" :max-length="50" />
        </a-form-item>
        <a-form-item label="邮箱" required>
          <a-input v-model="form.email" placeholder="请输入邮箱" :max-length="100" />
        </a-form-item>
        <a-form-item v-if="!isEditing" label="角色" required>
          <a-select v-model="form.role" placeholder="请选择角色" @change="onRoleChange">
            <a-option value="super_admin">超级管理员</a-option>
            <a-option value="user">普通用户</a-option>
          </a-select>
        </a-form-item>
      </a-form>

      <!-- 创建成功提示（显示默认密码） -->
      <a-alert v-if="createResult" type="success" show-icon style="margin-top: 8px">
        <template #title>用户创建成功</template>
        <div>
          默认密码：
          <a-typography-text code copyable>{{ createResult.defaultPassword }}</a-typography-text>
        </div>
        <div style="margin-top: 4px">首次登录需修改密码</div>
      </a-alert>
    </a-modal>

    <!-- 封禁用户弹窗 -->
    <a-modal
      v-model:visible="banVisible"
      title="封禁用户"
      width="480px"
      :ok-loading="banSubmitting"
      @ok="handleBanSubmit"
      @cancel="resetBanForm"
    >
      <a-form :model="banForm" layout="vertical">
        <a-form-item label="目标用户">
          <a-tag color="arcoblue" size="medium">{{ banTarget?.username }}</a-tag>
          <span style="margin-left: 8px; color: var(--color-text-3); font-size: 13px">{{ banTarget?.email }}</span>
        </a-form-item>
        <a-form-item label="封禁时长" required>
          <a-select v-model="banForm.duration" placeholder="请选择封禁时长" style="width: 100%">
            <a-option :value="60">1 小时</a-option>
            <a-option :value="1440">1 天</a-option>
            <a-option :value="10080">7 天</a-option>
            <a-option :value="43200">30 天</a-option>
            <a-option :value="0">自定义</a-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="banForm.duration === 0" label="自定义时长（分钟）" required>
          <a-input-number
            v-model="banForm.customDuration"
            :min="1"
            :max="43200"
            placeholder="1 ~ 43200 分钟"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="封禁原因（选填）">
          <a-textarea
            v-model="banForm.reason"
            placeholder="请输入封禁原因，最多 500 字符"
            :max-length="500"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            show-word-limit
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { Message, Modal } from "@arco-design/web-vue";
import { IconPlus } from "@arco-design/web-vue/es/icon";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  banUser,
  unbanUser,
  type UserAdminItem,
  type UserListQuery,
  type CreateUserResult
} from "@/api/modules/admin";
import { useUserStore } from "@/store/modules/user";

// ─── 状态 ──────────────────────────────────────────────────────
const userStore = useUserStore();
const currentUserId = computed(() => userStore.user?.id);
const loading = ref(false);
const searchKeyword = ref("");
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);
const userList = ref<UserAdminItem[]>([]);

/** 该行是否可以操作封禁（不可封禁自己或超管） */
function canBan(record: UserAdminItem): boolean {
  return record.id !== currentUserId.value && record.role !== "super_admin" && !record.isBanned;
}

/** 该行是否可以解封 */
function canUnban(record: UserAdminItem): boolean {
  return record.id !== currentUserId.value && record.role !== "super_admin" && record.isBanned;
}

/** 该行是否可以删除（不可删除自己或超管） */
function canDelete(record: UserAdminItem): boolean {
  return record.id !== currentUserId.value && record.role !== "super_admin";
}

// 创建/编辑
const formVisible = ref(false);
const formSubmitting = ref(false);
const isEditing = ref(false);
const editingUserId = ref<string | null>(null);
const createResult = ref<CreateUserResult | null>(null);
const form = reactive({ username: "", email: "", role: "user" });

// 封禁
const banVisible = ref(false);
const banSubmitting = ref(false);
const banTarget = ref<UserAdminItem | null>(null);
const banForm = reactive({ duration: 1440, customDuration: 1440, reason: "" });

// ─── 角色映射 ──────────────────────────────────────────────────
function roleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin: "超级管理员",
    user: "普通用户"
  };
  return map[role] ?? role;
}
function roleColor(role: string): string {
  const map: Record<string, string> = {
    super_admin: "red",
    user: "gray"
  };
  return map[role] ?? "gray";
}

// ─── 日期格式化 ────────────────────────────────────────────────
function formatDate(val: string | null): string {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 格式化封禁剩余秒数为可读字符串 */
function formatBanRemaining(seconds: number): string {
  if (seconds <= 0) return "即将解除";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分钟`);
  return parts.join("") || "不到1分钟";
}

// ─── 分页 ──────────────────────────────────────────────────────
const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  showTotal: true,
  showPageSize: true,
  pageSizeOptions: [10, 20, 50]
}));

function handlePageChange(page: number) {
  currentPage.value = page;
  fetchUsers();
}

function handleSearch() {
  currentPage.value = 1;
  fetchUsers();
}

// ─── 数据获取 ──────────────────────────────────────────────────
async function fetchUsers() {
  loading.value = true;
  try {
    const query: UserListQuery = { page: currentPage.value, limit: pageSize.value };
    if (searchKeyword.value.trim()) {
      query.email = searchKeyword.value.trim();
    }
    const res = await listUsers(query);
    if (res.data) {
      userList.value = res.data.items;
      total.value = res.data.total;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "获取用户列表失败";
    Message.error(msg);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchUsers();
});

// ─── 创建/编辑 ─────────────────────────────────────────────────
function onRoleChange(value: string) {
  form.role = value;
}

function resetForm() {
  form.username = "";
  form.email = "";
  form.role = "user";
  isEditing.value = false;
  editingUserId.value = null;
  createResult.value = null;
}

function handleAdd() {
  resetForm();
  formVisible.value = true;
}

function handleEdit(record: UserAdminItem) {
  // 管理员编辑：只允许修改用户名
  isEditing.value = true;
  editingUserId.value = record.id;
  form.username = record.username;
  form.email = record.email;
  form.role = record.role;
  createResult.value = null;
  formVisible.value = true;
}

async function handleFormSubmit() {
  if (!form.username.trim() || !form.email.trim()) {
    Message.warning("请填写用户名和邮箱");
    return;
  }

  formSubmitting.value = true;
  try {
    if (isEditing.value && editingUserId.value) {
      // 编辑模式：仅更新用户名
      await updateUser(editingUserId.value, { username: form.username.trim() });
      Message.success("用户信息已更新");
      formVisible.value = false;
      fetchUsers();
    } else {
      // 创建模式
      const res = await createUser({ email: form.email.trim(), username: form.username.trim() });
      if (res.data) {
        createResult.value = res.data;
        Message.success("用户创建成功");
        fetchUsers();
        // 不自动关闭弹窗，让管理员复制默认密码
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "操作失败";
    Message.error(msg);
  } finally {
    formSubmitting.value = false;
  }
}

// ─── 封禁/解封 ─────────────────────────────────────────────────
function resetBanForm() {
  banForm.duration = 1440;
  banForm.customDuration = 1440;
  banForm.reason = "";
  banTarget.value = null;
}

function handleBan(record: UserAdminItem) {
  resetBanForm();
  banTarget.value = record;
  banVisible.value = true;
}

async function handleBanSubmit() {
  if (!banTarget.value) return;

  const duration = banForm.duration === 0 ? banForm.customDuration : banForm.duration;
  if (duration < 1 || duration > 43200) {
    Message.warning("封禁时长需在 1 ~ 43200 分钟之间");
    return;
  }

  banSubmitting.value = true;
  try {
    const res = await banUser(banTarget.value.id, {
      ban_duration: duration,
      ...(banForm.reason.trim() ? { reason: banForm.reason.trim() } : {})
    });
    if (res.data) {
      Message.success(
        `用户「${res.data.username}」已被封禁${res.data.banRemaining > 0 ? `，剩余 ${formatBanRemaining(res.data.banRemaining)}` : ""}`
      );
      banVisible.value = false;
      fetchUsers();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "封禁失败";
    Message.error(msg);
  } finally {
    banSubmitting.value = false;
  }
}

async function handleUnban(record: UserAdminItem) {
  try {
    const res = await unbanUser(record.id);
    if (res.data) {
      Message.success(`用户「${res.data.username}」已解封`);
      fetchUsers();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "解封失败";
    Message.error(msg);
  }
}

// ─── 删除 ──────────────────────────────────────────────────────
function handleDelete(record: UserAdminItem) {
  Modal.confirm({
    title: "确认删除",
    content: `确定删除用户「${record.username} (${record.email})」？此操作不可撤销，该用户数据将被软删除。`,
    okText: "确认删除",
    cancelText: "取消",
    maskClosable: false,
    onOk: async () => {
      try {
        const res = await deleteUser(record.id);
        if (res.data) {
          Message.success(`用户「${record.username}」已删除`);
          fetchUsers();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "删除失败";
        Message.error(msg);
      }
    }
  });
}
</script>

<style scoped>
.user-list-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.page-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-1);
}

.page-subtitle {
  font-size: 13px;
  color: var(--color-text-3);
}
</style>
