/**
 * 全局错误处理插件测试
 */
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { AppError, AuthError, ValidationError } from "../../utils/errors.js";
import errorHandlerPlugin from "../../plugins/error-handler.js";

/** 创建一个已注册 error-handler 的 Fastify 实例并注入请求 */
async function injectError(error: Error, production = false) {
  const prevEnv = process.env.NODE_ENV;
  const app = Fastify({ logger: false });

  // 若有 production 需要，在注册插件前设置（模块顶层读取）
  if (production) process.env.NODE_ENV = "production";

  await app.register(errorHandlerPlugin);

  // 注册抛出错误的路由
  app.route({
    method: "GET",
    url: "/throw",
    handler: () => { throw error; },
  });

  await app.ready();
  const res = await app.inject({ method: "GET", url: "/throw" });
  await app.close();

  process.env.NODE_ENV = prevEnv;
  return res;
}

describe("error-handler plugin", () => {
  it("AppError → 对应状态码 + {data,code,msg}", async () => {
    const res = await injectError(new AppError("自定义错误", 422, 1001, { field: "test" }));
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toEqual({ data: { field: "test" }, code: 1001, msg: "自定义错误" });
  });

  it("AuthError(401) → 401", async () => {
    const res = await injectError(new AuthError("请先登录", 401));
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.data).toBeNull();
    expect(body.code).toBe(401);
  });

  it("AuthError(403) → 403", async () => {
    const res = await injectError(new AuthError("无权限", 403));
    expect(res.statusCode).toBe(403);
  });

  it("ValidationError → 400", async () => {
    const res = await injectError(new ValidationError("字段不能为空"));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).msg).toBe("字段不能为空");
  });

  it("普通 Error → 500，开发环境暴露原始消息", async () => {
    const res = await injectError(new Error("dev stack trace"));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).msg).toBe("dev stack trace");
  });

  it("普通 Error → 500，生产环境兜底消息不泄露", async () => {
    const res = await injectError(new Error("secret detail"), true);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).msg).toBe("服务器内部错误");
  });

  it("@fastify/multipart 文件超限错误（FST_REQ_FILE_TOO_LARGE）→ 413 + 中文友好提示，而非兜底 500", async () => {
    // 模拟 @fastify/multipart 抛出的 RequestFileTooLargeError：带 statusCode=413 与 code 属性
    const err = Object.assign(new Error("request file too large"), {
      code: "FST_REQ_FILE_TOO_LARGE",
      statusCode: 413
    });
    const res = await injectError(err);
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ data: null, code: 413, msg: "文件大小超出限制" });
  });

  it("未预置中文提示的插件级 4xx 错误 → 保留原状态码，回退到原始 message", async () => {
    const err = Object.assign(new Error("some plugin 4xx error"), {
      code: "FST_SOME_UNMAPPED_ERROR",
      statusCode: 422
    });
    const res = await injectError(err);
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toEqual({ data: null, code: 422, msg: "some plugin 4xx error" });
  });
});
