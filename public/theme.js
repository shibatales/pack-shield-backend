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
    let isScrollLocked = false;
    let lockedScrollY = 0;

    function lockPageScroll() {
      if (isScrollLocked) return;
      lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.style.position = "fixed";
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.right = "0";
      document.body.style.left = "0";
      document.body.style.width = "100%";
      isScrollLocked = true;
    }

    function unlockPageScroll() {
      if (!isScrollLocked) return;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.right = "";
      document.body.style.left = "";
      document.body.style.width = "";
      window.scrollTo(0, lockedScrollY);
      isScrollLocked = false;
    }

    function syncMenuState() {
      const isMobile = mobileQuery.matches;
      const shouldOpen = isMobile && isOpen;

      if (shouldOpen) {
        document.documentElement.setAttribute("data-menu-open", "true");
        document.body.setAttribute("data-menu-open", "true");
        lockPageScroll();
      } else {
        document.documentElement.removeAttribute("data-menu-open");
        document.body.removeAttribute("data-menu-open");
        unlockPageScroll();
      }

      toggle.setAttribute("aria-expanded", String(shouldOpen));
      toggle.setAttribute("aria-label", shouldOpen ? "Close menu" : "Open menu");

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

    document.addEventListener("wheel", (event) => {
      if (!isOpen || !mobileQuery.matches) return;
      const target = event.target;
      if (!(target instanceof Node) || !panel.contains(target)) event.preventDefault();
    }, { passive: false });

    document.addEventListener("touchmove", (event) => {
      if (!isOpen || !mobileQuery.matches) return;
      const target = event.target;
      if (!(target instanceof Node) || !panel.contains(target)) event.preventDefault();
    }, { passive: false });

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
