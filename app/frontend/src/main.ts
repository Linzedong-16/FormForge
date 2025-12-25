import { createApp } from "vue";
import "./style.css";
import "@arco-design/web-vue/dist/arco.css";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import App from "./App.vue";
import router from "./router";
import pinia from "./store";

const app = createApp(App);
app.use(ArcoVue, {
  componentPrefix: "arco" // 组件前缀
});

app.use(router);
app.use(pinia);
app.use(ArcoVueIcon);

app.mount("#app");
