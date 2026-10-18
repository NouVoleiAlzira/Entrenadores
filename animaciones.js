  // =====================================================================
  //  ANIMACIONES — intro, desplegables, modales y cabecera
  //  No cambia la lógica de app.js: observa las clases/estilos que ya
  //  pone la app (collapsed, active, display) y anima el cambio.
  //  Estilos en animaciones.css.
  // =====================================================================
  (function () {
    const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const html = document.documentElement;
    const running = new WeakMap();   // elemento -> animaciones en curso

    function stop(el) {
      (running.get(el) || []).forEach(a => a.cancel());
      running.delete(el);
    }

    // ---------- Desplegar / plegar con altura medida ----------
    function expand(el) {
      // Si se estaba plegando, se parte de la altura actual (sin saltos)
      let fromH = null, fromOp = 0;
      if (running.has(el)) {
        fromH = el.getBoundingClientRect().height;
        fromOp = +getComputedStyle(el).opacity;
        stop(el);
      }
      el.classList.remove("anim-closing");

      if (reduce.matches) {
        running.set(el, [el.animate([{ opacity: fromOp }, { opacity: 1 }], { duration: 150, easing: "ease" })]);
        return;
      }

      const cs = getComputedStyle(el);
      const to = {
        height: el.offsetHeight + "px", opacity: 1,
        paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
        marginTop: cs.marginTop, marginBottom: cs.marginBottom
      };
      const from = fromH !== null
        ? { height: fromH + "px", opacity: fromOp }
        : { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" };

      el.classList.add("anim-clip");
      const main = el.animate([from, to], { duration: 260, easing: EASE_OUT });
      main.onfinish = () => { el.classList.remove("anim-clip"); running.delete(el); };

      // Los hijos entran escalonados (solo en una apertura limpia)
      const kids = fromH !== null ? [] : Array.from(el.children).slice(0, 8).map((c, i) =>
        c.animate(
          [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }],
          { duration: 320, delay: i * 35, easing: EASE_OUT, fill: "backwards" }
        ));
      running.set(el, [main, ...kids]);
    }

    function collapse(el, display) {
      // La app ya lo ha ocultado: se mantiene visible mientras se pliega
      el.dataset.animDisplay = display || "block";
      el.classList.add("anim-closing", "anim-clip");
      const h = el.getBoundingClientRect().height;
      const op = +getComputedStyle(el).opacity;
      stop(el);

      const frames = reduce.matches
        ? [{ opacity: op }, { opacity: 0 }]
        : [{ height: h + "px", opacity: op },
           { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" }];
      const a = el.animate(frames, { duration: reduce.matches ? 150 : 200, easing: EASE_OUT, fill: "forwards" });
      a.onfinish = () => {
        el.classList.remove("anim-closing", "anim-clip");
        a.cancel();
        running.delete(el);
      };
      running.set(el, [a]);
    }

    // ---------- Observador común ----------
    let ready = false;   // durante la carga inicial no se anima nada
    const watchers = new Map();
    const mo = new MutationObserver(records => {
      new Set(records.map(r => r.target)).forEach(el => {
        const w = watchers.get(el);
        if (!w) return;
        const now = w.isOpen(el);
        if (now === w.state) return;
        w.state = now;
        if (ready) (now ? w.open : w.close)(el, w);
      });
    });
    function watch(el, isOpen, open, close) {
      if (!el) return;
      const w = { isOpen, open, close, state: isOpen(el), display: null };
      if (w.state) w.display = getComputedStyle(el).display;
      watchers.set(el, w);
      mo.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
    }

    const accordionOpen = (el, w) => { expand(el); w.display = getComputedStyle(el).display; };
    const accordionClose = (el, w) => collapse(el, w.display);

    // ---------- Modales y pantalla de carga ----------
    function modalOpen(el, w) {
      w.openedAt = performance.now();
      stop(el);
      el.classList.remove("anim-closing");   // la entrada la hace el CSS
    }
    function modalClose(el, w) {
      // La carga tiene 120 ms de retraso: si se cierra antes, nunca se llegó a ver
      if (el.classList.contains("loading-overlay") && performance.now() - (w.openedAt || 0) < 140) return;
      el.dataset.animDisplay = "flex";
      el.classList.add("anim-closing");
      const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: EASE_OUT, fill: "forwards" });
      const list = [a];
      const box = el.querySelector(":scope > .modal-box");
      if (box && !reduce.matches) {
        list.push(box.animate(
          [{ transform: "none" }, { transform: "translateY(4px) scale(0.97)" }],
          { duration: 180, easing: EASE_OUT, fill: "forwards" }));
      }
      a.onfinish = () => {
        el.classList.remove("anim-closing");
        list.forEach(x => x.cancel());
        running.delete(el);
      };
      running.set(el, list);
    }

    // ---------- Entrenadores: los equipos se despliegan y se pliegan ----------
    function wrapCoachSelection() {
      const orig = window.toggleCoachSelection;
      if (typeof orig !== "function") return;
      let busy = false;
      window.toggleCoachSelection = function (coachId) {
        if (busy) return;
        const list = document.getElementById("coachTeamList");
        const current = list && list.querySelector(".teams-container");
        let opening = true;
        try { opening = activeCoachId !== coachId; } catch (e) { /* sin acceso: se asume apertura */ }

        const render = () => {
          orig(coachId);
          const fresh = opening && list && list.querySelector(".teams-container");
          if (fresh) expand(fresh);
        };
        if (!current || reduce.matches) { render(); return; }

        busy = true;
        current.classList.add("anim-clip");
        const a = current.animate(
          [{ height: current.offsetHeight + "px", opacity: 1 },
           { height: "0px", opacity: 0, marginTop: "0px", marginBottom: "0px" }],
          { duration: 180, easing: EASE_OUT, fill: "forwards" });
        a.onfinish = () => { busy = false; render(); };
      };
    }

    // ---------- Intro ----------
    function initIntro() {
      const intro = document.getElementById("nvaIntro");
      if (!intro || !html.classList.contains("nva-intro-on")) { if (intro) intro.remove(); return; }

      const cleanup = () => html.classList.remove("nva-intro-on", "nva-reveal");
      let timer = setTimeout(cleanup, Math.max(400, 3300 - performance.now()));

      intro.addEventListener("animationend", e => {
        if (e.target === intro && (e.animationName === "nvaIntroOut" || e.animationName === "nvaIntroSkip")) intro.remove();
      });

      // Un toque (o Esc) salta la intro
      let skipped = false;
      const skip = () => {
        if (skipped || !intro.isConnected) return;
        skipped = true;
        intro.classList.add("is-skip");
        html.classList.remove("nva-intro-on");
        void html.offsetWidth;               // reinicia las animaciones de entrada
        html.classList.add("nva-reveal");
        clearTimeout(timer);
        timer = setTimeout(cleanup, 1300);
        document.removeEventListener("keydown", onKey);
      };
      const onKey = e => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip(); };
      intro.addEventListener("click", skip);
      document.addEventListener("keydown", onKey);
    }

    // ---------- Cabecera: cristal al hacer scroll ----------
    function initHeader() {
      const header = document.querySelector("header");
      if (!header) return;
      const update = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
      window.addEventListener("scroll", update, { passive: true });
      update();

      // El indicador Online/Offline hace un pequeño "pop" al cambiar
      const badge = document.getElementById("netStatusBadge");
      watch(badge, el => el.className, el => {
        if (!reduce.matches) el.animate(
          [{ transform: "scale(0.85)", opacity: 0.4 }, { transform: "none", opacity: 1 }],
          { duration: 300, easing: EASE_OUT });
      }, () => {});
    }


    // ---------- Encabezado: saque del escudo + reflejo en el nombre ----------
    function initHeadPlay() {
      const header = document.querySelector("header");
      const title = header && header.querySelector(".header-title-container");
      if (!title) return;
      const play = () => {
        header.classList.remove("nva-head-play");
        void header.offsetWidth;             // reinicia la animación
        header.classList.add("nva-head-play");
      };
      header.addEventListener("animationend", e => {
        if (e.animationName === "nvaSheen" || (reduce.matches && e.animationName === "nvaFade")) header.classList.remove("nva-head-play");
      });
      // Tocar el escudo o el nombre (cualquier zona de la cabecera que no sea un botón)
      header.addEventListener("click", e => {
        if (!e.target.closest("button, .network-badge")) play();
      });
      // Al entrar: tras la intro (2,6 s) o enseguida si ya se vio
      setTimeout(play, html.classList.contains("nva-intro-on") ? 2600 : 500);
    }

    // ---------- Textos: cifras que cambian ----------
    // Al pasar de semana, las cifras del resumen que cambian entran desde
    // el lado hacia el que se navega (solo con las flechas, no al recargar).
    function wrapWeekMove() {
      const orig = window.wkMove;
      if (typeof orig !== "function") return;
      window.wkMove = function (delta) {
        const box = document.getElementById("wkSummary");
        const before = box ? Array.from(box.querySelectorAll("b"), b => b.textContent) : [];
        orig(delta);
        if (!box || !ready) return;
        const dx = (delta > 0 ? 8 : -8) + "px";
        box.querySelectorAll("b").forEach((b, i) => {
          if (b.textContent === before[i]) return;
          b.animate(
            reduce.matches
              ? [{ opacity: 0.3 }, { opacity: 1 }]
              : [{ opacity: 0, transform: `translateX(${dx})` }, { opacity: 1, transform: "none" }],
            { duration: 220, easing: EASE_OUT });
        });
      };
    }

    // Los contadores de "Avisos" y "Lista de partidos" hacen un pop al cambiar
    function watchCounter(el) {
      if (!el) return;
      let last = el.textContent;
      new MutationObserver(() => {
        const now = el.textContent;
        if (now === last) return;
        last = now;
        if (!ready || !now) return;
        el.animate(
          reduce.matches
            ? [{ opacity: 0.3 }, { opacity: 1 }]
            : [{ opacity: 0.4, transform: "scale(0.8)" }, { opacity: 1, transform: "none" }],
          { duration: 260, easing: EASE_OUT });
      }).observe(el, { childList: true, characterData: true, subtree: true });
    }

    function init() {
      initIntro();
      initHeader();
      initHeadPlay();
      wrapCoachSelection();
      wrapWeekMove();
      watchCounter(document.getElementById("cpWarnCount"));
      watchCounter(document.getElementById("cpListCount"));

      const byClass = el => !el.classList.contains("collapsed");
      const byStyle = el => el.style.display !== "none";
      document.querySelectorAll(".section-body, .cp-sub-body")
        .forEach(el => watch(el, byClass, accordionOpen, accordionClose));
      document.querySelectorAll(".hz-panel, #direccionTeamsContainer")
        .forEach(el => watch(el, byStyle, accordionOpen, accordionClose));
      document.querySelectorAll(".modal-backdrop, .loading-overlay")
        .forEach(el => watch(el, x => x.classList.contains("active"), modalOpen, modalClose));

      const arm = () => setTimeout(() => { ready = true; }, 400);
      if (document.readyState === "complete") arm();
      else window.addEventListener("load", arm);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  })();
