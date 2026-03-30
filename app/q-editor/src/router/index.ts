import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/Layout/index.vue")
    },
    {
      path: "/materials",
      name: "materials",
      component: () => import("@/views/MaterialsView/index.vue"),
      redirect: "/select-group",
      children: [
        {
          path: "/select-group",
          name: "select-group",
          component: () => import("@/views/MaterialsView/SelectGroupView.vue"),
          redirect: "/single-select",
          children: [
            {
              path: "/single-select",
              name: "single-select",
              component: () => import("@/components/SurveyComs/Materials/SelectComs/SingleSelect.vue")
            },
            {
              path: "/multi-select",
              name: "multi-select",
              component: () => import("@/components/SurveyComs/Materials/SelectComs/MultiSelect.vue")
            },
            {
              path: "/option-select",
              name: "option-select",
              component: () => import("@/components/SurveyComs/Materials/SelectComs/OptionSelect.vue")
            },
            {
              path: "/single-pic-select",
              name: "single-pic-select",
              component: () => import("@/components/SurveyComs/Materials/SelectComs/SinglePicSelect.vue")
            },
            {
              path: "/multi-pic-select",
              name: "multi-pic-select",
              component: () => import("@/components/SurveyComs/Materials/SelectComs/MultiPicSelect.vue")
            }
          ]
        },
        {
          path: "/input-group",
          name: "input-group",
          component: () => import("@/views/MaterialsView/InputGroupView.vue")
        },
        {
          path: "/advanced-group",
          name: "advanced-group",
          component: () => import("@/views/MaterialsView/AdvancedGroupView.vue")
        },
        {
          path: "/note-group",
          name: "note-group",
          component: () => import("@/views/MaterialsView/NoteGroupView.vue"),
          redirect: "/text-note",
          children: [
            {
              path: "/text-note",
              name: "text-note",
              component: () => import("@/components/SurveyComs/Materials/NoteComs/TextNote.vue")
            }
          ]
        },
        {
          path: "/personal-info-group",
          name: "personal-info-group",
          component: () => import("@/views/MaterialsView/PersonalInfoGroupView.vue")
        },
        {
          path: "/contact-group",
          name: "contact-group",
          component: () => import("@/views/MaterialsView/ContactGroupView.vue")
        }
      ]
    },
    {
      path: "/editor",
      name: "editor",
      component: () => import("@/views/EditorView/index.vue")
    }
  ]
});

// router.beforeEach((to, from, next) => {});

export default router;
