/**
 * sanitizeMessageContent 内容安全处理 — 专项单元测试
 *
 * 覆盖 research.md §5 约定的三类处理：HTML/脚本标签剔除、手机号/邮箱/身份证号脱敏
 */
import { describe, it, expect } from "vitest";
import { sanitizeMessageContent } from "../../modules/message/message-content-sanitizer.js";

describe("sanitizeMessageContent", () => {
  it("剔除 HTML/脚本标签", () => {
    expect(sanitizeMessageContent("<script>alert(1)</script>你好<b>世界</b>")).toBe("alert(1)你好世界");
  });

  it("中国大陆手机号脱敏为 ***", () => {
    expect(sanitizeMessageContent("我的手机号是13800138000，请联系我")).toBe("我的手机号是***，请联系我");
  });

  it("邮箱地址脱敏为 ***", () => {
    expect(sanitizeMessageContent("请发送到 test.user@example.com 谢谢")).toBe("请发送到 *** 谢谢");
  });

  it("18 位身份证号脱敏为 ***（末位含 X）", () => {
    expect(sanitizeMessageContent("身份证号：11010119900307123X")).toBe("身份证号：***");
  });

  it("同时命中多种敏感信息，全部替换", () => {
    const raw = "<p>联系方式：13800138000，邮箱 a@b.com，身份证 110101199003071234</p>";
    expect(sanitizeMessageContent(raw)).toBe("联系方式：***，邮箱 ***，身份证 ***");
  });

  it("不含敏感信息的普通文本原样返回", () => {
    expect(sanitizeMessageContent("这是一条普通的咨询消息")).toBe("这是一条普通的咨询消息");
  });
});
