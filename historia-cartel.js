/* =====================================================================
   Story desde el cartel (Partidos.html y Resultados.html)
   Al descargar un cartel pregunta si se quiere crear una Story con él.
   Si se acepta, sube la imagen a Reels/historias/<id>/origen/ y escribe
   Reels/solicitud_historia.json (igual que «Stories · borradores»).
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
    return { token: ig.token, user: gh.user, repo: gh.repo };
  }

  const api = (a, path) => `https://api.github.com/repos/${a.user}/${a.repo}/contents/${path}`;
  const hdr = (a) => ({ "Authorization": `token ${a.token}`, "Content-Type": "application/json" });

  function aBase64(blob) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => mal(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function put(a, path, content, msg) {
    let sha = "";
    const g = await fetch(api(a, path), { headers: hdr(a), cache: "no-store" });
    if (g.ok) sha = (await g.json()).sha;
    const r = await fetch(api(a, path), { method: "PUT", headers: hdr(a),
      body: JSON.stringify({ message: msg, content, ...(sha && { sha }) }) });
    if (!r.ok) throw new Error(`No se ha podido guardar en GitHub (${r.status}).`);
  }

  async function pedir(a, blobs, tipo, estado) {
    const id = Date.now().toString(36);
    const rutas = [];
    for (let i = 0; i < blobs.length; i++) {
      estado.textContent = `Subiendo imagen ${i + 1} de ${blobs.length}…`;
      const ruta = `${DIR_H}/${id}/origen/${String(i + 1).padStart(2, "0")}.jpg`;
      await put(a, ruta, await aBase64(blobs[i]), `Imagen ${i + 1} de las stories ${id}`);
      rutas.push(ruta);
    }
    estado.textContent = "Pidiendo la story…";
    const sol = { id, tipo, imagenes: rutas, pedido: new Date().toISOString() };
    await put(a, "Reels/solicitud_historia.json",
      btoa(unescape(encodeURIComponent(JSON.stringify(sol, null, 2)))), `Pedir stories ${id}`);
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
        <div style="font-size:.9rem; line-height:1.4;">${n > 1 ? `Se crea un borrador de Story con estas ${n} imágenes.` : "Se crea un borrador de Story con esta imagen."} No se publica nada hasta que lo confirmes en «Stories · borradores».</div>
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
        estado.textContent = "✅ Pedida. El borrador aparecerá en «Stories · borradores» en unos minutos.";
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
