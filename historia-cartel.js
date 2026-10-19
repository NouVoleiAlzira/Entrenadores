/* =====================================================================
   Story desde el cartel (Partidos.html y Resultados.html)
   Al descargar un cartel pregunta si se quiere crear una Story con él.
   Si se acepta, crea el borrador de Story con la imagen sin cambios
   (historia-editor.js); se ajusta y se confirma en Redes Sociales › Stories.
   Solo aparece en los dispositivos con el token de Instagram.
   Si se descargan varios carteles seguidos, se pregunta una sola vez.
   ===================================================================== */
(function () {
  "use strict";

  const DIR_H = "Reels/historias";
  let cola = [], tipoCola = "resultados", espera = null;

  function ajustes() {
    let ig = null, gh = null;
    try { ig = JSON.parse(localStorage.getItem("NVA_IG_SETTINGS")); } catch (e) { /* nada */ }
    try { gh = JSON.parse(localStorage.getItem("NVA_GH_SETTINGS")); } catch (e) { /* nada */ }
    if (!ig || !ig.token || !gh || !gh.user || !gh.repo) return null;
    return { token: ig.token, user: gh.user, repo: gh.repo, login: ig.login || "" };
  }

  async function pedir(a, blobs, tipo, estado) {
    if (!window.nvaStory) throw new Error("Falta historia-editor.js: vuelve a cargar la página.");
    await window.nvaStory.crearBorrador(a, blobs.map(blob => ({ blob })), { tipo }, (t) => { estado.textContent = t; });
  }

  function preguntar() {
    const a = ajustes();
    const blobs = cola.slice(0, 10), tipo = tipoCola;
    cola = [];
    if (!a || !blobs.length) return;
    const n = blobs.length;
    const fondo = document.createElement("div");
    fondo.setAttribute("role", "dialog");
    fondo.setAttribute("aria-modal", "true");
    fondo.style.cssText = "position:fixed; inset:0; z-index:100005; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; padding:16px;";
    fondo.innerHTML = `
      <div style="background:#0f1d4a; color:#e9eefa; border:1px solid rgba(255,255,255,.15); border-radius:14px; max-width:340px; width:100%; padding:18px 16px; display:flex; flex-direction:column; gap:12px; font-family:inherit; box-shadow:0 10px 30px rgba(0,0,0,.4);">
        <div style="font-weight:800; font-size:1.1rem; color:#fff;">📲 ¿Crear una Story?</div>
        <div style="font-size:.9rem; line-height:1.4;">${n > 1 ? `Se crea un borrador de Story con estas ${n} imágenes.` : "Se crea un borrador de Story con esta imagen."} No se publica nada hasta que lo confirmes en Redes Sociales › Stories.</div>
        <div data-estado style="font-size:.85rem; color:#facc15; min-height:1em;"></div>
        <div style="display:flex; gap:8px;">
          <button type="button" data-no style="flex:1; padding:11px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:transparent; color:#fff; font:inherit; font-weight:700; cursor:pointer;">Cancelar</button>
          <button type="button" data-si style="flex:1; padding:11px; border-radius:10px; border:0; background:#16a34a; color:#fff; font:inherit; font-weight:700; cursor:pointer;">Aceptar</button>
        </div>
      </div>`;
    const cerrar = () => fondo.remove();
    const estado = fondo.querySelector("[data-estado]");
    const si = fondo.querySelector("[data-si]"), no = fondo.querySelector("[data-no]");
    no.onclick = cerrar;
    fondo.addEventListener("click", (e) => { if (e.target === fondo && !si.disabled) cerrar(); });
    si.onclick = async () => {
      si.disabled = no.disabled = true;
      try {
        await pedir(a, blobs, tipo, estado);
        estado.style.color = "#4ade80";
        estado.textContent = "✅ Borrador creado. Revísalo y confírmalo en Redes Sociales › Stories.";
        setTimeout(cerrar, 3500);
      } catch (e) {
        estado.style.color = "#f87171";
        estado.textContent = e.message;
        si.disabled = no.disabled = false;
      }
    };
    document.body.appendChild(fondo);
    si.focus();
  }

  // tipo: "resultados" | "proximos"
  window.nvaOfrecerStory = function (blob, tipo) {
    if (!blob || !/^image\//.test(blob.type) || !ajustes()) return;
    cola.push(blob);
    tipoCola = tipo === "proximos" ? "proximos" : "resultados";
    clearTimeout(espera);
    espera = setTimeout(preguntar, 1200);
  };
})();
