import type { RouteRecordRaw } from "vue-router";

export interface RouteMeta {
  title: string; // 路由标题
  icon: string; // 路由图标
}

export const childrenRoutes: RouteRecordRaw[] = [
  {
    path: "",
    name: "home",
    component: () => import("../views/home/HomeView.vue"),
    meta: {
      title: "首页",
      icon: "home"
    }
  },
  {
    path: "/autopack",
    name: "autopack",
    component: () => import("../views/home/HomeView.vue"),
    meta: {
      title: "自动打包",
      icon: "box"
    },
    children: [
      {
        path: "/seed",
        name: "seed",
        component: () => import("../views/home/HomeView.vue"),
        meta: {
          title: "Seed",
          icon: "code"
        }
      },
      {
        path: "/similarity",
        name: "similarity",
        component: () => import("../views/home/HomeView.vue"),
        meta: {
          title: "相似度",
          icon: "shrink"
        }
      },
      {
        path: "/landing",
        name: "landing",
        component: () => import("../views/home/HomeView.vue"),
        meta: {
          title: "落地页",
          icon: "layout"
        }
      }
    ]
  },
  {
    path: "/download",
    name: "download",
    component: () => import("../views/home/HomeView.vue"),
    meta: {
      title: "包下载",
      icon: "download"
    },
    children: [
      {
        path: "/rpk",
        name: "rpk",
        component: () => import("../views/home/HomeView.vue"),
        meta: {
          title: "RPK下载",
          icon: "file"
        }
      },
      {
        path: "/app",
        name: "app",
        component: () => import("../views/home/HomeView.vue"),
        meta: {
          title: "APP下载",
          icon: "phone"
        }
      }
    ]
  },
  {
    path: "/navigation",
    name: "navigation",
    component: () => import("../views/home/HomeView.vue"),
    meta: {
      title: "网站导航",
      icon: "link"
    }
  },
  {
    path: "/document",
    name: "document",
    component: () => import("../views/home/HomeView.vue"),
    meta: {
      title: "文档管理",
      icon: "book"
    }
  },
  {
    path: "/about",
    name: "about",
    // route level code-splitting
    // this generates a separate chunk (About.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import("@/views/AboutView.vue"),
    meta: {
      title: "关于",
      icon: "info"
    }
  }
];
