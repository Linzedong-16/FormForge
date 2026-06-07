import axios from "axios";

const authClient = axios.create({
  baseURL: "/api",
  timeout: 50000
});
/** 认证 API 响应拦截器 */
authClient.interceptors.response.use(
  res => {
    return res.data;
  },
  err => {
    return Promise.reject(err);
  }
);

/** 刷新token API */
// export const refreshTokenApi () => {}
