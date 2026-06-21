/**
 * 用户资料路由 — 资料查询/更新、头像上传、邮箱绑定、密码修改、账号注销
 * 挂载于 /api/user
 *
 * 所有接口均需认证（authenticate 中间件），敏感接口有限流保护。
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate, extractToken } from "../user/auth.middleware.js";
import { ProfileService } from "./profile.service.js";
import { AvatarService } from "./avatar.service.js";
import { parseAndRespond } from "../../utils/zod.js";
import { updateProfileSchema, bindEmailSchema, changePasswordSchema } from "./schemas/user.schemas.js";

const profileRoutes: FastifyPluginAsync = async fastify => {
  const profileService = new ProfileService(fastify);
  const avatarService = new AvatarService(fastify);

  // 所有接口均需认证
  fastify.addHook("preHandler", authenticate);

  // ══════════════════════════════════════════════════════════════
  //  GET /profile — 获取用户资料（含表单回显数据）
  // ══════════════════════════════════════════════════════════════
  fastify.get("/profile", async (request, reply) => {
    const result = await profileService.getProfile(request.user!.userId);
    return reply.sendSuccess(result);
  });

  // ══════════════════════════════════════════════════════════════
  //  PUT /profile — 更新用户资料（昵称/职业/介绍/兴趣）
  // ══════════════════════════════════════════════════════════════
  fastify.put("/profile", async (request, reply) => {
    const body = parseAndRespond(updateProfileSchema.safeParse(request.body), reply);
    if (!body) return;

    const result = await profileService.updateProfile(request.user!.userId, body);
    return reply.sendSuccess(result, "资料更新成功");
  });

  // ══════════════════════════════════════════════════════════════
  //  POST /avatar — 上传头像（multipart/form-data，10次/分钟）
  // ══════════════════════════════════════════════════════════════
  fastify.post(
    "/avatar",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.sendBadRequest("请选择要上传的图片");
      }

      // 读取文件为 Buffer
      const fileBuffer = await file.toBuffer();

      const result = await avatarService.upload(request.user!.userId, fileBuffer, file.mimetype);
      return reply.sendSuccess(result, "头像上传成功");
    }
  );

  // ══════════════════════════════════════════════════════════════
  //  POST /bind-email — 绑定邮箱（5次/分钟）
  // ══════════════════════════════════════════════════════════════
  fastify.post(
    "/bind-email",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = parseAndRespond(bindEmailSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await profileService.bindEmail(request.user!.userId, body.email, body.code);
      return reply.sendSuccess(result, "邮箱绑定成功");
    }
  );

  // ══════════════════════════════════════════════════════════════
  //  PUT /change-password — 修改密码（5次/分钟）
  // ══════════════════════════════════════════════════════════════
  fastify.put(
    "/change-password",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = parseAndRespond(changePasswordSchema.safeParse(request.body), reply);
      if (!body) return;

      await profileService.changePassword(request.user!.userId, body.currentPassword, body.newPassword);

      // 修改密码后使当前 Token 失效
      const token = extractToken(request) ?? "";
      // 估算 Token 剩余有效期（当前时间 ~ iat 之间的差值，保守估计 1h）
      await profileService.blacklistToken(token, 3600);

      return reply.sendSuccess(null, "密码修改成功，请重新登录");
    }
  );

  // ══════════════════════════════════════════════════════════════
  //  DELETE /account — 注销账号（3次/天）
  // ══════════════════════════════════════════════════════════════
  fastify.delete(
    "/account",
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "1 day"
        }
      }
    },
    async (request, reply) => {
      const result = await profileService.deleteAccount(request.user!.userId);

      // 注销后使当前 Token 失效
      const token = extractToken(request) ?? "";
      await profileService.blacklistToken(token, 3600);

      return reply.sendSuccess(result, "账号已注销");
    }
  );
};

export default profileRoutes;
