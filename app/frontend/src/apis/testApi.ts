import axios from "../utils/axios";

// 通用响应接口
// export interface ApiResponse<T> {
//   code: number;
//   message: string;
//   data: T;
// }

// 用户接口
export interface User {
  id: number;
  name: string;
  email: string;
}

// 系统信息接口
export interface SystemInfo {
  name: string;
  version: string;
  description: string;
  uptime: number;
}

// 随机数据接口
export interface RandomData {
  number: number;
  string: string;
  timestamp: number;
  boolean: boolean;
  randomArray: number[];
}

// 测试接口：获取用户列表
export const getUsers = (): Promise<User[]> => {
  return axios.get("/test/users");
};

// 测试接口：获取系统信息
export const getSystemInfo = (): Promise<SystemInfo> => {
  return axios.get("/test/system/info");
};

// 测试接口：获取随机数据
export const getRandomData = (): Promise<RandomData> => {
  return axios.get("/test/random");
};
