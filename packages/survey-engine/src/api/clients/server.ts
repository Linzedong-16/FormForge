/**
 * 业务请求客户端（引擎共享版）
 *
 * 简化版 axios client，不依赖项目特定的 useUserStore。
 * 消费者可通过 interceptors 自行注入 Token 认证逻辑。
 */
import axios from "axios";

const serverClient = axios.create({
  baseURL: "/api",
  timeout: 15000
});

export default serverClient;
