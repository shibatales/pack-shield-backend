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

  function setupMobileMenu() {
    const toggle = document.querySelector("[data-menu-toggle]");
    const panel = document.querySelector("[data-menu-panel]");
    const nav = document.querySelector(".site-nav");
    const mobileQuery = window.matchMedia("(max-width: 860px)");

    if (!toggle || !panel || !nav) return;

    let isOpen = false;

    function syncMenuState() {
      const isMobile = mobileQuery.matches;

      if (isMobile && isOpen) {
        document.body.setAttribute("data-menu-open", "true");
      } else {
        document.body.removeAttribute("data-menu-open");
      }

      toggle.setAttribute("aria-expanded", String(isMobile && isOpen));
      toggle.setAttribute("aria-label", isMobile && isOpen ? "Close menu" : "Open menu");

      if (isMobile) {
        panel.setAttribute("aria-hidden", String(!isOpen));
      } else {
        panel.removeAttribute("aria-hidden");
      }
    }

    function setMenuOpen(nextOpen) {
      isOpen = Boolean(nextOpen) && mobileQuery.matches;
      syncMenuState();
    }

    toggle.addEventListener("click", () => {
      setMenuOpen(!isOpen);
    });

    panel.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setMenuOpen(false));
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!isOpen || !mobileQuery.matches || !(target instanceof Node) || nav.contains(target)) return;
      setMenuOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    });

    mobileQuery.addEventListener("change", () => setMenuOpen(false));
    syncMenuState();
  }

  setTheme(savedTheme());

  window.addEventListener("DOMContentLoaded", () => {
    setActiveNav();
    setupMobileMenu();

    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      select.value = savedTheme();
      select.addEventListener("change", (event) => {
        setTheme(event.currentTarget.value);
      });
    });
  });
})();
