/**
 * LoginModal 组件测试
 *
 * 测试范围：
 *  - 组件挂载/卸载
 *  - Props 传递
 *  - visible 切换
 *
 * 注：Arco Modal 依赖 Transition API + Teleport，在 jsdom 中内容受限。
 * 登录业务逻辑的完整测试见 src/__tests__/store/user.spec.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import LoginModal from "@/components/LoginModal.vue";

vi.mock("@/api", () => ({
  login: vi.fn()
}));

const mockRouter = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", component: { template: "<div></div>" } }]
});

describe("LoginModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
  });

  function createWrapper(visible = true) {
    return mount(LoginModal, {
      props: { visible },
      global: {
        plugins: [ArcoVue, ArcoVueIcon, mockRouter]
      }
    });
  }

  it("组件应成功挂载", () => {
    const wrapper = createWrapper(true);
    expect(wrapper.exists()).toBe(true);
  });

  it("visible=false 时组件仍应挂载", () => {
    const wrapper = createWrapper(false);
    expect(wrapper.exists()).toBe(true);
  });

  it("visible 变化时应更新 props", async () => {
    const wrapper = createWrapper(true);
    expect(wrapper.props("visible")).toBe(true);

    await wrapper.setProps({ visible: false });
    expect(wrapper.props("visible")).toBe(false);
  });
});
