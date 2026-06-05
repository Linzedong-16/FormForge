import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "./App.vue";
import router from "./router";

// elementplus 组件库
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";

// i18n 国际化
import { setupI18n } from "@/i18n";

// scss样式
import "@/assets/css/index.scss";

// Font Awesome 配置
// 引入 Font Awesome 图标库
import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { fas } from "@fortawesome/free-solid-svg-icons";

// 将所有的 solid 图标添加到库中
library.add(fas);

const app = createApp(App);

app.component("FontAwesomeIcon", FontAwesomeIcon);
app.use(createPinia());
app.use(router);
// 安装 i18n
setupI18n(app);
// Element Plus 语言由 App.vue 的 ElConfigProvider 跟随 i18n 动态切换
app.use(ElementPlus);
app.mount("#app");
