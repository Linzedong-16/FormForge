/**
 * 测试环境初始化
 *
 * jsdom 环境缺少部分浏览器 API，在此进行 mock
 */

// Mock localStorage / sessionStorage
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null
  };
})();

Object.defineProperty(window, "localStorage", { value: storageMock });
Object.defineProperty(window, "sessionStorage", { value: storageMock });

// Mock window.matchMedia（Arco Design 响应式组件需要）
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
});

// Mock getComputedStyle（Arco Design 某些组件需要）
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
  const style = originalGetComputedStyle(elt, pseudoElt);
  // 某些 CSS 属性 jsdom 不返回，补充默认值
  if (!style.paddingLeft) {
    Object.defineProperty(style, "paddingLeft", { get: () => "0px" });
  }
  return style;
};
