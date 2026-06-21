import axios from "axios";

// 创建axios实例
const instance = axios.create({
  baseURL: "/api", // 设置基础URL
  timeout: 10000 // 设置请求超时时间
});

// 请求拦截器
instance.interceptors.request.use(
  config => {
    // 自动附加 accessToken（从 localStorage 读取，与 userStore 保持一致）
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    // 处理请求错误
    console.error("请求错误:", error);
    return Promise.reject(error);
  }
);

// 响应拦截器
instance.interceptors.response.use(
  response => {
    // 2xx 范围内的状态码都会触发该函数
    // 对响应数据做点什么
    const res = response.data;

    // 统一处理响应格式
    if (res.code === 200) {
      return res.data;
    } else {
      // 业务错误，返回错误信息
      console.error("业务错误:", res.message);
      return Promise.reject(new Error(res.message || "请求失败"));
    }
  },
  error => {
    // 超出 2xx 范围的状态码都会触发该函数
    // 处理响应错误
    console.error("网络错误:", error);

    let errorMessage = "网络请求失败";
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          errorMessage = data.message || "请求参数错误";
          break;
        case 401:
          errorMessage = "未授权，请重新登录";
          // 可以在这里处理登录过期逻辑
          break;
        case 403:
          errorMessage = "拒绝访问";
          break;
        case 404:
          errorMessage = "请求的资源不存在";
          break;
        case 500:
          errorMessage = "服务器内部错误";
          break;
        default:
          errorMessage = data.message || `请求失败 (${status})`;
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      errorMessage = "服务器无响应，请稍后重试";
    }

    return Promise.reject(new Error(errorMessage));
  }
);

export default instance;
