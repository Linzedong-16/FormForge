/**
 * 素材库 Store 单元测试
 *
 * 测试范围：
 *   1. 初始状态
 *   2. setCurrentMaterialCom 切换当前组件
 *   3. coms 中所有组件类型存在
 *   4. 各组件获取默认状态
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useMaterialStore } from "../useMaterial";

describe("useMaterialStore", () => {
  let store: ReturnType<typeof useMaterialStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useMaterialStore();
  });

  describe("初始状态", () => {
    it("默认 currentMaterialCom 应为 single-select", () => {
      expect(store.currentMaterialCom).toBe("single-select");
    });

    it("coms 应包含所有选择题组件", () => {
      expect(store.coms["single-select"]).toBeDefined();
      expect(store.coms["single-pic-select"]).toBeDefined();
      expect(store.coms["multi-select"]).toBeDefined();
      expect(store.coms["option-select"]).toBeDefined();
      expect(store.coms["multi-pic-select"]).toBeDefined();
    });

    it("coms 应包含备注组件", () => {
      expect(store.coms["text-note"]).toBeDefined();
    });

    it("coms 应包含输入框组件", () => {
      expect(store.coms["text-input"]).toBeDefined();
    });

    it("coms 应包含个人信息组件", () => {
      expect(store.coms["personal-info-gender"]).toBeDefined();
      expect(store.coms["personal-info-education"]).toBeDefined();
      expect(store.coms["personal-info-name"]).toBeDefined();
      expect(store.coms["personal-info-age"]).toBeDefined();
      expect(store.coms["personal-info-career"]).toBeDefined();
    });

    it("coms 应包含高级组件", () => {
      expect(store.coms["date-time"]).toBeDefined();
      expect(store.coms["rate-score"]).toBeDefined();
      expect(store.coms["cascader"]).toBeDefined();
      expect(store.coms["matrix-single"]).toBeDefined();
      expect(store.coms["slider"]).toBeDefined();
      expect(store.coms["transfer"]).toBeDefined();
    });

    it("coms 应包含联系信息组件", () => {
      expect(store.coms["personal-info-address"]).toBeDefined();
      expect(store.coms["personal-info-tel"]).toBeDefined();
      expect(store.coms["personal-info-wechat"]).toBeDefined();
      expect(store.coms["personal-info-qq"]).toBeDefined();
      expect(store.coms["personal-info-email"]).toBeDefined();
    });
  });

  describe("setCurrentMaterialCom", () => {
    it("应能切换到其他组件", () => {
      store.setCurrentMaterialCom("multi-select");
      expect(store.currentMaterialCom).toBe("multi-select");
    });

    it("应能切换到高级组件", () => {
      store.setCurrentMaterialCom("rate-score");
      expect(store.currentMaterialCom).toBe("rate-score");
    });

    it("应能切换到个人信息组件", () => {
      store.setCurrentMaterialCom("personal-info-gender");
      expect(store.currentMaterialCom).toBe("personal-info-gender");
    });
  });
});