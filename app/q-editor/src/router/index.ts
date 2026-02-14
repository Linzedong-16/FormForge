import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: import('@/views/Layout/index.vue'),
    },
    {
      path: '/materials',
      name: 'materials',
      component: import('@/views/MaterialsView/index.vue'),
    },
    {
      path: '/editor',
      name: 'editor',
      component: import('@/views/EditorView/index.vue'),
    },
  ],
})

export default router
