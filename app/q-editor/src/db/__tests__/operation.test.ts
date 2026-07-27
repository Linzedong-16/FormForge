/**
 * IndexedDB 操作模块单元测试
 *
 * 测试范围：
 *   1. saveSurvey — 保存问卷，调用 db.surveys.add 并记录成功日志
 *   2. saveSurvey — 失败时记录错误日志
 *   3. getAllSurvey — 查询所有问卷，调用 db.surveys.toArray
 *   4. getSurveyById — 根据 ID 查询，调用 db.surveys.get
 *   5. deleteSurveyById — 根据 ID 删除，调用 db.surveys.delete
 *   6. updateSurveyById — 根据 ID 更新，调用 db.surveys.update
 *   7. getUnsyncedSurveyCount — 返回未同步问卷数量
 *   8. getUnsyncedSurveyCount — 错误时返回 0
 *   9. getUnsyncedSurveyTitles — 返回未同步问卷标题
 *  10. getUnsyncedSurveyTitles — 错误时返回空数组
 *  11. getUnsyncedSurveyTitles — 无标题时使用 "未命名问卷"
 *  12. clearAllSurveys — 清空所有问卷，返回 true
 *  13. clearAllSurveys — 错误时返回 false
 *  14. flushLogs — 返回并清空日志
 *  15. operationLogs — 累积多次操作日志
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SurveyDBReturnData } from "@/types";

// ─── Mock 模块（使用 vi.hoisted 避免 hoisting 问题） ────────────

const { mockSurveys } = vi.hoisted(() => {
  const mockSurveys = {
    add: vi.fn(),
    toArray: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    clear: vi.fn()
  };
  return { mockSurveys };
});

vi.mock("../db", () => ({
  db: {
    surveys: mockSurveys
  }
}));

// 必须在 mock 之后导入
import {
  saveSurvey,
  getAllSurvey,
  getSurveyById,
  deleteSurveyById,
  updateSurveyById,
  getUnsyncedSurveyCount,
  getUnsyncedSurveyTitles,
  clearAllSurveys,
  flushLogs,
  operationLogs
} from "../operation";
import type { SurveyDBData } from "@/types";

// ─── 辅助函数 ──────────────────────────────────────────────────

/** 创建模拟 SurveyDBData */
function createSurveyData(overrides: Partial<SurveyDBData> = {}): SurveyDBData {
  return {
    createDate: Date.now(),
    updateDate: Date.now(),
    title: "测试问卷",
    surveyCount: 3,
    coms: [],
    pageSize: 10,
    ...overrides
  };
}

/** 创建模拟 SurveyDBReturnData（从数据库返回的数据，id 必存在） */
function createSurveyReturnData(
  id: number,
  overrides: Partial<SurveyDBReturnData> = {}
): SurveyDBReturnData {
  return {
    id,
    createDate: Date.now(),
    updateDate: Date.now(),
    title: "测试问卷",
    surveyCount: 3,
    coms: [],
    pageSize: 10,
    ...overrides
  };
}

