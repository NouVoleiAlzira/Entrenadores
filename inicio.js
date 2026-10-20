  // =====================================================================
  //  PANTALLA PRINCIPAL — efectos visuales (estilos en inicio.css)
  //  - Onda al pulsar botones y títulos de sección
  //  - Las tarjetas que están más abajo entran al llegar a ellas con el scroll
  //  No cambia nada de la lógica de app.js: solo pone clases y variables CSS.
  // =====================================================================
  (function () {
    const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const screen = document.getElementById("screenCoachTeam");
    if (!screen) return;

    // ---------- Onda al pulsar ----------
    const RIPPLE = [
      ".coach-btn", ".team-btn", ".btn-pdf-mode", ".btn-pdf-mode2",
      ".btn-save-session", ".section-toggle", ".cp-sub-head"
    ].map(s => "#screenCoachTeam " + s).concat("header .btn-header-icon").join(", ");

    document.addEventListener("pointerdown", e => {
      if (reduce.matches || e.button > 0) return;
      const el = e.target.closest && e.target.closest(RIPPLE);
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--rx", (e.clientX - r.left) + "px");
      el.style.setProperty("--ry", (e.clientY - r.top) + "px");
      el.style.setProperty("--rs", Math.round(Math.max(r.width, r.height) * 2.2) + "px");
      el.classList.remove("nv-rip");
      void el.offsetWidth;                   // reinicia la onda si se pulsa seguido
      el.classList.add("nv-rip");
    }, { passive: true, capture: true });

    document.addEventListener("animationend", e => {
      if (e.animationName === "nvRipple") e.target.classList.remove("nv-rip");
    });

    // ---------- Entrada de tarjetas al hacer scroll ----------
    if (reduce.matches || !("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const head = entry.target;
        const body = head.nextElementSibling;
        [head, body].forEach((el, i) => {
          if (!el || !el.classList.contains("nv-wait")) return;
          el.classList.remove("nv-wait");
          el.animate(
            [{ opacity: 0, transform: "translateY(24px) scale(0.98)" }, { opacity: 1, transform: "none" }],
            { duration: 560, delay: i * 70, easing: EASE_OUT, fill: "backwards" });
        });
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    // Solo las que no se ven al abrir (las de arriba ya tienen su entrada)
    screen.querySelectorAll(".section-toggle").forEach(head => {
      if (head.getBoundingClientRect().top < window.innerHeight) return;
      head.classList.add("nv-wait");
      const body = head.nextElementSibling;
      if (body && body.classList.contains("section-body")) body.classList.add("nv-wait");
      io.observe(head);
    });
  })();
