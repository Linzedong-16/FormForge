/**
 * qiankun 子应用公共路径配置
 *
 * 作为 qiankun 子应用运行时，静态资源需要使用绝对路径来避免 404。
 * 在 Vite 开发模式下，资源直接由各自的 dev server 提供，无需特殊处理。
 */
if ((window as any).__POWERED_BY_QIANKUN__) {
  console.log("[q-editor] 运行于 qiankun 微前端环境");
}
