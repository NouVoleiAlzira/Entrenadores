/* =====================================================================
   Editor de Stories (index.html, Partidos.html y Resultados.html)
   La imagen se publica SIN modificar: solo se coloca en un lienzo
   1080×1920 y el hueco se rellena con los colores del borde de la imagen.
   Se puede hacer zoom (también alejar) y moverla.
   Los borradores se guardan directamente en GitHub:
     Reels/historias/<id>/origen/NN.jpg   imagen original
     Reels/historias/<id>/historia_NN.jpg lienzo final
     Reels/historias/<id>/meta.json       ajustes, duración y estado
   ===================================================================== */
(function () {
  "use strict";

  const W = 1080, H = 1920;
  const DIR_H = "Reels/historias";
  const Z_MIN = 0.4, Z_MAX = 4;
  const AJUSTE_INICIAL = { z: 1, cx: 0.5, cy: 0.5 };   // z = 1: la imagen entera cabe en el lienzo

  function cargarImagen(blob) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se ha podido leer la imagen.")); };
      img.src = url;
    });
  }

  // Color medio de una franja de la imagen (para que el relleno encaje con su fondo)
  function colorMedio(img, sx, sy, sw, sh) {
    const c = document.createElement("canvas");
    c.width = 24; c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, sx, sy, Math.max(1, sw), Math.max(1, sh), 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  }

  function colores(img) {
    if (img._nvaColores) return img._nvaColores;
    const w = img.naturalWidth, h = img.naturalHeight, f = Math.max(2, Math.round(h * 0.04)), fw = Math.max(2, Math.round(w * 0.04));
    img._nvaColores = {
      arriba: colorMedio(img, 0, 0, w, f), abajo: colorMedio(img, 0, h - f, w, f),
      izq: colorMedio(img, 0, 0, fw, h), der: colorMedio(img, w - fw, 0, fw, h)
    };
    return img._nvaColores;
  }

  // Dibuja la story en un contexto de tamaño W×H (o escalado)
  function dibujar(ctx, img, a, escala) {
    const cw = W * escala, ch = H * escala, col = colores(img);
    const fondo = ctx.createLinearGradient(0, 0, 0, ch);
    fondo.addColorStop(0, col.arriba); fondo.addColorStop(1, col.abajo);
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, cw, ch);
    const base = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * base * a.z, dh = img.naturalHeight * base * a.z;
    const x = a.cx * cw - dw / 2, y = a.cy * ch - dh / 2;
    // Bandas laterales con el color de cada lado si la imagen no llega a los bordes
    if (x > 0) { ctx.fillStyle = col.izq; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, x, ch); ctx.fillStyle = col.der; ctx.fillRect(x + dw, 0, cw - x - dw, ch); ctx.globalAlpha = 1; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, dw, dh);
  }

  async function componer(blob, ajuste) {
    const img = await cargarImagen(blob);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    dibujar(c.getContext("2d"), img, Object.assign({}, AJUSTE_INICIAL, ajuste || {}), 1);
    return new Promise((ok, mal) => c.toBlob(b => b ? ok(b) : mal(new Error("No se ha podido preparar la story.")), "image/jpeg", 0.92));
  }

  // Abre el editor. Devuelve { blob, ajuste } o null si se cancela.
  async function editar(blob, ajuste) {
    const img = await cargarImagen(blob);
    const a = Object.assign({}, AJUSTE_INICIAL, ajuste || {});
    return new Promise((resolver) => {
      const capa = document.createElement("div");
      capa.setAttribute("role", "dialog");
      capa.setAttribute("aria-modal", "true");
      capa.style.cssText = "position:fixed; inset:0; z-index:100010; background:rgba(5,12,35,.88); display:flex; align-items:center; justify-content:center; padding:12px;";
      capa.innerHTML = `
        <div style="background:#0f1d4a; color:#e9eefa; border:1px solid rgba(255,255,255,.15); border-radius:14px; width:100%; max-width:340px; max-height:100%; overflow:auto; padding:14px; display:flex; flex-direction:column; gap:10px; font-family:inherit;">
          <div style="font-weight:800; font-size:1.05rem; color:#fff;">🔍 Encaja la story</div>
          <canvas data-v style="width:100%; max-width:260px; align-self:center; aspect-ratio:9/16; border-radius:10px; touch-action:none; cursor:grab; box-shadow:0 4px 18px rgba(0,0,0,.4);"></canvas>
          <label style="display:flex; align-items:center; gap:8px; font-size:.9rem;">➖
            <input type="range" data-z min="${Z_MIN}" max="${Z_MAX}" step="0.01" value="${a.z}" style="flex:1;">➕</label>
          <small style="font-size:.8rem; opacity:.85;">Arrastra la imagen y usa la barra para acercar o alejar. La imagen no se cambia: el hueco se rellena con los colores de su fondo.</small>
          <div style="display:flex; gap:8px;">
            <button type="button" data-e="reset" style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:transparent; color:#fff; font:inherit; font-weight:700; cursor:pointer;">↺ Encajar</button>
            <button type="button" data-e="no" style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:transparent; color:#fff; font:inherit; font-weight:700; cursor:pointer;">Cancelar</button>
            <button type="button" data-e="si" style="flex:1.4; padding:10px; border-radius:10px; border:0; background:#16a34a; color:#fff; font:inherit; font-weight:700; cursor:pointer;">✅ Usar</button>
          </div>
        </div>`;
      document.body.appendChild(capa);
      const lienzo = capa.querySelector("[data-v]"), zoom = capa.querySelector("[data-z]");
      let escala = 0.25;
      const pintar = () => {
        const r = lienzo.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        escala = (r.width || 240) * dpr / W;
        lienzo.width = Math.round(W * escala); lienzo.height = Math.round(H * escala);
        dibujar(lienzo.getContext("2d"), img, a, escala);
      };
      const cambiarZoom = (nuevo) => { a.z = Math.min(Z_MAX, Math.max(Z_MIN, nuevo)); zoom.value = String(a.z); pintar(); };
      zoom.oninput = () => cambiarZoom(+zoom.value);
      lienzo.addEventListener("wheel", (e) => { e.preventDefault(); cambiarZoom(a.z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)); }, { passive: false });
      const dedos = new Map();
      let distancia = 0;
      lienzo.addEventListener("pointerdown", (e) => { lienzo.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
      lienzo.addEventListener("pointermove", (e) => {
        const antes = dedos.get(e.pointerId);
        if (!antes) return;
        dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (dedos.size === 2) {
          const [p, q] = [...dedos.values()], dist = Math.hypot(p.x - q.x, p.y - q.y);
          if (distancia) cambiarZoom(a.z * dist / distancia);
          distancia = dist;
          return;
        }
        const r = lienzo.getBoundingClientRect();
        a.cx += (e.clientX - antes.x) / r.width; a.cy += (e.clientY - antes.y) / r.height;
        a.cx = Math.min(1.5, Math.max(-0.5, a.cx)); a.cy = Math.min(1.5, Math.max(-0.5, a.cy));
        pintar();
      });
      const soltar = (e) => { dedos.delete(e.pointerId); distancia = 0; };
      lienzo.addEventListener("pointerup", soltar);
      lienzo.addEventListener("pointercancel", soltar);
      const cerrar = (v) => { window.removeEventListener("resize", pintar); capa.remove(); resolver(v); };
      window.addEventListener("resize", pintar);
      capa.querySelector('[data-e="reset"]').onclick = () => { Object.assign(a, AJUSTE_INICIAL); cambiarZoom(1); };
      capa.querySelector('[data-e="no"]').onclick = () => cerrar(null);
      capa.querySelector('[data-e="si"]').onclick = async () => {
        try { cerrar({ blob: await componer(blob, a), ajuste: Object.assign({}, a) }); }
        catch (e) { alert(e.message); }
      };
      requestAnimationFrame(pintar);
    });
  }

  // Las imágenes muy grandes se reducen (sin recortar) antes de guardarlas
  async function reducir(blob) {
    const img = await cargarImagen(blob);
    const k = Math.min(1, 2160 / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && blob.type === "image/jpeg") return blob;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok, mal) => c.toBlob(b => b ? ok(b) : mal(new Error("No se ha podido leer la imagen.")), "image/jpeg", 0.92));
  }

  /* ---------- GitHub ---------- */
  function gh(cfg) {
    const url = (p) => `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${p}`;
    const h = (extra) => Object.assign({ "Authorization": `token ${cfg.token}` }, extra || {});
    const b64 = (blob) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => mal(r.error); r.readAsDataURL(blob); });
    async function sha(p) { const g = await fetch(url(p), { headers: h(), cache: "no-store" }); return g.ok ? (await g.json()).sha : ""; }
    async function put(p, content, msg) {
      const s = await sha(p);
      const r = await fetch(url(p), { method: "PUT", headers: h({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message: msg, content, ...(s && { sha: s }) }) });
      if (!r.ok) throw new Error(`No se ha podido guardar en GitHub (${r.status}).`);
    }
    return {
      async json(p) {
        const r = await fetch(url(p), { headers: h({ "Accept": "application/vnd.github.raw" }), cache: "no-store" });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`GitHub ${r.status}`);
        return r.json();
      },
      async blob(p) {
        const r = await fetch(url(p), { headers: h({ "Accept": "application/vnd.github.raw" }), cache: "no-store" });
        if (!r.ok) throw new Error(`GitHub ${r.status}`);
        return new Blob([await r.blob()], { type: "image/jpeg" });
      },
      putJson: (p, obj, msg) => put(p, btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2)))), msg),
      putBlob: async (p, blob, msg) => put(p, await b64(blob), msg)
    };
  }

  // imagenes: [{ blob (original), ajuste? }]  datos: { tipo, titulo?, desde?, hasta? }
  async function crearBorrador(cfg, imagenes, datos, avisar) {
    const g = gh(cfg), id = Date.now().toString(36), carpeta = `${DIR_H}/${id}`;
    const historias = [], ajustes = {}, origenes = {};
    const lista = imagenes.slice(0, 10);
    for (let i = 0; i < lista.length; i++) {
      const nn = String(i + 1).padStart(2, "0"), nombre = `historia_${nn}.jpg`;
      if (avisar) avisar(`Subiendo imagen ${i + 1} de ${lista.length}…`);
      const original = await reducir(lista[i].blob);
      const ajuste = Object.assign({}, AJUSTE_INICIAL, lista[i].ajuste || {});
      await g.putBlob(`${carpeta}/origen/${nn}.jpg`, original, `Story ${id}: imagen ${i + 1}`);
      await g.putBlob(`${carpeta}/${nombre}`, lista[i].final || await componer(original, ajuste), `Story ${id}: story ${i + 1}`);
      historias.push(nombre); ajustes[nombre] = ajuste; origenes[nombre] = `origen/${nn}.jpg`;
    }
    if (avisar) avisar("Guardando el borrador…");
    const meta = { id, tipo: datos.tipo || "evento", titulo: datos.titulo || "", desde: datos.desde || "", hasta: datos.hasta || "",
      creado: new Date().toISOString(), pedidoPor: cfg.login || "", estado: "borrador", historias, ajustes, origenes, duracion: 5 };
    await g.putJson(`${carpeta}/meta.json`, meta, `Borrador de stories ${id}`);
    const idx = (await g.json(`${DIR_H}/indice.json`)) || { historias: [] };
    idx.historias = (idx.historias || []).filter(h => h.id !== id);
    idx.historias.unshift({ id, tipo: meta.tipo, titulo: meta.titulo, desde: meta.desde, hasta: meta.hasta, creado: meta.creado, estado: "borrador", n: historias.length });
    await g.putJson(`${DIR_H}/indice.json`, idx, `Borrador de stories ${id}`);
    return id;
  }

  window.nvaStory = { componer, editar, crearBorrador, gh, AJUSTE_INICIAL, DURACIONES: [5, 7, 10, 15, 20, 30] };
})();
