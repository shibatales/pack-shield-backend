(() => {
  const key = "packshield.web.theme.v1";
  const themes = new Set([
    "glass-aqua",
    "glass-ember",
    "glass-solar",
    "glass-sky",
    "glass-moss",
    "glass-violet",
    "glass-rose"
  ]);

  function savedTheme() {
    try {
      const value = window.localStorage.getItem(key);
      return themes.has(value) ? value : "glass-aqua";
    } catch {
      return "glass-aqua";
    }
  }

  function setTheme(value) {
    const nextTheme = themes.has(value) ? value : "glass-aqua";
    document.documentElement.dataset.theme = nextTheme;

    try {
      window.localStorage.setItem(key, nextTheme);
    } catch {
      // The theme still changes for this page load when storage is unavailable.
    }

    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      select.value = nextTheme;
    });
  }

  function setActiveNav() {
    const currentPath = window.location.pathname.replace(/\/$/, "") || "/";

    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, "") || "/";

      if (linkPath === currentPath) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  setTheme(savedTheme());

  window.addEventListener("DOMContentLoaded", () => {
    setActiveNav();

    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      select.value = savedTheme();
      select.addEventListener("change", (event) => {
        setTheme(event.currentTarget.value);
      });
    });
  });
})();
