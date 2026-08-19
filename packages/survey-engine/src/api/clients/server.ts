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

// 响应拦截器：直接返回业务信封 { code, msg, data }，而非裸的 AxiosResponse
// 对应 Constitution Principle III 统一响应信封要求；错误处理（401 刷新等）由消费方按需自行注入
serverClient.interceptors.response.use(response => response.data);

export default serverClient;
