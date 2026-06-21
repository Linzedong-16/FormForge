import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

const pinia = createPinia();

// 注册 Pinia 持久化插件（user.store 中使用 persist 配置持久化 user + profile）
pinia.use(piniaPluginPersistedstate);

/** 初始化用户 store 的 Token 恢复（页面刷新后从 Storage 恢复登录态） */
export async function initUserStore() {
  // 延迟导入 user store，避免循环依赖（user store 引用 @/utils/axios 和 @/api）
  const { useUserStore } = await import("./modules/user");
  const store = useUserStore();
  await store.restoreState();
  // 恢复 Token 后尝试拉取用户资料
  if (store.isLoggedIn) {
    store.fetchProfile().catch(() => {});
  }
}

export { useUserStore } from "./modules/user";

export default pinia;