describe("IndexedDB 操作模块 — 全量单元测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置模块级日志
    operationLogs.length = 0;
    // 抑制 console 输出
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // ════════════════════════════════════════════════════════════
  //  1. saveSurvey — 保存问卷
  // ════════════════════════════════════════════════════════════
  describe("saveSurvey", () => {
    it("应调用 db.surveys.add 并记录成功日志", async () => {
      const data = createSurveyData({ title: "新问卷" });
      mockSurveys.add.mockResolvedValue(1);

      const result = await saveSurvey(data);

      expect(mockSurveys.add).toHaveBeenCalledTimes(1);
      expect(mockSurveys.add).toHaveBeenCalledWith(data);
      expect(result).toBe(1);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("saveSurvey");
      expect(operationLogs[0]!.success).toBe(true);
    });

    it("失败时应记录错误日志并抛出异常", async () => {
      const data = createSurveyData();
      const error = new Error("数据库写入失败");
      mockSurveys.add.mockRejectedValue(error);

      await expect(saveSurvey(data)).rejects.toThrow("数据库写入失败");

      expect(mockSurveys.add).toHaveBeenCalledTimes(1);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("saveSurvey");
      expect(operationLogs[0]!.success).toBe(false);
      expect(operationLogs[0]!.detail).toBe("数据库写入失败");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. getAllSurvey — 查询所有问卷
  // ════════════════════════════════════════════════════════════
  describe("getAllSurvey", () => {
    it("应调用 db.surveys.toArray 并记录成功日志", async () => {
      const mockData = [
        createSurveyReturnData(1, { title: "问卷A" }),
        createSurveyReturnData(2, { title: "问卷B" })
      ];
      mockSurveys.toArray.mockResolvedValue(mockData);

      const result = await getAllSurvey();

      expect(mockSurveys.toArray).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockData);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("getAllSurvey");
      expect(operationLogs[0]!.success).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. getSurveyById — 根据 ID 查询
  // ════════════════════════════════════════════════════════════
  describe("getSurveyById", () => {
    it("应使用正确的 id 调用 db.surveys.get", async () => {
      const mockData = createSurveyReturnData(42, { title: "目标问卷" });
      mockSurveys.get.mockResolvedValue(mockData);

      const result = await getSurveyById(42);

      expect(mockSurveys.get).toHaveBeenCalledTimes(1);
      expect(mockSurveys.get).toHaveBeenCalledWith(42);
      expect(result).toEqual(mockData);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("getSurveyById");
      expect(operationLogs[0]!.success).toBe(true);
    });

    it("问卷不存在时应返回 undefined", async () => {
      mockSurveys.get.mockResolvedValue(undefined);

      const result = await getSurveyById(999);

      expect(mockSurveys.get).toHaveBeenCalledWith(999);
      expect(result).toBeUndefined();
    });
  });

  // ════════════════════════════════════════════════════════════
  //  4. deleteSurveyById — 根据 ID 删除
  // ════════════════════════════════════════════════════════════
  describe("deleteSurveyById", () => {
    it("应使用正确的 id 调用 db.surveys.delete", async () => {
      mockSurveys.delete.mockResolvedValue(undefined);

      await deleteSurveyById(7);

      expect(mockSurveys.delete).toHaveBeenCalledTimes(1);
      expect(mockSurveys.delete).toHaveBeenCalledWith(7);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("deleteSurveyById");
      expect(operationLogs[0]!.success).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  5. updateSurveyById — 根据 ID 更新
  // ════════════════════════════════════════════════════════════
  describe("updateSurveyById", () => {
    it("应使用正确的 id 和 data 调用 db.surveys.update", async () => {
      const updateData: Partial<SurveyDBData> = { title: "更新后的标题", surveyCount: 5 };
      mockSurveys.update.mockResolvedValue(1);

      await updateSurveyById(10, updateData);

      expect(mockSurveys.update).toHaveBeenCalledTimes(1);
      expect(mockSurveys.update).toHaveBeenCalledWith(10, updateData);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("updateSurveyById");
      expect(operationLogs[0]!.success).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  6. getUnsyncedSurveyCount — 未同步问卷数量
  // ════════════════════════════════════════════════════════════
  describe("getUnsyncedSurveyCount", () => {
    it("应返回未同步问卷的数量", async () => {
      const mockData = [
        createSurveyReturnData(1, { remote_survey_id: "123", syncStatus: "synced", title: "已同步" }),
        createSurveyReturnData(2, { remote_survey_id: "", syncStatus: "unsynced", title: "未同步A" }),
        createSurveyReturnData(3, { remote_survey_id: undefined, syncStatus: "unsynced", title: "未同步B" }),
        createSurveyReturnData(4, { remote_survey_id: "456", syncStatus: "unsynced", title: "未同步C" })
      ];
      mockSurveys.toArray.mockResolvedValue(mockData);

      const count = await getUnsyncedSurveyCount();

      expect(count).toBe(3);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("getUnsyncedSurveyCount");
      expect(operationLogs[0]!.success).toBe(true);
      expect(operationLogs[0]!.detail).toContain("3");
    });

    it("全部已同步时应返回 0", async () => {
      const mockData = [
        createSurveyReturnData(1, { remote_survey_id: "123", syncStatus: "synced" }),
        createSurveyReturnData(2, { remote_survey_id: "456", syncStatus: "synced" })
      ];
      mockSurveys.toArray.mockResolvedValue(mockData);

      const count = await getUnsyncedSurveyCount();

      expect(count).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  7. getUnsyncedSurveyCount — 错误时返回 0
  // ════════════════════════════════════════════════════════════
  describe("getUnsyncedSurveyCount — 错误处理", () => {
    it("db.surveys.toArray 抛出异常时应返回 0", async () => {
      mockSurveys.toArray.mockRejectedValue(new Error("数据库读取失败"));

      const count = await getUnsyncedSurveyCount();

      expect(count).toBe(0);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("getUnsyncedSurveyCount");
      expect(operationLogs[0]!.success).toBe(false);
      expect(operationLogs[0]!.detail).toBe("数据库读取失败");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  8. getUnsyncedSurveyTitles — 未同步问卷标题
  // ════════════════════════════════════════════════════════════
  describe("getUnsyncedSurveyTitles", () => {
    it("应返回未同步问卷的标题和 id", async () => {
      const mockData = [
        createSurveyReturnData(1, { remote_survey_id: "123", syncStatus: "synced", title: "已同步问卷" }),
        createSurveyReturnData(2, { remote_survey_id: "", syncStatus: "unsynced", title: "未同步问卷A" }),
        createSurveyReturnData(3, { remote_survey_id: undefined, syncStatus: "unsynced", title: "未同步问卷B" })
      ];
      mockSurveys.toArray.mockResolvedValue(mockData);

      const titles = await getUnsyncedSurveyTitles();

      expect(titles).toHaveLength(2);
      expect(titles).toEqual([
        { title: "未同步问卷A", id: 2 },
        { title: "未同步问卷B", id: 3 }
      ]);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("getUnsyncedSurveyTitles");
      expect(operationLogs[0]!.success).toBe(true);
    });

    it("全部已同步时应返回空数组", async () => {
      const mockData = [
        createSurveyReturnData(1, { remote_survey_id: "123", syncStatus: "synced", title: "问卷1" }),
        createSurveyReturnData(2, { remote_survey_id: "456", syncStatus: "synced", title: "问卷2" })
      ];
      mockSurveys.toArray.mockResolvedValue(mockData);

      const titles = await getUnsyncedSurveyTitles();

      expect(titles).toEqual([]);
      expect(operationLogs[0]!.detail).toContain("无");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  9. getUnsyncedSurveyTitles — 错误时返回空数组
  // ════════════════════════════════════════════════════════════
  describe("getUnsyncedSurveyTitles — 错误处理", () => {
    it("db.surveys.toArray 抛出异常时应返回空数组", async () => {
      mockSurveys.toArray.mockRejectedValue(new Error("数据库读取失败"));

      const titles = await getUnsyncedSurveyTitles();

      expect(titles).toEqual([]);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("getUnsyncedSurveyTitles");
      expect(operationLogs[0]!.success).toBe(false);
      expect(operationLogs[0]!.detail).toBe("数据库读取失败");
    });
  });

  // ════════════════════════════════════════════════════════════
  // 10. getUnsyncedSurveyTitles — 无标题时使用默认值
  // ════════════════════════════════════════════════════════════
  describe("getUnsyncedSurveyTitles — 默认标题", () => {
    it("问卷无 title 时应使用 '未命名问卷'", async () => {
      const mockData = [
        createSurveyReturnData(1, { remote_survey_id: "", title: "" }),
        createSurveyReturnData(2, { remote_survey_id: "", title: undefined as unknown as string })
      ];
      mockSurveys.toArray.mockResolvedValue(mockData);

      const titles = await getUnsyncedSurveyTitles();

      expect(titles).toEqual([
        { title: "未命名问卷", id: 1 },
        { title: "未命名问卷", id: 2 }
      ]);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 11. clearAllSurveys — 清空所有问卷
  // ════════════════════════════════════════════════════════════
  describe("clearAllSurveys", () => {
    it("应调用 db.surveys.count 和 db.surveys.clear 并返回 true", async () => {
      mockSurveys.count.mockResolvedValue(5);
      mockSurveys.clear.mockResolvedValue(undefined);

      const result = await clearAllSurveys();

      expect(mockSurveys.count).toHaveBeenCalledTimes(1);
      expect(mockSurveys.clear).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("clearAllSurveys");
      expect(operationLogs[0]!.success).toBe(true);
      expect(operationLogs[0]!.detail).toContain("5");
    });
  });

  // ════════════════════════════════════════════════════════════
  // 12. clearAllSurveys — 错误时返回 false
  // ════════════════════════════════════════════════════════════
  describe("clearAllSurveys — 错误处理", () => {
    it("db.surveys.clear 抛出异常时应返回 false", async () => {
      mockSurveys.count.mockResolvedValue(3);
      mockSurveys.clear.mockRejectedValue(new Error("清空失败"));

      const result = await clearAllSurveys();

      expect(result).toBe(false);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("clearAllSurveys");
      expect(operationLogs[0]!.success).toBe(false);
      expect(operationLogs[0]!.detail).toBe("清空失败");
    });

    it("db.surveys.count 抛出异常时也应返回 false", async () => {
      mockSurveys.count.mockRejectedValue(new Error("计数失败"));

      const result = await clearAllSurveys();

      expect(result).toBe(false);
      expect(operationLogs).toHaveLength(1);
      expect(operationLogs[0]!.action).toBe("clearAllSurveys");
      expect(operationLogs[0]!.success).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 13. flushLogs — 返回并清空日志
  // ════════════════════════════════════════════════════════════
  describe("flushLogs", () => {
    it("应返回当前所有日志并清空 operationLogs", () => {
      // 手动添加日志条目
      operationLogs.push(
        { timestamp: "2024-01-01T00:00:00.000Z", action: "saveSurvey", success: true },
        { timestamp: "2024-01-01T00:00:01.000Z", action: "getAllSurvey", success: true }
      );

      const flushed = flushLogs();

      expect(flushed).toHaveLength(2);
      expect(flushed[0]!.action).toBe("saveSurvey");
      expect(flushed[1]!.action).toBe("getAllSurvey");
      // 清空后应为空数组
      expect(operationLogs).toHaveLength(0);
    });

    it("空日志时应返回空数组", () => {
      expect(operationLogs).toHaveLength(0);

      const flushed = flushLogs();

      expect(flushed).toEqual([]);
      expect(operationLogs).toHaveLength(0);
    });
  });

  // ════════════════════════════════════════════════════════════
  // 14. operationLogs — 累积多次操作日志
  // ════════════════════════════════════════════════════════════
  describe("operationLogs — 累积日志", () => {
    it("多次操作应累积日志条目", async () => {
      mockSurveys.add.mockResolvedValue(1);
      mockSurveys.toArray.mockResolvedValue([]);
      mockSurveys.get.mockResolvedValue(createSurveyReturnData(1));
      mockSurveys.delete.mockResolvedValue(undefined);

      await saveSurvey(createSurveyData());
      await getAllSurvey();
      await getSurveyById(1);
      await deleteSurveyById(1);

      expect(operationLogs).toHaveLength(4);
      expect(operationLogs[0]!.action).toBe("saveSurvey");
      expect(operationLogs[1]!.action).toBe("getAllSurvey");
      expect(operationLogs[2]!.action).toBe("getSurveyById");
      expect(operationLogs[3]!.action).toBe("deleteSurveyById");
      // 所有操作都应成功
      expect(operationLogs.every(log => log.success)).toBe(true);
    });

    it("包含失败操作的日志也应正确累积", async () => {
      mockSurveys.add.mockResolvedValue(1);
      mockSurveys.toArray.mockRejectedValue(new Error("读取失败"));

      await saveSurvey(createSurveyData());
      await expect(getAllSurvey()).rejects.toThrow("读取失败");

      expect(operationLogs).toHaveLength(2);
      expect(operationLogs[0]!.success).toBe(true);
      expect(operationLogs[1]!.success).toBe(false);
    });
  });
});