import type { RouterConfig } from "@nuxt/schema";

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }

    if (to.hash) {
      if (typeof document !== "undefined") {
        try {
          const el = document.querySelector(to.hash);
          if (el) {
            return {
              el: to.hash,
              behavior: "smooth",
              top: 72,
            };
          }
        } catch {
          // Ignore invalid selector queries
        }
      }
      return false;
    }

    return { top: 0, left: 0 };
  },
};
