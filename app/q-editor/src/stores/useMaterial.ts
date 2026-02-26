// 组件市场里面所有组件状态的仓库
import { defineStore } from 'pinia'
import { defaultStatusMap } from '@/configs/defaultStatus/defaultStatusMap'

export const useMaterialStore = defineStore('materialStore', {
  state: () => ({
    // 记录所有的业务组件
    coms: {
      'single-select': defaultStatusMap['single-select'](),
    },
  }),
})
