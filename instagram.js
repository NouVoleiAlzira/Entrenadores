/* =====================================================================
   Sección Instagram
   - Se activa en cada dispositivo desde Opciones › Instagram poniendo el
     «token de Instagram»: el de la cuenta de GitHub que el club ha
     invitado como colaboradora al repositorio privado (no el token común
     de los entrenadores, que es de la cuenta propietaria).
   - Al activarlo se comprueba con GitHub que el token es válido, que puede
     escribir en el repositorio y que NO es de la cuenta propietaria.
   - El token se guarda solo en este dispositivo y se usará únicamente
     para las acciones de Instagram (borradores y publicación).
   OJO: esto solo muestra u oculta la sección. Quien impide de verdad que
   otros publiquen es el Action, que comprueba la cuenta que lo pide.
   ===================================================================== */
(function () {
  "use strict";

  const IG_KEY = "NVA_IG_SETTINGS";   // { token, login }
  try { localStorage.removeItem("NVA_IG_ENABLED"); } catch (e) { /* versión anterior, con contraseña */ }

  function loadIg() {
    try { return JSON.parse(localStorage.getItem(IG_KEY)) || null; } catch (e) { return null; }
  }

  function saveIg(data) {
    try {
      if (data) localStorage.setItem(IG_KEY, JSON.stringify(data));
      else localStorage.removeItem(IG_KEY);
    } catch (e) { console.warn(e); }
    applyVisibility();
  }

  function applyVisibility() {
    const ig = loadIg();
    // La sección Redes Sociales (con Carteles) se ve siempre; Reels y Stories solo con el token
    const solo = document.getElementById("igSoloToken");
    if (solo) solo.hidden = !ig;
    const sin = document.getElementById("igSinToken");
    if (sin) sin.hidden = !!ig;
    const off = document.getElementById("igConfigOff");
    const on = document.getElementById("igConfigOn");
    if (off) off.hidden = !!ig;
    if (on) on.hidden = !ig;
    const who = document.getElementById("igConfigLogin");
    if (who) who.textContent = ig ? ig.login : "";
  }

  // Comprueba el token con GitHub. Devuelve { login } o lanza un Error con
  // un mensaje para el usuario. err.authFailed indica token caducado o sin acceso.
  async function checkIgToken(token) {
    if (!ghSettings.user || !ghSettings.repo) {
      throw new Error("Primero configura el repositorio en Opciones › Conexión GitHub.");
    }
    const headers = { "Authorization": `token ${token}`, "Accept": "application/vnd.github+json" };
    const fail = (msg) => { const e = new Error(msg); e.authFailed = true; return e; };

    const userRes = await fetch("https://api.github.com/user", { headers, cache: "no-store" });
    if (userRes.status === 401) throw fail("El token de Instagram no es válido o ha caducado.");
    if (!userRes.ok) throw new Error(`GitHub ha respondido con un error (${userRes.status}).`);
    const login = (await userRes.json()).login || "";

    if (login.toLowerCase() === ghSettings.user.toLowerCase()) {
      throw fail("Ese token es de la cuenta del club (la de los entrenadores). Usa el token de la cuenta de Instagram.");
    }

    const repoRes = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}`, { headers, cache: "no-store" });
    if (repoRes.status === 401) throw fail("El token de Instagram no es válido o ha caducado.");
    if (repoRes.status === 403 || repoRes.status === 404) {
      throw fail(`La cuenta ${login} no tiene acceso al repositorio. Comprueba que ha aceptado la invitación.`);
    }
    if (!repoRes.ok) throw new Error(`GitHub ha respondido con un error (${repoRes.status}).`);
    const perms = (await repoRes.json()).permissions || {};
    if (!perms.push) throw fail(`La cuenta ${login} puede ver el repositorio pero no escribir en él.`);

    return { login };
  }

  async function igActivate() {
    const input = document.getElementById("igTokenInput");
    const token = input.value.trim();
    if (!token) { alert("Pega el token de Instagram."); return; }
    if (!navigator.onLine) { alert("Hace falta conexión a internet para comprobar el token."); return; }
    try {
      const { login } = await checkIgToken(token);
      input.value = "";
      saveIg({ token, login });
      alert(`Instagram activado en este dispositivo (cuenta ${login}).`);
    } catch (err) {
      console.error(err);
      alert(err.message || "No se ha podido comprobar el token.");
    }
  }

  function igDeactivate() {
    if (!confirm("¿Quitar el token de Instagram de este dispositivo? Reels y Stories dejarán de verse.")) return;
    saveIg(null);
  }

  // Al abrir la app se vuelve a comprobar el token guardado: si ha caducado
  // o ya no tiene acceso se ocultan Reels y Stories. Sin conexión se deja como está.
  async function recheckStoredToken() {
    const ig = loadIg();
    if (!ig || !navigator.onLine || !ghSettings.user || !ghSettings.repo) return;
    try {
      await checkIgToken(ig.token);
    } catch (err) {
      if (!err.authFailed) return;
      saveIg(null);
      alert(`Se han desactivado Reels y Stories: ${err.message}`);
    }
  }

  // Subsecciones plegables de Redes Sociales (mismo aspecto que las del calendario)
  const SUBS_KEY = "NVA_IG_SUBS";
  function subsState() { try { return JSON.parse(localStorage.getItem(SUBS_KEY)) || {}; } catch (e) { return {}; } }
  function applySub(id, open) {
    const head = document.getElementById("igSubHead_" + id), body = document.getElementById("igSub_" + id);
    if (!head || !body) return;
    head.classList.toggle("collapsed", !open); body.classList.toggle("collapsed", !open);
    head.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function igToggleSub(id) {
    const body = document.getElementById("igSub_" + id);
    if (!body) return;
    const open = body.classList.contains("collapsed"), st = subsState();
    st[id] = open;
    try { localStorage.setItem(SUBS_KEY, JSON.stringify(st)); } catch (e) { /* sin almacenamiento */ }
    applySub(id, open);
  }
  const st0 = subsState();
  ["carteles", "reels", "stories"].forEach(id => applySub(id, st0[id] !== false));
  ["reelsPub", "storiesPub"].forEach(id => applySub(id, st0[id] === true));   // «Publicados» empieza plegado
  window.igToggleSub = igToggleSub;

  window.igActivate = igActivate;
  window.igDeactivate = igDeactivate;
  window.igGetToken = () => (loadIg() || {}).token || null;

  applyVisibility();
  window.addEventListener("load", () => setTimeout(recheckStoredToken, 1500));
})();

/* =====================================================================
   Reels · borradores
   El Action «Generar reels» deja cada reel en Reels/borradores/<id>/
   (reel.mp4, portada.jpg, meta.json) y la lista en indice.json.
   Aquí se ven, se edita el texto y una persona los CONFIRMA. Nada se
   publica sin esa confirmación: confirmar escribe Reels/publicar.json.
   Todo se hace con el token de Instagram (el Action comprueba la cuenta).
   ===================================================================== */
(function () {
  "use strict";

  const DIR = "Reels/borradores";
  const ESTADOS = { previa: "🖼️ Previa · falta crear el vídeo", borrador: "📝 Borrador", confirmado: "✅ Confirmado · pendiente de publicar", publicado: "📲 Publicado", descartado: "🗑️ Descartado", error: "⚠️ Error al publicar" };
  const TIPOS = { resultados: "🏆 Resultados de la semana", proximos: "📅 Próximos partidos", actividad: "📸 Actividad", evento: "📸 Evento" };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (s) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}`; };
  const videos = {};   // id -> objectURL ya descargado

  const api = (path) => `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${path}`;
  const hdr = (extra) => Object.assign({ "Authorization": `token ${window.igGetToken()}` }, extra || {});

  async function getJson(path) {
    const r = await fetch(api(path), { headers: hdr({ "Accept": "application/vnd.github.raw" }), cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return r.json();
  }

  async function putJson(path, obj, msg) {
    let sha = "";
    const g = await fetch(api(path), { headers: hdr(), cache: "no-store" });
    if (g.ok) sha = (await g.json()).sha;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
    const r = await fetch(api(path), { method: "PUT", headers: hdr({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: msg, content, ...(sha && { sha }) }) });
    if (!r.ok) throw new Error(`No se ha podido guardar en GitHub (${r.status}).`);
  }

  async function blobUrl(path) {
    const r = await fetch(api(path), { headers: hdr({ "Accept": "application/vnd.github.raw" }), cache: "no-store" });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    // El tipo hace falta para que el móvil (sobre todo iPhone) reproduzca el vídeo
    const tipo = /\.mp4$/.test(path) ? "video/mp4" : /\.jpe?g$/.test(path) ? "image/jpeg" : "";
    const datos = await r.blob();
    return URL.createObjectURL(tipo ? new Blob([datos], { type: tipo }) : datos);
  }

  function box() { return document.getElementById("igReelsList"); }

  const OCULTOS = ["descartado", "eliminado"];

  // Tarjeta de un reel o de unas stories. papelera: solo en los publicados
  function tarjeta(b, titulo, detalle, papelera) {
    return `
        <div class="ig-reel" data-id="${esc(b.id)}">
          <div class="ig-reel-head">
            <img class="ig-portada" alt="" data-src="${esc(b.id)}">
            <div style="flex:1; min-width:0;"><b>${titulo}</b><br><small>${detalle}</small><br>
              <span class="ig-estado ig-${esc(b.estado)}">${ESTADOS[b.estado] || esc(b.estado)}</span></div>
            ${papelera ? `<button type="button" class="ig-papelera" title="Borrar" aria-label="Borrar" style="flex:none; align-self:flex-start; border:0; background:transparent; font-size:1.3rem; cursor:pointer; padding:4px;">🗑️</button>` : ""}
          </div>
          <button class="btn-pdf-mode ig-abrir" style="width:100%; margin:8px 0 0; background:var(--azul-primary); color:#fff;">${b.estado === "borrador" ? "👀 REVISAR Y CONFIRMAR" : b.estado === "previa" ? "👀 VER PREVIA" : "👀 VER"}</button>
          <div class="ig-detalle" hidden></div>
        </div>`;
  }

  // Quita un reel o unas stories publicadas de la app (estado «eliminado»)
  async function eliminar(dir, clave, id, recargar) {
    if (!confirm("¿Borrar de la app? Desaparece de esta lista. Si también quieres quitarlo de Instagram, bórralo desde Instagram (en «👀 VER» tienes el enlace cuando lo hay).")) return;
    try {
      const meta = (await getJson(`${dir}/${id}/meta.json`)) || {};
      meta.estado = "eliminado";
      await putJson(`${dir}/${id}/meta.json`, meta, `Borrar ${id} de la app`);
      const idx = (await getJson(`${dir}/indice.json`)) || {};
      (idx[clave] || []).forEach(b => { if (b.id === id) b.estado = "eliminado"; });
      await putJson(`${dir}/indice.json`, idx, `Borrar ${id} de la app`);
    } catch (e) { alert(e.message); }
    recargar();
  }

  async function cargar() {
    const el = box(), pub = document.getElementById("igReelsPub");
    if (!el || !window.igGetToken()) return;
    el.innerHTML = `<p class="ig-info">Cargando borradores…</p>`;
    try {
      const idx = await getJson(`${DIR}/indice.json`);
      const todos = ((idx && idx.borradores) || []).filter(b => !OCULTOS.includes(b.estado));
      const det = (b) => b.tipo === "evento" ? `${esc(b.titulo || "")} · ${b.fotos || 0} fotos` : `${fmt(b.desde)} – ${fmt(b.hasta)} · ${b.partidos || 0} partidos`;
      const borr = todos.filter(b => b.estado !== "publicado").slice(0, 12), publ = todos.filter(b => b.estado === "publicado").slice(0, 30);
      el.innerHTML = borr.length ? borr.map(b => tarjeta(b, TIPOS[b.tipo] || esc(b.tipo), det(b), false)).join("")
        : `<p class="ig-info">No hay borradores pendientes. Se crean solos el lunes a las 18:00 (resultados) y el martes a las 21:00 (próximos partidos), o con los botones de arriba.</p>`;
      if (pub) pub.innerHTML = publ.length ? publ.map(b => tarjeta(b, TIPOS[b.tipo] || esc(b.tipo), det(b), true)).join("") : `<p class="ig-info">Todavía no hay reels publicados.</p>`;
      [el, pub].filter(Boolean).forEach(cont => {
        cont.querySelectorAll(".ig-portada").forEach(async img => {
          try { img.src = await blobUrl(`${DIR}/${img.dataset.src}/portada.jpg`); } catch (e) { img.remove(); }
        });
        cont.querySelectorAll(".ig-abrir").forEach(btn => btn.onclick = () => abrir(btn.closest(".ig-reel")));
        cont.querySelectorAll(".ig-papelera").forEach(btn => btn.onclick = () => eliminar(DIR, "borradores", btn.closest(".ig-reel").dataset.id, cargar));
      });
    } catch (e) {
      console.error(e);
      el.innerHTML = `<p class="ig-info">No se han podido leer los borradores (${esc(e.message)}).</p>`;
    }
  }

  async function abrir(card) {
    const id = card.dataset.id, det = card.querySelector(".ig-detalle");
    if (!det.hidden) { det.hidden = true; return; }
    det.hidden = false;
    det.innerHTML = `<p class="ig-info">Descargando el vídeo…</p>`;
    try {
      const meta = await getJson(`${DIR}/${id}/meta.json`);
      if (meta.estado === "previa") return abrirPrevia(id, meta, det);
      const vk = id + "|" + (meta.version || "");   // al cambiar el estilo el vídeo es otro
      if (!videos[vk]) videos[vk] = await blobUrl(`${DIR}/${id}/reel.mp4`);
      videos[id] = videos[vk];
      const editable = meta.estado === "borrador";
      det.innerHTML = `
        <video class="ig-video" src="${videos[id]}" controls playsinline preload="metadata"></video>
        <p class="ig-info ig-video-err" hidden style="color:#b91c1c;">Este navegador no puede reproducir el vídeo aquí. Descárgalo para verlo.</p>
        <a class="ig-info" href="${videos[id]}" download="reel-${esc(id)}.mp4">⬇️ Descargar el vídeo</a>
        <label class="ig-label">Texto del post${editable ? " (puedes cambiarlo)" : ""}</label>
        <textarea class="ig-texto" rows="8" ${editable ? "" : "readonly"}>${esc(meta.texto)}</textarea>
        <small class="ig-info">Música: ${esc(meta.musica || "sin música")}${meta.confirmadoPor ? ` · Confirmado por ${esc(meta.confirmadoPor)}` : ""}</small>
        ${editable ? `<button class="btn-save-session ig-estilo" style="width:100%; margin-top:10px; background:#7c3aed;">🎨 Cambiar estilo</button>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn-save-session ig-descartar" style="flex:1; background:#64748b;">🗑️ Descartar</button>
          <button class="btn-save-session ig-confirmar" style="flex:2;">✅ Confirmar y publicar</button></div>` : ""}`;
      const v = det.querySelector(".ig-video");
      v.onerror = () => { det.querySelector(".ig-video-err").hidden = false; console.error("Vídeo", v.error); };
      if (meta.enlace) det.insertAdjacentHTML("beforeend", `<p class="ig-info"><a href="${esc(meta.enlace)}" target="_blank" rel="noopener">📲 Ver en Instagram</a></p>`);
      if (meta.estado === "error") {
        det.insertAdjacentHTML("beforeend", `<p class="ig-info" style="color:#b91c1c;">${esc(meta.error)}</p>
          <button class="btn-save-session ig-reintentar" style="width:100%;">🔁 Reintentar publicación</button>`);
        det.querySelector(".ig-reintentar").onclick = () => { meta.estado = "borrador"; confirmar(id, meta); };
      }
      if (!editable) return;
      det.querySelector(".ig-descartar").onclick = () => cambiarEstado(id, meta, "descartado");
      det.querySelector(".ig-estilo").onclick = async () => {
        const estilo = await elegirEstilo(meta.estilo, "🎨 Rehacer la previa");
        if (!estilo) return;
        try {
          await putJson("Reels/solicitud.json", { id: Date.now().toString(36), tipo: "regenerar", borrador: id, estilo,
            texto: det.querySelector(".ig-texto").value.trim(), pedido: new Date().toISOString() }, `Cambiar estilo del reel ${id}`);
          det.hidden = true;
          alert("Pedido. Se rehará la previa con el nuevo estilo en unos minutos (pulsa 🔄 para actualizar). Después tendrás que crear el vídeo otra vez.");
        } catch (e) { alert(e.message); }
      };
      det.querySelector(".ig-confirmar").onclick = () => {
        meta.texto = det.querySelector(".ig-texto").value.trim();
        confirmar(id, meta);
      };
    } catch (e) {
      console.error(e);
      det.innerHTML = `<p class="ig-info">No se ha podido abrir el borrador (${esc(e.message)}).</p>`;
    }
  }

  // Previa: las diapositivas dibujadas, antes de montar el vídeo
  async function abrirPrevia(id, meta, det) {
    const n = meta.slides || 0;
    det.innerHTML = `
      <p class="ig-info">Así quedan las diapositivas. Si te gustan, crea el vídeo; si no, cambia el estilo.</p>
      <div class="ig-slides" style="display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; scroll-snap-type:x mandatory;">
        ${Array.from({ length: n }, (_, i) => `<img data-i="${i + 1}" alt="Diapositiva ${i + 1}" style="flex:0 0 auto; width:46%; aspect-ratio:9/16; object-fit:cover; border-radius:8px; background:#0b163a; scroll-snap-align:start; cursor:zoom-in;">`).join("")}
      </div>
      <label class="ig-label">Texto del post (puedes cambiarlo)</label>
      <textarea class="ig-texto" rows="6">${esc(meta.texto)}</textarea>
      <button class="btn-save-session ig-estilo" style="width:100%; margin-top:10px; background:#7c3aed;">🎨 Cambiar estilo</button>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn-save-session ig-descartar" style="flex:1; background:#64748b;">🗑️ Descartar</button>
        <button class="btn-save-session ig-video" style="flex:2; background:var(--btn-fondoVerde);">🎬 Crear vídeo</button></div>`;
    det.querySelectorAll(".ig-slides img").forEach(async img => {
      try {
        img.src = await blobUrl(`${DIR}/${id}/slides/${String(img.dataset.i).padStart(2, "0")}.jpg`);
        img.onclick = () => window.open(img.src, "_blank");
      } catch (e) { img.alt = "No disponible"; }
    });
    const texto = () => det.querySelector(".ig-texto").value.trim();
    det.querySelector(".ig-descartar").onclick = () => cambiarEstado(id, meta, "descartado");
    det.querySelector(".ig-estilo").onclick = async () => {
      const estilo = await elegirEstilo(meta.estilo, "🎨 Rehacer la previa");
      if (!estilo) return;
      await pedirSobreBorrador({ tipo: "regenerar", borrador: id, estilo, texto: texto() }, `Cambiar estilo del reel ${id}`,
        "Pedido. La previa se rehará con el nuevo estilo en unos minutos (pulsa 🔄 para actualizar).", det);
    };
    det.querySelector(".ig-video").onclick = async () => {
      await pedirSobreBorrador({ tipo: "video", borrador: id, texto: texto() }, `Crear vídeo del reel ${id}`,
        "Pedido. El vídeo estará listo en unos minutos (pulsa 🔄 para actualizar).", det);
    };
  }

  async function pedirSobreBorrador(datos, msg, aviso, det) {
    try {
      await putJson("Reels/solicitud.json", Object.assign({ id: Date.now().toString(36), pedido: new Date().toISOString() }, datos), msg);
      det.hidden = true;
      alert(aviso);
    } catch (e) { alert(e.message); }
  }

  async function cambiarEstado(id, meta, estado, extra) {
    if (estado === "descartado" && !confirm("¿Descartar este borrador? No se publicará.")) return;
    try {
      Object.assign(meta, { estado }, extra || {});
      await putJson(`${DIR}/${id}/meta.json`, meta, `Reel ${id}: ${estado}`);
      const idx = (await getJson(`${DIR}/indice.json`)) || { borradores: [] };
      (idx.borradores || []).forEach(b => { if (b.id === id) b.estado = estado; });
      await putJson(`${DIR}/indice.json`, idx, `Reel ${id}: ${estado}`);
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    } finally {
      cargar();
    }
  }

  async function confirmar(id, meta) {
    if (!meta.texto) { alert("Escribe el texto del post."); return; }
    if (!confirm("¿Has visto el vídeo y el texto? Al confirmar se publicará en el Instagram del club.")) return;
    const quien = (JSON.parse(localStorage.getItem("NVA_IG_SETTINGS") || "{}").login) || "";
    const ahora = new Date().toISOString();
    const ok = await cambiarEstado(id, meta, "confirmado", { confirmadoPor: quien, confirmadoEn: ahora });
    if (!ok) return;
    try {
      await putJson("Reels/publicar.json", { id, texto: meta.texto, confirmadoPor: quien, pedido: ahora }, `Publicar reel ${id}`);
      alert("Confirmado. El reel se publicará en Instagram en unos minutos.");
    } catch (e) { alert(e.message); }
  }

  /* ---------- Estilo del reel: portada, partidos y despedida (tipo, duración, animación) y colores ----------
     Las miniaturas están en reels-estilos/<parte>-<plantilla>.jpg. «auto» = al azar (lo decide el Action). */
  const ESTILO_KEY = "NVA_REEL_ESTILO";
  const PLANTILLAS = [["auto", "🎲 Al azar"], ["pancarta", "Pancarta"], ["rasgado", "Rasgado"], ["impacto", "Impacto"], ["diagonal", "Diagonal"],
                      ["franjas", "Franjas"], ["pista", "Pista"], ["corte", "Corte"], ["foco", "Foco"], ["editorial", "Crónica"], ["marcador", "Marcador"]];
  const ANIM_TXT = { portada: "Animación de inicio", partido: "Transición entre partidos", cierre: "Animación final" };
  const ANIM_DEF = { portada: "fade", partido: "slideleft", cierre: "fade" };
  const PARTES = [["portada", "Portada", [2, 2.5, 3, 4, 5], 3], ["partido", "Partidos y fotos", [2, 2.5, 3, 3.2, 4, 5, 6], 3.2],
                  ["cierre", "Despedida", [2, 2.5, 3, 4, 5], 3]];
  const ANIMACIONES = [["slideleft", "Deslizar"], ["fade", "Desvanecer"], ["fadeblack", "Fundido a negro"], ["dissolve", "Disolver"],
                       ["hblur", "Desenfoque"], ["zoomin", "Zoom"], ["circleopen", "Círculo"], ["pixelize", "Píxeles"]];
  // v85: un solo estilo para todo el reel; cada estilo trae sus colores y todos se pueden cambiar
  const COLORES_TXT = { ac: "Acento", ac2: "Acento 2", fondo: "Fondo", texto: "Texto" };
  const COLORES_DEF = {
    auto: { ac: "#f5c518", fondo: "#0b163a", texto: "#ecf0fa" },
    pancarta: { ac: "#ffd400", fondo: "#1840c8", texto: "#ecf0fa" },
    rasgado: { ac: "#b5e61d", fondo: "#0e0e0e", texto: "#ecf0fa" },
    impacto: { ac: "#e21c28", fondo: "#101012", texto: "#ecf0fa" },
    diagonal: { ac: "#ffc400", ac2: "#6221f5", fondo: "#0a1640", texto: "#ecf0fa" },
    franjas: { ac: "#d0141e", fondo: "#161616", texto: "#ecf0fa" },
    pista: { ac: "#f5c518", fondo: "#0b163a", texto: "#ecf0fa" },
    corte: { ac: "#ff7a45", fondo: "#0b163a", texto: "#ecf0fa" },
    foco: { ac: "#57aedf", fondo: "#0b163a", texto: "#ecf0fa" },
    editorial: { ac: "#ff7a45" },
    marcador: { ac: "#ff7a45", fondo: "#0b163a", texto: "#ecf0fa" },
  };

  function estiloGuardado() {
    try { return JSON.parse(localStorage.getItem(ESTILO_KEY)) || {}; } catch (e) { return {}; }
  }

  // Devuelve una promesa con el estilo elegido, o null si se cancela
  function elegirEstilo(inicial, textoBoton) {
    const e = JSON.parse(JSON.stringify(inicial || estiloGuardado()));
    PARTES.forEach(([k, , , dur]) => { e[k] = Object.assign({ dur }, e[k] || {}); e[k].anim = e[k].anim || ANIM_DEF[k]; });
    e.tipo = e.tipo || (e.partido && e.partido.tipo) || "auto";
    e.colores = e.colores || {};
    document.getElementById("modalIgEstilo")?.remove();
    document.body.insertAdjacentHTML("beforeend", `
  <div class="modal-backdrop active" id="modalIgEstilo" style="z-index:3000;">
    <div class="modal-box" style="max-width:460px; max-height:92vh; overflow:auto;">
      <div class="modal-header">
        <div class="modal-title">🎨 Estilo del reel</div>
        <button class="btn-close-modal" type="button" data-est="cancelar">✕</button>
      </div>
      <label class="ig-label">Estilo (para todo el reel)</label>
      <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; margin-bottom:10px;">
        ${PLANTILLAS.map(([g, n]) => `<button type="button" class="ig-plantilla" data-g="${g}"
          style="flex:0 0 auto; width:70px; padding:3px; border-radius:8px; border:2px solid #cbd5e1; background:#fff; cursor:pointer; color:#1e293b;">
          ${g === "auto" ? `<div style="height:124px; display:flex; align-items:center; justify-content:center; font-size:28px; background:#f1f5f9; border-radius:5px;">🎲</div>`
            : `<img src="reels-estilos/partido-${g}.jpg" alt="" loading="lazy" style="width:100%; height:124px; object-fit:cover; border-radius:5px; display:block;">`}
          <small style="display:block; font-size:11px; margin-top:2px;">${g === "auto" ? "Al azar" : n}</small></button>`).join("")}
      </div>
      <label class="ig-label">Colores del estilo</label>
      <div id="igEstColores" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:4px;"></div>
      <small class="ig-info" id="igEstColInfo"></small>
      <label class="ig-label" style="margin-top:10px;">Música</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <span id="igEstMusica" style="flex:1; min-width:0; font-size:.85rem; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
        <button type="button" data-est="musica" style="border:1px solid #cbd5e1; background:#fff; border-radius:8px; padding:4px 10px; cursor:pointer; color:#1e293b;">🎵 Elegir</button>
      </div>
      ${PARTES.map(([k, nombre, durs]) => `
      <div class="ig-est-parte" data-parte="${k}" style="margin-top:10px;">
        <label class="ig-label">${nombre}</label>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <small>Duración</small>
          <select class="app-input ig-est-dur" style="width:auto; padding:4px 8px;">${durs.map(d => `<option value="${d}">${String(d).replace(".", ",")} s</option>`).join("")}</select>
          <small>${ANIM_TXT[k]}</small>
          <select class="app-input ig-est-anim" style="width:auto; padding:4px 8px;">${ANIMACIONES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select>
        </div>
      </div>`).join("")}
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn-save-session" type="button" data-est="cancelar" style="flex:1; background:#64748b;">Cancelar</button>
        <button class="btn-save-session" type="button" data-est="ok" style="flex:2;">${textoBoton || "🎬 Generar reel"}</button>
      </div>
    </div>
  </div>`);
    const m = document.getElementById("modalIgEstilo");
    const pintarColores = () => {
      const def = COLORES_DEF[e.tipo] || COLORES_DEF.auto;
      m.querySelector("#igEstColores").innerHTML = Object.keys(def).map(c => {
        const v = e.colores[c] || def[c];
        return `<label style="display:flex; flex-direction:column; align-items:center; gap:2px; font-size:11px; color:#334155; cursor:pointer;">
          <span style="position:relative; width:38px; height:38px; border-radius:50%; border:2px solid ${e.colores[c] ? "#2563eb" : "#cbd5e1"}; background:${v};">
            <input type="color" class="ig-col" data-c="${c}" value="${v}" style="position:absolute; inset:0; opacity:0; cursor:pointer;"></span>
          ${COLORES_TXT[c]}</label>`;
      }).join("") + (Object.keys(e.colores).length ? `<button type="button" data-est="colreset" style="align-self:center; border:1px solid #cbd5e1; background:#fff; border-radius:8px; padding:4px 8px; cursor:pointer; color:#1e293b;">↺ Originales</button>` : "");
      m.querySelector("#igEstColInfo").textContent = e.tipo === "auto" ? "Con 🎲 el estilo se elige al azar; los colores que cambies se aplican igual."
        : e.tipo === "editorial" ? "«Crónica» usa siempre fondo de papel y texto oscuro." : "Toca un color para cambiarlo.";
    };
    const marcar = () => {
      m.querySelectorAll(".ig-plantilla").forEach(b => {
        const si = b.dataset.g === e.tipo;
        b.style.borderColor = si ? "#2563eb" : "#cbd5e1"; b.style.boxShadow = si ? "0 0 0 2px #93c5fd" : "none";
      });
      m.querySelectorAll(".ig-est-parte").forEach(div => {
        const k = div.dataset.parte, sel = div.querySelector(".ig-est-dur");
        if (![...sel.options].some(o => +o.value === +e[k].dur)) sel.insertAdjacentHTML("beforeend", `<option value="${e[k].dur}">${e[k].dur} s</option>`);
        sel.value = String(+e[k].dur);
        div.querySelector(".ig-est-anim").value = e[k].anim;
      });
      pintarColores();
      m.querySelector("#igEstMusica").textContent = textoMusica(e.musica);
    };
    marcar();
    return new Promise(resolve => {
      const fin = (v) => { m.remove(); resolve(v); };
      m.addEventListener("click", (ev) => {
        if (ev.target === m) return fin(null);
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.est === "cancelar") return fin(null);
        if (b.dataset.est === "colreset") { e.colores = {}; return marcar(); }
        if (b.dataset.est === "musica") { elegirMusica(e.musica).then(mu => { if (mu !== undefined) { e.musica = mu; marcar(); } }); return; }
        if (b.dataset.est === "ok") {
          PARTES.forEach(([k]) => { e[k].tipo = e.tipo; });
          e.acento = e.colores.ac || ""; e.fondo = e.colores.fondo || "";
          try { localStorage.setItem(ESTILO_KEY, JSON.stringify(e)); } catch (x) { /* sin almacenamiento */ }
          return fin(e);
        }
        if (b.classList.contains("ig-plantilla")) { if (e.tipo !== b.dataset.g) e.colores = {}; e.tipo = b.dataset.g; marcar(); }
      });
      m.addEventListener("change", (ev) => {
        const t = ev.target, parte = t.closest(".ig-est-parte")?.dataset.parte;
        if (t.classList.contains("ig-est-dur")) e[parte].dur = +t.value;
        else if (t.classList.contains("ig-est-anim")) e[parte].anim = t.value;
        else if (t.classList.contains("ig-col")) e.colores[t.dataset.c] = t.value;
        marcar();
      });
    });
  }


  /* ---------- Música (v89): elegir canción de Reels/musica y el segundo en que empieza ----------
     El catálogo lo escribe el Action «Descargar música» (Reels/musica/catalogo.json). */
  const DIR_M = "Reels/musica";
  const audios = {};   // archivo -> objectURL
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  // Devuelve una promesa: {archivo, titulo, inicio, duracion}, null = al azar, undefined = cancelar
  function elegirMusica(inicial, sinMusica) {
    let sel = inicial && inicial.archivo ? Object.assign({}, inicial) : null;
    document.getElementById("modalIgMusica")?.remove();
    document.body.insertAdjacentHTML("beforeend", `
  <div class="modal-backdrop active" id="modalIgMusica" style="z-index:3100;">
    <div class="modal-box" style="max-width:440px; max-height:92vh; overflow:auto;">
      <div class="modal-header">
        <div class="modal-title">🎵 Música</div>
        <button class="btn-close-modal" type="button" data-mu="cancelar">✕</button>
      </div>
      <div id="igMuLista" style="display:flex; flex-direction:column; gap:6px; max-height:42vh; overflow:auto;"><p class="ig-info">Cargando canciones…</p></div>
      <div id="igMuInicio" style="margin-top:10px;" hidden>
        <label class="ig-label">Momento de la canción: empieza en <b id="igMuSeg">0:00</b></label>
        <input type="range" id="igMuRango" min="0" max="0" step="0.5" value="0" style="width:100%;">
        <button class="btn-save-session" type="button" data-mu="escuchar" style="width:100%; margin-top:6px; background:var(--azul-primary);">▶️ Escuchar desde aquí</button>
      </div>
      <small class="ig-info" id="igMuEstado"></small>
      <button type="button" data-mu="mas" style="display:block; width:100%; margin-top:8px; border:1px dashed #94a3b8; background:#fff; color:#1e293b; border-radius:10px; padding:8px; cursor:pointer;">⬇️ Descargar más canciones libres</button>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn-save-session" type="button" data-mu="cancelar" style="flex:1; background:#64748b;">Cancelar</button>
        <button class="btn-save-session" type="button" data-mu="ok" style="flex:2;">✅ Usar esta música</button>
      </div>
    </div>
  </div>`);
    const m = document.getElementById("modalIgMusica");
    const audio = new Audio();
    let canciones = [], paraEn = null;
    const parar = () => { audio.pause(); clearTimeout(paraEn); m.querySelectorAll("[data-play]").forEach(b => b.textContent = "▶️"); };
    const pintar = () => {
      const lista = m.querySelector("#igMuLista");
      lista.innerHTML = [`<label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; border:2px solid ${sel ? "#e2e8f0" : "#2563eb"}; cursor:pointer; color:#1e293b;">
          <input type="radio" name="igMu" value="" ${sel ? "" : "checked"}> <span style="flex:1;">${sinMusica ? "🔇 Sin música" : "🎲 Al azar"}</span></label>`]
        .concat(canciones.map(c => `<label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; border:2px solid ${sel && sel.archivo === c.archivo ? "#2563eb" : "#e2e8f0"}; cursor:pointer; color:#1e293b;">
          <input type="radio" name="igMu" value="${esc(c.archivo)}" ${sel && sel.archivo === c.archivo ? "checked" : ""}>
          <button type="button" data-play="${esc(c.archivo)}" title="Escuchar" style="border:0; background:#eef2ff; border-radius:50%; width:32px; height:32px; cursor:pointer;">▶️</button>
          <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(c.titulo)}</span>
          <small style="color:#64748b;">${c.duracion ? mmss(c.duracion) : ""}</small></label>`)).join("");
      const ini = m.querySelector("#igMuInicio");
      ini.hidden = !sel;
      if (sel) {
        const c = canciones.find(x => x.archivo === sel.archivo) || sel;
        const r = m.querySelector("#igMuRango");
        r.max = String(Math.max(0, Math.floor((c.duracion || sel.duracion || 60) - 10)));
        r.value = String(sel.inicio || 0);
        m.querySelector("#igMuSeg").textContent = mmss(+r.value);
      }
    };
    async function sonar(archivo, desde, segundos) {
      parar();
      const est = m.querySelector("#igMuEstado");
      try {
        if (!audios[archivo]) { est.textContent = "Descargando la canción…"; audios[archivo] = await blobUrl(`${DIR_M}/${archivo}`); }
        est.textContent = "";
        audio.src = audios[archivo];
        audio.currentTime = desde || 0;
        await audio.play();
        const b = m.querySelector(`[data-play="${CSS.escape(archivo)}"]`); if (b) b.textContent = "⏸️";
        if (segundos) paraEn = setTimeout(parar, segundos * 1000);
      } catch (e) { est.textContent = `No se puede reproducir (${e.message}).`; }
    }
    getJson(`${DIR_M}/catalogo.json`).then(cat => {
      canciones = (cat && cat.canciones) || [];
      if (!canciones.length) m.querySelector("#igMuEstado").textContent = "Aún no hay canciones guardadas. Pulsa «Descargar más canciones libres».";
      pintar();
    }).catch(e => { m.querySelector("#igMuEstado").textContent = `No se ha podido leer el catálogo (${e.message}).`; pintar(); });
    return new Promise(resolve => {
      const fin = (v) => { parar(); m.remove(); resolve(v); };
      m.addEventListener("click", async (ev) => {
        if (ev.target === m) return fin(undefined);
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.play) {
          ev.preventDefault();
          if (!audio.paused && audio.src === audios[b.dataset.play]) return parar();
          return sonar(b.dataset.play, sel && sel.archivo === b.dataset.play ? sel.inicio : 0);
        }
        const mu = b.dataset.mu;
        if (mu === "cancelar") return fin(undefined);
        if (mu === "ok") return fin(sel);
        if (mu === "escuchar" && sel) return sonar(sel.archivo, sel.inicio || 0, 15);
        if (mu === "mas") {
          b.disabled = true;
          try {
            await putJson(`${DIR_M}/solicitud.json`, { max: 20, pedido: new Date().toISOString() }, "Pedir más música");
            m.querySelector("#igMuEstado").textContent = "Pedido. En unos minutos aparecerán más canciones; vuelve a abrir esta ventana.";
          } catch (e) { m.querySelector("#igMuEstado").textContent = e.message; b.disabled = false; }
        }
      });
      m.addEventListener("change", (ev) => {
        const t = ev.target;
        if (t.name === "igMu") {
          const c = canciones.find(x => x.archivo === t.value);
          if (c) { if (!sel || sel.archivo !== c.archivo) sel = ({ archivo: c.archivo, titulo: c.titulo, duracion: c.duracion, inicio: 0 }); }
          else sel = null;
          parar(); pintar();
        }
        if (t.id === "igMuRango" && sel) { sel.inicio = +t.value; m.querySelector("#igMuSeg").textContent = mmss(sel.inicio); }
      });
      m.addEventListener("input", (ev) => {
        if (ev.target.id === "igMuRango" && sel) { sel.inicio = +ev.target.value; m.querySelector("#igMuSeg").textContent = mmss(sel.inicio); }
      });
    });
  }
  const textoMusica = (mu) => mu && mu.archivo ? `${mu.titulo || mu.archivo} · desde ${mmss(mu.inicio || 0)}` : "🎲 Al azar";

  /* ---------- Menú «Generar ahora» (resultados, próximos o evento manual) ---------- */
  const MAX_FOTOS = 10;
  let fotosEvento = [];   // [{ blob, url }]
  let dictado = null;

  function crearMenu() {
    if (document.getElementById("modalIgGenerar")) return;
    document.body.insertAdjacentHTML("beforeend", `
  <div class="modal-backdrop" id="modalIgGenerar">
    <div class="modal-box" style="max-width: 420px;">
      <div class="modal-header">
        <div class="modal-title" id="igGenTitulo">¿Qué reel quieres generar?</div>
        <button class="btn-close-modal" type="button" data-ig="cerrar">✕</button>
      </div>
      <div id="igGenMenu" style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn-save-session" type="button" data-ig="resultados">🏆 Resultados de la semana</button>
        <button class="btn-save-session" type="button" data-ig="proximos" style="background:var(--azul-primary);">📅 Próximos partidos</button>
        <button class="btn-save-session" type="button" data-ig="evento" style="background:var(--btn-fondoVerde);">📸 Evento manual</button>
      </div>
      <div id="igGenResultados" hidden>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <label style="flex:1; font-size:0.75rem; color:#475569;">Desde<input type="date" id="igResDesde" class="app-input" style="margin-top:2px;"></label>
          <label style="flex:1; font-size:0.75rem; color:#475569;">Hasta<input type="date" id="igResHasta" class="app-input" style="margin-top:2px;"></label>
        </div>
        <p class="ig-info" id="igResInfo"></p>
        <div id="igResLista" style="display:flex; flex-direction:column; gap:6px; max-height:46vh; overflow:auto;"></div>
        <small class="ig-info" id="igResEstado"></small>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session" type="button" data-ig="volver" style="flex:1; background:#64748b;">← Volver</button>
          <button class="btn-save-session" type="button" id="igResPedir" style="flex:2;">🎬 Generar reel</button>
        </div>
      </div>
      <div id="igGenCarteles" hidden>
        <p class="ig-info">Primero genera y descarga los carteles en <b>Redes Sociales › Carteles</b> (Partidos o Resultados de la semana, «Carga automática»). Después elígelos aquí: cada cartel será una story y saldrá entero, sin cambios. Toca una miniatura para acercarla, alejarla o moverla.</p>
        <label class="btn-save-session" style="display:block; text-align:center; cursor:pointer; margin-bottom:6px; background:var(--btn-fondoVerde);">🖼️ Elegir carteles (JPG)
          <input type="file" id="igCartFotos" accept="image/*" multiple hidden></label>
        <div id="igCartMiniaturas" style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;"></div>
        <small class="ig-info" id="igCartEstado"></small>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session" type="button" data-ig="cerrar" style="flex:1; background:#64748b;">Cancelar</button>
          <button class="btn-save-session" type="button" id="igCartPedir" style="flex:2;">📲 Generar stories</button>
        </div>
      </div>
      <div id="igGenEvento" hidden>
        <label class="ig-label" for="igEvTitulo">Título</label>
        <input type="text" id="igEvTitulo" class="app-input" maxlength="40" placeholder="Ej.: Challenge NVA">
        <label class="ig-label" for="igEvTexto" id="igEvTextoLabel">¿De qué va el reel?</label>
        <textarea id="igEvTexto" class="app-input" rows="4" placeholder="Cuenta un poco qué pasó: qué, dónde, cuándo, quién…"></textarea>
        <button class="btn-save-session" type="button" id="igEvVoz" style="width:100%; margin:6px 0; background:var(--azul-primary);">🎤 Dictar con la voz</button>
        <label class="ig-label">Fotos (hasta ${MAX_FOTOS})</label>
        <label class="btn-save-session" style="display:block; text-align:center; cursor:pointer; margin-bottom:6px; background:var(--btn-fondoVerde);">🖼️ Elegir fotos
          <input type="file" id="igEvFotos" accept="image/*" multiple hidden></label>
        <div id="igEvMiniaturas" style="display:grid; grid-template-columns:repeat(5,1fr); gap:4px;"></div>
        <small class="ig-info" id="igEvEstado"></small>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session" type="button" data-ig="volver" style="flex:1; background:#64748b;">← Volver</button>
          <button class="btn-save-session" type="button" id="igEvPedir" style="flex:2;">🎬 Generar reel</button>
        </div>
      </div>
    </div>
  </div>`);
    const m = document.getElementById("modalIgGenerar");
    m.addEventListener("click", (e) => {
      if (e.target === m) return cerrarMenu();
      const b = e.target.closest("[data-ig]");
      if (!b) return;
      const a = b.dataset.ig;
      if (a === "cerrar") cerrarMenu();
      else if (a === "volver") { if (destino === "historia") cerrarMenu(); else verPaso("menu"); }
      else if (a === "evento") verPaso("evento");
      else if (a === "resultados") prepararResultados();
      else pedirPartidos(a);
    });
    document.getElementById("igEvFotos").onchange = (e) => { anadirFotos(e.target.files); e.target.value = ""; };
    document.getElementById("igEvPedir").onclick = pedirEvento;
    document.getElementById("igResPedir").onclick = pedirResultados;
    ["igResDesde", "igResHasta"].forEach(i => document.getElementById(i).onchange = () => {
      const d = document.getElementById("igResDesde").value, h = document.getElementById("igResHasta").value;
      if (d && h && d <= h) cargarResultados({ desde: d, hasta: h });
    });
    document.getElementById("igCartFotos").onchange = (e) => { anadirCarteles(e.target.files); e.target.value = ""; };
    document.getElementById("igCartPedir").onclick = pedirCarteles;
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voz = document.getElementById("igEvVoz");
    if (!Rec) { voz.hidden = true; voz.dataset.sinVoz = "1"; }
    else voz.onclick = () => alternarDictado(Rec, voz);
  }

  function verPaso(paso) {
    document.getElementById("igGenMenu").style.display = paso === "menu" ? "flex" : "none";
    document.getElementById("igGenEvento").hidden = paso !== "evento";
    document.getElementById("igGenResultados").hidden = paso !== "resultados";
    document.getElementById("igGenCarteles").hidden = paso !== "carteles";
    const historia = destino === "historia";
    document.getElementById("igGenTitulo").textContent = {
      menu: "¿Qué reel quieres generar?", evento: historia ? "📸 Stories" : "📸 Evento manual",
      resultados: "🏆 Fotos de los partidos",
      carteles: tipoCarteles === "proximos" ? "📅 Stories de próximos partidos" : "🏆 Stories de resultados" }[paso];
    document.getElementById("igEvTextoLabel").textContent = historia ? "Notas (no salen en la story)" : "¿De qué va el reel?";
    document.getElementById("igEvMiniaturas").style.gridTemplateColumns = historia ? "repeat(4,1fr)" : "repeat(5,1fr)";
    if (fotosEvento.length && fotosEvento.destino && fotosEvento.destino !== destino) { fotosEvento.forEach(f => URL.revokeObjectURL(f.url)); fotosEvento = []; pintarFotos(); }
    fotosEvento.destino = destino;
    // En stories solo se eligen fotos: sin título, texto ni dictado
    ["igEvTitulo", "igEvTexto", "igEvTextoLabel"].forEach(i => { document.getElementById(i).style.display = historia ? "none" : ""; });
    document.querySelector('label[for="igEvTitulo"]').style.display = historia ? "none" : "";
    const voz = document.getElementById("igEvVoz");
    voz.hidden = historia || voz.dataset.sinVoz === "1";
    document.getElementById("igEvPedir").textContent = historia ? "📲 Generar stories" : "🎬 Generar reel";
    if (paso !== "evento") pararDictado();
  }

  function cerrarMenu() {
    pararDictado();
    document.getElementById("modalIgGenerar").classList.remove("active");
  }

  function alternarDictado(Rec, boton) {
    if (dictado) { pararDictado(); return; }
    const area = document.getElementById("igEvTexto");
    const previo = area.value ? area.value.replace(/\s*$/, " ") : "";
    dictado = new Rec();
    dictado.lang = "es-ES"; dictado.continuous = true; dictado.interimResults = true;
    dictado.onresult = (ev) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      area.value = previo + t;
    };
    dictado.onerror = (ev) => {
      if (ev.error === "not-allowed") alert("El navegador no deja usar el micrófono. Revisa los permisos.");
    };
    dictado.onend = () => { dictado = null; boton.textContent = "🎤 Dictar con la voz"; };
    dictado.start();
    boton.textContent = "⏹️ Parar de dictar";
  }

  function pararDictado() { if (dictado) dictado.stop(); }

  /* ---------- Encuadre de la foto (zoom y posición) antes de añadirla ----------
     La foto sale en el reel en formato 4:5 y ningún texto ni color se pone encima,
     así que lo que se ve en este marco es exactamente lo que saldrá. */
  const FOTO_W = 1080, FOTO_H = 1350;

  // ancho × alto: 1080×1350 (4:5) para las fotos de eventos, 1200×900 (4:3) para las de los partidos
  function encuadrar(file, FOTO_W = 1080, FOTO_H = 1350) {
    return new Promise((resolver) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); alert(`No se ha podido leer ${file.name}`); resolver(null); };
      img.onload = () => {
        const capa = document.createElement("div");
        capa.style.cssText = "position:fixed; inset:0; z-index:10000; background:rgba(5,12,35,.86); display:flex; align-items:center; justify-content:center; padding:16px;";
        capa.innerHTML = `
          <div class="modal-box" style="max-width:380px; width:100%;">
            <div class="modal-header"><div class="modal-title">🔍 Ajusta la foto</div></div>
            <div class="ig-marco" style="position:relative; width:100%; aspect-ratio:${FOTO_W}/${FOTO_H}; overflow:hidden; border-radius:10px; background:#0b163a; touch-action:none; cursor:grab;">
              <img alt="" draggable="false" style="position:absolute; left:0; top:0; transform-origin:0 0; user-select:none; max-width:none;">
            </div>
            <label class="ig-label" style="display:flex; align-items:center; gap:8px; margin-top:10px;">➖
              <input type="range" class="ig-zoom" min="0.4" max="4" step="0.01" value="1" style="flex:1;">➕</label>
            <small class="ig-info">Arrastra la foto para encuadrarla y usa la barra (o pellizca) para acercar o alejar. Si la alejas, el hueco se rellena con la misma foto desenfocada. Lo que ves en el marco es lo que saldrá en el reel.</small>
            <div style="display:flex; gap:8px; margin-top:10px;">
              <button class="btn-save-session" type="button" data-e="no" style="flex:1; background:#64748b;">Cancelar</button>
              <button class="btn-save-session" type="button" data-e="si" style="flex:2;">✅ Usar foto</button>
            </div>
          </div>`;
        document.body.appendChild(capa);
        const marco = capa.querySelector(".ig-marco"), vista = marco.querySelector("img"), zoom = capa.querySelector(".ig-zoom");
        vista.src = url;
        marco.style.backgroundImage = `url("${url}")`; marco.style.backgroundSize = "cover"; marco.style.backgroundPosition = "center";
        marco.insertAdjacentHTML("afterbegin", `<div style="position:absolute; inset:0; backdrop-filter:blur(14px) brightness(.7); -webkit-backdrop-filter:blur(14px) brightness(.7);"></div>`);
        let FW = 0, FH = 0, base = 1, z = 1, ox = 0, oy = 0;
        const limitar = () => {
          const dw = img.naturalWidth * base * z, dh = img.naturalHeight * base * z;
          ox = dw <= FW ? (FW - dw) / 2 : Math.min(0, Math.max(FW - dw, ox));
          oy = dh <= FH ? (FH - dh) / 2 : Math.min(0, Math.max(FH - dh, oy));
        };
        const pintar = () => { limitar(); vista.style.transform = `translate(${ox}px, ${oy}px) scale(${base * z})`; };
        const medir = () => {
          const r = marco.getBoundingClientRect();
          const cx = FW ? (FW / 2 - ox) / (base * z) : img.naturalWidth / 2, cy = FH ? (FH / 2 - oy) / (base * z) : img.naturalHeight / 2;
          FW = r.width; FH = r.height;
          base = Math.max(FW / img.naturalWidth, FH / img.naturalHeight);
          ox = FW / 2 - cx * base * z; oy = FH / 2 - cy * base * z;
          pintar();
        };
        const cambiarZoom = (nuevo, px = FW / 2, py = FH / 2) => {   // zoom manteniendo fijo el punto (px, py)
          nuevo = Math.min(4, Math.max(0.4, nuevo));
          const k = nuevo / z;
          ox = px - (px - ox) * k; oy = py - (py - oy) * k; z = nuevo; zoom.value = String(z);
          pintar();
        };
        zoom.oninput = () => cambiarZoom(+zoom.value);
        marco.addEventListener("wheel", (e) => {
          e.preventDefault();
          const r = marco.getBoundingClientRect();
          cambiarZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
        }, { passive: false });
        const dedos = new Map();
        let distancia = 0;
        marco.addEventListener("pointerdown", (e) => { marco.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); marco.style.cursor = "grabbing"; });
        marco.addEventListener("pointermove", (e) => {
          const antes = dedos.get(e.pointerId);
          if (!antes) return;
          dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (dedos.size === 2) {   // pellizco con dos dedos
            const [a, b] = [...dedos.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y), r = marco.getBoundingClientRect();
            if (distancia) cambiarZoom(z * dist / distancia, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
            distancia = dist;
            return;
          }
          ox += e.clientX - antes.x; oy += e.clientY - antes.y;
          pintar();
        });
        const soltar = (e) => { dedos.delete(e.pointerId); distancia = 0; marco.style.cursor = "grab"; };
        marco.addEventListener("pointerup", soltar);
        marco.addEventListener("pointercancel", soltar);
        const cerrar = (blob) => { window.removeEventListener("resize", medir); capa.remove(); URL.revokeObjectURL(url); resolver(blob); };
        window.addEventListener("resize", medir);
        capa.querySelector('[data-e="no"]').onclick = () => cerrar(null);
        capa.querySelector('[data-e="si"]').onclick = () => {
          const c = document.createElement("canvas");
          c.width = FOTO_W; c.height = FOTO_H;
          const k = FOTO_W / FW, ctx = c.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          if (z < 1) {   // foto alejada: el hueco, con la misma foto desenfocada y oscurecida
            const s = Math.max(FOTO_W / img.naturalWidth, FOTO_H / img.naturalHeight);
            ctx.fillStyle = "#0b163a"; ctx.fillRect(0, 0, FOTO_W, FOTO_H);
            ctx.filter = "blur(28px) brightness(0.7)";
            ctx.drawImage(img, (FOTO_W - img.naturalWidth * s) / 2, (FOTO_H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
            ctx.filter = "none";
          }
          ctx.drawImage(img, ox * k, oy * k, img.naturalWidth * base * z * k, img.naturalHeight * base * z * k);
          c.toBlob(b => b ? cerrar(b) : alert("No se ha podido preparar la foto."), "image/jpeg", 0.88);
        };
        requestAnimationFrame(medir);
      };
      img.src = url;
    });
  }

  async function anadirFotos(files) {
    const libres = MAX_FOTOS - fotosEvento.length;
    const lista = Array.from(files || []).filter(f => f.type.startsWith("image/"));
    if (lista.length > libres) alert(`Como mucho ${MAX_FOTOS} fotos. Se añaden las ${libres} primeras.`);
    for (const f of lista.slice(0, libres)) {
      if (destino === "historia") { try { await anadirStory(fotosEvento, f); } catch (e) { alert(e.message); } continue; }
      const blob = await encuadrar(f);
      if (blob) fotosEvento.push({ blob, url: URL.createObjectURL(blob) });
    }
    pintarFotos();
  }

  function pintarFotos() {
    const el = document.getElementById("igEvMiniaturas");
    if (destino === "historia") return miniaturasStory(el, fotosEvento, pintarFotos);
    el.innerHTML = fotosEvento.map((f, i) => `
      <div style="position:relative; aspect-ratio:4/5;">
        <img src="${f.url}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">
        <button type="button" data-quitar="${i}" aria-label="Quitar foto" style="position:absolute; top:2px; right:2px; border:0; border-radius:50%; width:22px; height:22px; background:rgba(0,0,0,.65); color:#fff; cursor:pointer;">✕</button>
      </div>`).join("");
    el.querySelectorAll("[data-quitar]").forEach(b => b.onclick = () => {
      const [f] = fotosEvento.splice(+b.dataset.quitar, 1); URL.revokeObjectURL(f.url); pintarFotos();
    });
  }

  function aBase64(blob) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => mal(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function subirArchivo(path, blob, msg) {
    const r = await fetch(api(path), { method: "PUT", headers: hdr({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: msg, content: await aBase64(blob) }) });
    if (!r.ok) throw new Error(`No se ha podido subir la foto (${r.status}).`);
  }

  /* ---------- Resultados: antes de pedir el reel, fotos de los partidos que no tengan ---------- */
  // Mismo cálculo que el Action (generar_reel.py): partidos con resultado de la semana pasada
  const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const apos = (t) => String(t || "").replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'");
  const normT = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const parecido = (a, b) => { const x = normT(a), y = normT(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
  const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  let resPartidos = [];   // [{ id, equipo, rival, fecha, marcador, tiene, blob, url }]
  let resRango = null;

  function rangoResultados() {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const dom = new Date(hoy); dom.setDate(hoy.getDate() - ((hoy.getDay() + 7) % 7));   // domingo pasado (u hoy)
    const lun = new Date(dom); lun.setDate(dom.getDate() - 6);
    return { desde: isoDia(lun), hasta: isoDia(dom) };
  }

  function partidosConResultado(desde, hasta) {
    const cp = window.cpGetData ? window.cpGetData() : null;
    const out = [];
    Object.entries((cp && cp.teams) || {}).forEach(([clave, info]) => (info.matches || []).forEach(m => {
      if (!m.date || m.date < desde || m.date > hasta) return;
      const r = /\s(\d)\s*-\s*(\d)\s*\(/.exec(m.raw || "");
      if (!r) return;
      const rival = apos(m.rival);
      out.push({ id: `${clave}|${m.date}|${rival}`, equipo: clave.replace(/\s*\(.*\)\s*$/, ""), rival, fecha: m.date, marcador: `${r[1]}-${r[2]}` });
    }));
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  function rangoDeNombre(nombre) {   // "Resultados del 26 de septiembre al 4 de octubre del 2026.json"
    const t = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const y = (t.match(/\b(20\d\d)\b/) || [])[1];
    const dias = [...t.matchAll(/\b(\d{1,2}) de ([a-z]+)/g)].map(m => ({ d: +m[1], m: MESES_L.indexOf(m[2]) })).filter(x => x.m >= 0);
    if (!y || !dias.length) return null;
    const a = dias[0], b = dias[dias.length - 1];
    const iso = (yy, x) => `${yy}-${String(x.m + 1).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
    return { desde: iso(a.m > b.m ? +y - 1 : +y, a), hasta: iso(+y, b) };
  }

  // Fotos ya guardadas desde Resultados.html para esas fechas (el Action las usa solas)
  async function fotosGuardadas(desde, hasta) {
    const r = await fetch(api("PartidosyResultados"), { headers: hdr(), cache: "no-store" });
    if (!r.ok) return [];
    const archivos = ((await r.json()) || []).filter(a => a.type === "file" && /^Resultados.*\.json$/i.test(a.name))
      .filter(a => { const x = rangoDeNombre(a.name); return x && x.desde <= hasta && x.hasta >= desde; });
    const cards = [];
    for (const a of archivos) {
      try { ((await getJson(`PartidosyResultados/${a.name}`)) || {}).cards.forEach(c => { if (c.photo && c.photo.file) cards.push(c); }); }
      catch (e) { console.warn("No se ha podido leer", a.name, e); }
    }
    return cards;
  }

  function prepararResultados() {
    verPaso("resultados");
    document.getElementById("modalIgGenerar").classList.add("active");
    cargarResultados(rangoResultados());
  }

  // Partidos con resultado entre dos fechas; se conservan las fotos y casillas ya puestas
  async function cargarResultados(rango) {
    resRango = rango;
    document.getElementById("igResDesde").value = rango.desde;
    document.getElementById("igResHasta").value = rango.hasta;
    const antes = new Map(resPartidos.map(p => [p.id, p]));
    resPartidos = partidosConResultado(rango.desde, rango.hasta).map(p => {
      const v = antes.get(p.id);
      return v ? Object.assign(p, { blob: v.blob, url: v.url, sel: v.sel }) : Object.assign(p, { sel: true });
    });
    antes.forEach((v, id) => { if (v.url && !resPartidos.some(p => p.id === id)) URL.revokeObjectURL(v.url); });
    document.getElementById("igResInfo").textContent = "Buscando las fotos de los partidos…";
    document.getElementById("igResLista").innerHTML = "";
    if (!resPartidos.length) { pintarResultados(); return; }
    try {
      const cards = await fotosGuardadas(resRango.desde, resRango.hasta);
      resPartidos.forEach(p => {
        p.tiene = cards.some(c => (parecido(c.homeTeam, p.equipo) && parecido(c.awayTeam, p.rival)) ||
                                  (parecido(c.awayTeam, p.equipo) && parecido(c.homeTeam, p.rival)));
      });
    } catch (e) { console.warn(e); }
    if (resRango !== rango) return;   // se cambiaron las fechas mientras tanto
    pintarResultados();
  }

  function pintarResultados() {
    const sel = resPartidos.filter(p => p.sel), faltan = sel.filter(p => !p.tiene && !p.blob).length;
    document.getElementById("igResInfo").textContent = !resPartidos.length ? "No hay partidos con resultado entre esas fechas."
      : `${sel.length} de ${resPartidos.length} partidos en el reel. ` + (faltan
      ? `${faltan} sin foto: puedes añadirlas ahora (es opcional), saldrán en su diapositiva.` : "Todos tienen foto.");
    const el = document.getElementById("igResLista");
    el.innerHTML = resPartidos.map((p, i) => `
      <div style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:10px;${p.sel ? "" : " opacity:.5;"}">
        <input type="checkbox" data-sel="${i}" ${p.sel ? "checked" : ""} title="Incluir en el reel" style="width:20px; height:20px; flex:none; accent-color:#2563eb;">
        ${p.url ? `<img src="${p.url}" alt="" style="width:44px; height:44px; object-fit:cover; border-radius:6px;">` : ""}
        <div style="flex:1; min-width:0; font-size:0.78rem; color:#1e293b;"><b>${esc(p.equipo)}</b> ${esc(p.marcador)} ${esc(p.rival)}<br>
          <small style="color:#64748b;">${fmt(p.fecha)}${p.tiene ? " · 📸 ya tiene foto" : ""}</small></div>
        <label class="btn-save-session" style="width:auto; flex:none; white-space:nowrap; margin:0; padding:6px 10px; font-size:0.72rem; cursor:pointer; background:${p.tiene || p.blob ? "#64748b" : "var(--btn-fondoVerde)"};">
          ${p.blob ? "Cambiar" : p.tiene ? "Otra foto" : "➕ Foto"}<input type="file" accept="image/*" hidden data-res="${i}"></label>
      </div>`).join("");
    el.querySelectorAll("[data-sel]").forEach(c => c.onchange = () => { resPartidos[+c.dataset.sel].sel = c.checked; pintarResultados(); });
    el.querySelectorAll("[data-res]").forEach(inp => inp.onchange = async () => {
      const p = resPartidos[+inp.dataset.res], f = inp.files && inp.files[0];
      if (!f) return;
      inp.value = "";
      const blob = await encuadrar(f, 1200, 900);
      if (!blob) return;
      if (p.url) URL.revokeObjectURL(p.url);
      Object.assign(p, { blob, url: URL.createObjectURL(blob) });
      pintarResultados();
    });
  }

  async function pedirResultados() {
    const boton = document.getElementById("igResPedir"), estado = document.getElementById("igResEstado");
    const elegidos = resPartidos.filter(p => p.sel);
    if (!elegidos.length) { alert("Marca al menos un partido."); return; }
    const conFoto = elegidos.filter(p => p.blob);
    boton.disabled = true;
    const id = Date.now().toString(36);
    try {
      const fotos = {};
      for (let i = 0; i < conFoto.length; i++) {
        estado.textContent = `Subiendo foto ${i + 1} de ${conFoto.length}…`;
        const ruta = `Reels/fotos/${id}/foto_${String(i + 1).padStart(2, "0")}.jpg`;
        await subirArchivo(ruta, conFoto[i].blob, `Foto ${i + 1} del reel ${id}`);
        fotos[conFoto[i].id] = ruta;
      }
      estado.textContent = "";
      await pedirPartidos("resultados", { desde: resRango.desde, hasta: resRango.hasta, fotos, id, partidos: elegidos.map(p => p.id) });
    } catch (e) {
      estado.textContent = "";
      alert(e.message);
    } finally {
      boton.disabled = false;
    }
  }

  // Botones de la sección: resultados, próximos o evento manual (sin tipo, el menú con los tres)
  function generar(tipo) {
    crearMenu();
    destino = "reel";
    if (tipo === "proximos") { pedirPartidos("proximos"); return; }
    if (tipo === "resultados") { prepararResultados(); return; }
    verPaso(tipo === "evento" ? "evento" : "menu");
    document.getElementById("modalIgGenerar").classList.add("active");
  }

  async function pedirPartidos(tipo, extra) {
    const estilo = await elegirEstilo();
    if (!estilo) return;
    cerrarMenu();
    try {
      await putJson("Reels/solicitud.json", Object.assign({ id: Date.now().toString(36), tipo, estilo, pedido: new Date().toISOString() }, extra || {}),
        `Pedir reel ${tipo}`);
      alert("Pedido. La previa de las diapositivas aparecerá aquí en unos minutos (pulsa 🔄 para actualizar).");
    } catch (e) { alert(e.message); }
  }

  async function pedirEvento() {
    if (destino === "historia") return pedirEventoHistoria();
    const titulo = document.getElementById("igEvTitulo").value.trim();
    const texto = document.getElementById("igEvTexto").value.trim();
    if (!titulo) { alert("Pon un título al reel."); return; }
    if (!texto) { alert("Explica un poco de qué va el reel (puedes dictarlo)."); return; }
    if (!fotosEvento.length) { alert("Añade al menos una foto."); return; }
    pararDictado();
    const estilo = await elegirEstilo();
    if (!estilo) return;
    const boton = document.getElementById("igEvPedir"), estado = document.getElementById("igEvEstado");
    boton.disabled = true;
    const id = Date.now().toString(36);
    try {
      const fotos = [];
      for (let i = 0; i < fotosEvento.length; i++) {
        estado.textContent = `Subiendo foto ${i + 1} de ${fotosEvento.length}…`;
        const ruta = `Reels/eventos/${id}/foto_${String(i + 1).padStart(2, "0")}.jpg`;
        await subirArchivo(ruta, fotosEvento[i].blob, `Foto ${i + 1} del reel ${id}`);
        fotos.push(ruta);
      }
      estado.textContent = "Pidiendo el reel…";
      await putJson("Reels/solicitud.json", { id, tipo: "evento", titulo, descripcion: texto, fotos, estilo,
        pedido: new Date().toISOString() }, `Pedir reel de evento ${id}`);
      fotosEvento.forEach(f => URL.revokeObjectURL(f.url)); fotosEvento = []; pintarFotos();
      document.getElementById("igEvTitulo").value = ""; document.getElementById("igEvTexto").value = "";
      estado.textContent = "";
      cerrarMenu();
      alert("Pedido. La previa de las diapositivas aparecerá aquí en unos minutos (pulsa 🔄 para actualizar).");
    } catch (e) {
      estado.textContent = "";
      alert(e.message);
    } finally {
      boton.disabled = false;
    }
  }


  /* =====================================================================
     Stories · borradores
     Mismos botones que los reels. Resultados y Próximos usan los carteles
     (JPG) que se generan en Resultados.html y Partidos.html; el evento
     manual es el mismo formulario que el de los reels. La app sube las
     imágenes a Reels/historias/<id>/origen/ y escribe
     Reels/solicitud_historia.json; el Action «Generar stories» monta cada
     story (1080×1920) y deja el borrador. Confirmar escribe
     Reels/publicar.json con tipo «historia».
     ===================================================================== */
  const DIR_H = "Reels/historias";
  let destino = "reel";          // "reel" o "historia": a qué va el formulario del evento
  let tipoCarteles = "resultados";
  let carteles = [];             // [{ blob, url }]

  function rangoProximos() {      // mismo cálculo que el Action: de mañana al domingo siguiente
    const ini = new Date(); ini.setHours(12, 0, 0, 0); ini.setDate(ini.getDate() + 1);
    const fin = new Date(ini); fin.setDate(ini.getDate() + ((7 - ini.getDay()) % 7));
    if ((fin - ini) / 864e5 < 3) fin.setDate(fin.getDate() + 7);
    return { desde: isoDia(ini), hasta: isoDia(fin) };
  }

  function generarHistoria(tipo) {
    crearMenu();
    destino = "historia";
    if (tipo === "evento") verPaso("evento");
    else { tipoCarteles = tipo === "proximos" ? "proximos" : "resultados"; verPaso("carteles"); }
    document.getElementById("modalIgGenerar").classList.add("active");
  }

  // Stories: la imagen se publica tal cual, colocada en el lienzo 9:16 (editor en historia-editor.js)
  async function anadirStory(lista, file) {
    const story = window.nvaStory;
    const ajuste = Object.assign({}, story.AJUSTE_INICIAL);
    const final = await story.componer(file, ajuste);
    lista.push({ blob: file, ajuste, final, url: URL.createObjectURL(final) });
  }

  async function editarStory(item, repintar) {
    const r = await window.nvaStory.editar(item.blob, item.ajuste);
    if (!r) return;
    URL.revokeObjectURL(item.url);
    Object.assign(item, { ajuste: r.ajuste, final: r.blob, url: URL.createObjectURL(r.blob) });
    repintar();
  }

  async function anadirCarteles(files) {
    const libres = MAX_FOTOS - carteles.length;
    const lista = Array.from(files || []).filter(f => f.type.startsWith("image/"));
    if (lista.length > libres) alert(`Como mucho ${MAX_FOTOS} imágenes. Se añaden las ${libres} primeras.`);
    for (const f of lista.slice(0, libres)) {
      try { await anadirStory(carteles, f); } catch (e) { alert(e.message); }
    }
    pintarCarteles();
  }

  function miniaturasStory(el, lista, repintar) {
    el.innerHTML = lista.map((f, i) => `
      <div style="position:relative; aspect-ratio:9/16;">
        <img src="${f.url}" alt="" data-editar="${i}" title="Tocar para ajustar" style="width:100%; height:100%; object-fit:cover; border-radius:6px; cursor:pointer;">
        <button type="button" data-quitar="${i}" aria-label="Quitar" style="position:absolute; top:2px; right:2px; border:0; border-radius:50%; width:22px; height:22px; background:rgba(0,0,0,.65); color:#fff; cursor:pointer;">✕</button>
        <span style="position:absolute; bottom:3px; left:3px; font-size:.7rem; background:rgba(0,0,0,.6); color:#fff; border-radius:6px; padding:1px 5px; pointer-events:none;">✏️ Ajustar</span>
      </div>`).join("");
    el.querySelectorAll("[data-quitar]").forEach(b => b.onclick = () => {
      const [f] = lista.splice(+b.dataset.quitar, 1); URL.revokeObjectURL(f.url); repintar();
    });
    el.querySelectorAll("[data-editar]").forEach(im => im.onclick = () => editarStory(lista[+im.dataset.editar], repintar));
  }

  function pintarCarteles() {
    miniaturasStory(document.getElementById("igCartMiniaturas"), carteles, pintarCarteles);
  }

  async function subirYPedirHistoria(imagenes, datos, estado, boton) {
    boton.disabled = true;
    try {
      const ig = JSON.parse(localStorage.getItem("NVA_IG_SETTINGS") || "{}");
      await window.nvaStory.crearBorrador({ token: window.igGetToken(), user: ghSettings.user, repo: ghSettings.repo, login: ig.login || "" },
        imagenes, datos, (t) => { estado.textContent = t; });
      estado.textContent = "";
      cerrarMenu();
      alert("Borrador creado. Lo tienes en «Stories»: revísalo, elige la duración y pulsa «Confirmar y publicar».");
      cargarHistorias();
      return true;
    } catch (e) {
      estado.textContent = "";
      alert(e.message);
      return false;
    } finally {
      boton.disabled = false;
    }
  }

  async function pedirCarteles() {
    if (!carteles.length) { alert("Elige al menos un cartel."); return; }
    const r = tipoCarteles === "proximos" ? rangoProximos() : rangoResultados();
    const ok = await subirYPedirHistoria(carteles, { tipo: tipoCarteles, desde: r.desde, hasta: r.hasta },
      document.getElementById("igCartEstado"), document.getElementById("igCartPedir"));
    if (ok) { carteles.forEach(f => URL.revokeObjectURL(f.url)); carteles = []; pintarCarteles(); }
  }

  async function pedirEventoHistoria() {
    const titulo = document.getElementById("igEvTitulo").value.trim();
    const texto = document.getElementById("igEvTexto").value.trim();
    if (!fotosEvento.length) { alert("Añade al menos una foto."); return; }
    pararDictado();
    const ok = await subirYPedirHistoria(fotosEvento, { tipo: "evento", titulo, descripcion: texto },
      document.getElementById("igEvEstado"), document.getElementById("igEvPedir"));
    if (ok) {
      fotosEvento.forEach(f => URL.revokeObjectURL(f.url)); fotosEvento = []; pintarFotos();
      document.getElementById("igEvTitulo").value = ""; document.getElementById("igEvTexto").value = "";
    }
  }

  const TIPOS_H = { resultados: "🏆 Resultados", proximos: "📅 Próximos partidos", evento: "📸 Evento" };
  const fotosH = {};   // ruta -> objectURL

  async function cargarHistorias() {
    const el = document.getElementById("igStoriesList"), pub = document.getElementById("igStoriesPub");
    if (!el || !window.igGetToken()) return;
    el.innerHTML = `<p class="ig-info">Cargando borradores…</p>`;
    try {
      const idx = await getJson(`${DIR_H}/indice.json`);
      const todos = ((idx && idx.historias) || []).filter(b => !OCULTOS.includes(b.estado));
      const det = (b) => `${b.tipo === "evento" ? esc(b.titulo || "") : `${fmt(b.desde)} – ${fmt(b.hasta)}`} · ${b.n || 0} stories`;
      const borr = todos.filter(b => b.estado !== "publicado").slice(0, 12), publ = todos.filter(b => b.estado === "publicado").slice(0, 30);
      el.innerHTML = borr.length ? borr.map(b => tarjeta(b, TIPOS_H[b.tipo] || esc(b.tipo), det(b), false)).join("")
        : `<p class="ig-info">No hay borradores pendientes. Créalos con los botones de arriba.</p>`;
      if (pub) pub.innerHTML = publ.length ? publ.map(b => tarjeta(b, TIPOS_H[b.tipo] || esc(b.tipo), det(b), true)).join("") : `<p class="ig-info">Todavía no hay stories publicadas.</p>`;
      [el, pub].filter(Boolean).forEach(cont => {
        cont.querySelectorAll(".ig-portada").forEach(async img => {
          try { img.src = await blobUrl(`${DIR_H}/${img.dataset.src}/historia_01.jpg`); } catch (e) { img.remove(); }
        });
        cont.querySelectorAll(".ig-abrir").forEach(btn => btn.onclick = () => abrirHistoria(btn.closest(".ig-reel")));
        cont.querySelectorAll(".ig-papelera").forEach(btn => btn.onclick = () => eliminar(DIR_H, "historias", btn.closest(".ig-reel").dataset.id, cargarHistorias));
      });
    } catch (e) {
      console.error(e);
      el.innerHTML = `<p class="ig-info">No se han podido leer los borradores (${esc(e.message)}).</p>`;
    }
  }

  async function abrirHistoria(card) {
    const id = card.dataset.id, det = card.querySelector(".ig-detalle");
    if (!det.hidden) { det.hidden = true; return; }
    det.hidden = false;
    det.innerHTML = `<p class="ig-info">Descargando las stories…</p>`;
    try {
      const meta = await getJson(`${DIR_H}/${id}/meta.json`);
      const editable = meta.estado === "borrador" || meta.estado === "error";
      const puedeAjustar = editable && meta.estado === "borrador";
      for (const h of meta.historias || []) {
        const ruta = `${DIR_H}/${id}/${h}`;
        if (!fotosH[ruta]) fotosH[ruta] = await blobUrl(ruta);
      }
      const dur = meta.duracion || 5;
      det.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:8px;">
          ${(meta.historias || []).map(h => `<div style="position:relative;">
            <img src="${fotosH[`${DIR_H}/${id}/${h}`]}" alt="Story" data-h="${esc(h)}" style="width:100%; border-radius:8px; display:block; ${puedeAjustar ? "cursor:pointer;" : ""}">
            ${puedeAjustar ? `<span style="position:absolute; bottom:4px; left:4px; font-size:.7rem; background:rgba(0,0,0,.6); color:#fff; border-radius:6px; padding:1px 5px; pointer-events:none;">✏️ Ajustar</span>` : ""}
            <a href="${fotosH[`${DIR_H}/${id}/${h}`]}" download="story-${esc(id)}-${esc(h)}" title="Descargar" style="position:absolute; top:4px; right:4px; text-decoration:none; background:rgba(0,0,0,.6); border-radius:6px; padding:0 4px;">⬇️</a>
          </div>`).join("")}
        </div>
        <label class="ig-label" style="display:flex; align-items:center; gap:8px; margin-top:8px;">⏱️ Duración de cada story
          <select class="ig-duracion app-input" style="width:auto; flex:none;" ${puedeAjustar ? "" : "disabled"}>
            ${window.nvaStory.DURACIONES.map(d => `<option value="${d}" ${d === dur ? "selected" : ""}>${d} s</option>`).join("")}
          </select></label>
        <div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
          <span class="ig-label" style="margin:0;">🎵 Música</span>
          <span class="ig-mu-txt" style="flex:1; min-width:0; font-size:.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(meta.musica && meta.musica.archivo ? textoMusica(meta.musica) : "Sin música")}</span>
          ${puedeAjustar ? `<button type="button" class="ig-mu-btn" style="border:1px solid #cbd5e1; background:#fff; border-radius:8px; padding:4px 10px; cursor:pointer; color:#1e293b;">Elegir</button>` : ""}
        </div>
        <small class="ig-info">${puedeAjustar ? "Toca una story para acercarla, alejarla o moverla. " : ""}${meta.confirmadoPor ? `Confirmado por ${esc(meta.confirmadoPor)}` : ""}</small>
        ${puedeAjustar ? `<div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-save-session ig-descartar" style="flex:1; background:#64748b;">🗑️ Descartar</button>
          <button class="btn-save-session ig-confirmar" style="flex:2;">✅ Confirmar y publicar</button></div>` : ""}`;
      if (meta.estado === "error") {
        det.insertAdjacentHTML("beforeend", `<p class="ig-info" style="color:#b91c1c;">${esc(meta.error)}</p>
          <button class="btn-save-session ig-reintentar" style="width:100%;">🔁 Reintentar publicación</button>`);
        det.querySelector(".ig-reintentar").onclick = () => confirmarHistoria(id, meta);
      }
      if (!puedeAjustar) return;
      det.querySelectorAll("[data-h]").forEach(im => im.onclick = () => ajustarEnBorrador(id, meta, im.dataset.h, im));
      det.querySelector(".ig-descartar").onclick = () => estadoHistoria(id, meta, "descartado");
      det.querySelector(".ig-mu-btn").onclick = async () => {
        const mu = await elegirMusica(meta.musica, true);
        if (mu === undefined) return;
        meta.musica = mu;   // null = sin música (en stories no hay «al azar»)
        det.querySelector(".ig-mu-txt").textContent = mu ? textoMusica(mu) : "Sin música";
        try { await putJson(`${DIR_H}/${id}/meta.json`, meta, `Stories ${id}: música`); } catch (e) { alert(e.message); }
      };
      det.querySelector(".ig-confirmar").onclick = () => {
        meta.duracion = +det.querySelector(".ig-duracion").value || 5;
        confirmarHistoria(id, meta);
      };
    } catch (e) {
      console.error(e);
      det.innerHTML = `<p class="ig-info">No se ha podido abrir el borrador (${esc(e.message)}).</p>`;
    }
  }

  // Volver a encajar una story del borrador: se parte siempre de la imagen original
  async function ajustarEnBorrador(id, meta, h, imgEl) {
    try {
      const g = window.nvaStory.gh({ token: window.igGetToken(), user: ghSettings.user, repo: ghSettings.repo });
      const origen = (meta.origenes && meta.origenes[h]) || `origen/${h.replace("historia_", "")}`;
      const original = await g.blob(`${DIR_H}/${id}/${origen}`);
      const r = await window.nvaStory.editar(original, (meta.ajustes || {})[h]);
      if (!r) return;
      imgEl.style.opacity = ".4";
      await g.putBlob(`${DIR_H}/${id}/${h}`, r.blob, `Stories ${id}: ajustar ${h}`);
      meta.ajustes = Object.assign({}, meta.ajustes, { [h]: r.ajuste });
      await putJson(`${DIR_H}/${id}/meta.json`, meta, `Stories ${id}: ajustar ${h}`);
      const ruta = `${DIR_H}/${id}/${h}`;
      if (fotosH[ruta]) URL.revokeObjectURL(fotosH[ruta]);
      fotosH[ruta] = URL.createObjectURL(r.blob);
      imgEl.src = fotosH[ruta]; imgEl.style.opacity = "";
      const portada = imgEl.closest(".ig-reel").querySelector(".ig-portada");
      if (portada && h === "historia_01.jpg") portada.src = fotosH[ruta];
    } catch (e) {
      imgEl.style.opacity = "";
      alert(e.message);
    }
  }

  async function estadoHistoria(id, meta, estado, extra) {
    if (estado === "descartado" && !confirm("¿Descartar estas stories? No se publicarán.")) return false;
    try {
      Object.assign(meta, { estado }, extra || {});
      await putJson(`${DIR_H}/${id}/meta.json`, meta, `Stories ${id}: ${estado}`);
      const idx = (await getJson(`${DIR_H}/indice.json`)) || { historias: [] };
      (idx.historias || []).forEach(b => { if (b.id === id) b.estado = estado; });
      await putJson(`${DIR_H}/indice.json`, idx, `Stories ${id}: ${estado}`);
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    } finally {
      cargarHistorias();
    }
  }

  async function confirmarHistoria(id, meta) {
    if (!confirm("¿Has visto las stories? Al confirmar se publicarán en el Instagram del club.")) return;
    const quien = (JSON.parse(localStorage.getItem("NVA_IG_SETTINGS") || "{}").login) || "";
    const ahora = new Date().toISOString();
    if (!await estadoHistoria(id, meta, "confirmado", { confirmadoPor: quien, confirmadoEn: ahora, duracion: meta.duracion || 5 })) return;
    try {
      await putJson("Reels/publicar.json", { tipo: "historia", id, confirmadoPor: quien, pedido: ahora }, `Publicar stories ${id}`);
      alert("Confirmado. Las stories se publicarán en Instagram en unos minutos.");
    } catch (e) { alert(e.message); }
  }

  window.igHistoriasCargar = cargarHistorias;
  window.igHistoriasGenerar = generarHistoria;
  window.addEventListener("load", () => setTimeout(cargarHistorias, 3000));

  window.igReelsCargar = cargar;
  window.igReelsGenerar = generar;
  window.addEventListener("load", () => setTimeout(cargar, 2500));
})();
