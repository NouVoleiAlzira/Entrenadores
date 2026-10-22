  // ---------------------------------------------------------------------
  //  CARGA DIFERIDA DE LIBRERÍAS PESADAS (html2canvas, jsPDF, Chart.js)
  //  Antes se cargaban las 3 en <head> en cada visita (~700 KB) aunque el
  //  usuario nunca generase un PDF ni viera un gráfico. Ahora se cargan
  //  solo la primera vez que realmente hacen falta (exportar PDF, generar
  //  el informe con gráficos o descargar el horario), y quedan en caché
  //  del navegador para el resto de la sesión. Mismas librerías, mismas
  //  versiones, mismo comportamiento: solo cambia el momento de la carga.
  // ---------------------------------------------------------------------
  const NVA_EXPORT_LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js?v=8",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=8",
    "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"
  ];
  // Huella (SRI) de cada librería externa: si el CDN sirviera un fichero
  // alterado, el navegador se niega a ejecutarlo. Si se cambia una versión,
  // hay que actualizar también su huella. ("?v=8" evita que el service worker
  // antiguo sirva una copia guardada sin CORS, que no pasaría la comprobación.)
  const NVA_SCRIPT_SRI = {
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js?v=8": "sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=8": "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk",
    "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js": "sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js?v=8": "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e"
  };
  const _nvaLoadedScripts = {};
  function loadScriptOnce(src) {
    if (_nvaLoadedScripts[src]) return _nvaLoadedScripts[src];
    _nvaLoadedScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      if (NVA_SCRIPT_SRI[src]) {
        s.integrity = NVA_SCRIPT_SRI[src];
        s.crossOrigin = "anonymous";
      }
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete _nvaLoadedScripts[src]; reject(new Error("No se pudo cargar " + src)); };
      document.head.appendChild(s);
    });
    return _nvaLoadedScripts[src];
  }
  let _nvaExportLibsPromise = null;
  function ensureExportLibs() {
    if (window.html2canvas && window.jspdf && window.Chart) return Promise.resolve();
    if (!_nvaExportLibsPromise) {
      _nvaExportLibsPromise = Promise.all(NVA_EXPORT_LIBS.map(loadScriptOnce)).catch((e) => {
        _nvaExportLibsPromise = null;
        throw e;
      });
    }
    return _nvaExportLibsPromise;
  }

  // Datos iniciales
  const defaultData = {
    coaches: [
      { id: 1, name: "Mourinho", teams: ["NVA A (Infantil)", "NVA A (Cadete)", "NVA A (Juvenil)"] }
    ],
    teams: [
      { name: "NVA A", category: "Infantil" },
      { name: "NVA A", category: "Cadete" },
      { name: "NVA A", category: "Juvenil" }
    ],
    players: {
      "NVA A (Infantil)": ["Aitana", "Lola Indigo", "Ana Mena", "Rosalia"]
    }
  };

  // Huella SHA-256 de la contraseña de propietario (la contraseña ya no está
  // escrita en claro en el código). Para cambiarla, calcula la huella de la
  // nueva contraseña en la consola del navegador:
  //   await nvaHashPassword("NuevaContraseña")
  // y pega aquí el resultado. OJO: esto solo oculta el panel de opciones;
  // la protección real de los datos es el token de GitHub de cada usuario.
  const OWNER_PASS_SHA256 = "82dfda665ea0ce1b39d6350f18d6487f23ae2f2f11a31619ea12924a484edc22";
  async function nvaHashPassword(pass) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pass));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  localStorage.removeItem("NVA_OWNER_PASS"); // versiones anteriores la guardaban en claro
  let ghSettings = JSON.parse(localStorage.getItem("NVA_GH_SETTINGS")) || { user: "", repo: "", token: "" };

  // Carpeta del repositorio donde viven los registros de entrenamiento:
  // un fichero por equipo y por fecha, p.ej. "registros/Entrenamientos_<equipo>_<fecha>.json"
  // Carpeta del repositorio donde viven los registros de entrenamiento:
  // un fichero por equipo y por fecha, p.ej. "registros/Entrenamientos_<equipo>_<fecha>.json"
  const TRAINING_LOGS_FOLDER = "registros";

  // Carpeta del repositorio donde viven los avisos ("warnings") de Dirección NVA:
  // un fichero por equipo, p.ej. "warnings/warning_<equipo>.json"
  const WARNINGS_FOLDER = "warnings";
  let appData = JSON.parse(localStorage.getItem("NVA_APP_DATA")) || defaultData;
  let tablonData = JSON.parse(localStorage.getItem("NVA_TABLON_DATA")) || { tablonText: "" };
  let offlineQueue = JSON.parse(localStorage.getItem("NVA_OFFLINE_QUEUE")) || [];

  // Estado global
  let activeCoachId = null;
  let currentCoach = null;
  let currentTeam = null;
  let selectedPlayerIndexForAbsence = null;
  let sessionData = [];
  let allTrainingLogs = JSON.parse(localStorage.getItem("NVA_TRAINING_LOGS")) || [];

  let isDireccionExpanded = false;
  let warningsData = JSON.parse(localStorage.getItem("NVA_WARNINGS_DATA")) || {};
  let currentWarningPlayer = null;
  let selectedWarningColor = "#ef4444";

  let queriesData = JSON.parse(localStorage.getItem("NVA_QUERIES_DATA")) || [];
  let tempQueryColor = "#0284c7";
  let tempQueryText = "";
  let tempQueryType = "sino";
  let tempQueryOptions = ["V", "X"];
  let selectedQueryPdfId = null;

  let isPdfMode = false;
  let pdfSelectedCoach = null;
  let pdfSelectedTeamKey = null;
  let pdfSelectedTeamName = null;
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();
  let rangeStart = null;
  let rangeEnd = null;

  let pdfChart1 = null;
  let pdfChart2 = null;

  // UTILIDADES UTF-8 Y SANITIZACIÓN PARA ARCHIVOS SEGREGADOS
  function utf8_to_b64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
  }

  function b64_to_utf8(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str.replace(/\s/g, '')), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  }

  // Escapa texto antes de insertarlo como HTML (innerHTML o atributos). Los
  // datos llegan de GitHub y los puede editar cualquiera con acceso al
  // repositorio: sin escapar, un nombre como <img onerror=...> ejecutaría
  // código y podría leer el token guardado en este dispositivo.
  function escapeHtml(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Convierte un texto en argumento JS seguro dentro de onclick="...":
  // funciona con apóstrofos (p.ej. "L'Eliana") y no permite inyectar código.
  function jsArg(v) {
    return escapeHtml(JSON.stringify(String(v == null ? "" : v)));
  }

  // Solo admite colores CSS simples (#hex, rgb()/rgba() o un nombre); si no, usa el de reserva.
  function safeColor(c, fallback) {
    const s = String(c == null ? "" : c).trim();
    return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(s) ? s : fallback;
  }

  function sanitizeFileName(name) {
    if (!name) return "general";
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function getTeamKey(t) {
    if (!t) return "";
    if (typeof t === "string") return t;
    return `${t.name} (${t.category})`;
  }

  function getPlayersForTeamKey(teamKey) {
    if (!appData.players) appData.players = {};
    if (appData.players[teamKey]) return appData.players[teamKey];
    const simpleName = teamKey.split(' (')[0];
    if (appData.players[simpleName]) return appData.players[simpleName];
    return [];
  }

  function ensurePlayerListExists(teamKey) {
    if (!appData.players) appData.players = {};
    if (!appData.players[teamKey]) {
      const simpleName = teamKey.split(' (')[0];
      if (appData.players[simpleName]) {
        appData.players[teamKey] = appData.players[simpleName];
        delete appData.players[simpleName];
      } else {
        appData.players[teamKey] = [];
      }
    }
    return appData.players[teamKey];
  }

  document.addEventListener("DOMContentLoaded", async () => {
    resetToTodayDate();
    updateNetworkStatusUI();

    // Al recuperar conexión: primero se intenta enviar cualquier cambio
    // pendiente guardado en el localStorage (prioridad de envío), y después
    // se trae la versión más reciente de GitHub para refrescar la pantalla
    // que el usuario tenga abierta en ese momento.
    window.addEventListener("online", () => {
      updateNetworkStatusUI();
      fullSyncFromGitHub(true);
    });
    window.addEventListener("offline", updateNetworkStatusUI);

    renderCoachTeamSelection();
    loadGitHubSettingsUI();
    setupColorPickers();

    const tablonEl = document.getElementById("tablonTextarea");
    if (tablonEl) {
      tablonEl.value = tablonData.tablonText || "";
      autoResizeTablon(tablonEl);
    }

    if (ghSettings.user && ghSettings.repo && ghSettings.token) {
      // fullSyncFromGitHub ya se encarga, en este orden, de:
      //  1) enviar primero a GitHub cualquier operación pendiente que se
      //     hubiera quedado en la cola offline (por si la app se cerró u
      //     offlineQueue no llegó a vaciarse en la sesión anterior),
      //  2) sincronizar la configuración (equipos/categorías) antes que el
      //     resto, porque los nombres de los archivos de entrenamientos
      //     dependen de ella, y
      //  3) traer en paralelo entrenamientos, warnings, consultas y tablón.
      await fullSyncFromGitHub(true);
    }

    // Red de seguridad: si por cualquier motivo quedan operaciones en la cola
    // offline (p.ej. un fallo puntual de red que no disparó el evento
    // "offline"/"online"), se reintenta el envío periódicamente mientras haya
    // conexión, para que nunca se queden datos pendientes de sincronizar.
    setInterval(() => {
      if (navigator.onLine && offlineQueue.length > 0) {
        processOfflineQueue();
      }
    }, 60000);
  });

  function updateNetworkStatusUI() {
    const badge = document.getElementById("netStatusBadge");
    if (navigator.onLine) {
      badge.innerText = "Online";
      badge.className = "network-badge network-online";
    } else {
      badge.innerText = "Offline";
      badge.className = "network-badge network-offline";
    }
  }

  function resetToTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("sessionDatePicker").value = today;
  }

  function autoResizeTablon(element) {
    if (!element) return;
    element.style.height = 'auto';
    const style = window.getComputedStyle(element);
    let lineHeight = parseFloat(style.lineHeight);
    if (isNaN(lineHeight)) {
      const fontSize = parseFloat(style.fontSize) || 14;
      lineHeight = fontSize * 1.3;
    }
    element.style.height = (element.scrollHeight + lineHeight) + 'px';
  }

  function setupColorPickers() {
    const wPicker = document.getElementById("warningColorPicker");
    wPicker.querySelectorAll(".color-circle").forEach(c => {
      c.onclick = () => {
        wPicker.querySelectorAll(".color-circle").forEach(x => x.classList.remove("selected"));
        c.classList.add("selected");
        selectedWarningColor = c.dataset.color;
        // El texto del motivo se ve con el color de warning seleccionado
        document.getElementById("warningReasonInput").style.color = selectedWarningColor;
      };
    });

    const qPicker = document.getElementById("queryColorPicker");
    qPicker.querySelectorAll(".color-circle").forEach(c => {
      c.onclick = () => {
        qPicker.querySelectorAll(".color-circle").forEach(x => x.classList.remove("selected"));
        c.classList.add("selected");
        tempQueryColor = c.dataset.color;
      };
    });
  }

  function toggleDireccionNVA() {
    isDireccionExpanded = !isDireccionExpanded;
    document.getElementById("iconDireccionNVA").innerText = isDireccionExpanded ? '🔻' : '➤';
    const container = document.getElementById("direccionTeamsContainer");
    container.style.display = isDireccionExpanded ? 'flex' : 'none';
    
    if (isDireccionExpanded) {
      container.innerHTML = "";
      appData.teams.forEach(team => {
        const displayName = `${team.name} (${team.category})`;
        const teamKey = getTeamKey(team);
        const teamPlayers = getPlayersForTeamKey(teamKey);
        const hasTeamWarning = teamPlayers.some(playerName => !!warningsData[playerName]);

        const btn = document.createElement("button");
        btn.className = "team-btn";
        const warningBadge = hasTeamWarning 
          ? `<span style="background:#ef4444; color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px; font-weight:800; margin-left:6px;">⚠️ AVISO</span>`
          : '';

        btn.innerHTML = `
          <div style="display:flex; align-items:center; gap:4px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
            <span>🛡️ ${escapeHtml(displayName)}</span>
            ${warningBadge}
          </div>
          <span>➤</span>
        `;
        btn.onclick = () => openWarningTeam(teamKey, displayName);
        container.appendChild(btn);
      });
    }
  }

  function refreshDireccionAccordion() {
    // Pliega (si estaba abierto) y vuelve a expandir el acordeón "Gestión y
    // Avisos Individuales" para que las insignias "⚠️ AVISO" de cada equipo
    // se reconstruyan con el warningsData recién guardado.
    if (isDireccionExpanded) {
      toggleDireccionNVA();
    }
    toggleDireccionNVA();
  }

  function updateTablon(val) {
    tablonData.tablonText = val;
  }

  async function saveTablon() {
    const val = document.getElementById("tablonTextarea").value;
    tablonData.tablonText = val;
    localStorage.setItem("NVA_TABLON_DATA", JSON.stringify(tablonData));

    const success = await writeGitHubFile("Tablon.json", tablonData, "Actualizar texto del Tablón");
    if (success) {
      alert("¡Tablón guardado y sincronizado en GitHub!");
    } else {
      alert("Guardado localmente. Se sincronizará con GitHub cuando recupere la conexión.");
    }
  }

  async function saveTablonToGitHub() {
    localStorage.setItem("NVA_TABLON_DATA", JSON.stringify(tablonData));
    await writeGitHubFile("Tablon.json", tablonData, "Actualizar texto del Tablón");
  }

  async function refreshTablon() {
    if (!ghSettings.user || !ghSettings.repo) {
      alert("Configura primero la conexión con GitHub para poder refrescar el Tablón.");
      return;
    }
    if (!navigator.onLine) {
      alert("Sin conexión: no se puede refrescar el Tablón ahora mismo.");
      return;
    }
    await fetchTablonFromGitHub();
  }

  async function fetchTablonFromGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/Tablon.json`;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;

    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        tablonData = JSON.parse(b64_to_utf8(json.content));
        localStorage.setItem("NVA_TABLON_DATA", JSON.stringify(tablonData));
        const tablonEl = document.getElementById("tablonTextarea");
        if (tablonEl) {
          tablonEl.value = tablonData.tablonText || "";
          autoResizeTablon(tablonEl);
        }
      }
    } catch (e) { console.error("Error al cargar Tablon.json:", e); }
  }

  async function openWarningTeam(teamKey, displayName) {
    currentTeam = teamKey;
    document.getElementById("warningTeamTitle").innerText = `Dirección NVA - ${displayName || teamKey}`;
    showScreen("screenWarnings");
    document.getElementById("btnBack").style.display = "flex";

    // Refresca los warnings desde GitHub para reflejar cambios guardados
    // desde otros dispositivos antes de mostrarlos. Antes de leer, se envía
    // cualquier cambio pendiente en la cola offline.
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      if (offlineQueue.length > 0) await processOfflineQueue();
      await fetchWarningsFromGitHub();
    } else {
      renderWarningPlayers();
    }
  }

  function renderWarningPlayers() {
    const container = document.getElementById("warningPlayersContainer");
    container.innerHTML = "";
    const players = getPlayersForTeamKey(currentTeam);
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    players.forEach(playerName => {
      const wObj = warningsData[playerName];
      const hasWarning = !!wObj;
      const reason = hasWarning ? (typeof wObj === 'string' ? wObj : wObj.reason) : "";
      const color = hasWarning ? safeColor(wObj.color, "#ef4444") : "#ef4444";

      const card = document.createElement("div");
      card.className = "player-card";
      if (hasWarning) card.style.borderLeft = `4px solid ${color}`;

      // Jugadora y motivo se ven con el color del warning. El motivo ocupa todo el
      // espacio hasta el botón y, si no cabe, se desplaza como un teleprompter.
      const textHtml = hasWarning
        ? `<div class="warn-line" style="color:${color};" title="${esc(playerName)} (${esc(reason)})">
             <span class="warn-name">${esc(playerName)}</span>
             <span class="warn-reason-view"><span class="warn-reason-track">(${esc(reason)})</span></span>
           </div>`
        : `<div class="warn-line"><span class="warn-name" style="max-width:100%;" title="${esc(playerName)}">${esc(playerName)}</span></div>`;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          ${textHtml}
          <button class="warn-toggle-btn" style="flex-shrink:0; background:${hasWarning ? 'transparent' : '#e2e8f0'}; color:${hasWarning ? color : '#64748b'}; border:${hasWarning ? `1px solid ${color}` : 'none'}; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem; cursor:pointer;">
            ${hasWarning ? 'Quitar' : 'Marcar Warning'}
          </button>
        </div>
      `;
      card.querySelector(".warn-toggle-btn").addEventListener("click", () => toggleWarningPlayer(playerName));
      container.appendChild(card);
    });

    requestAnimationFrame(setupWarningMarquees);
  }

  // Si el motivo es más largo que el espacio disponible, se desplaza de un
  // extremo a otro (con pausas) para poder leerlo completo.
  function setupWarningMarquees() {
    document.querySelectorAll("#warningPlayersContainer .warn-reason-view").forEach(view => {
      const track = view.firstElementChild;
      if (!track) return;
      track.classList.remove("scrolling");
      track.style.removeProperty("--warn-shift");
      track.style.removeProperty("--warn-dur");
      const overflow = track.scrollWidth - view.clientWidth;
      if (overflow > 1) {
        track.style.setProperty("--warn-shift", `-${Math.ceil(overflow) + 4}px`);
        track.style.setProperty("--warn-dur", `${Math.max(5, Math.round(overflow / 25) + 4)}s`);
        track.classList.add("scrolling");
      }
    });
  }
  let warnResizeTimer = null;   // se agrupa: solo se recalcula al terminar de cambiar el tamaño
  window.addEventListener("resize", () => {
    clearTimeout(warnResizeTimer);
    warnResizeTimer = setTimeout(() => {
      const el = document.getElementById("screenWarnings");
      if (el && el.classList.contains("active")) setupWarningMarquees();
    }, 150);
  });

  function toggleWarningPlayer(playerName) {
    if (warningsData[playerName]) {
      delete warningsData[playerName];
      renderWarningPlayers();
    } else {
      currentWarningPlayer = playerName;
      const reasonInput = document.getElementById("warningReasonInput");
      reasonInput.value = "NO PAGADO";
      selectedWarningColor = "#ef4444";
      reasonInput.style.color = selectedWarningColor;
      const wPicker = document.getElementById("warningColorPicker");
      wPicker.querySelectorAll(".color-circle").forEach(x => x.classList.remove("selected"));
      wPicker.querySelector('[data-color="#ef4444"]').classList.add("selected");
      document.getElementById("modalWarning").classList.add("active");
    }
  }

  function confirmWarningReason() {
    const reason = document.getElementById("warningReasonInput").value || "NO PAGADO";
    if (currentWarningPlayer) {
      warningsData[currentWarningPlayer] = { reason: reason, color: selectedWarningColor };
    }
    document.getElementById("modalWarning").classList.remove("active");
    renderWarningPlayers();
  }

  function closeWarningModal() { 
    document.getElementById("modalWarning").classList.remove("active"); 
  }

  function openCreateQueryModal() {
    document.getElementById("createQueryText").value = "";
    const typeSelect = document.getElementById("createQueryType");
    if (typeSelect) typeSelect.value = "sino";
    const customOpts = document.getElementById("createQueryOptions");
    if (customOpts) customOpts.value = "";
    toggleQueryTypeOptions();

    tempQueryColor = "#0284c7";
    const qPicker = document.getElementById("queryColorPicker");
    qPicker.querySelectorAll(".color-circle").forEach(x => x.classList.remove("selected"));
    qPicker.querySelector('[data-color="#0284c7"]').classList.add("selected");
    document.getElementById("modalCreateQuery").classList.add("active");
  }

  function closeCreateQueryModal() {
    document.getElementById("modalCreateQuery").classList.remove("active");
  }

  function toggleQueryTypeOptions() {
    const type = document.getElementById("createQueryType").value;
    const container = document.getElementById("customOptionsContainer");
    if (container) {
      container.style.display = (type === "custom") ? "block" : "none";
    }
  }

  function openQueryTeamsSelection() {
    tempQueryText = document.getElementById("createQueryText").value.trim();
    if (!tempQueryText) {
      alert("Por favor introduce una consulta o pregunta.");
      return;
    }

    tempQueryType = document.getElementById("createQueryType").value;
    if (tempQueryType === "custom") {
      const rawOpts = document.getElementById("createQueryOptions").value;
      const parsed = rawOpts.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (parsed.length === 0) {
        alert("Por favor introduce al menos una opción para la consulta personalizada (separadas por comas).");
        return;
      }
      tempQueryOptions = parsed;
    } else {
      tempQueryOptions = ["V", "X"];
    }

    closeCreateQueryModal();

    const container = document.getElementById("queryTeamsCheckboxes");
    container.innerHTML = "";

    appData.teams.forEach(t => {
      const key = getTeamKey(t);
      const label = document.createElement("label");
      label.style.fontSize = "0.85rem";
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.innerHTML = `<input type="checkbox" class="query-team-check" value="${escapeHtml(key)}"> ${escapeHtml(t.name)} (${escapeHtml(t.category)})`;
      container.appendChild(label);
    });

    document.getElementById("modalQueryTeams").classList.add("active");
  }

  function closeQueryTeamsModal() {
    document.getElementById("modalQueryTeams").classList.remove("active");
  }

  async function confirmSaveQuery() {
    const selectedTeams = [];
    document.querySelectorAll(".query-team-check:checked").forEach(cb => selectedTeams.push(cb.value));

    if (selectedTeams.length === 0) {
      alert("Selecciona al menos un equipo.");
      return;
    }

    const newQuery = {
      id: Date.now(),
      text: tempQueryText,
      color: tempQueryColor,
      type: tempQueryType,
      options: tempQueryOptions,
      teams: selectedTeams,
      createdAt: new Date().toISOString(),
      responses: {},
      responseTimes: {}
    };

    queriesData.push(newQuery);
    saveQueriesToLocalStorage();

    const colorTag = tempQueryColor === '#0284c7' ? '🔵' : (tempQueryColor === '#7e22ce' ? '🟣' : '🟠');
    const queryNotice = `${colorTag} CONSULTA: ${tempQueryText}`;
    tablonData.tablonText = tablonData.tablonText ? `${tablonData.tablonText}\n${queryNotice}` : queryNotice;
    const tablonEl = document.getElementById("tablonTextarea");
    tablonEl.value = tablonData.tablonText;
    autoResizeTablon(tablonEl);

    closeQueryTeamsModal();
    await saveQueriesToGitHub();
    await saveTablonToGitHub();
    alert("Consulta creada y publicada en el tablón.");
  }

  function answerQuery(queryId, playerName, option) {
    const q = queriesData.find(x => x.id === queryId);
    if (!q) return;

    if (!q.responses) q.responses = {};
    q.responses[playerName] = option;
    // Día y hora de cada respuesta (se muestra en el PDF de la consulta)
    if (!q.responseTimes) q.responseTimes = {};
    q.responseTimes[playerName] = new Date().toISOString();

    let allAnswered = true;
    q.teams.forEach(teamKey => {
      const players = getPlayersForTeamKey(teamKey);
      players.forEach(p => {
        if (!q.responses[p]) allAnswered = false;
      });
    });

    if (allAnswered) {
      const colorTag = q.color === '#0284c7' ? '🔵' : (q.color === '#7e22ce' ? '🟣' : '🟠');
      const queryNotice = `${colorTag} CONSULTA: ${q.text}`;
      let lines = (tablonData.tablonText || "").split('\n');
      lines = lines.filter(l => l.trim() !== queryNotice.trim());
      tablonData.tablonText = lines.join('\n');
      const tablonEl = document.getElementById("tablonTextarea");
      tablonEl.value = tablonData.tablonText;
      autoResizeTablon(tablonEl);
      saveTablonToGitHub();
    }

    saveQueriesToLocalStorage();
    saveQueriesToGitHub();
    renderPlayersMain();
  }

  function openSelectQueryPdfModal() {
    const container = document.getElementById("queryListPdfContainer");
    container.innerHTML = "";

    if (queriesData.length === 0) {
      container.innerHTML = `<p style="font-size:0.8rem; color:#64748b; text-align:center;">No hay consultas creadas.</p>`;
    } else {
      queriesData.forEach(q => {
        const btn = document.createElement("button");
        btn.className = "team-btn";
        btn.style.borderLeft = `4px solid ${safeColor(q.color, "#0284c7")}`;
        btn.style.flex = "1";
        btn.style.minWidth = "0";
        if (q.hidden) btn.style.opacity = "0.6";
        btn.innerHTML = `<span>${escapeHtml(q.text)}${q.hidden ? ' <small style="color:#64748b;">(oculta)</small>' : ''}</span> <span style="font-size:0.75rem; color:#64748b;">Generar PDF →</span>`;
        btn.onclick = () => {
          closeSelectQueryPdfModal();
          generateQueryPDF(q.id);
        };
        const row = document.createElement("div");
        row.style.cssText = "display:flex; gap:6px; align-items:stretch;";
        row.appendChild(btn);
        if (!q.hidden) {
          const del = document.createElement("button");
          del.className = "query-hide-btn";
          del.style.cssText = "flex:0 0 auto; width:40px; border:1px solid #fecaca; background:#fef2f2; color:#b91c1c; border-radius:8px; font-size:1rem; cursor:pointer;";
          del.title = "Dejar de mostrar en los equipos";
          del.textContent = "🗑";
          del.onclick = () => hideQuery(q.id);
          row.appendChild(del);
        }
        container.appendChild(row);
      });
    }

    document.getElementById("modalSelectQueryPdf").classList.add("active");
  }

  // Oculta una consulta en los equipos (no borra las respuestas ya tomadas;
  // sigue disponible para generar su PDF).
  async function hideQuery(queryId) {
    const q = queriesData.find(x => x.id === queryId);
    if (!q) return;
    if (!confirm(`¿Dejar de mostrar la consulta "${q.text}" en los equipos?\n\nLas respuestas ya registradas se conservan.`)) return;
    q.hidden = true;
    q.hiddenAt = new Date().toISOString();
    const colorTag = q.color === '#0284c7' ? '🔵' : (q.color === '#7e22ce' ? '🟣' : '🟠');
    const queryNotice = `${colorTag} CONSULTA: ${q.text}`;
    const lines = (tablonData.tablonText || "").split('\n');
    const kept = lines.filter(l => l.trim() !== queryNotice.trim());
    if (kept.length !== lines.length) {
      tablonData.tablonText = kept.join('\n');
      const tablonEl = document.getElementById("tablonTextarea");
      if (tablonEl) { tablonEl.value = tablonData.tablonText; autoResizeTablon(tablonEl); }
      saveTablonToGitHub();
    }
    saveQueriesToLocalStorage();
    openSelectQueryPdfModal();
    if (typeof renderPlayersMain === "function") try { renderPlayersMain(); } catch (e) {}
    await saveQueriesToGitHub();
  }

  function closeSelectQueryPdfModal() {
    document.getElementById("modalSelectQueryPdf").classList.remove("active");
  }

  async function generateQueryPDF(queryId) {
    const q = queriesData.find(x => x.id === queryId);
    if (!q) return;

    const color = safeColor(q.color, "#1B3A8C");
    document.getElementById("pdfQueryTextHeader").innerText = q.text;
    const fechaQ = q.createdAt ? new Date(q.createdAt) : (q.id && !isNaN(Number(q.id)) && Number(q.id) > 1e11 ? new Date(Number(q.id)) : new Date());
    document.getElementById("pdfQueryDate").innerText = fechaQ.toLocaleDateString("es-ES") + " " + fechaQ.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const fmtResp = (iso) => {
      if (!iso) return "-";
      const d = new Date(iso);
      return isNaN(d) ? "-" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    };
    const container = document.getElementById("pdfQueryTeamsContent");
    container.innerHTML = "";

    let tSi = 0, tNo = 0, tPend = 0, tOtro = 0;
    // Consulta personalizada: el conteo es por cada opción disponible, no Sí/No.
    const customOpts = (Array.isArray(q.options) ? q.options : []).filter(o => o !== 'V' && o !== 'X');
    const isCustom = q.type === 'custom' || customOpts.length > 0;
    const optTotals = {};
    customOpts.forEach(o => optTotals[o] = 0);
    q.teams.forEach(teamKey => {
      const players = getPlayersForTeamKey(teamKey);
      let si = 0, no = 0, pend = 0, otro = 0;
      const optCounts = {};
      customOpts.forEach(o => optCounts[o] = 0);

      let rowsHtml = "";
      players.forEach(p => {
        const resp = q.responses ? q.responses[p] : null;
        let badge = `<span class="nva-chip grey">Pendiente</span>`;
        if (resp === 'V') { badge = `<span class="nva-chip green">✔ Sí</span>`; si++; }
        else if (resp === 'X') { badge = `<span class="nva-chip red">✖ No</span>`; no++; }
        else if (resp) {
          badge = `<span class="nva-chip blue">${escapeHtml(resp)}</span>`; otro++;
          optCounts[resp] = (optCounts[resp] || 0) + 1;
          optTotals[resp] = (optTotals[resp] || 0) + 1;
        }
        else pend++;

        rowsHtml += `
          <tr>
            <td class="nva-name">${escapeHtml(p)}</td>
            <td style="white-space:nowrap; color:#64748b; font-size:0.85em;">${resp ? fmtResp(q.responseTimes && q.responseTimes[p]) : "-"}</td>
            <td style="text-align:right;">${badge}</td>
          </tr>
        `;
      });
      tSi += si; tNo += no; tPend += pend; tOtro += otro;

      const teamBox = document.createElement("div");
      teamBox.className = "nva-team-block";
      teamBox.innerHTML = `
        <div class="nva-team-head">
          <h4 style="--q:${color}"><i></i>${escapeHtml(teamKey)}</h4>
          <div class="nva-team-sum">
            ${isCustom
              ? Object.keys(optCounts).map(o => `<span class="nva-chip blue">${escapeHtml(o)} ${optCounts[o]}</span>`).join("")
              : `<span class="nva-chip green">✔ ${si}</span>
            <span class="nva-chip red">✖ ${no}</span>
            ${otro ? `<span class="nva-chip blue">Otras ${otro}</span>` : ""}`}
            <span class="nva-chip grey">Pend. ${pend}</span>
          </div>
        </div>
        <table class="pdf-table">
          <thead>
            <tr>
              <th>Jugadora</th>
              <th style="width:130px;">Día y hora</th>
              <th style="text-align:right; width:180px;">Respuesta</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="3" class="nva-na" style="text-align:center;">Sin jugadoras</td></tr>`}
          </tbody>
        </table>
      `;
      container.appendChild(teamBox);
    });

    const total = tSi + tNo + tPend + tOtro;
    const pct = (n) => total ? Math.round(n * 100 / total) + "%" : "-";
    const optCols = [NVA_PDF_COL.verde, NVA_PDF_COL.alzira, NVA_PDF_COL.pista, NVA_PDF_COL.balon];
    if (isCustom) {
      document.getElementById("pdfQueryKpis").innerHTML =
        nvaKpi("Convocadas", total, `${q.teams.length} equipo${q.teams.length === 1 ? "" : "s"}`, NVA_PDF_COL.pista) +
        Object.keys(optTotals).map((o, i) => nvaKpi(escapeHtml(o), optTotals[o], pct(optTotals[o]) + " del total", optCols[i % optCols.length])).join("") +
        nvaKpi("Pendientes", tPend, pct(tPend) + " sin responder", NVA_PDF_COL.balon);
    } else
    document.getElementById("pdfQueryKpis").innerHTML =
      nvaKpi("Convocadas", total, `${q.teams.length} equipo${q.teams.length === 1 ? "" : "s"}`, NVA_PDF_COL.pista) +
      nvaKpi("Sí", tSi, pct(tSi) + " del total", NVA_PDF_COL.verde) +
      nvaKpi("No", tNo, pct(tNo) + " del total", NVA_PDF_COL.alzira) +
      nvaKpi(tOtro ? "Pendientes / otras" : "Pendientes", tOtro ? `${tPend}<small>/ ${tOtro}</small>` : tPend, pct(tPend) + " sin responder", NVA_PDF_COL.balon);

    const exportArea = document.getElementById("pdfQueryExportArea");

    try {
      await ensureExportLibs();
      await nvaPdfReady(exportArea);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      await addAreaAsPdfPages(pdf, exportArea);
      pdf.save(`Consulta_${q.id}.pdf`);
    } catch (e) {
      console.error("Error al generar PDF de consulta:", e);
      alert("Ocurrió un error al generar el PDF de la consulta.");
    }
  }

  function togglePdfMode() {
    isPdfMode = !isPdfMode;
    const banner = document.getElementById("pdfModeBanner");
    const btn = document.getElementById("btnPdfMode");
    
    if (isPdfMode) {
      banner.style.display = "flex";
      btn.style.opacity = "0.6";
    } else {
      banner.style.display = "none";
      btn.style.opacity = "1";
    }
    // Se repinta la lista para mostrar/ocultar las opciones "TODOS los equipos"
    renderCoachTeamSelection();
  }

  // Modo del calendario de período: false = informe de entrenamiento de un
  // equipo; true = PDF con los resultados de todos los partidos del período.
  let pdfResultsMode = false;

  // Informe de varios equipos a la vez (null = informe de un solo equipo)
  let pdfBatchEntries = null;
  let pdfBatchFileLabel = "";

  function getCoachTeamEntries(coach) {
    return (coach.teams || []).map(ref => {
      const t = appData.teams.find(x => getTeamKey(x) === ref || x.name === ref);
      return { teamKey: t ? getTeamKey(t) : ref, name: t ? `${t.name} (${t.category})` : ref };
    });
  }

  // coach = un entrenador -> todos sus equipos; coach = null -> todos los equipos de todos los entrenadores
  function openBatchDateRangeModal(coach) {
    let entries = [], title, fileLabel;
    if (coach) {
      entries = getCoachTeamEntries(coach).map(e => ({ teamKey: e.teamKey, label: e.name }));
      title = `Todos los equipos de ${coach.name}`;
      fileLabel = "Equipos_" + String(coach.name).replace(/[^a-zA-Z0-9]/g, "_");
    } else {
      const seen = new Set();   // un equipo con varios entrenadores solo sale una vez
      appData.coaches.forEach(c => getCoachTeamEntries(c).forEach(e => {
        if (seen.has(e.teamKey)) return;
        seen.add(e.teamKey);
        entries.push({ teamKey: e.teamKey, label: `${e.name} · ${c.name}` });
      }));
      title = "Todos los equipos";
      fileLabel = "Todos_los_equipos";
    }
    if (entries.length === 0) { alert("No hay equipos asignados."); return; }

    pdfResultsMode = false;
    pdfPlayerSel = null;
    pdfBatchEntries = entries;
    pdfBatchFileLabel = fileLabel;
    rangeStart = null;
    rangeEnd = null;
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();

    document.getElementById("pdfModalTitle").innerText = `🗓️ Período - ${title}`;
    document.getElementById("btnConfirmPdf").innerText = "Generar Informe PDF";
    updateDateSelectionSummary();
    renderCalendar();
    document.getElementById("modalDateRange").classList.add("active");
  }

  function openDateRangeModal(coach, teamKey, displayName) {
    pdfResultsMode = false;
    pdfBatchEntries = null;
    pdfPlayerSel = null;
    pdfSelectedCoach = coach;
    pdfSelectedTeamKey = teamKey;
    pdfSelectedTeamName = displayName;

    rangeStart = null;
    rangeEnd = null;
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();

    document.getElementById("pdfModalTitle").innerText = `🗓️ Período - ${displayName}`;
    document.getElementById("btnConfirmPdf").innerText = "Generar Informe PDF";
    updateDateSelectionSummary();
    renderCalendar();

    document.getElementById("modalDateRange").classList.add("active");
  }

  function closeDateRangeModal() {
    document.getElementById("modalDateRange").classList.remove("active");
  }

  function prevMonth() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); }
  function nextMonth() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); }

  function renderCalendar() {
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    document.getElementById("calendarMonthLabel").innerText = `${monthNames[calMonth]} ${calYear}`;

    const daysGrid = document.getElementById("calendarDaysGrid");
    daysGrid.innerHTML = "";

    const firstDayIndex = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-day empty";
      daysGrid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement("div");
      cell.className = "cal-day";
      const monthStr = String(calMonth + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${calYear}-${monthStr}-${dayStr}`;

      cell.innerText = day;

      if (rangeStart && dateStr === rangeStart) cell.classList.add("range-start");
      if (rangeEnd && dateStr === rangeEnd) cell.classList.add("range-end");
      if (rangeStart && rangeEnd && dateStr > rangeStart && dateStr < rangeEnd) {
        cell.classList.add("range-in-between");
      }

      cell.onclick = () => selectCalDate(dateStr);
      daysGrid.appendChild(cell);
    }
  }

  function selectCalDate(dateStr) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      rangeStart = dateStr;
      rangeEnd = null;
    } else if (rangeStart && !rangeEnd) {
      if (dateStr < rangeStart) {
        rangeStart = dateStr;
      } else {
        rangeEnd = dateStr;
      }
    }
    updateDateSelectionSummary();
    renderCalendar();
  }

  function updateDateSelectionSummary() {
    const summary = document.getElementById("dateSelectionSummary");
    const btn = document.getElementById("btnConfirmPdf");

    if (rangeStart && rangeEnd) {
      summary.innerText = `Rango: ${rangeStart}  ➜  ${rangeEnd}`;
      btn.disabled = false;
      btn.style.opacity = "1";
    } else if (rangeStart) {
      summary.innerText = `Inicio: ${rangeStart} (Selecciona fecha final)`;
      btn.disabled = true;
      btn.style.opacity = "0.5";
    } else {
      summary.innerText = "Selecciona fecha de inicio...";
      btn.disabled = true;
      btn.style.opacity = "0.5";
    }
  }

  function processPdfGeneration() {
    closeDateRangeModal();
    if (isPdfMode) togglePdfMode();
    if (pdfResultsMode) {
      withLoading(openResultsMatchSelection, 'Buscando partidos del período...');
      return;
    }
    if (pdfPlayerSel) {
      withLoading(generatePlayerPDF, 'Generando informe de jugadora...');
      return;
    }
    if (pdfBatchEntries) {
      withLoading(generateBatchPDF, 'Generando informes de entrenamiento...');
      return;
    }
    generatePDF();
  }

  // --- PDF Resultados: todos los partidos del período seleccionado ---
  function openResultsRangeModal() {
    if (isPdfMode) togglePdfMode();
    pdfResultsMode = true;
    pdfBatchEntries = null;
    pdfPlayerSel = null;
    rangeStart = null;
    rangeEnd = null;
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();

    document.getElementById("pdfModalTitle").innerText = "🗓️ Período - Resultados de Partidos";
    document.getElementById("btnConfirmPdf").innerText = "Siguiente: elegir partidos ➜";
    updateDateSelectionSummary();
    renderCalendar();
    document.getElementById("modalDateRange").classList.add("active");
  }

  // Partidos del período encontrados y partidos elegidos para el PDF.
  let resultsCandidateLogs = [];
  let resultsSelectedLogs = [];

  // Resumen de un partido guardado (equipos, sets y si tiene resultado).
  function matchLogSummary(log) {
    const m = log.marcador;
    const hasScore = !!(m && (m.local || m.visitante || (m.sets || []).some(s => s && (s.local != null || s.visitante != null))));
    return {
      hasScore,
      home: hasScore ? (m.local || "Home") : "",
      visit: hasScore ? (m.visitante || "VISIT") : "",
      sl: hasScore ? (m.setsLocal ?? 0) : 0,
      sv: hasScore ? (m.setsVisitante ?? 0) : 0
    };
  }

  // Paso 2 del PDF Resultados: tras elegir las fechas se listan los partidos
  // del período para escoger cuáles se incluyen en el PDF.
  async function openResultsMatchSelection() {
    // Igual que en los demás informes: se sincroniza antes de recopilar para
    // incluir partidos guardados en GitHub desde otros dispositivos.
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      if (offlineQueue.length > 0) await processOfflineQueue();
      await fetchMatchLogsFromGitHub();
    }

    resultsCandidateLogs = allMatchLogs
      .filter(l => l && l.fecha >= rangeStart && l.fecha <= rangeEnd)
      .sort((a, b) => a.fecha === b.fecha ? String(a.equipo).localeCompare(String(b.equipo)) : a.fecha.localeCompare(b.fecha));

    if (resultsCandidateLogs.length === 0) {
      alert(`No existen partidos guardados entre ${rangeStart} y ${rangeEnd}.`);
      return;
    }

    const fmtDate = (d) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
    document.getElementById("resultsMatchesPeriod").innerText =
      `Período: ${fmtDate(rangeStart)} al ${fmtDate(rangeEnd)}. Marca los partidos que quieres incluir en el PDF:`;

    const list = document.getElementById("resultsMatchesList");
    list.innerHTML = "";
    resultsCandidateLogs.forEach((log, i) => {
      const sm = matchLogSummary(log);
      const label = document.createElement("label");
      label.style.cssText = "display:flex; align-items:center; gap:10px; padding:8px 10px; background:#f8fafc; border:1px solid var(--gray-border); border-radius:10px; cursor:pointer; font-size:0.82rem;";
      const scoreTxt = sm.hasScore
        ? `${escapeHtmlMatch(sm.home)} <b>${sm.sl} - ${sm.sv}</b> ${escapeHtmlMatch(sm.visit)}`
        : `<span style="color:#94a3b8;">Sin resultado</span>`;
      label.innerHTML = `
        <input type="checkbox" class="results-match-check" data-idx="${i}" checked onchange="updateResultsSelectionUI()" style="width:18px; height:18px; flex-shrink:0;">
        <span style="min-width:0;">
          <span style="font-weight:700; color:var(--azul-dark);">${fmtDate(log.fecha)} · ${escapeHtmlMatch(log.equipo)}</span><br>
          <span style="color:#334155;">${scoreTxt}</span>
        </span>`;
      list.appendChild(label);
    });

    updateResultsSelectionUI();
    document.getElementById("modalResultsMatches").classList.add("active");
  }

  function closeResultsMatchesModal() {
    document.getElementById("modalResultsMatches").classList.remove("active");
  }

  function updateResultsSelectionUI() {
    const checks = Array.from(document.querySelectorAll(".results-match-check"));
    const n = checks.filter(c => c.checked).length;
    document.getElementById("resultsMatchesCount").innerText = `${n} de ${checks.length} seleccionados`;
    document.getElementById("btnResultsToggleAll").innerText = (n === checks.length) ? "☐ Marcar ninguno" : "☑ Marcar todos";
    const gen = document.getElementById("btnResultsGenerate");
    gen.disabled = n === 0;
    gen.style.opacity = n === 0 ? "0.5" : "1";
  }

  // Botón superior de la lista: si están todos marcados los desmarca; si no, los marca todos.
  function toggleAllResultsMatches() {
    const checks = Array.from(document.querySelectorAll(".results-match-check"));
    const allChecked = checks.every(c => c.checked);
    checks.forEach(c => { c.checked = !allChecked; });
    updateResultsSelectionUI();
  }

  function confirmResultsSelection() {
    const idxs = Array.from(document.querySelectorAll(".results-match-check"))
      .filter(c => c.checked).map(c => parseInt(c.dataset.idx, 10));
    if (idxs.length === 0) {
      alert("Selecciona al menos un partido.");
      return;
    }
    resultsSelectedLogs = idxs.map(i => resultsCandidateLogs[i]).filter(Boolean);
    closeResultsMatchesModal();
    withLoading(generateResultsPDF, 'Generando PDF de resultados...');
  }

  async function generateResultsPDF() {
    const logs = resultsSelectedLogs;
    if (!logs || logs.length === 0) return;
    await ensureExportLibs();

    const esc = (v) => escapeHtmlMatch(v);
    const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

    let gan = 0, perd = 0, sf = 0, sc = 0, conRes = 0;
    const rowsHtml = logs.map(log => {
      const m = log.marcador;
      const hasScore = !!(m && (m.local || m.visitante || (m.sets || []).some(s => s && (s.local != null || s.visitante != null))));
      const clubEsLocal = hasScore && m.local === log.equipo;
      const clubEsVisit = hasScore && m.visitante === log.equipo;
      const sl = hasScore ? (m.setsLocal ?? 0) : 0;
      const sv = hasScore ? (m.setsVisitante ?? 0) : 0;
      let color = "#64748B";
      if (hasScore) {
        conRes++;
        if ((clubEsLocal || clubEsVisit) && sl !== sv) {
          const clubGana = clubEsLocal ? sl > sv : sv > sl;
          color = clubGana ? "#15803D" : "#D62839";
          if (clubGana) gan++; else perd++;
          sf += clubEsLocal ? sl : sv;
          sc += clubEsLocal ? sv : sl;
        }
      }
      const sets = hasScore
        ? (m.sets || []).filter(s => s && s.local != null && s.visitante != null).map(s => {
            const a = Number(s.local), b = Number(s.visitante);
            let cls = "";
            if (clubEsLocal || clubEsVisit) {
              const clubPts = clubEsLocal ? a : b, rivPts = clubEsLocal ? b : a;
              cls = clubPts > rivPts ? "w" : (clubPts < rivPts ? "l" : "");
            }
            return `<span class="nva-set ${cls}">${s.local}-${s.visitante}</span>`;
          }).join("")
        : "";
      const d = new Date(log.fecha + "T12:00:00");
      return `
        <div class="nva-match" style="--r:${color}">
          <div class="nva-match-date"><b>${d.getDate()}</b><span>${DIAS[d.getDay()]} · ${MES[d.getMonth()]}</span></div>
          <div class="nva-match-team"><span>Equipo</span><b>${esc(log.equipo)}</b></div>
          <div class="nva-match-game">
            <div class="nva-match-side home${clubEsLocal ? " club" : ""}">${hasScore ? esc(m.local || "Home") : "—"}</div>
            ${hasScore ? `<div class="nva-score">${sl} - ${sv}</div>` : `<div class="nva-score none">Sin resultado</div>`}
            <div class="nva-match-side${clubEsVisit ? " club" : ""}">${hasScore ? esc(m.visitante || "VISIT") : "—"}</div>
          </div>
          <div class="nva-match-sets">${sets}</div>
        </div>`;
    });

    const FIRST_PAGE_ROWS = 11;
    const NEXT_PAGE_ROWS = 14;
    const chunks = [rowsHtml.slice(0, FIRST_PAGE_ROWS)];
    for (let i = FIRST_PAGE_ROWS; i < rowsHtml.length; i += NEXT_PAGE_ROWS) {
      chunks.push(rowsHtml.slice(i, i + NEXT_PAGE_ROWS));
    }

    const periodo = nvaPeriodo();
    const kpis =
      nvaKpi("Partidos", logs.length, `${conRes} con resultado`, NVA_PDF_COL.pista) +
      nvaKpi("Victorias", gan, conRes ? Math.round(gan * 100 / Math.max(1, gan + perd)) + "% de los decididos" : "-", NVA_PDF_COL.verde) +
      nvaKpi("Derrotas", perd, conRes ? Math.round(perd * 100 / Math.max(1, gan + perd)) + "% de los decididos" : "-", NVA_PDF_COL.alzira) +
      nvaKpi("Sets", `${sf}<small>- ${sc}</small>`, "a favor - en contra", NVA_PDF_COL.balon);

    const head = (compact) => `
      <div class="nva-pdf-head${compact ? " compact" : ""}">
        <div class="nva-pdf-bigtxt"${compact ? ' style="font-size:150px; top:-30px;"' : ""}>NVA</div>
        <div class="nva-pdf-logo"><img src="LOGO-NVA.png" alt="Logo"></div>
        <div class="nva-pdf-head-txt">
          ${compact ? "" : `<div class="nva-pdf-club">Club Nou Vòlei Alzira</div>`}
          <div class="nva-pdf-kicker">${compact ? "Club Nou Vòlei Alzira" : "Informe de competición"}</div>
          <h1 class="nva-pdf-title">Resultados de partidos</h1>
        </div>
        <div class="nva-pdf-period"><span>Período</span><b>${periodo}</b></div>
      </div>
      <div class="nva-pdf-attack"></div>`;

    const exportArea = document.getElementById("pdfResultsExportArea");
    exportArea.innerHTML = chunks.map((rows, idx) => `
      <div class="pdf-results-page">
        <img src="LOGO-NVA.png" alt="" class="pdf-watermark">
        ${head(idx > 0)}
        <div class="nva-pdf-body">
          ${idx === 0 ? `<div class="nva-kpis">${kpis}</div><div class="nva-sec">Partidos del período</div>` : `<div style="height:4px"></div>`}
          ${rows.join("")}
        </div>
        <div class="nva-pdf-foot"><span class="nva-pdf-gen"></span><span>Página ${idx + 1} de ${chunks.length}</span><span class="nva-pdf-brand"><i></i>Nou Vòlei Alzira</span></div>
      </div>
    `).join("");

    await nvaPdfReady(exportArea);

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const pages = exportArea.querySelectorAll(".pdf-results-page");

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }
      pdf.save(`Resultados_Partidos_${rangeStart}_al_${rangeEnd}.pdf`);
    } catch (e) {
      console.error("Error al generar el PDF de resultados:", e);
      alert("Ocurrió un error al generar el PDF de resultados.");
    } finally {
      exportArea.innerHTML = "";
    }
  }

  // Registros de un equipo dentro del período seleccionado
  function collectTeamLogs(teamKey) {
    return allTrainingLogs
      .filter(log => log.equipo === teamKey && log.fecha >= rangeStart && log.fecha <= rangeEnd)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // Igual que en el Historial: sincroniza antes de recopilar los registros
  // para que el PDF incluya también entrenamientos guardados en GitHub
  // desde otros dispositivos y no solo los que ya estaban en caché local.
  // Antes de leer, se envía cualquier cambio pendiente en la cola offline.
  async function syncTrainingLogsForPdf() {
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      if (offlineQueue.length > 0) await processOfflineQueue();
      await fetchTrainingLogsFromGitHub();
    }
  }

  // Pinta en el área oculta el informe de UN equipo y lo añade como página al PDF
  async function addTeamReportPage(pdf, teamKey, teamName, logs, isFirstPage) {
    document.getElementById("pdfReportTeamTitle").innerText = teamName;
    document.getElementById("pdfReportDateRange").innerText = nvaPeriodo();

    const teamPlayers = getPlayersForTeamKey(teamKey);
    const tableBody = document.getElementById("pdfReportTableBody");
    tableBody.innerHTML = "";

    let totPres = 0, totAsig = 0, totQ = 0, totQn = 0, totStrikes = 0;
    teamPlayers.forEach(playerName => {
      let attended = 0;
      let totalAssigned = 0;
      let qualitySum = 0;
      let qualityCount = 0;
      let strikesSum = 0;

      logs.forEach(log => {
        const pData = log.jugadores.find(j => j.name === playerName);
        if (pData) {
          totalAssigned++;
          if (pData.attendance === "presente") {
            attended++;
            qualitySum += (pData.quality || 0);
            qualityCount++;
          }
          strikesSum += (pData.strikes || 0);
        }
      });
      totPres += attended; totAsig += totalAssigned; totQ += qualitySum; totQn += qualityCount; totStrikes += strikesSum;

      const pct = totalAssigned ? Math.round(attended * 100 / totalAssigned) : 0;
      const barCol = pct >= 80 ? NVA_PDF_COL.azul : (pct >= 50 ? "#E0A800" : NVA_PDF_COL.alzira);
      const qualityAvg = qualityCount > 0
        ? `<span class="nva-q">${(qualitySum / qualityCount).toFixed(1)}<i>★</i></span>`
        : `<span class="nva-na">—</span>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="nva-name">${escapeHtml(playerName)}</td>
        <td><div class="nva-bar">
          <span class="nva-bar-n">${attended}/${totalAssigned}</span>
          <span class="nva-bar-t"><span class="nva-bar-f" style="display:block; width:${pct}%; background:${barCol};"></span></span>
          <span class="nva-bar-p">${totalAssigned ? pct + "%" : "—"}</span>
        </div></td>
        <td style="text-align:center;">${qualityAvg}</td>
        <td style="text-align:center;"><span class="nva-chip ${strikesSum > 0 ? "red" : "grey"}">${strikesSum}</span></td>
      `;
      tableBody.appendChild(tr);
    });

    // Marcadores del informe
    const pctEq = totAsig ? Math.round(totPres * 100 / totAsig) : 0;
    const mediaPres = logs.length ? (logs.reduce((a, l) => a + l.jugadores.filter(j => j.attendance === "presente").length, 0) / logs.length) : 0;
    document.getElementById("pdfReportKpis").innerHTML =
      nvaKpi("Sesiones", logs.length, `${teamPlayers.length} jugadoras en plantilla`, NVA_PDF_COL.pista) +
      nvaKpi("Asistencia", `${pctEq}<small>%</small>`, `${mediaPres.toFixed(1).replace(".", ",")} presentes por sesión`, NVA_PDF_COL.azul) +
      nvaKpi("Calidad media", totQn ? `${(totQ / totQn).toFixed(1).replace(".", ",")}<small>/ 5</small>` : "—", "de las jugadoras presentes", NVA_PDF_COL.balon) +
      nvaKpi("Strikes", totStrikes, "acumulados en el período", NVA_PDF_COL.alzira);

    const labels = logs.map(l => pdfFechaCorta(l.fecha).slice(0, 5));
    const attendanceData = logs.map(l => l.jugadores.filter(j => j.attendance === "presente").length);
    const qualityData = logs.map(l => {
      const present = l.jugadores.filter(j => j.attendance === "presente");
      if (present.length === 0) return 0;
      const sum = present.reduce((acc, curr) => acc + (curr.quality || 0), 0);
      return parseFloat((sum / present.length).toFixed(1));
    });

    if (pdfChart1) pdfChart1.destroy();
    if (pdfChart2) pdfChart2.destroy();
    nvaChartDefaults();

    const pocos = labels.length <= 16;
    const chartValueLabelPlugin = {
      id: 'chartValueLabel',
      afterDatasetsDraw(chart) {
        if (!pocos) return;   // con muchas sesiones las cifras se pisarían
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((element, index) => {
            const val = dataset.data[index];
            if (val !== null && val !== undefined) {
              ctx.save();
              ctx.fillStyle = NVA_PDF_COL.noche;
              ctx.font = '700 11px Barlow, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              const pos = element.tooltipPosition();
              ctx.fillText(val, pos.x, pos.y - 4);
              ctx.restore();
            }
          });
        });
      }
    };

    const ctx1 = document.getElementById("chartAttendanceCanvas").getContext("2d");
    const grad1 = ctx1.createLinearGradient(0, 0, 0, 190);
    grad1.addColorStop(0, '#2450C8');
    grad1.addColorStop(1, '#0D1B45');

    pdfChart1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Jugadoras Presentes',
          data: attendanceData,
          backgroundColor: grad1,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 26
        }]
      },
      plugins: [chartValueLabelPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { grid: { display: false }, border: { color: '#E3E8F4' }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, border: { display: false }, grid: { color: '#EEF2F8' } }
        }
      }
    });

    const ctx2 = document.getElementById("chartQualityCanvas").getContext("2d");
    const grad2 = ctx2.createLinearGradient(0, 0, 0, 190);
    grad2.addColorStop(0, 'rgba(245, 197, 24, 0.40)');
    grad2.addColorStop(1, 'rgba(245, 197, 24, 0.02)');

    pdfChart2 = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Media Calidad',
          data: qualityData,
          borderColor: '#1B3A8C',
          borderWidth: 2.5,
          backgroundColor: grad2,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#F5C518',
          pointBorderColor: '#0D1B45',
          pointBorderWidth: 2
        }]
      },
      plugins: [chartValueLabelPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { grid: { display: false }, border: { color: '#E3E8F4' }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } },
          y: { min: 1, max: 5, ticks: { stepSize: 1, font: { size: 10 } }, border: { display: false }, grid: { color: '#EEF2F8' } }
        }
      }
    });

    const exportArea = document.getElementById("pdfReportExportArea");
    await nvaPdfReady(exportArea);
    await new Promise(r => setTimeout(r, 150));

    if (!isFirstPage) pdf.addPage();
    await addAreaAsPdfPages(pdf, exportArea);
  }

  async function generatePDF() {
    await ensureExportLibs();
    await syncTrainingLogsForPdf();

    const logs = collectTeamLogs(pdfSelectedTeamKey);
    if (logs.length === 0) {
      alert(`No existen registros de entrenamiento guardados para ${pdfSelectedTeamName} entre ${rangeStart} y ${rangeEnd}.`);
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      await addTeamReportPage(pdf, pdfSelectedTeamKey, pdfSelectedTeamName, logs, true);
      pdf.save(`Informe_${pdfSelectedTeamName.replace(/[^a-zA-Z0-9]/g, '_')}_${rangeStart}_al_${rangeEnd}.pdf`);
    } catch (e) {
      console.error("Error al generar el PDF:", e);
      alert("Ocurrió un error al generar el PDF.");
    }
  }

  // Un único PDF con una página por equipo (los equipos sin registros en el período se omiten)
  async function generateBatchPDF() {
    const entries = pdfBatchEntries || [];
    if (entries.length === 0) { alert("No hay equipos para generar el informe."); return; }
    await ensureExportLibs();
    await syncTrainingLogsForPdf();

    const omitidos = [];
    let pages = 0;
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      for (const en of entries) {
        const logs = collectTeamLogs(en.teamKey);
        if (logs.length === 0) { omitidos.push(en.label); continue; }
        await addTeamReportPage(pdf, en.teamKey, en.label, logs, pages === 0);
        pages++;
      }
      if (pages === 0) {
        alert(`No existen registros de entrenamiento guardados entre ${rangeStart} y ${rangeEnd} para ninguno de los equipos seleccionados.`);
        return;
      }
      pdf.save(`Informe_${pdfBatchFileLabel}_${rangeStart}_al_${rangeEnd}.pdf`);
    } catch (e) {
      console.error("Error al generar el PDF de equipos:", e);
      alert("Ocurrió un error al generar el PDF.");
      return;
    }
    if (omitidos.length > 0) {
      alert("PDF generado. Equipos sin registros en el período (no incluidos):\n- " + omitidos.join("\n- "));
    }
  }

  // =====================================================================
  //  PDF JUGADORA: informe individual (mismo estilo que el de entrenamientos)
  // =====================================================================
  let pdfPlayerSel = null;   // { teamKey, teamLabel, player, coachName }
  let pdfPlayerChart1 = null;

  function openPlayerPdfModal() {
    if (isPdfMode) togglePdfMode();
    const sel = document.getElementById("playerPdfTeamSelect");
    sel.innerHTML = "";
    sel.add(new Option("Selecciona un equipo...", ""));
    appData.teams.forEach(t => {
      const key = getTeamKey(t);
      sel.add(new Option(key, key));
    });
    document.getElementById("playerPdfPlayersWrap").style.display = "none";
    document.getElementById("modalPlayerPdf").classList.add("active");
  }

  function closePlayerPdfModal() {
    document.getElementById("modalPlayerPdf").classList.remove("active");
  }

  function renderPlayerPdfPlayers() {
    const key = document.getElementById("playerPdfTeamSelect").value;
    const wrap = document.getElementById("playerPdfPlayersWrap");
    const list = document.getElementById("playerPdfPlayersList");
    list.innerHTML = "";
    if (!key) { wrap.style.display = "none"; return; }

    const players = getPlayersForTeamKey(key);
    if (!players || players.length === 0) {
      list.innerHTML = '<div style="font-size:0.8rem; color:#64748b; padding:6px;">Este equipo no tiene jugadoras.</div>';
    } else {
      players.forEach(name => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "player-pdf-item";
        b.textContent = "🧑 " + name;
        b.onclick = () => selectPlayerForPdf(key, name);
        list.appendChild(b);
      });
    }
    wrap.style.display = "block";
  }

  function selectPlayerForPdf(teamKey, player) {
    const matches = ref => {
      if (ref === teamKey) return true;
      const t = appData.teams.find(x => getTeamKey(x) === ref || x.name === ref);
      return !!t && getTeamKey(t) === teamKey;
    };
    const coaches = appData.coaches.filter(c => (c.teams || []).some(matches)).map(c => c.name);
    const teamObj = appData.teams.find(t => getTeamKey(t) === teamKey);
    const teamLabel = (teamObj && typeof teamObj === "object" && teamObj.category)
      ? `${teamObj.name} - ${teamObj.category}` : teamKey;

    closePlayerPdfModal();
    pdfResultsMode = false;
    pdfBatchEntries = null;
    pdfPlayerSel = { teamKey, teamLabel, player, coachName: coaches.length ? coaches.join(", ") : "-" };

    rangeStart = null;
    rangeEnd = null;
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();
    document.getElementById("pdfModalTitle").innerText = `🗓️ Período - ${player}`;
    document.getElementById("btnConfirmPdf").innerText = "Generar Informe PDF";
    updateDateSelectionSummary();
    renderCalendar();
    document.getElementById("modalDateRange").classList.add("active");
  }

  // =====================================================================
  //  UTILIDADES COMUNES DE LOS INFORMES PDF (diseño "Línea de Ataque")
  // =====================================================================
  const NVA_PDF_COL = {
    noche: "#0D1B45", pista: "#1B3A8C", azul: "#2450C8", balon: "#F5C518",
    alzira: "#D62839", verde: "#15803D", gris: "#64748B"
  };

  function pdfEscape(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pdfFechaCorta(f) {
    const p = String(f).split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f;
  }
  function nvaPeriodo() {
    return `${pdfFechaCorta(rangeStart)}  –  ${pdfFechaCorta(rangeEnd)}`;
  }
  // Tarjeta de marcador (KPI): etiqueta, valor grande, texto pequeño y color de acento
  function nvaKpi(label, value, sub, color) {
    return `<div class="nva-kpi" style="--k:${color}">
      <div class="nva-kpi-l">${label}</div>
      <div class="nva-kpi-v">${value}</div>
      <div class="nva-kpi-s">${sub || "&nbsp;"}</div>
    </div>`;
  }
  // Espera a logos y tipografías del club y pone la fecha en el pie
  async function nvaPdfReady(area) {
    const hoy = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    area.querySelectorAll(".nva-pdf-gen").forEach(el => { el.textContent = "Generado el " + hoy; });
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load('400 13px "Barlow"'),
          document.fonts.load('600 13px "Barlow"'),
          document.fonts.load('700 13px "Barlow"'),
          document.fonts.load('700 20px "Barlow Condensed"'),
          document.fonts.load('italic 800 20px "Barlow Condensed"')
        ]);
      }
    } catch (e) { /* si no cargan, se usa la tipografía del sistema */ }
    await Promise.all(Array.from(area.querySelectorAll("img")).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
  }
  function nvaChartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "Barlow, -apple-system, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.color = "#64748B";
  }

  // --- Para los PDF dibujados directamente con jsPDF (cuadrante, kilometraje...) ---
  let _nvaLogoPromise = null;
  // Escudo del club como PNG (data URL) para jsPDF. Se prepara una sola vez.
  function nvaLogoDataUrl() {
    if (!_nvaLogoPromise) {
      _nvaLogoPromise = new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          try {
            const c = document.createElement("canvas");
            c.width = c.height = 240;
            c.getContext("2d").drawImage(img, 0, 0, 240, 240);
            resolve(c.toDataURL("image/png"));
          } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = "LOGO-NVA.png";
      });
    }
    return _nvaLogoPromise;
  }
  // Banda de cabecera: azul noche, escudo en disco blanco, título y línea de ataque amarilla.
  // Devuelve la coordenada Y (mm) donde empieza el contenido.
  function nvaPdfBand(pdf, logo, { kicker, title, sub, h = 26 }) {
    const W = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(13, 27, 69); pdf.rect(0, 0, W, h, "F");
    pdf.setFillColor(21, 41, 106); pdf.triangle(W * 0.55, 0, W, 0, W, h, "F");
    pdf.setFillColor(29, 53, 128); pdf.triangle(W * 0.78, 0, W, 0, W, h, "F");
    pdf.setFillColor(245, 197, 24); pdf.rect(0, h, W, 1.4, "F");
    const r = h * 0.36, cx = 12 + r, cy = h / 2;
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(245, 197, 24); pdf.setLineWidth(0.7);
    pdf.circle(cx, cy, r, "FD");
    if (logo) pdf.addImage(logo, "PNG", cx - r * 0.88, cy - r * 0.88, r * 1.76, r * 1.76, "nvalogo", "FAST");
    const tx = cx + r + 5;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(245, 197, 24);
    pdf.text(String(kicker || "CLUB NOU VÒLEI ALZIRA").toUpperCase(), tx, cy - 3.6, { charSpace: 0.6 });
    pdf.setFontSize(h > 22 ? 16 : 13); pdf.setTextColor(255, 255, 255);
    pdf.text(String(title || "").toUpperCase(), tx, cy + 2.6);
    if (sub) {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(147, 163, 207);
      pdf.text(String(sub), tx, cy + 7.6);
    }
    pdf.setLineWidth(0.2);
    return h + 1.4;
  }
  // Pie: fecha de generación, página y marca del club
  function nvaPdfFooter(pdf, page, total) {
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 12;
    pdf.setDrawColor(227, 232, 244); pdf.setLineWidth(0.25); pdf.line(M, H - 9, W - M, H - 9);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184);
    pdf.text("Generado el " + new Date().toLocaleDateString("es-ES"), M, H - 5);
    if (total > 1) pdf.text(`Página ${page} de ${total}`, W / 2, H - 5, { align: "center" });
    pdf.setFillColor(245, 197, 24); pdf.rect(W - M - 44, H - 6.4, 3.5, 1.1, "F");
    pdf.setFillColor(214, 40, 57); pdf.rect(W - M - 39.5, H - 6.4, 3.5, 1.1, "F");
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(27, 58, 140);
    pdf.text("NOU VÒLEI ALZIRA", W - M, H - 5, { align: "right", charSpace: 0.4 });
  }
  // Recorre todas las páginas al final y pone el pie
  function nvaPdfFooters(pdf) {
    const n = pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) { pdf.setPage(i); nvaPdfFooter(pdf, i, n); }
  }

  // Captura el área oculta y la coloca en UNA sola página A4: si el contenido es más
  // alto que la página, se reduce proporcionalmente hasta que quepa.
  async function addAreaAsPdfPages(pdf, exportArea) {
    const SC = 1.5;                                      // ~144 ppp: nítido y ligero
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const W = Math.round(pdfWidth * 3.7795275591 * SC);
    const H = Math.round(pdfHeight * 3.7795275591 * SC);

    const cssW = exportArea.getBoundingClientRect().width;
    const total = exportArea.getBoundingClientRect().height;
    const pageCssH = cssW * pdfHeight / pdfWidth;
    const reducir = total > pageCssH + 2;                // tolerancia por redondeos
    const f = reducir ? pageCssH / total : 1;

    // Al reducir, la marca de agua quedaría cortada a media página: se oculta
    const wm = exportArea.querySelector(".pdf-watermark");
    if (reducir && wm) wm.style.visibility = "hidden";
    let canvas;
    try {
      canvas = await html2canvas(exportArea, { scale: SC, useCORS: true, backgroundColor: "#ffffff" });
    } finally {
      if (wm) wm.style.visibility = "";
    }

    const full = document.createElement("canvas");
    full.width = W; full.height = H;
    const ctx = full.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const ko = W / cssW;                                 // px de página por px CSS
    const destW = W * f;
    const destH = total * ko * f;
    const dx = (W - destW) / 2;
    if (reducir) {
      // Las franjas laterales que deja la reducción se rellenan con la banda de cabecera
      // para que la página siga viéndose a sangre.
      const headEl = exportArea.querySelector(".nva-pdf-head");
      if (headEl) {
        const hh = (headEl.offsetHeight + 5) * ko * f;
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, "#0D1B45"); g.addColorStop(1, "#1D3580");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, hh - 5 * ko * f);
        ctx.fillStyle = "#F5C518"; ctx.fillRect(0, hh - 5 * ko * f, W, 5 * ko * f);
      }
    }
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, dx, 0, destW, destH);

    pdf.addImage(full.toDataURL("image/jpeg", 0.86), "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
  }

  async function generatePlayerPDF() {
    const sel = pdfPlayerSel;
    if (!sel) return;
    await ensureExportLibs();
    await syncTrainingLogsForPdf();

    const registros = [];
    collectTeamLogs(sel.teamKey).forEach(l => {
      const p = (l.jugadores || []).find(j => j.name === sel.player);
      if (p) registros.push({ fecha: l.fecha, p });
    });
    if (registros.length === 0) {
      alert(`No existen registros de entrenamiento de ${sel.player} (${sel.teamLabel}) entre ${rangeStart} y ${rangeEnd}.`);
      return;
    }

    document.getElementById("pdfPlayerTitle").innerText = sel.player;
    document.getElementById("pdfPlayerCoach").innerText = sel.coachName;
    document.getElementById("pdfPlayerTeam").innerText = sel.teamLabel;
    document.getElementById("pdfPlayerPeriod").innerText = nvaPeriodo();

    // --- Datos de los gráficos ---
    const labels = registros.map(r => pdfFechaCorta(r.fecha).slice(0, 5));
    const calidad = registros.map(r => r.p.attendance === "presente" ? (r.p.quality || 0) : null);
    const presentes = calidad.filter(v => v !== null);
    const media = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
    const strikes = registros.map(r => r.p.strikes || 0);
    const totalStrikes = strikes.reduce((a, b) => a + b, 0);
    document.getElementById("pdfPlayerChartTitle").innerText = "Calidad de entrenamiento y strikes por sesión";
    const pctAsis = registros.length ? Math.round(presentes.length * 100 / registros.length) : 0;
    const nComent = registros.filter(r => (r.p.comments || "").trim()).length;
    document.getElementById("pdfPlayerKpis").innerHTML =
      nvaKpi("Asistencia", `${pctAsis}<small>%</small>`, `${presentes.length} de ${registros.length} sesiones`, NVA_PDF_COL.azul) +
      nvaKpi("Calidad media", media !== null ? `${media.toFixed(1).replace(".", ",")}<small>/ 5</small>` : "—", "en las sesiones asistidas", NVA_PDF_COL.balon) +
      nvaKpi("Strikes", totalStrikes, "acumulados en el período", NVA_PDF_COL.alzira) +
      nvaKpi("Comentarios", nComent, "anotados por el entrenador/a", NVA_PDF_COL.pista);

    // --- Comentarios con fecha ---
    const body = document.getElementById("pdfPlayerCommentsBody");
    const conComentario = registros.filter(r => (r.p.comments || "").trim());
    const tablaCom = body.closest("table");
    const nCom = conComentario.length;
    tablaCom.style.fontSize = nCom > 16 ? "10px" : (nCom > 8 ? "11px" : "");
    tablaCom.classList.toggle("pdf-table-compact", nCom > 8);
    body.innerHTML = conComentario.length
      ? conComentario.map(r => `<tr data-pdf-row><td style="white-space:nowrap; font-weight:700;">${pdfFechaCorta(r.fecha)}</td><td>${pdfEscape(r.p.comments.trim())}</td></tr>`).join("")
      : `<tr data-pdf-row><td colspan="2" class="nva-na" style="text-align:center;">Sin comentarios en el período</td></tr>`;

    // --- Gráficos ---
    if (pdfPlayerChart1) pdfPlayerChart1.destroy();
    nvaChartDefaults();

    const labelPlugin = {
      id: "playerValueLabel",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, i) => {
          if (ds.noLabel) return;
          const esBarra = ds.type === "bar";
          chart.getDatasetMeta(i).data.forEach((el, idx) => {
            const val = ds.data[idx];
            if (val === null || val === undefined) return;
            if (esBarra && !val) return;   // sin etiqueta en 0 strikes
            ctx.save();
            ctx.fillStyle = esBarra ? "#B4172A" : "#0D1B45";
            ctx.font = "700 11px Barlow, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            const pos = el.tooltipPosition();
            ctx.fillText(val, pos.x, pos.y - 4);
            ctx.restore();
          });
        });
      }
    };

    const ctx1 = document.getElementById("chartPlayerQualityCanvas").getContext("2d");
    const grad1 = ctx1.createLinearGradient(0, 0, 0, 300);
    grad1.addColorStop(0, "rgba(36, 80, 200, 0.28)");
    grad1.addColorStop(1, "rgba(36, 80, 200, 0.02)");
    const maxStrikes = Math.max(0, ...strikes);
    const dsCombinado = [
      {
        type: "bar",
        label: "Strikes",
        data: strikes,
        yAxisID: "y",
        pointStyle: "rect",
        backgroundColor: "rgba(214, 40, 57, 0.78)",
        borderColor: "#D62839",
        borderWidth: 0,
        borderRadius: 5,
        borderSkipped: false,
        maxBarThickness: 28,
        order: 3
      },
      {
        type: "line",
        label: "Calidad",
        data: calidad,
        yAxisID: "y",
        pointStyle: "line",
        borderColor: "#1B3A8C",
        borderWidth: 2.5,
        backgroundColor: grad1,
        fill: true,
        spanGaps: true,
        tension: 0.35,
        pointRadius: 5,
        pointBackgroundColor: "#F5C518",
        pointBorderColor: "#0D1B45",
        pointBorderWidth: 2,
        order: 2
      }
    ];
    if (media !== null) {
      dsCombinado.push({
        type: "line",
        label: `Media calidad: ${media.toFixed(1)} ★`,
        data: labels.map(() => parseFloat(media.toFixed(2))),
        yAxisID: "y",
        pointStyle: "line",
        borderColor: "#E0A800",
        borderWidth: 2,
        borderDash: [6, 5],
        pointRadius: 0,
        fill: false,
        noLabel: true,
        order: 1
      });
    }
    // X en los entrenamientos a los que no asistió (sobre la línea de media) y asistencia x/X en la leyenda
    const yX = media !== null ? parseFloat(media.toFixed(2)) : 1;
    dsCombinado.push({
      type: "line",
      label: `Asistencia: ${presentes.length}/${registros.length}`,
      data: registros.map(r => r.p.attendance === "presente" ? null : yX),
      yAxisID: "y",
      showLine: false,
      pointStyle: "crossRot",
      pointRadius: 9,
      pointHoverRadius: 9,
      borderColor: "#D62839",
      borderWidth: 3,
      pointBorderColor: "#D62839",
      pointBorderWidth: 3,
      noLabel: true,
      order: 0
    });
    pdfPlayerChart1 = new Chart(ctx1, {
      data: { labels, datasets: dsCombinado },
      plugins: [labelPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 20 } },
        plugins: { legend: { display: true, position: "bottom", labels: { usePointStyle: true, boxWidth: 12, padding: 16, color: "#0D1B45", font: { size: 11, weight: "600" } } }, tooltip: { enabled: false } },
        scales: {
          x: { grid: { display: false }, border: { color: "#E3E8F4" }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } },
          // Un único eje para calidad (1-5) y strikes (0-3): misma escala
          y: {
            min: 0,
            max: Math.max(5, maxStrikes),
            ticks: { stepSize: 1, precision: 0 },
            title: { display: true, text: "Calidad (1-5) · Strikes (0-3)", font: { size: 10, weight: "600" } },
            border: { display: false },
            grid: { color: "#EEF2F8" }
          }
        }
      }
    });

    // --- Captura y PDF ---
    const exportArea = document.getElementById("pdfPlayerExportArea");
    await nvaPdfReady(exportArea);
    await new Promise(r => setTimeout(r, 150));

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
      await addAreaAsPdfPages(pdf, exportArea);
      pdf.save(`Jugadora_${sel.player.replace(/[^a-zA-Z0-9]/g, "_")}_${rangeStart}_al_${rangeEnd}.pdf`);
    } catch (e) {
      console.error("Error al generar el PDF de jugadora:", e);
      alert("Ocurrió un error al generar el PDF de la jugadora.");
    }
  }

  function renderCoachTeamSelection() {
    const container = document.getElementById("coachTeamList");
    container.innerHTML = "";

    if (isPdfMode && appData.coaches.length > 0) {
      const allBtn = document.createElement("button");
      allBtn.className = "team-btn team-btn-all";
      allBtn.style.marginBottom = "8px";
      allBtn.style.width = "100%";
      allBtn.innerHTML = `<span>📚 TODOS los equipos de todos los entrenadores</span> <span>Generar PDF →</span>`;
      allBtn.onclick = () => openBatchDateRangeModal(null);
      container.appendChild(allBtn);
    }

    appData.coaches.forEach(coach => {
      const isSelected = coach.id === activeCoachId;
      const coachBtn = document.createElement("button");
      coachBtn.className = `coach-btn ${isSelected ? 'selected' : ''}`;
      coachBtn.innerHTML = `<span>${isSelected ? '🕵️' : '👤'} ${escapeHtml(coach.name)}</span> <span>${isSelected ? '🔻' : '➤'}</span>`;
      coachBtn.onclick = () => toggleCoachSelection(coach.id);
      container.appendChild(coachBtn);

      if (isSelected) {
        const teamsDiv = document.createElement("div");
        teamsDiv.className = "teams-container";

        if (!coach.teams || coach.teams.length === 0) {
          teamsDiv.innerHTML = `<div style="color: rgba(255,255,255,0.7); font-size: 0.8rem; padding: 4px;">Sin equipos asignados</div>`;
        } else {
          if (isPdfMode) {
            const coachAllBtn = document.createElement("button");
            coachAllBtn.className = "team-btn team-btn-all";
            coachAllBtn.innerHTML = `<span>📚 TODOS los equipos de ${escapeHtml(coach.name)}</span> <span>Generar PDF →</span>`;
            coachAllBtn.onclick = () => openBatchDateRangeModal(coach);
            teamsDiv.appendChild(coachAllBtn);
          }
          coach.teams.forEach(teamRef => {
            const teamObj = appData.teams.find(t => getTeamKey(t) === teamRef || t.name === teamRef);
            const displayName = teamObj ? `${teamObj.name} (${teamObj.category})` : teamRef;
            const teamKey = teamObj ? getTeamKey(teamObj) : teamRef;

            const teamBtn = document.createElement("button");
            teamBtn.className = "team-btn";
            teamBtn.innerHTML = `<span>🏐 ${escapeHtml(displayName)}</span> <span>${isPdfMode ? 'Generar PDF →' : ' ➤'}</span>`;
            teamBtn.onclick = () => selectCoachAndTeam(coach, teamKey, displayName);
            teamsDiv.appendChild(teamBtn);
          });
        }
        container.appendChild(teamsDiv);
      }
    });
  }

  function toggleCoachSelection(coachId) {
    activeCoachId = activeCoachId === coachId ? null : coachId;
    renderCoachTeamSelection();
  }

  function selectCoachAndTeam(coach, teamKey, displayName) {
    if (isPdfMode) {
      openDateRangeModal(coach, teamKey, displayName);
      return;
    }

    currentCoach = coach;
    currentTeam = teamKey;
    document.getElementById("sessionTitle").innerText = `${displayName || teamKey} - ${coach.name}`;
    resetToTodayDate();
    initSessionData();
    renderPlayersMain();

    showScreen("screenAttendance");
    document.getElementById("btnBack").style.display = "flex";

    // Refresca avisos y consultas desde GitHub en segundo plano (sin
    // bloquear la entrada a la pantalla) para que las insignias de aviso y
    // las consultas pendientes reflejen lo guardado por otros dispositivos.
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      (async () => {
        if (offlineQueue.length > 0) await processOfflineQueue();
        await Promise.all([fetchWarningsFromGitHub(), fetchQueriesFromGitHub()]);
        if (document.getElementById("screenAttendance").classList.contains("active")) {
          renderPlayersMain();
        }
      })();
    }
  }

  function initSessionData() {
    commentBoxOpen = {};
    const playerNames = getPlayersForTeamKey(currentTeam);
    sessionData = playerNames.map(name => ({
      name: name,
      attendance: "presente",
      absenceType: "",
      absenceReason: "",
      quality: 3,
      strikes: 0,
      comments: ""
    }));
  }

  // Controla, por índice de jugadora, si el mini-campo de comentarios
  // está desplegado en la tarjeta de asistencia.
  let commentBoxOpen = {};

  // ---------------------------------------------------------------------
  //  MOTIVOS DE FALTA JUSTIFICADA (compartido por Asistencia y Partido)
  //  Lista por defecto + motivos propios que se guardan en el dispositivo
  //  para próximas selecciones. 'kind' es 'train' (Asistencia) o 'match'.
  // ---------------------------------------------------------------------
  const ABSENCE_REASONS_KEY = "NVA_ABSENCE_REASONS";
  const DEFAULT_ABSENCE_REASONS = ["Enfermedad/Lesión", "Examen/Estudios", "Motivos familiares"];
  let customAbsenceReasons = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ABSENCE_REASONS_KEY));
      return Array.isArray(saved) ? saved.filter(r => typeof r === "string" && r.trim()) : [];
    } catch (e) { return []; }
  })();
  let absenceReasonMenuOpen = {};   // claves "train-<i>" / "match-<i>"

  function getAllAbsenceReasons() { return DEFAULT_ABSENCE_REASONS.concat(customAbsenceReasons); }
  function saveCustomAbsenceReasons() { localStorage.setItem(ABSENCE_REASONS_KEY, JSON.stringify(customAbsenceReasons)); }
  function getPlayersByKind(kind) { return kind === 'match' ? matchData : sessionData; }
  function rerenderPlayersByKind(kind) { if (kind === 'match') renderMatchPlayers(); else renderPlayersMain(); }

  function isPlayerPresent(player) { return player.attendance === 'presente' || !player.attendance; }
  function isJustifiedAbsence(player) {
    return player.attendance === 'falta' && (player.absenceType || 'injustificada') === 'justificada';
  }

  // Valoración (strikes/estrellas) solo tiene sentido si la jugadora estuvo:
  // al guardar, las que no están Presentes no acumulan strikes, y el motivo
  // solo se conserva en Falta Justificada.
  function playersForSave(list) {
    return list.map(p => {
      const copy = Object.assign({}, p);
      if (!isPlayerPresent(p)) copy.strikes = 0;
      if (!isJustifiedAbsence(p)) copy.absenceReason = "";
      return copy;
    });
  }

  function toggleAbsenceReasonMenu(kind, index) {
    const key = kind + "-" + index;
    absenceReasonMenuOpen[key] = !absenceReasonMenuOpen[key];
    rerenderPlayersByKind(kind);
  }

  // Inserta el motivo elegido en el comentario (sustituyendo el motivo anterior
  // si ya se había puesto uno) y lo guarda también en absenceReason.
  function applyAbsenceReason(kind, index, reason) {
    const player = getPlayersByKind(kind)[index];
    const prev = player.absenceReason || "";
    let text = player.comments || "";
    if (prev && text.includes(prev)) {
      text = text.replace(prev, () => reason);
    } else {
      text = text ? text + " · " + reason : reason;
    }
    player.comments = text;
    player.absenceReason = reason;
    absenceReasonMenuOpen[kind + "-" + index] = false;
    rerenderPlayersByKind(kind);
  }

  function pickAbsenceReason(kind, index, optIdx) {
    const reason = getAllAbsenceReasons()[optIdx];
    if (reason) applyAbsenceReason(kind, index, reason);
  }

  function addCustomAbsenceReason(kind, index) {
    const input = document.getElementById(`reasonInput-${kind}-${index}`);
    const value = input ? input.value.trim() : "";
    if (!value) return;
    const existing = getAllAbsenceReasons().find(r => r.toLowerCase() === value.toLowerCase());
    if (existing) {
      applyAbsenceReason(kind, index, existing);
      return;
    }
    customAbsenceReasons.push(value);
    saveCustomAbsenceReasons();
    applyAbsenceReason(kind, index, value);
  }

  function deleteCustomAbsenceReason(kind, index, customIdx) {
    customAbsenceReasons.splice(customIdx, 1);
    saveCustomAbsenceReasons();
    rerenderPlayersByKind(kind);
  }

  // Devuelve { btn, menu }: el botón (junto al micrófono) y la lista desplegable.
  // Solo se generan cuando la jugadora está en Falta Justificada.
  function buildAbsenceReasonControls(kind, index, player) {
    if (!isJustifiedAbsence(player)) return { btn: "", menu: "" };

    const isOpen = !!absenceReasonMenuOpen[kind + "-" + index];
    const btn = `<button type="button" class="mic-btn reason-btn ${isOpen ? 'open' : ''}"
                         onclick="toggleAbsenceReasonMenu('${kind}', ${index})"
                         title="Motivo de la falta">📋▾</button>`;
    if (!isOpen) return { btn, menu: "" };

    const all = getAllAbsenceReasons();
    const optionsHtml = all.map((reason, i) => {
      const isCustom = i >= DEFAULT_ABSENCE_REASONS.length;
      const delBtn = isCustom
        ? `<button type="button" class="reason-option-del" title="Quitar de la lista"
                   onclick="event.stopPropagation(); deleteCustomAbsenceReason('${kind}', ${index}, ${i - DEFAULT_ABSENCE_REASONS.length})">✕</button>`
        : "";
      return `<div class="reason-option ${player.absenceReason === reason ? 'selected' : ''}"
                   onclick="pickAbsenceReason('${kind}', ${index}, ${i})">
                <span>${escapeHtmlMatch(reason)}</span>${delBtn}
              </div>`;
    }).join("");

    const menu = `
        <div class="reason-menu">
          ${optionsHtml}
          <div class="reason-add-row">
            <input type="text" class="reason-add-input" id="reasonInput-${kind}-${index}"
                   placeholder="Otro motivo..."
                   onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomAbsenceReason('${kind}', ${index});}">
            <button type="button" class="reason-add-btn" onclick="addCustomAbsenceReason('${kind}', ${index})" title="Añadir a la lista">＋</button>
          </div>
        </div>`;
    return { btn, menu };
  }

  function getAttendanceStateColor(player) {
    if (player.attendance === 'falta') {
      const type = player.absenceType || 'injustificada';
      return type === 'justificada' ? '#f59e0b' : '#ef4444'; // amarillo / rojo
    }
    return '#22c55e'; // verde: presente
  }

  // Versión suave del color de estado, para el fondo de la tarjeta.
  function getAttendanceStateSoftColor(player) {
    if (player.attendance === 'falta') {
      const type = player.absenceType || 'injustificada';
      return type === 'justificada' ? '#fef3c7' : '#fee2e2'; // amarillo / rojo suaves
    }
    return '#dcfce7'; // verde suave: presente
  }

  // Ciclo del borde lateral: Presente (verde) -> Falta Injustificada (rojo)
  // -> Falta Justificada (amarillo) -> Presente...
  // Contadores hexagonales junto al título: verde presentes, rojo faltas
  // injustificadas, naranja justificadas, azul no convocadas (partido), negro total.
  function updateAttendanceCounters(kind, list) {
    const box = document.getElementById(kind === 'match' ? 'matchCounters' : 'trainCounters');
    if (!box) return;
    let pres = 0, inj = 0, jus = 0, noc = 0;
    (list || []).forEach(p => {
      if (p.attendance === 'no_convocada') noc++;
      else if (p.attendance === 'falta') ((p.absenceType || 'injustificada') === 'justificada') ? jus++ : inj++;
      else pres++;
    });
    const hex = (cls, n, t) => `<span class="att-hex ${cls}" title="${t}">${n}</span>`;
    box.innerHTML = hex('att-pres', pres, 'Presentes') + hex('att-inj', inj, 'Faltas injustificadas') +
      hex('att-jus', jus, 'Faltas justificadas') + (kind === 'match' ? hex('att-noc', noc, 'No convocadas') : '') +
      hex('att-tot', (list || []).length, 'Total');
  }

  // Ajusta el tamaño de ENTRENAMIENTO / PARTIDO al ancho libre de la barra
  // Caja de fecha justa: ancho del texto de la fecha + icono del calendario
  function fitDateInputs() {
    const cv = fitDateInputs.cv || (fitDateInputs.cv = document.createElement('canvas'));
    const ctx = cv.getContext('2d');
    document.querySelectorAll('#sessionDatePicker, #matchDatePicker').forEach(inp => {
      if (!inp.offsetParent) return;
      const cs = getComputedStyle(inp);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const txt = ctx.measureText('20/10/2026').width;
      inp.style.setProperty('width', Math.ceil(txt + 24) + 'px', 'important');
    });
  }

  // ENTRENAMIENTO / PARTIDO: alto fijo ≈85% del botón de cambio; solo se comprime a lo ancho si no cabe
  function fitModeLabels() {
    fitDateInputs();
    const head = document.querySelector('header');
    if (head) document.documentElement.style.setProperty('--nva-head-h', head.offsetHeight + 'px');
    document.querySelectorAll('.mode-label').forEach(el => {
      const avail = el.clientWidth;
      const btn = el.parentElement && el.parentElement.querySelector('.mode-swap');
      if (!avail || !btn) return;
      let sp = el.firstElementChild;
      if (!sp) { sp = document.createElement('span'); sp.textContent = el.textContent; el.textContent = ''; el.appendChild(sp); }
      sp.style.transform = 'translateY(-50%)';
      const r = sp.getBoundingClientRect();
      const capH = parseFloat(getComputedStyle(el).fontSize) * 0.72;   // alto de las mayúsculas
      const sy = (btn.offsetHeight * 0.85) / capH;
      const sx = Math.min(sy, avail / (r.width || 1));
      sp.style.transform = `translateY(-50%) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    });
  }
  window.addEventListener('resize', fitModeLabels);
  if (window.ResizeObserver) {
    const roMode = new ResizeObserver(fitModeLabels);
    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.mode-label').forEach(el => roMode.observe(el)));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitModeLabels);

  function cycleAttendanceState(index) {
    const player = sessionData[index];
    if (player.attendance !== 'falta') {
      player.attendance = 'falta';
      player.absenceType = 'injustificada';
    } else if ((player.absenceType || 'injustificada') === 'injustificada') {
      player.absenceType = 'justificada';
    } else {
      player.attendance = 'presente';
      player.absenceType = '';
    }
    absenceReasonMenuOpen['train-' + index] = false;
    renderPlayersMain();
  }

  function toggleCommentBox(index) {
    commentBoxOpen[index] = !commentBoxOpen[index];
    renderPlayersMain();
  }

  function startDictation(index) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("El dictado por voz no está disponible en este navegador.");
      return;
    }
    commentBoxOpen[index] = true;
    const micBtn = document.getElementById(`micBtn-${index}`);
    if (micBtn) micBtn.classList.add("recording");

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const current = sessionData[index].comments || "";
      sessionData[index].comments = (current ? current + " " : "") + transcript;
      renderPlayersMain();
    };
    recognition.onerror = () => {
      if (micBtn) micBtn.classList.remove("recording");
    };
    recognition.onend = () => {
      if (micBtn) micBtn.classList.remove("recording");
    };

    try {
      recognition.start();
    } catch (e) {
      if (micBtn) micBtn.classList.remove("recording");
    }
  }

  function renderPlayersMain() {
    const container = document.getElementById("playersContainer");
    container.innerHTML = "";
    updateAttendanceCounters('train', sessionData);

    sessionData.forEach((player, index) => {
      const card = document.createElement("div");
      card.className = "player-card";

      const wObj = warningsData[player.name];
      const hasWarning = !!wObj;
      const warningText = hasWarning ? (typeof wObj === 'string' ? wObj : wObj.reason) : "";
      const warningColor = hasWarning ? safeColor(wObj.color, "#ef4444") : "#ef4444";

      const nameHtml = hasWarning 
        ? `<div class="warning-capsule" style="background:${warningColor};" title="${escapeHtml(player.name)} (${escapeHtml(warningText)})">${escapeHtml(player.name)} (${escapeHtml(warningText)})</div>`
        : `<div class="player-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</div>`;

      let queryHtml = "";
      const pendingQuery = queriesData.find(q => !q.hidden && q.teams && q.teams.includes(currentTeam) && (!q.responses || !q.responses[player.name]));
      if (pendingQuery) {
        const opts = (pendingQuery.options && pendingQuery.options.length > 0) ? pendingQuery.options : ['V', 'X'];
        const btnsHtml = opts.map(opt => {
          return `<button class="query-btn" onclick="answerQuery(${Number(pendingQuery.id)}, ${jsArg(player.name)}, ${jsArg(opt)})">${escapeHtml(opt)}</button>`;
        }).join('');

        queryHtml = `
          <div class="query-capsule" style="background:${safeColor(pendingQuery.color, "#0284c7")};">
            <span>❓</span>
            ${btnsHtml}
          </div>
        `;
      }

      const stateColor = getAttendanceStateColor(player);
      card.style.backgroundColor = getAttendanceStateSoftColor(player);
      const stateLabel = player.attendance === 'falta'
        ? ((player.absenceType || 'injustificada') === 'justificada' ? 'Falta Justificada' : 'Falta Injustificada')
        : 'Presente';

      const isPresent = isPlayerPresent(player);
      // Solo Presente permite plegar/desplegar el comentario; en el resto
      // de estados (falta / no convocada) se muestra siempre desplegado.
      const isCommentOpen = !isPresent || !!commentBoxOpen[index];
      const reasonUI = buildAbsenceReasonControls('train', index, player);
      const safeComment = escapeHtml(player.comments);

      const ratingHtml = isPresent ? `
          <div class="strikes-xxx">
            ${[1, 2, 3].map(n => `
              <span class="xmark ${n <= player.strikes ? 'active' : ''}" 
                    onclick="setStrikes(${index}, ${player.strikes === n ? n - 1 : n})">${n <= player.strikes ? '❌' : '✖️'}</span>
            `).join('')}
          </div>

          <div class="stars">
            ${[1, 2, 3, 4, 5].map(star => `
              <span class="star ${star <= player.quality ? 'active' : ''}" 
                    onclick="setQuality(${index}, ${star})">★</span>
            `).join('')}
          </div>
      ` : '';

      card.innerHTML = `
        <div class="state-strip" onclick="cycleAttendanceState(${index})" title="Estado: ${stateLabel} (pulsa para cambiar)">
          <div class="state-strip-bar" style="background:${stateColor};"></div>
        </div>

        <div class="card-row-1">
          <div style="display:flex; align-items:center; gap:4px; flex:1; min-width:0; overflow:hidden;">
            ${nameHtml}
            ${queryHtml}
          </div>
        </div>

        <div class="card-row-2">
          <div class="comment-toggle-wrap">
            <button type="button" class="comment-bubble-btn ${player.comments ? 'has-comment' : ''}" 
                    ${isPresent ? `onclick="toggleCommentBox(${index})"` : 'style="cursor:default;"'} title="Comentarios">💬</button>
            <div class="comment-compact-row" style="display:${isCommentOpen ? 'flex' : 'none'};">
              <input type="text" class="comment-compact-input" value="${safeComment}" 
                     placeholder="Comentario u observación..." 
                     onchange="updateComment(${index}, this.value)">
              <button type="button" id="micBtn-${index}" class="mic-btn" 
                      onclick="startDictation(${index})" title="Dictar por voz">🎤</button>
              ${reasonUI.btn}
            </div>
          </div>

          ${ratingHtml}
        </div>

        ${reasonUI.menu}
      `;
      container.appendChild(card);
    });
  }

  function setQuality(i, r) { sessionData[i].quality = r; renderPlayersMain(); }
  function setStrikes(i, c) { sessionData[i].strikes = c; renderPlayersMain(); }
  function updateComment(i, text) { sessionData[i].comments = text; }

  // Las funciones siguientes pertenecen al antiguo modal de "Motivo de la
  // Falta" (modalAbsence). Ya no se invocan desde el flujo de asistencia
  // (el estado se marca ahora con el borde lateral y el motivo, si se desea,
  // se anota en el campo de comentarios), pero se conservan intactas por si
  // el modal se usa en algún otro punto.
  function selectReason(reason) { document.getElementById("customReason").value = reason; }

  function confirmAbsence() {
    const reason = document.getElementById("customReason").value || "Falta de asistencia";
    if (selectedPlayerIndexForAbsence !== null) {
      sessionData[selectedPlayerIndexForAbsence].absenceReason = reason;
      sessionData[selectedPlayerIndexForAbsence].comments = `[Falta]: ${reason}`;
    }
    document.getElementById("modalAbsence").classList.remove("active");
    renderPlayersMain();
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  async function goBack() {
    showScreen("screenCoachTeam");
    document.getElementById("btnBack").style.display = "none";

    // Cada vez que se vuelve a la pantalla principal se sincroniza con
    // GitHub (enviando antes lo pendiente) para ver lo que otro usuario
    // haya modificado y guardado mientras tanto.
    await fullSyncFromGitHub(true);
  }

  // --- Historial: título con el equipo, resumen por registro y carga de 6 en 6 ---
  const HISTORY_PAGE = 6;
  let historyLimit = HISTORY_PAGE, matchHistoryLimit = HISTORY_PAGE;

  function historyTeamLabel() {
    const t = (document.getElementById("sessionTitle").innerText || "").trim();
    return t.replace(/\s+-\s+[^-]*$/, "") || currentTeam || "";
  }

  // Media de estrellas (solo presentes) + strikes + hexágonos de asistencia
  function historyLogSummaryHtml(log, kind) {
    const js = log.jugadores || [];
    const pres = js.filter(j => j.attendance === 'presente' || !j.attendance);
    const q = pres.filter(j => j.quality);
    const media = q.length ? (q.reduce((a, j) => a + j.quality, 0) / q.length).toFixed(1) : "–";
    const strikes = js.reduce((a, j) => a + (j.strikes || 0), 0);
    let inj = 0, jus = 0, noc = 0;
    js.forEach(j => {
      if (j.attendance === 'no_convocada') noc++;
      else if (j.attendance === 'falta') ((j.absenceType || 'injustificada') === 'justificada') ? jus++ : inj++;
    });
    const hex = (cls, n, t) => `<span class="att-hex att-mini ${cls}" title="${t}">${n}</span>`;
    const hexes = js.length
      ? hex('att-pres', pres.length, 'Presentes') + hex('att-inj', inj, 'Faltas injustificadas') + hex('att-jus', jus, 'Faltas justificadas') +
        (kind === 'match' ? hex('att-noc', noc, 'No convocadas') : '') + hex('att-tot', js.length, 'Total')
      : `<span style="font-size:0.72rem; color:#64748b;">Sin asistencia registrada</span>`;
    return `<div class="hist-stats"><span title="Media de estrellas">⭐ ${media}</span><span title="Strikes">❌ ${strikes}</span></div>
          <div class="att-counters hist-hexes">${hexes}</div>`;
  }

  // ---- Fechas de registro / modificación de cada registro ----
  // Se guardan en el JSON (registrado, modificado). Para registros antiguos sin
  // esas fechas se deducen del historial de commits del fichero en GitHub.
  function stampLogDates(entry, prev) {
    const now = new Date().toISOString();
    if (prev && prev.registrado) {
      entry.registrado = prev.registrado;
      entry.modificado = now;
    } else if (prev) {
      entry.modificado = now; // registro antiguo: la creación sale de GitHub
    } else {
      entry.registrado = now;
    }
  }

  (function () {
    const st = document.createElement("style");
    st.textContent = ".hist-fecha-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.hist-reg-fechas{font-size:0.68rem;line-height:1.3;color:#475569;font-weight:500}";
    document.head.appendChild(st);
  })();

  function fmtLogDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}H`;
  }

  function logDatesKey(log, kind) { return `${kind}|${log.equipo}|${log.fecha}`; }
  function logDatesCache() { try { return JSON.parse(localStorage.getItem("NVA_REG_FECHAS") || "{}"); } catch (e) { return {}; } }

  function logDatesResolved(log, kind) {
    const c = logDatesCache()[logDatesKey(log, kind)] || {};
    const reg = log.registrado || c.registrado || "";
    let mod = log.modificado || "";
    if (c.modificado && (!mod || c.modificado > mod)) mod = c.modificado;
    if (mod && reg && Math.abs(new Date(mod) - new Date(reg)) < 60000) mod = "";
    return { reg, mod };
  }

  function logDatesInner(log, kind) {
    const { reg, mod } = logDatesResolved(log, kind);
    return (reg ? `<div>Registro: ${fmtLogDate(reg)}</div>` : "") + (mod ? `<div>Modificado: ${fmtLogDate(mod)}</div>` : "");
  }

  function logDatesHtml(log, kind) {
    return `<div class="hist-reg-fechas" data-regkey="${escapeHtml(logDatesKey(log, kind))}">${logDatesInner(log, kind)}</div>`;
  }

  async function fillLogDatesFromCommits(logs, kind) {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return;
    const cache = logDatesCache();
    const pending = logs.filter(l => !l.registrado && !cache[logDatesKey(l, kind)]);
    if (!pending.length) return;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
    await Promise.all(pending.map(async log => {
      const path = kind === "match"
        ? `${MATCH_LOGS_FOLDER}/Partidos_${sanitizeFileName(log.equipo)}_${log.fecha}.json`
        : `${TRAINING_LOGS_FOLDER}/Entrenamientos_${sanitizeFileName(log.equipo)}_${log.fecha}.json`;
      try {
        const r = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/commits?path=${encodeURIComponent(path)}&per_page=100`, { headers, cache: "no-store" });
        if (!r.ok) return;
        const commits = await r.json();
        if (!Array.isArray(commits) || !commits.length) return;
        const dateOf = c => (c.commit && (c.commit.author || c.commit.committer) || {}).date;
        const info = { registrado: dateOf(commits[commits.length - 1]) };
        if (commits.length > 1) info.modificado = dateOf(commits[0]);
        cache[logDatesKey(log, kind)] = info;
      } catch (e) { /* sin conexión: se intentará otra vez */ }
    }));
    try { localStorage.setItem("NVA_REG_FECHAS", JSON.stringify(cache)); } catch (e) {}
    pending.forEach(log => {
      const el = document.querySelector(`.hist-reg-fechas[data-regkey="${CSS.escape(logDatesKey(log, kind))}"]`);
      if (el) el.innerHTML = logDatesInner(log, kind);
    });
  }

  function historyMoreButton(container, shown, total, onMore) {
    if (shown >= total) return;
    const b = document.createElement("button");
    b.className = "btn-history-more";
    b.textContent = `Cargar más registros (${total - shown} más)`;
    b.onclick = onMore;
    container.appendChild(b);
  }

  async function openHistoryModal() {
    historyLimit = HISTORY_PAGE;
    document.getElementById("historyTitle").innerText = `📜 Entrenamientos ${historyTeamLabel()}`;
    document.getElementById("modalHistory").classList.add("active");

    // Refresca los registros desde GitHub antes de listarlos, para que el
    // Historial recoja también los entrenamientos guardados desde otros
    // dispositivos y no solo lo que quedó cacheado en este navegador.
    // Antes de leer, se envía cualquier cambio pendiente en la cola offline
    // para no perderlo ni mostrar una versión más antigua.
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      const container = document.getElementById("historyListContainer");
      container.innerHTML = `<p style="text-align:center; font-size:0.85rem; color:#64748b; padding:20px;">Actualizando historial...</p>`;
      if (offlineQueue.length > 0) await processOfflineQueue();
      await fetchTrainingLogsFromGitHub();
    }

    renderHistoryList();
  }

  function closeHistoryModal() {
    document.getElementById("modalHistory").classList.remove("active");
  }

  function renderHistoryList() {
    const container = document.getElementById("historyListContainer");
    container.innerHTML = "";
    const teamLogs = allTrainingLogs.filter(log => log.equipo === currentTeam);

    if (teamLogs.length === 0) {
      container.innerHTML = `<p style="text-align:center; font-size:0.85rem; color:#64748b; padding:20px;">No hay entrenamientos guardados previamente para este equipo.</p>`;
      return;
    }

    teamLogs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    teamLogs.slice(0, historyLimit).forEach((log) => {
      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
        <div>
          <div class="hist-fecha-row"><div style="font-weight:700; font-size:0.85rem; color:var(--azul-dark);">📅 ${escapeHtml(log.fecha)}</div>${logDatesHtml(log, 'train')}</div>
          ${historyLogSummaryHtml(log, 'train')}
        </div>
        <div class="history-actions">
          <button class="btn-edit-history" onclick="loadRecordForEditing(${jsArg(log.fecha)})">✏️ Cargar/Editar</button>
          <button class="btn-delete-history" onclick="openDeleteLogModal(currentTeam, ${jsArg(log.fecha)}, 'train')">🗑️ Borrar</button>
        </div>
      `;
      container.appendChild(card);
    });
    historyMoreButton(container, historyLimit, teamLogs.length, () => { historyLimit += HISTORY_PAGE; renderHistoryList(); });
    fillLogDatesFromCommits(teamLogs.slice(0, historyLimit), 'train');
  }

  function loadRecordForEditing(fecha) {
    const log = allTrainingLogs.find(l => l.equipo === currentTeam && l.fecha === fecha);
    if (!log) return;
    document.getElementById("sessionDatePicker").value = log.fecha;
    sessionData = JSON.parse(JSON.stringify(log.jugadores));
    renderPlayersMain();
    closeHistoryModal();
    alert(`Se ha cargado el entrenamiento del ${log.fecha} para modificar. Al terminar pulsa "Guardar Entrenamiento en GitHub".`);
  }

  function promptOwnerPassword() {
    document.getElementById("ownerPasswordInput").value = "";
    document.getElementById("modalPassword").classList.add("active");
  }

  function closePasswordModal() { document.getElementById("modalPassword").classList.remove("active"); }

  async function verifyOwnerPassword() {
    const pass = document.getElementById("ownerPasswordInput").value;
    if (!window.crypto || !crypto.subtle) {
      alert("Para entrar en Opciones abre la app desde su dirección https://.");
      return;
    }
    if (await nvaHashPassword(pass) === OWNER_PASS_SHA256) {
      closePasswordModal();
      await openOptionsModal();
    } else {
      alert("Contraseña incorrecta de propietario.");
    }
  }

  async function openOptionsModal() {
    // Antes de mostrar el panel de administración se sincroniza la
    // configuración con GitHub (enviando antes lo pendiente), para editar
    // siempre sobre la última versión y no pisar cambios de otro dispositivo.
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      if (offlineQueue.length > 0) await processOfflineQueue();
      await syncConfigFromGitHub(true);
    }
    renderConfigTab1();
    renderConfigTab2Select();
    document.getElementById("modalOptions").classList.add("active");
    if (document.getElementById("tabContent3").classList.contains("active")) await renderLeaguesTab();
  }

  function closeOptionsModal() {
    document.getElementById("modalOptions").classList.remove("active");
    renderCoachTeamSelection();
  }

  function switchTab(num) {
    document.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", i + 1 === num));
    document.querySelectorAll(".tab-content").forEach((c, i) => c.classList.toggle("active", i + 1 === num));
    if (num === 2) renderPlayerManagement();
    if (num === 3) withLoading(renderLeaguesTab, 'Cargando equipos de la liga...');
  }

  function renderConfigTab1() {
    const coachesList = document.getElementById("configCoachesList");
    coachesList.innerHTML = "";
    document.getElementById("coachCountBadge").innerText = appData.coaches.length;

    appData.coaches.forEach((c, idx) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `<span><strong>${escapeHtml(c.name)}</strong> (${c.teams ? c.teams.length : 0} eq.)</span>
                       <button class="btn-del" onclick="deleteCoach(${idx})">✕</button>`;
      coachesList.appendChild(row);
    });

    const teamsList = document.getElementById("configTeamsList");
    teamsList.innerHTML = "";
    document.getElementById("teamCountBadge").innerText = appData.teams.length;

    appData.teams.forEach((t, idx) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `<span><strong>${escapeHtml(t.name)}</strong> <small class="badge">${escapeHtml(t.category)}</small></span>
                       <button class="btn-del" onclick="deleteTeam(${idx})">✕</button>`;
      teamsList.appendChild(row);
    });

    const selectCoach = document.getElementById("selectCoachAssign");
    selectCoach.innerHTML = "";
    appData.coaches.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.innerText = c.name;
      selectCoach.appendChild(opt);
    });
    renderCoachAssignments();
  }

  function addCoach() {
    const input = document.getElementById("newCoachName");
    const name = input.value.trim();
    if (!name) return;
    appData.coaches.push({ id: Date.now(), name: name, teams: [] });
    input.value = "";
    saveDataAndSyncGitHub();
  }

  function deleteCoach(idx) { appData.coaches.splice(idx, 1); saveDataAndSyncGitHub(); }

  function addTeam() {
    const inputName = document.getElementById("newTeamName");
    const catSelect = document.getElementById("newTeamCategory");
    const name = inputName.value.trim();
    const category = catSelect.value;
    if (!name) return;

    if (!appData.teams.some(t => t.name === name && t.category === category)) {
      appData.teams.push({ name: name, category: category });
      const key = `${name} (${category})`;
      if (!appData.players[key]) appData.players[key] = [];
      saveDataAndSyncGitHub();
      renderConfigTab2Select();
    }
    inputName.value = "";
  }

  function deleteTeam(idx) {
    const team = appData.teams[idx];
    if (!team) return;
    const teamKey = getTeamKey(team);
    const teamName = team.name;

    const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar el equipo "${team.name} (${team.category})"? Esta acción también borrará sus jugadores y asignaciones.`);
    if (!confirmDelete) return;

    appData.teams.splice(idx, 1);
    delete appData.players[teamKey];
    if (teamName) delete appData.players[teamName];

    appData.coaches.forEach(c => {
      if (c.teams) c.teams = c.teams.filter(t => t !== teamKey && t !== teamName);
    });
    saveDataAndSyncGitHub();
    renderConfigTab2Select();
  }

  function renderCoachAssignments() {
    const coachId = parseInt(document.getElementById("selectCoachAssign").value);
    const container = document.getElementById("coachTeamsCheckboxes");
    container.innerHTML = "";

    const coach = appData.coaches.find(c => c.id === coachId);
    if (!coach) return;

    appData.teams.forEach(t => {
      const key = getTeamKey(t);
      const label = document.createElement("label");
      label.style.fontSize = "0.8rem";
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";

      const isChecked = coach.teams && (coach.teams.includes(key) || coach.teams.includes(t.name));
      label.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleTeamCoachAssignment(${Number(coach.id)}, ${jsArg(key)})"> ${escapeHtml(t.name)} (${escapeHtml(t.category)})`;
      container.appendChild(label);
    });
  }

  function toggleTeamCoachAssignment(coachId, teamKey) {
    const coach = appData.coaches.find(c => c.id === coachId);
    if (!coach) return;
    if (!coach.teams) coach.teams = [];

    const teamObj = appData.teams.find(t => getTeamKey(t) === teamKey);
    const simpleName = teamObj ? teamObj.name : teamKey;

    if (coach.teams.includes(teamKey) || coach.teams.includes(simpleName)) {
      coach.teams = coach.teams.filter(t => t !== teamKey && t !== simpleName);
    } else {
      coach.teams.push(teamKey);
    }
    saveDataAndSyncGitHub();
  }

  function renderConfigTab2Select() {
    const selectTeam = document.getElementById("selectTeamPlayers");
    selectTeam.innerHTML = "";
    appData.teams.forEach(t => {
      const key = getTeamKey(t);
      const opt = document.createElement("option");
      opt.value = key;
      opt.innerText = `${t.name} (${t.category})`;
      selectTeam.appendChild(opt);
    });
    renderPlayerManagement();
  }

  function renderPlayerManagement() {
    const teamKey = document.getElementById("selectTeamPlayers").value;
    const container = document.getElementById("draggablePlayerList");
    container.innerHTML = "";

    if (!teamKey) {
      document.getElementById("playerCountBadge").innerText = "0";
      return;
    }

    const playersList = getPlayersForTeamKey(teamKey);
    document.getElementById("playerCountBadge").innerText = playersList.length;

    playersList.forEach((player, index) => {
      const item = document.createElement("div");
      item.className = "item-row";
      item.style.marginBottom = "4px";
      item.innerHTML = `
        <span style="font-weight:600;">${escapeHtml(player)}</span>
        <div style="display:flex; gap:4px; align-items:center;">
          <button style="border:none; background:#e2e8f0; border-radius:4px; padding:2px 5px; font-size:0.7rem;" onclick="movePlayer(${jsArg(teamKey)}, ${index}, -1)">▲</button>
          <button style="border:none; background:#e2e8f0; border-radius:4px; padding:2px 5px; font-size:0.7rem;" onclick="movePlayer(${jsArg(teamKey)}, ${index}, 1)">▼</button>
          <button class="btn-del" onclick="deletePlayer(${jsArg(teamKey)}, ${index})">✕</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  function addPlayer() {
    const teamKey = document.getElementById("selectTeamPlayers").value;
    const input = document.getElementById("newPlayerName");
    const name = input.value.trim();
    if (!name || !teamKey) return;

    const playersList = ensurePlayerListExists(teamKey);
    playersList.push(name);
    input.value = "";
    saveDataAndSyncGitHub();
    renderPlayerManagement();
  }

  function deletePlayer(teamKey, index) {
    const playersList = getPlayersForTeamKey(teamKey);
    if (playersList && playersList[index] !== undefined) playersList.splice(index, 1);
    saveDataAndSyncGitHub();
    renderPlayerManagement();
  }

  function movePlayer(teamKey, index, direction) {
    const list = getPlayersForTeamKey(teamKey);
    if (!list) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    saveDataAndSyncGitHub();
    renderPlayerManagement();
  }

  /* ------------------- COMUNICACIÓN REST API GITHUB CON ARQUITECTURA SEGREGADA Y COLA OFFLINE ------------------- */
  function loadGitHubSettingsUI() {
    document.getElementById("ghUser").value = ghSettings.user || "";
    document.getElementById("ghRepo").value = ghSettings.repo || "";
    document.getElementById("ghToken").value = ghSettings.token || "";
  }

  async function saveGitHubSettings() {
    ghSettings.user = document.getElementById("ghUser").value.trim();
    ghSettings.repo = document.getElementById("ghRepo").value.trim();
    ghSettings.token = document.getElementById("ghToken").value.trim();
    localStorage.setItem("NVA_GH_SETTINGS", JSON.stringify(ghSettings));
    alert("Configuración de GitHub guardada.");
    // fullSyncFromGitHub encadena correctamente: primero envía lo pendiente,
    // luego configuración, y por último entrenamientos/warnings/consultas/tablón.
    await fullSyncFromGitHub(false);
  }

  function saveQueriesToLocalStorage() {
    localStorage.setItem("NVA_QUERIES_DATA", JSON.stringify(queriesData));
  }

  function clearAllLocalStorageData() {
    const confirmDelete = confirm("⚠️ ATENCIÓN: ¿Estás seguro de que deseas borrar TODOS los datos guardados en el almacenamiento local de este dispositivo?\n\nEsta acción limpiará la memoria local y reajustará los ajustes.");
    if (!confirmDelete) return;

    localStorage.clear();
    
    appData = defaultData;
    tablonData = { tablonText: "" };
    otrosData = [];
    otrosOpenId = null;
    if (typeof hzResetLocal === "function") hzResetLocal();
    offlineQueue = [];
    allTrainingLogs = [];
    warningsData = {};
    queriesData = [];
    customAbsenceReasons = [];

    localStorage.setItem("NVA_APP_DATA", JSON.stringify(appData));

    loadGitHubSettingsUI();
    renderCoachTeamSelection();
    
    const tablonEl = document.getElementById("tablonTextarea");
    if (tablonEl) tablonEl.value = "";

    closeOptionsModal();
    alert("¡Se han borrado exitosamente todos los datos del almacenamiento local!");
  }

  function saveDataAndSyncGitHub() {
    localStorage.setItem("NVA_APP_DATA", JSON.stringify(appData));
    renderConfigTab1();
    if (ghSettings.user && ghSettings.repo && ghSettings.token) {
      writeGitHubFile("configuracion.json", appData, "Actualizar configuraciones del club");
    }
  }

  async function writeGitHubFile(fileName, dataObject, commitMessage) {
    if (!navigator.onLine || !ghSettings.user || !ghSettings.repo || !ghSettings.token) {
      enqueueOfflineOp(fileName, dataObject, commitMessage);
      return false;
    }

    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${fileName}`;
    try {
      let sha = "";
      const getRes = await fetch(url, { headers: { "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
      if (getRes.ok) {
        const getJson = await getRes.json();
        sha = getJson.sha;
      }
      const contentBase64 = utf8_to_b64(typeof dataObject === "string" ? dataObject : JSON.stringify(dataObject, null, 2));
      const body = { message: commitMessage, content: contentBase64, ...(sha && { sha: sha }) };
      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Authorization": `token ${ghSettings.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!putRes.ok) {
        enqueueOfflineOp(fileName, dataObject, commitMessage);
      }
      return putRes.ok;
    } catch (e) {
      enqueueOfflineOp(fileName, dataObject, commitMessage);
      return false;
    }
  }

  function enqueueOfflineOp(fileName, dataObject, commitMessage) {
    offlineQueue.push({
      fileName: fileName,
      dataObject: dataObject,
      commitMessage: commitMessage,
      timestamp: Date.now()
    });
    localStorage.setItem("NVA_OFFLINE_QUEUE", JSON.stringify(offlineQueue));
  }

  // ---------------------------------------------------------------------
  //  BORRADO DE UN REGISTRO DE ENTRENAMIENTO
  //  Se elimina de la caché local y del fichero de la carpeta "registros/".
  //  Si no hay conexión (o falla), el borrado queda en la cola offline.
  // ---------------------------------------------------------------------
  function isLogPendingDelete(equipo, fecha, kind) {
    return offlineQueue.some(op => op.deleteLog && op.equipo === equipo && op.fecha === fecha && (op.kind || 'train') === (kind || 'train'));
  }

  function enqueueOfflineDeleteLog(equipo, fecha, kind) {
    kind = kind || 'train';
    if (isLogPendingDelete(equipo, fecha, kind)) return;
    const esPartido = kind === 'match';
    offlineQueue.push({
      deleteLog: true,
      kind: kind,
      equipo: equipo,
      fecha: fecha,
      fileName: esPartido
        ? `${MATCH_LOGS_FOLDER}/Partidos_${sanitizeFileName(equipo)}_${fecha}.json`
        : `${TRAINING_LOGS_FOLDER}/Entrenamientos_${sanitizeFileName(equipo)}_${fecha}.json`,
      commitMessage: `Borrar registro ${esPartido ? 'partido' : 'entrenamiento'} ${equipo} - ${fecha}`,
      timestamp: Date.now()
    });
    localStorage.setItem("NVA_OFFLINE_QUEUE", JSON.stringify(offlineQueue));
  }

  // Borra en GitHub el/los fichero(s) que contienen el registro de ese equipo y fecha.
  // Devuelve true si ya no queda nada de ese registro en el repositorio.
  // kind: 'train' (carpeta registros/, Entrenamientos_*) o 'match' (carpeta Partidos/, Partidos_*)
  async function githubDeleteTrainingLogFiles(equipo, fecha, kind) {
    if (!ghSettings.user || !ghSettings.repo || !ghSettings.token || !navigator.onLine) return false;
    const esPartido = kind === 'match';
    const folder = esPartido ? MATCH_LOGS_FOLDER : TRAINING_LOGS_FOLDER;
    const prefix = esPartido ? "Partidos_" : "Entrenamientos_";
    const tipoTxt = esPartido ? "partido" : "entrenamiento";
    const files = await listGitHubFolder(folder);
    if (!files) return false;   // no se pudo listar: no se puede confirmar el borrado

    const authHeaders = { "Authorization": `token ${ghSettings.token}` };
    const candidates = files.filter(f => f.name && f.name.startsWith(prefix) && f.name.endsWith(".json") && f.name.includes(fecha));

    for (const file of candidates) {
      const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${folder}/${file.name}`;
      const getRes = await fetch(url, { headers: authHeaders, cache: "no-store" });
      if (!getRes.ok) { if (getRes.status === 404) continue; return false; }
      const getJson = await getRes.json();
      let parsed;
      try { parsed = JSON.parse(b64_to_utf8(getJson.content)); } catch (e) { continue; }

      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const isTarget = e => e && e.equipo === equipo && e.fecha === fecha;
      if (!entries.some(isTarget)) continue;

      const remaining = entries.filter(e => !isTarget(e));
      let res;
      if (remaining.length > 0) {
        // El fichero contiene también otros registros: se reescribe sin el borrado
        res = await fetch(url, {
          method: "PUT",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Borrar registro ${tipoTxt} ${equipo} - ${fecha}`,
            content: utf8_to_b64(JSON.stringify(remaining, null, 2)),
            sha: getJson.sha
          })
        });
      } else {
        res = await fetch(url, {
          method: "DELETE",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Borrar registro ${tipoTxt} ${equipo} - ${fecha}`, sha: getJson.sha })
        });
      }
      if (!res.ok && res.status !== 404) return false;
    }
    return true;
  }

  let pendingDeleteLog = null;   // { equipo, fecha }

  function openDeleteLogModal(equipo, fecha, kind) {
    kind = kind || 'train';
    const esPartido = kind === 'match';
    const existe = (esPartido ? allMatchLogs : allTrainingLogs).some(l => l.equipo === equipo && l.fecha === fecha);
    if (!existe) {
      alert(`Este ${esPartido ? 'partido' : 'entrenamiento'} no tiene registro guardado: no hay nada que borrar.`);
      return;
    }
    pendingDeleteLog = { equipo, fecha, kind };
    const p = String(fecha).split("-");
    const fechaTxt = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : fecha;
    document.getElementById("deleteLogText").innerText =
      `¿Quieres borrar el registro de ${esPartido ? 'partido' : 'entrenamiento'} de ${equipo} del ${fechaTxt}?`;
    const modalDel = document.getElementById("modalDeleteLog");
    document.body.appendChild(modalDel);   // por encima del Historial abierto
    modalDel.classList.add("active");
  }

  function closeDeleteLogModal() {
    document.getElementById("modalDeleteLog").classList.remove("active");
  }

  async function confirmDeleteLog() {
    const d = pendingDeleteLog;
    if (!d) return;
    pendingDeleteLog = null;
    closeDeleteLogModal();

    const esPartido = d.kind === 'match';
    const noEs = l => !(l.equipo === d.equipo && l.fecha === d.fecha);
    if (esPartido) {
      allMatchLogs = allMatchLogs.filter(noEs);
      localStorage.setItem("NVA_MATCH_LOGS", JSON.stringify(allMatchLogs));
    } else {
      allTrainingLogs = allTrainingLogs.filter(noEs);
      localStorage.setItem("NVA_TRAINING_LOGS", JSON.stringify(allTrainingLogs));
    }

    let ok = false;
    try {
      ok = await githubDeleteTrainingLogFiles(d.equipo, d.fecha, d.kind);
    } catch (e) {
      console.error("Error al borrar el registro en GitHub:", e);
    }
    if (!ok) enqueueOfflineDeleteLog(d.equipo, d.fecha, d.kind);

    if (document.getElementById("modalHistory").classList.contains("active")) renderHistoryList();
    if (document.getElementById("modalMatchHistory").classList.contains("active")) renderMatchHistoryList();
    renderWeekCalendar();
    alert(ok
      ? "Registro borrado."
      : "Registro borrado en este dispositivo. Se eliminará de GitHub cuando recupere la conexión.");
  }

  async function processOfflineQueue() {
    if (!navigator.onLine || offlineQueue.length === 0) return;
    if (!ghSettings.user || !ghSettings.repo || !ghSettings.token) return;

    const remaining = [];
    for (const op of offlineQueue) {
      if (op.deleteLog) {
        try {
          if (!(await githubDeleteTrainingLogFiles(op.equipo, op.fecha, op.kind))) remaining.push(op);
        } catch (e) {
          remaining.push(op);
        }
        continue;
      }
      const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${op.fileName}`;
      try {
        let sha = "";
        const getRes = await fetch(url, { headers: { "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
        if (getRes.ok) {
          const getJson = await getRes.json();
          sha = getJson.sha;
        }
        const contentBase64 = utf8_to_b64(typeof op.dataObject === "string" ? op.dataObject : JSON.stringify(op.dataObject, null, 2));
        const body = { message: op.commitMessage, content: contentBase64, ...(sha && { sha: sha }) };
        const putRes = await fetch(url, {
          method: "PUT",
          headers: { "Authorization": `token ${ghSettings.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!putRes.ok) remaining.push(op);
      } catch (e) {
        remaining.push(op);
      }
    }

    offlineQueue = remaining;
    localStorage.setItem("NVA_OFFLINE_QUEUE", JSON.stringify(offlineQueue));
  }

  // Sincronización completa con GitHub: se usa cada vez que se abre o se
  // vuelve a una pantalla/menú, y también al recuperar la conexión. Primero
  // envía lo pendiente (offlineQueue) para no sobrescribirlo con datos
  // remotos desactualizados, luego sincroniza configuración (equipos y
  // categorías, de los que dependen los nombres de fichero) y por último
  // trae en paralelo entrenamientos, warnings, consultas y tablón.
  // Al terminar, refresca en pantalla lo que el usuario tenga abierto.
  async function fullSyncFromGitHub(silent = true) {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return;

    if (offlineQueue.length > 0) {
      await processOfflineQueue();
    }

    await syncConfigFromGitHub(silent);
    await Promise.all([
      fetchTrainingLogsFromGitHub(),
      fetchWarningsFromGitHub(),
      fetchQueriesFromGitHub(),
      fetchTablonFromGitHub(),
      fetchOtrosFromGitHub(),
      (typeof fetchHorariosFromGitHub === "function" ? fetchHorariosFromGitHub() : Promise.resolve())
    ]);

    refreshActiveScreenUI();
  }

  // Vuelve a pintar la pantalla/modal que esté visible en este momento con
  // los datos ya actualizados desde GitHub, sin cambiar de pantalla ni
  // alterar la navegación del usuario.
  function refreshActiveScreenUI() {
    const screenCoachTeamEl = document.getElementById("screenCoachTeam");
    const screenAttendanceEl = document.getElementById("screenAttendance");
    const screenWarningsEl = document.getElementById("screenWarnings");

    if (screenCoachTeamEl && screenCoachTeamEl.classList.contains("active")) {
      renderCoachTeamSelection();
      rebuildDireccionAccordionIfExpanded();
      renderWeekCalendar();
    }

    if (screenAttendanceEl && screenAttendanceEl.classList.contains("active")) {
      renderPlayersMain();
    }

    if (screenWarningsEl && screenWarningsEl.classList.contains("active")) {
      renderWarningPlayers();
    }

    const screenOtrosEl = document.getElementById("screenOtros");
    if (screenOtrosEl && screenOtrosEl.classList.contains("active")) {
      renderOtros();
    }

    const screenHorariosEl = document.getElementById("screenHorarios");
    if (screenHorariosEl && screenHorariosEl.classList.contains("active") && typeof hzRenderAll === "function") {
      hzRenderAll();
    }

    const tablonEl = document.getElementById("tablonTextarea");
    if (tablonEl && document.activeElement !== tablonEl) {
      tablonEl.value = tablonData.tablonText || "";
      autoResizeTablon(tablonEl);
    }

    const modalOptionsEl = document.getElementById("modalOptions");
    if (modalOptionsEl && modalOptionsEl.classList.contains("active")) {
      renderConfigTab1();
    }
  }

  // Reconstruye el acordeón "Gestión y Avisos Individuales" solo si ya
  // estaba desplegado, para reflejar avisos nuevos sin abrirlo si el usuario
  // lo tenía cerrado.
  function rebuildDireccionAccordionIfExpanded() {
    if (!isDireccionExpanded) return;
    isDireccionExpanded = false;
    toggleDireccionNVA();
  }

  async function syncConfigFromGitHub(silent = false) {
    if (!ghSettings.user || !ghSettings.repo) return; 
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/configuracion.json`;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;

    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        appData = JSON.parse(b64_to_utf8(json.content));

        localStorage.setItem("NVA_GH_SETTINGS", JSON.stringify(ghSettings));
        localStorage.setItem("NVA_APP_DATA", JSON.stringify(appData));

        renderCoachTeamSelection();
        if (!silent) alert("¡Configuración sincronizada desde GitHub correctamente!");
      } else {
        if (!silent) alert("No se pudo obtener la configuracion.json desde GitHub.");
      }
    } catch (e) { 
      console.error(e); 
      if (!silent) alert("Error de conexión al sincronizar desde GitHub.");
    }
  }

  async function saveQueriesToGitHub() {
    saveQueriesToLocalStorage();
    return await writeGitHubFile("Consultas.json", queriesData, "Actualizar consultas del club");
  }

  async function fetchQueriesFromGitHub() {
    if (!ghSettings.user || !ghSettings.repo) return;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/Consultas.json`;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;

    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        queriesData = JSON.parse(b64_to_utf8(json.content));
        saveQueriesToLocalStorage();
        if (document.getElementById("screenAttendance").classList.contains("active")) {
          renderPlayersMain();
        }
      }
    } catch (e) { console.error("Error al cargar Consultas.json:", e); }
  }

  async function saveSession() {
    const dateVal = document.getElementById("sessionDatePicker").value;
    if (!dateVal) {
      alert("Por favor selecciona una fecha.");
      return;
    }

    const logEntry = {
      fecha: dateVal,
      equipo: currentTeam,
      entrenador: currentCoach ? currentCoach.name : "",
      jugadores: playersForSave(sessionData)
    };
    stampLogDates(logEntry, allTrainingLogs.find(l => l.equipo === currentTeam && l.fecha === dateVal));

    const existingIndex = allTrainingLogs.findIndex(l => l.equipo === currentTeam && l.fecha === dateVal);
    if (existingIndex >= 0) {
      allTrainingLogs[existingIndex] = logEntry;
    } else {
      allTrainingLogs.push(logEntry);
    }

    localStorage.setItem("NVA_TRAINING_LOGS", JSON.stringify(allTrainingLogs));

    // Un fichero por equipo y por fecha, dentro de la carpeta "registros/"
    const sessionFileName = `${TRAINING_LOGS_FOLDER}/Entrenamientos_${sanitizeFileName(currentTeam)}_${dateVal}.json`;
    const success = await writeGitHubFile(sessionFileName, logEntry, `Registro entrenamiento ${currentTeam} - ${dateVal}`);

    if (success) {
      alert("¡Entrenamiento guardado y sincronizado en GitHub!");
    } else {
      alert("Guardado localmente. Se sincronizará con GitHub cuando recupere la conexión.");
    }
  }

  async function listGitHubFolder(folderPath) {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return null;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${folderPath}`;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;

    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        return Array.isArray(json) ? json : [];
      }
      if (res.status === 404) return []; // la carpeta aún no existe = no hay ficheros, no es un error
      console.error(`Error HTTP ${res.status} al listar la carpeta ${folderPath}`);
    } catch (e) {
      console.error(`Error al listar la carpeta ${folderPath}:`, e);
      return null; // fallo real de red: se distingue de "carpeta vacía"
    }
    return null;
  }

  // Lee el JSON de un fichero que viene de listGitHubFolder. El listado trae
  // el "sha" (huella) de cada fichero: si ya se descargó esa misma versión,
  // se usa la copia guardada en el dispositivo y no se pide a GitHub. Así cada
  // sincronización solo descarga los ficheros nuevos o modificados.
  // Devuelve null si GitHub responde con error (igual que antes).
  const GH_SHA_CACHE = "ghsha-v1";   // sin prefijo "nva-": sw.js no la borra al cambiar de versión
  async function readListedGitHubJson(file, headers) {
    const key = file.sha ? `https://nva-cache.local/sha/${file.sha}` : null;
    let cache = null;
    if (key && typeof caches !== "undefined") {
      try {
        cache = await caches.open(GH_SHA_CACHE);
        const hit = await cache.match(key);
        if (hit) return JSON.parse(await hit.text());
      } catch (e) { cache = null; }
    }
    const res = await fetch(file.url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const text = b64_to_utf8(json.content);
    const parsed = JSON.parse(text);
    if (cache && json.sha === file.sha) {
      try { await cache.put(key, new Response(text, { headers: { "Content-Type": "application/json" } })); } catch (e) {}
    }
    return parsed;
  }

  // Los entrenamientos se guardan como un fichero por equipo y por fecha
  // dentro de la carpeta "registros/" (p.ej. Entrenamientos_NVA_Alevin_2026-09-15.json).
  // En lugar de intentar adivinar el nombre exacto del fichero a partir del
  // equipo (frágil, porque nombres/categorías cambian), se lista la carpeta
  // completa y se lee el "equipo" y la "fecha" del propio contenido de cada
  // fichero. Así se detectan también los registros ya existentes en el repo.
  async function fetchTrainingLogsFromGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return;

    const files = await listGitHubFolder(TRAINING_LOGS_FOLDER);
    if (!files) return; // fallo de red al listar la carpeta: no tocar la caché local
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;

    // Los ficheros se leen en paralelo (antes se leían uno a uno, esperando
    // cada respuesta antes de pedir la siguiente): con muchos entrenamientos
    // guardados esto reduce el tiempo de carga de N peticiones en serie a
    // una sola tanda simultánea, sin cambiar qué datos se leen ni cómo se
    // fusionan (la fusión sigue siendo síncrona, igual que antes).
    const relevantFiles = files.filter(file => file.name && file.name.startsWith("Entrenamientos_") && file.name.endsWith(".json"));
    const results = await Promise.all(relevantFiles.map(async file => {
      try {
        return await readListedGitHubJson(file, headers);
      } catch (e) {
        console.error(`Error al leer ${file.name}:`, e);
        return null;
      }
    }));

    results.forEach(parsed => {
      if (!parsed) return;
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      entries.forEach(remoteLog => {
        if (!remoteLog || !remoteLog.equipo || !remoteLog.fecha) return;
        if (isLogPendingDelete(remoteLog.equipo, remoteLog.fecha)) return;   // borrado pendiente de enviar a GitHub
        const idx = allTrainingLogs.findIndex(l => l.equipo === remoteLog.equipo && l.fecha === remoteLog.fecha);
        if (idx >= 0) {
          allTrainingLogs[idx] = remoteLog;
        } else {
          allTrainingLogs.push(remoteLog);
        }
      });
    });

    localStorage.setItem("NVA_TRAINING_LOGS", JSON.stringify(allTrainingLogs));
  }

  async function saveWarningsToGitHub() {
    localStorage.setItem("NVA_WARNINGS_DATA", JSON.stringify(warningsData));

    // Un fichero por equipo, igual que los entrenamientos: solo se escriben
    // los avisos de las jugadoras que pertenecen al equipo actual.
    const teamPlayers = getPlayersForTeamKey(currentTeam);
    const teamWarnings = {};
    teamPlayers.forEach(name => {
      if (warningsData[name]) teamWarnings[name] = warningsData[name];
    });

    const fileName = `${WARNINGS_FOLDER}/warning_${sanitizeFileName(currentTeam)}.json`;
    const success = await writeGitHubFile(fileName, teamWarnings, `Actualizar warnings - ${currentTeam}`);
    if (success) {
      alert("¡Warnings guardados y sincronizados en GitHub!");
    } else {
      alert("Guardado localmente. Se sincronizará con GitHub cuando recupere la conexión.");
    }

    // Vuelve a la pantalla principal y refresca el acordeón de "Gestión y
    // Avisos Individuales" para que quede con los avisos actualizados.
    showScreen("screenCoachTeam");
    document.getElementById("btnBack").style.display = "none";
    refreshDireccionAccordion();
  }

  // Los warnings se guardan como un fichero por equipo dentro de la carpeta
  // "warnings/" (p.ej. warning_NVA_Alevin.json). Igual que con los
  // entrenamientos, se lista la carpeta completa y se fusiona el contenido
  // de cada fichero (playerName -> {reason, color}) en el objeto global
  // warningsData, en lugar de depender de un único "Warnings.json" en la raíz.
  async function fetchWarningsFromGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return;

    const files = await listGitHubFolder(WARNINGS_FOLDER);
    if (!files) return; // fallo de red al listar la carpeta: no tocar la caché local

    // Solo se leen los ficheros de warnings que corresponden a un equipo que
    // existe AHORA MISMO en la configuración (appData.teams). Si un equipo
    // cambió de nombre o categoría en algún momento, el fichero antiguo
    // "warning_<nombre-viejo>.json" se queda huérfano en el repositorio con
    // datos obsoletos. Si se sigue leyendo ese fichero huérfano, sus avisos
    // "resucitan" en la app aunque ya no existan en el fichero actual del
    // equipo, que es justo el síntoma reportado.
    const validFileNames = new Set(
      (appData.teams || []).map(t => `warning_${sanitizeFileName(getTeamKey(t))}.json`)
    );

    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;

    // Cada fichero "warning_<equipo>.json" contiene el estado COMPLETO de
    // avisos de ese equipo (solo las jugadoras que tienen aviso ahora mismo).
    // Por eso, para que un aviso borrado en GitHub también desaparezca aquí,
    // se reconstruye warningsData desde cero en vez de solo fusionar claves
    // nuevas sobre el objeto anterior (lo cual dejaba avisos "fantasma" que
    // ya no existían en el repositorio).
    const freshWarningsData = {};
    let allFilesReadOk = true;
    let anyOrphanSkipped = false;

    // Igual que con los entrenamientos: se leen todos los ficheros vigentes
    // en paralelo en vez de uno a uno, sin cambiar qué se lee ni cómo se
    // fusiona el resultado final.
    const relevantWarningFiles = [];
    for (const file of files) {
      if (!file.name || !file.name.startsWith("warning_") || !file.name.endsWith(".json")) continue;
      if (!validFileNames.has(file.name)) {
        anyOrphanSkipped = true;
        console.warn(`Ignorando fichero de warnings huérfano (no corresponde a ningún equipo actual): ${file.name}`);
        continue;
      }
      relevantWarningFiles.push(file);
    }

    const warningResults = await Promise.all(relevantWarningFiles.map(async file => {
      try {
        const teamWarnings = await readListedGitHubJson(file, headers);
        if (teamWarnings === null) return { ok: false };
        return { ok: true, teamWarnings };
      } catch (e) {
        console.error(`Error al leer ${file.name}:`, e);
        return { ok: false };
      }
    }));

    warningResults.forEach(({ ok, teamWarnings }) => {
      if (!ok) { allFilesReadOk = false; return; }
      if (teamWarnings && typeof teamWarnings === "object" && !Array.isArray(teamWarnings)) {
        Object.assign(freshWarningsData, teamWarnings);
      }
    });

    if (allFilesReadOk) {
      // Todos los ficheros vigentes se leyeron correctamente: freshWarningsData
      // es el estado real y completo de GitHub, así que sustituye por completo
      // al anterior (esto es lo que elimina los avisos "fantasma").
      warningsData = freshWarningsData;
    } else {
      // Si algún fichero falló al leerse, se conserva lo que ya había en
      // caché y solo se actualiza con lo que sí se pudo leer, para no borrar
      // avisos reales por un fallo puntual de red.
      Object.assign(warningsData, freshWarningsData);
    }

    localStorage.setItem("NVA_WARNINGS_DATA", JSON.stringify(warningsData));
    if (anyOrphanSkipped) {
      localStorage.setItem("NVA_WARNINGS_ORPHAN_FILES_DETECTED", "1");
    }
    if (document.getElementById("screenWarnings").classList.contains("active")) {
      renderWarningPlayers();
    }
  }

  /**
     * Muestra la ventana flotante de carga con el mensaje indicado.
     */
  function mostrarCargando(mensaje = "Procesando datos...") {
    document.getElementById("loadingMessage").textContent = mensaje;
    document.getElementById("loadingOverlay").classList.add("active");
  }

  /**
     * Oculta la ventana flotante de carga.
     */
  function ocultarCargando() {
    document.getElementById("loadingOverlay").classList.remove("active");
  }

  /**
     * Envuelve cualquier función asíncrona para mostrar el overlay durante su ejecución.
     * @param {Function} asyncFunc - Función que devuelve una promesa (tu lógica de red/guardado)
     * @param {string} mensaje - Mensaje a mostrar en el overlay
     */
  async function withLoading(asyncFunc, mensaje = "Procesando datos...") {
      mostrarCargando(mensaje);
      try {
        return await asyncFunc();
      } catch (error) {
        console.error("Error en la operación:", error);
        alert("Ocurrió un error al procesar la solicitud.");
      } finally {
        ocultarCargando();
      }
  }

  // =====================================================================
  //  MÓDULO PARTIDO
  //  Mismo funcionamiento que la pantalla de Asistencia (entrenamientos),
  //  pero para reportar partidos. Se guarda un fichero por equipo y fecha
  //  en la carpeta "Partidos/" (p.ej. Partidos_NVA_A_Infantil__2026-09-15.json)
  //  con exactamente el mismo formato que los entrenamientos.
  //  Estados: Presente (verde), Falta justificada (amarillo),
  //           Falta injustificada (rojo), No Convocada (azul).
  // =====================================================================
  const MATCH_LOGS_FOLDER = "Partidos";

  let matchData = [];
  let allMatchLogs = JSON.parse(localStorage.getItem("NVA_MATCH_LOGS")) || [];
  let matchCommentBoxOpen = {};
  let matchInitialized = false;
  let matchTeamKey = null;

  document.addEventListener("DOMContentLoaded", () => {
    const picker = document.getElementById("matchDatePicker");
    if (picker) picker.addEventListener("change", () => { loadMatchScoreForDate(); renderMatchScoreboard(); });
  });

  function resetMatchToTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("matchDatePicker").value = today;
  }

  function initMatchData() {
    matchCommentBoxOpen = {};
    resetMatchScore();
    const playerNames = getPlayersForTeamKey(currentTeam);
    matchData = playerNames.map(name => ({
      name: name,
      attendance: "presente",
      absenceType: "",
      absenceReason: "",
      quality: 3,
      strikes: 0,
      comments: ""
    }));
  }

  // ---------------------------------------------------------------------
  //  MARCADOR DEL PARTIDO
  // ---------------------------------------------------------------------
  const LEAGUES_FOLDER = "Ligas";
  const MATCH_SETS_COUNT = 5;

  let matchScore = { local: "", visitante: "", sets: [] };
  let leagueTeamsList = [];
  let leaguePickSide = "home";
  const leagueFileNames = {}; // teamKey -> nombre real del .txt en Ligas/ (si ya existe)

  function resetMatchScore() {
    matchScore = { local: "", visitante: "", sets: [] };
    for (let i = 0; i < MATCH_SETS_COUNT; i++) matchScore.sets.push({ local: "", visitante: "" });
  }

  function escapeHtmlMatch(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Sets ganados: en cada fila con los dos puntos rellenados, +1 al que tenga más puntos.
  function computeMatchSets() {
    let local = 0, visitante = 0;
    matchScore.sets.forEach(s => {
      if (s.local === "" || s.visitante === "") return;
      const a = parseInt(s.local, 10), b = parseInt(s.visitante, 10);
      if (isNaN(a) || isNaN(b)) return;
      if (a > b) local++;
      else if (b > a) visitante++;
    });
    return { local, visitante };
  }

  function updateMatchScoreDigits() {
    const t = computeMatchSets();
    const l = document.getElementById("msScoreLocal");
    const v = document.getElementById("msScoreVisit");
    if (l) l.textContent = t.local;
    if (v) v.textContent = t.visitante;
  }

  function onMatchSetInput(i, side, el) {
    el.value = el.value.replace(/\D/g, "").slice(0, 2);
    matchScore.sets[i][side] = el.value;
    updateMatchScoreDigits();
  }

  // ---------------------------------------------------------------------
  //  DICTADO POR VOZ DE LAS PUNTUACIONES
  //  Orden de relleno: fila 1 local, fila 1 visitante, fila 2 local, ...
  // ---------------------------------------------------------------------
  const matchVoice = { active: false, recognition: null, slot: 0, wantListening: false };

  const VOICE_UNITS = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
    ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21,
    veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
    veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29
  };
  const VOICE_TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };

  // Convierte un texto dictado ("25 23", "veinticinco veintitrés", "treinta y uno") en una lista de números.
  function parseSpokenNumbers(text) {
    const tokens = String(text || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^\d+$/.test(t)) { out.push(parseInt(t, 10)); continue; }
      if (t in VOICE_TENS) {
        let n = VOICE_TENS[t];
        if (tokens[i + 1] === "y" && tokens[i + 2] in VOICE_UNITS && VOICE_UNITS[tokens[i + 2]] < 10) {
          n += VOICE_UNITS[tokens[i + 2]];
          i += 2;
        }
        out.push(n);
        continue;
      }
      if (t in VOICE_UNITS) out.push(VOICE_UNITS[t]);
    }
    return out;
  }

  function highlightNextVoiceSlot() {
    document.querySelectorAll(".ms-set-input.voice-next").forEach(el => el.classList.remove("voice-next"));
    if (!matchVoice.active) return;
    const inputs = document.querySelectorAll("#matchScoreboard .ms-set-input");
    if (inputs[matchVoice.slot]) inputs[matchVoice.slot].classList.add("voice-next");
  }

  function fillMatchSlotsFromNumbers(numbers) {
    const inputs = document.querySelectorAll("#matchScoreboard .ms-set-input");
    const total = MATCH_SETS_COUNT * 2;
    numbers.forEach(n => {
      if (matchVoice.slot >= total) return;
      const value = String(Math.min(Math.max(n, 0), 99));
      const row = Math.floor(matchVoice.slot / 2);
      const side = matchVoice.slot % 2 === 0 ? "local" : "visitante";
      matchScore.sets[row][side] = value;
      if (inputs[matchVoice.slot]) inputs[matchVoice.slot].value = value;
      matchVoice.slot++;
    });
    updateMatchScoreDigits();
    if (matchVoice.slot >= total) stopMatchVoice();
    else highlightNextVoiceSlot();
  }

  function setMatchVoiceUI(active) {
    matchVoice.active = active;
    const btn = document.getElementById("msVoiceBtn");
    if (btn) btn.classList.toggle("recording", active);
    highlightNextVoiceSlot();
  }

  function stopMatchVoice() {
    matchVoice.wantListening = false;
    const rec = matchVoice.recognition;
    matchVoice.recognition = null;
    if (rec) { try { rec.stop(); } catch (e) {} }
    setMatchVoiceUI(false);
  }

  function startMatchVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("El dictado por voz no está disponible en este navegador.");
      return;
    }
    matchVoice.slot = 0;
    matchVoice.wantListening = true;

    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        fillMatchSlotsFromNumbers(parseSpokenNumbers(event.results[i][0].transcript));
      }
    };
    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        alert("No hay permiso para usar el micrófono.");
        stopMatchVoice();
      }
    };
    // El navegador corta el reconocimiento tras un silencio: se reinicia mientras siga activo.
    recognition.onend = () => {
      if (matchVoice.wantListening && matchVoice.recognition === recognition) {
        try { recognition.start(); return; } catch (e) {}
      }
      if (matchVoice.recognition === recognition) stopMatchVoice();
    };

    matchVoice.recognition = recognition;
    try {
      recognition.start();
      setMatchVoiceUI(true);
    } catch (e) {
      stopMatchVoice();
    }
  }

  function toggleMatchVoice() {
    if (matchVoice.active) stopMatchVoice();
    else startMatchVoice();
  }

  // El marcador ya no se rellena a mano: se muestra (solo lectura) cuando el registro
  // del partido de esa fecha tiene resultado, que llega con la carga automática de
  // «Resultados de la semana» (Dirección NVA > Carteles). Sin datos, no se ve.
  function hasMatchScoreData() {
    return !!(matchScore.local || matchScore.visitante ||
      matchScore.sets.some(s => s.local !== "" || s.visitante !== ""));
  }

  function loadMatchScoreForDate() {
    const picker = document.getElementById("matchDatePicker");
    const fecha = picker ? picker.value : "";
    const log = allMatchLogs.find(l => l.equipo === currentTeam && l.fecha === fecha);
    loadMatchScoreFromLog(log);
  }

  function renderMatchScoreboard() {
    const box = document.getElementById("matchScoreboard");
    if (!box) return;
    if (matchVoice.active) stopMatchVoice();
    if (!hasMatchScoreData()) { box.innerHTML = ""; box.style.display = "none"; return; }
    box.style.display = "";
    const t = computeMatchSets();

    const teamBox = (name, placeholder) => `<div class="ms-box ms-team ${name ? '' : 'placeholder'}">${name ? escapeHtmlMatch(name) : placeholder}</div>`;
    const rows = matchScore.sets
      .filter(s => s.local !== "" || s.visitante !== "")
      .map(s => `
      <div class="ms-set-row">
        <span class="ms-set-input ms-set-ro">${escapeHtmlMatch(s.local)}</span>
        <span class="ms-dash">-</span>
        <span class="ms-set-input ms-set-ro">${escapeHtmlMatch(s.visitante)}</span>
      </div>`).join("");

    box.innerHTML = `
      <div class="ms-side">
        ${teamBox(matchScore.local, 'HOME')}
        <div class="ms-box ms-score" id="msScoreLocal">${t.local}</div>
      </div>
      <div class="ms-mid">
        <div class="ms-box ms-sets-title"><span>SETS</span></div>
        ${rows}
      </div>
      <div class="ms-side">
        ${teamBox(matchScore.visitante, 'VISIT')}
        <div class="ms-box ms-score" id="msScoreVisit">${t.visitante}</div>
      </div>
    `;
  }

  // Datos del marcador que se guardan dentro del registro del partido.
  function buildMatchMarcador() {
    const t = computeMatchSets();
    return {
      local: matchScore.local,
      visitante: matchScore.visitante,
      sets: matchScore.sets.map(s => ({
        local: s.local === "" ? null : parseInt(s.local, 10),
        visitante: s.visitante === "" ? null : parseInt(s.visitante, 10)
      })),
      setsLocal: t.local,
      setsVisitante: t.visitante
    };
  }

  function loadMatchScoreFromLog(log) {
    resetMatchScore();
    const m = log && log.marcador;
    if (!m) return;
    matchScore.local = m.local || "";
    matchScore.visitante = m.visitante || "";
    (m.sets || []).slice(0, MATCH_SETS_COUNT).forEach((s, i) => {
      matchScore.sets[i] = {
        local: (s && s.local != null) ? String(s.local) : "",
        visitante: (s && s.visitante != null) ? String(s.visitante) : ""
      };
    });
  }

  // --- Lista de equipos de la liga: carpeta "Ligas/", un .txt por equipo del club ---
  // El fichero se localiza por el nombre del equipo del club (sin distinguir
  // mayúsculas, acentos, espacios ni signos), p.ej. "NVA A (Infantil).txt".
  // Cada línea del .txt es un equipo de la liga. Se cachea para uso sin conexión.
  // Localiza en la carpeta "Ligas/" el .txt del equipo del club indicado.
  // Devuelve el elemento del listado de GitHub, o null si no existe / no hay conexión.
  async function findLeagueFile(teamKey) {
    if (!(ghSettings.user && ghSettings.repo && navigator.onLine)) return null;
    const norm = s => sanitizeFileName(s).replace(/_/g, "").toLowerCase();
    const stripTxt = n => n.replace(/\.txt$/i, "");

    const files = await listGitHubFolder(LEAGUES_FOLDER);
    if (!files) return null;
    const txts = files.filter(f => f.name && /\.txt$/i.test(f.name));
    const simpleName = teamKey.split(" (")[0];
    return txts.find(f => norm(stripTxt(f.name)) === norm(teamKey))
        || txts.find(f => norm(stripTxt(f.name)) === norm(simpleName))
        || null;
  }

  async function fetchLeagueTeamsForTeam(teamKey) {
    const cacheKey = `NVA_LEAGUE_${sanitizeFileName(teamKey)}`;

    const file = await findLeagueFile(teamKey);
    if (file) {
      leagueFileNames[teamKey] = file.name;
      try {
        const headers = {};
        if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
        const res = await fetch(file.url, { headers, cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          const text = b64_to_utf8(json.content).replace(/^\uFEFF/, "");
          const list = [];
          text.split(/\r?\n/).forEach(line => {
            const name = line.trim();
            if (name && !list.includes(name)) list.push(name);
          });
          localStorage.setItem(cacheKey, JSON.stringify(list));
          return list;
        }
      } catch (e) {
        console.error("Error al leer el fichero de la liga:", e);
      }
    }

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (Array.isArray(cached)) return cached;
    } catch (e) {}
    return [];
  }

  async function fetchLeagueTeamsForCurrentTeam() {
    return fetchLeagueTeamsForTeam(currentTeam);
  }

  async function openLeagueTeamsModal(side) {
    leaguePickSide = side;
    leagueTeamsList = await fetchLeagueTeamsForCurrentTeam();

    document.getElementById("leagueModalTitle").innerText =
      side === "home" ? "Equipo HOME (local)" : "Equipo VISIT (visitante)";

    const container = document.getElementById("leagueTeamsContainer");
    container.innerHTML = "";

    if (leagueTeamsList.length === 0) {
      container.innerHTML = `<p style="text-align:center; font-size:0.85rem; color:#64748b; padding:20px;">No se encontró la lista de equipos de la liga para ${escapeHtmlMatch(currentTeam)} (carpeta "${LEAGUES_FOLDER}"). Comprueba la conexión y que exista el archivo .txt con el nombre del equipo.</p>`;
    } else {
      leagueTeamsList.forEach((name, i) => {
        const btn = document.createElement("button");
        btn.className = "app-input";
        btn.style.textAlign = "left";
        btn.style.cursor = "pointer";
        btn.textContent = name;
        btn.onclick = () => selectLeagueTeam(i);
        container.appendChild(btn);
      });
    }
    document.getElementById("modalLeagueTeams").classList.add("active");
  }

  function closeLeagueTeamsModal() {
    document.getElementById("modalLeagueTeams").classList.remove("active");
  }

  // Cancela la selección: los dos lados vuelven al predeterminado (HOME / VISIT).
  function resetLeagueTeams() {
    matchScore.local = "";
    matchScore.visitante = "";
    closeLeagueTeamsModal();
    renderMatchScoreboard();
  }

  // Elegido un rival en un lado, el otro lado se rellena con el equipo del club.
  function selectLeagueTeam(index) {
    const name = leagueTeamsList[index];
    if (name === undefined) return;
    if (leaguePickSide === "home") {
      matchScore.local = name;
      matchScore.visitante = currentTeam;
    } else {
      matchScore.visitante = name;
      matchScore.local = currentTeam;
    }
    closeLeagueTeamsModal();
    renderMatchScoreboard();
  }

  // ---------------------------------------------------------------------
  //  CONFIGURACIÓN DEL CLUB > PESTAÑA "LIGAS"
  //  Igual que la pestaña de jugadores/as, pero para los equipos de la liga
  //  de cada equipo del club. Se guarda un .txt por equipo en la carpeta
  //  "Ligas/", con un equipo por fila (mismo formato que lee la pantalla Partido).
  // ---------------------------------------------------------------------
  let leagueEdit = { key: "", list: [] };
  let leagueWriteChain = Promise.resolve();

  async function renderLeaguesTab() {
    const select = document.getElementById("selectTeamLeagues");
    const prev = select.value;
    select.innerHTML = "";
    appData.teams.forEach(t => {
      const opt = document.createElement("option");
      opt.value = getTeamKey(t);
      opt.innerText = `${t.name} (${t.category})`;
      select.appendChild(opt);
    });
    if (prev && Array.from(select.options).some(o => o.value === prev)) select.value = prev;
    await loadLeagueEditList();
  }

  async function loadLeagueEditList() {
    const key = document.getElementById("selectTeamLeagues").value;
    // Antes de leer, se termina de enviar lo pendiente para no traer datos desactualizados.
    await leagueWriteChain;
    if (navigator.onLine && offlineQueue.length > 0) await processOfflineQueue();
    leagueEdit = { key: key, list: key ? await fetchLeagueTeamsForTeam(key) : [] };
    renderLeagueManagement();
  }

  function renderLeagueManagement() {
    const container = document.getElementById("draggableLeagueList");
    container.innerHTML = "";
    document.getElementById("leagueCountBadge").innerText = leagueEdit.list.length;

    leagueEdit.list.forEach((name, index) => {
      const item = document.createElement("div");
      item.className = "item-row";
      item.style.marginBottom = "4px";
      item.innerHTML = `
        <span style="font-weight:600;">${escapeHtmlMatch(name)}</span>
        <div style="display:flex; gap:4px; align-items:center;">
          <button style="border:none; background:#e2e8f0; border-radius:4px; padding:2px 5px; font-size:0.7rem;" onclick="moveLeagueTeam(${index}, -1)">▲</button>
          <button style="border:none; background:#e2e8f0; border-radius:4px; padding:2px 5px; font-size:0.7rem;" onclick="moveLeagueTeam(${index}, 1)">▼</button>
          <button class="btn-del" onclick="deleteLeagueTeam(${index})">✕</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  function addLeagueTeam() {
    if (!leagueEdit.key) return;
    const input = document.getElementById("newLeagueTeamName");
    const name = input.value.trim();
    if (!name) return;
    if (leagueEdit.list.some(n => n.toLowerCase() === name.toLowerCase())) {
      alert("Ese equipo ya está en la lista de la liga.");
      return;
    }
    leagueEdit.list.push(name);
    input.value = "";
    saveLeagueEditList();
    renderLeagueManagement();
  }

  function deleteLeagueTeam(index) {
    if (leagueEdit.list[index] === undefined) return;
    leagueEdit.list.splice(index, 1);
    saveLeagueEditList();
    renderLeagueManagement();
  }

  function moveLeagueTeam(index, direction) {
    const list = leagueEdit.list;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    saveLeagueEditList();
    renderLeagueManagement();
  }

  // --- Cargar la liga desde el PDF de la federación (tabla CLASIFICACION) ---
  // Lee el PDF en el propio dispositivo (pdf.js, se descarga solo la primera vez),
  // toma los equipos de la última tabla y quita el equipo del club seleccionado.
  const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js?v=8";
  const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  async function ensurePdfJs() {
    if (!window.pdfjsLib) await loadScriptOnce(PDFJS_URL);
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      // El worker está en otro dominio: se envuelve en un blob para que el navegador lo permita.
      const blob = new Blob([`importScripts("${PDFJS_WORKER_URL}");`], { type: "text/javascript" });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    }
  }

  function normalizeTeamName(n) {
    return (n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  // Devuelve [{pos, name}] con las filas de la tabla CLASIFICACION del PDF.
  async function extractStandingsTeamsFromPdf(file) {
    await ensurePdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const rows = [];
    let seenHeading = false;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Agrupar los textos por línea (misma coordenada Y) y ordenarlos de izquierda a derecha
      const lines = [];
      content.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5], x = it.transform[4];
        let line = lines.find(l => Math.abs(l.y - y) < 2.5);
        if (!line) { line = { y: y, items: [] }; lines.push(line); }
        line.items.push({ x: x, str: it.str.trim() });
      });
      lines.sort((a, b) => b.y - a.y);
      lines.forEach(l => {
        const text = l.items.sort((a, b) => a.x - b.x).map(i => i.str).join(" ").replace(/\s+/g, " ");
        if (/CLASIFICACI[OÓ]N/i.test(text)) { seenHeading = true; rows.length = 0; return; }
        // Pos + Equipo + 11 columnas numéricas (Pj PG3 PG2 PP1 PP0 SA SF SC PF PC Ptos)
        const m = text.match(/^(\d{1,2})\s+(.+?)((?:\s+\d+){11})$/);
        if (m && /[A-Za-zÀ-ÿ]/.test(m[2])) rows.push({ pos: parseInt(m[1], 10), name: m[2].trim() });
      });
    }
    return rows;
  }

  function findOwnTeamRow(rows, teamName) {
    const target = normalizeTeamName(teamName);
    if (!target) return -1;
    let i = rows.findIndex(r => normalizeTeamName(r.name) === target);
    if (i >= 0) return i;
    const cands = rows.map((r, idx) => ({ idx, n: normalizeTeamName(r.name) }))
      .filter(c => c.n.includes(target) || target.includes(c.n));
    return cands.length === 1 ? cands[0].idx : -1;
  }

  async function handleLeaguePdfSelected(input) {
    const file = input.files && input.files[0];
    input.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!leagueEdit.key) { alert("Selecciona primero un equipo."); return; }

    let rows;
    mostrarCargando("Leyendo el PDF...");
    try {
      rows = await extractStandingsTeamsFromPdf(file);
    } catch (e) {
      console.error("Error al leer el PDF:", e);
      ocultarCargando();
      alert("No se pudo leer el PDF. Comprueba que es el calendario de la federación y que hay conexión la primera vez (se descarga el lector de PDF).");
      return;
    }
    ocultarCargando();

    if (rows.length < 2) {
      alert("No he encontrado la tabla de CLASIFICACIÓN en este PDF.");
      return;
    }

    const teamObj = appData.teams.find(t => getTeamKey(t) === leagueEdit.key);
    const ownName = teamObj ? teamObj.name : leagueEdit.key;
    let ownIdx = findOwnTeamRow(rows, ownName);

    if (ownIdx < 0) {
      const menu = rows.map((r, i) => `${i + 1}. ${r.name}`).join("\n");
      const ans = prompt(`No encuentro "${ownName}" en la tabla.\nEscribe el número de TU equipo para excluirlo (o deja vacío para no excluir ninguno):\n\n${menu}`);
      if (ans === null) return;
      const n = parseInt(ans, 10);
      if (n >= 1 && n <= rows.length) ownIdx = n - 1;
    }

    const rivals = rows.filter((_, i) => i !== ownIdx).map(r => r.name);
    if (!rivals.length) { alert("No se han encontrado rivales."); return; }

    let finalList;
    if (leagueEdit.list.length > 0) {
      const replace = confirm(`Se han encontrado ${rivals.length} rivales.\n\nAceptar = REEMPLAZAR la lista actual (${leagueEdit.list.length} equipos).\nCancelar = AÑADIR solo los que falten.`);
      if (replace) finalList = rivals;
      else {
        const have = new Set(leagueEdit.list.map(normalizeTeamName));
        finalList = leagueEdit.list.concat(rivals.filter(r => !have.has(normalizeTeamName(r))));
      }
    } else {
      finalList = rivals;
    }

    leagueEdit.list = finalList;
    saveLeagueEditList();
    renderLeagueManagement();
  }

  // Guarda en local (caché que también usa la pantalla Partido) y envía a GitHub.
  // Los envíos se encadenan para que lleguen en orden y no se pisen entre sí.
  function saveLeagueEditList() {
    const key = leagueEdit.key;
    if (!key) return;
    const snapshot = leagueEdit.list.slice();
    localStorage.setItem(`NVA_LEAGUE_${sanitizeFileName(key)}`, JSON.stringify(snapshot));

    if (ghSettings.user && ghSettings.repo && ghSettings.token) {
      leagueWriteChain = leagueWriteChain
        .then(() => saveLeagueTeamsToGitHub(key, snapshot))
        .catch(e => console.error("Error al guardar la liga:", e));
    }
  }

  async function saveLeagueTeamsToGitHub(teamKey, list) {
    // Si ya existe un .txt de ese equipo en Ligas/ (aunque se llame distinto), se reutiliza
    // para no duplicarlo; si no, se crea con el nombre del equipo.
    let fileName = leagueFileNames[teamKey];
    if (!fileName) {
      const file = await findLeagueFile(teamKey);
      if (file) { fileName = file.name; leagueFileNames[teamKey] = fileName; }
    }
    const path = `${LEAGUES_FOLDER}/${fileName ? encodeURIComponent(fileName) : sanitizeFileName(teamKey) + ".txt"}`;
    const text = list.join("\n") + "\n"; // un equipo por fila
    await writeGitHubFile(path, text, `Actualizar liga de ${teamKey}`);
  }

  // =====================================================================
  //  CALENDARIO SEMANAL (página principal)
  //  Dibuja la misma imagen que «Horarios» (hzDrawSchedule) pero con las
  //  fechas de la semana y, sobre cada entrenamiento ya terminado:
  //    V = existe un registro de ese equipo en esa fecha
  //    X = no tiene registro
  //  Los entrenamientos que aún no han terminado no llevan marca.
  // =====================================================================
  let wkOffset = 0; // 0 = semana en curso, -1 = anterior, 1 = siguiente...
  const WK_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function wkFmt(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function wkMonday(offset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return d;
  }
  // Rayas diagonales sobre un polígono (entrenamiento o día anulado)
  function wkStripes(ctx, pts) {
    ctx.save();
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.clip();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineWidth = 5;
    ctx.beginPath();
    for (let k = -h; k < w + h; k += 22) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
    ctx.stroke();
    ctx.restore();
  }
  function wkAnulado(key, dateStr) { return !!(window.nvaEntrenoAnulado && window.nvaEntrenoAnulado(key, dateStr)); }
  function wkMarkFor(x, mon, logSet, now) {
    const d = new Date(mon); d.setDate(mon.getDate() + x.day - 1);
    if (wkAnulado(x.key, wkFmt(d))) return null;
    if (logSet.has(`${x.key}|${wkFmt(d)}`)) return "V";
    const end = new Date(d); end.setHours(Math.floor(x.e / 60), x.e % 60, 0, 0);
    return end <= now ? "X" : null;
  }
  let wkDayHits = [];     // cabeceras de los días (modo anulación)
  let wkHits = [];        // geometría de los entrenamientos dibujados (para detectar el toque)
  let wkShownMonday = null;

  function wkOpts() {
    const mon = wkMonday(wkOffset);
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    const now = new Date();
    const logSet = new Set(allTrainingLogs.map(l => `${l.equipo}|${l.fecha}`));
    const dayLabels = [0, 1, 2, 3, 4].map(i => { const d = new Date(mon); d.setDate(mon.getDate() + i); return String(d.getDate()); });
    return {
      subtitle: `Semana del ${mon.getDate()} ${WK_MONTHS[mon.getMonth()]} al ${fri.getDate()} ${WK_MONTHS[fri.getMonth()]} ${fri.getFullYear()}`,
      dayLabels,
      mark: x => wkMarkFor(x, mon, logSet, now),
      anulado: x => { const d = new Date(mon); d.setDate(mon.getDate() + x.day - 1); return wkAnulado(x.key, wkFmt(d)); },
      diaAnulado: day => { const d = new Date(mon); d.setDate(mon.getDate() + day - 1); return !!(window.nvaDiaAnulado && window.nvaDiaAnulado(wkFmt(d))); },
      hits: [], dayHits: [],
      _mon: mon, _logSet: logSet, _now: now
    };
  }

  function renderWeekCalendar() {
    const canvas = document.getElementById("wkCanvas");
    if (!canvas) return;
    const opts = wkOpts();
    hzDrawSchedule(canvas, opts);
    wkHits = opts.hits;
    wkDayHits = opts.dayHits;
    wkShownMonday = opts._mon;
    let ok = 0, miss = 0;
    hzBuildModel().sessions.forEach(x => {
      const m = wkMarkFor(x, opts._mon, opts._logSet, opts._now);
      if (m === "V") ok++; else if (m === "X") miss++;
    });
    const nOk = document.getElementById("wkCountV"), nMiss = document.getElementById("wkCountX");
    if (nOk) nOk.textContent = ok;
    if (nMiss) nMiss.textContent = miss;
  }
  function wkMove(delta) { wkOffset += delta; renderWeekCalendar(); }

  function wkPointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // Entrenamiento dibujado bajo un punto de la pantalla -> { key, date } o null
  function wkHitFromPoint(clientX, clientY) {
    const canvas = document.getElementById("wkCanvas");
    if (!canvas || !wkShownMonday) return null;
    const r = canvas.getBoundingClientRect();
    const px = (clientX - r.left) * canvas.width / r.width;
    const py = (clientY - r.top) * canvas.height / r.height;
    for (let i = wkHits.length - 1; i >= 0; i--) {
      if (wkPointInPoly(px, py, wkHits[i].pts)) {
        const d = new Date(wkShownMonday); d.setDate(d.getDate() + wkHits[i].day - 1);
        return { key: wkHits[i].key, date: wkFmt(d) };
      }
    }
    return null;
  }

  let wkSuppressClick = false;   // tras una pulsación larga no se abre el registro

  // Toque sobre la imagen: si cae en un entrenamiento, se abre su registro
  function wkCanvasClick(ev) {
    if (wkSuppressClick) { wkSuppressClick = false; return; }
    // Modo «Deselección entrenamientos» (anulaciones.js): toque = anular / reactivar
    if (window.nvaModoAnular && window.nvaModoAnular()) {
      const canvas = document.getElementById("wkCanvas");
      const r = canvas.getBoundingClientRect();
      const px = (ev.clientX - r.left) * canvas.width / r.width, py = (ev.clientY - r.top) * canvas.height / r.height;
      const dh = wkDayHits.find(h => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
      if (dh) { const d = new Date(wkShownMonday); d.setDate(d.getDate() + dh.day - 1); window.nvaToggleDia(wkFmt(d)); return; }
      const hit = wkHitFromPoint(ev.clientX, ev.clientY);
      if (hit) window.nvaToggleEntreno(hit.key, hit.date);
      return;
    }
    const hit = wkHitFromPoint(ev.clientX, ev.clientY);
    if (hit) wkOpenTraining(hit.key, hit.date);
  }

  // Mantener pulsado un entrenamiento (≈0,6 s) abre la ventana para borrar su registro
  (function initWkLongPress() {
    const canvas = document.getElementById("wkCanvas");
    if (!canvas) return;
    const LONG_PRESS_MS = 600, MOVE_TOLERANCE = 10;
    let timer = null, start = null;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

    canvas.addEventListener("pointerdown", ev => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      wkSuppressClick = false;
      cancel();
      start = { x: ev.clientX, y: ev.clientY };
      timer = setTimeout(() => {
        timer = null;
        if (window.nvaModoAnular && window.nvaModoAnular()) return;
        const hit = wkHitFromPoint(start.x, start.y);
        if (!hit) return;
        wkSuppressClick = true;
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
        openDeleteLogModal(hit.key, hit.date);
      }, LONG_PRESS_MS);
    });
    canvas.addEventListener("pointermove", ev => {
      if (!timer || !start) return;
      if (Math.abs(ev.clientX - start.x) > MOVE_TOLERANCE || Math.abs(ev.clientY - start.y) > MOVE_TOLERANCE) cancel();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(t => canvas.addEventListener(t, cancel));
    canvas.addEventListener("contextmenu", ev => ev.preventDefault());
  })();

  // Abre la pantalla de registro del equipo en esa fecha (cargando el registro si ya existe)
  function wkOpenTraining(teamKey, dateStr) {
    if (isPdfMode) return;
    const matches = ref => {
      if (ref === teamKey) return true;
      const t = appData.teams.find(x => getTeamKey(x) === ref || x.name === ref);
      return !!t && getTeamKey(t) === teamKey;
    };
    const coaches = appData.coaches.filter(c => (c.teams || []).some(matches));
    const coach = coaches.find(c => c.id === activeCoachId) || coaches[0];
    if (!coach) { alert("Este equipo no tiene ningún entrenador asignado."); return; }

    selectCoachAndTeam(coach, teamKey, teamKey);
    document.getElementById("sessionDatePicker").value = dateStr;
    const log = allTrainingLogs.find(l => l.equipo === teamKey && l.fecha === dateStr);
    if (log && Array.isArray(log.jugadores)) {
      sessionData = JSON.parse(JSON.stringify(log.jugadores));
      renderPlayersMain();
    }
  }

  // =====================================================================
  //  SECCIONES PLEGABLES (página principal)
  //  El estado (desplegado/plegado) se guarda en el localStorage de cada
  //  dispositivo, así que cada usuario conserva el suyo. Por defecto están
  //  desplegadas.
  // =====================================================================
  const SECTIONS_KEY = "NVA_SECTIONS_STATE";
  const SECTION_IDS = ["wk", "trainings", "tablon", "direccion", "instagram"];

  function loadSectionsState() {
    try { return JSON.parse(localStorage.getItem(SECTIONS_KEY)) || {}; } catch (e) { return {}; }
  }
  function applySectionState(id, open) {
    const head = document.getElementById("secHead_" + id);
    const body = document.getElementById("secBody_" + id);
    if (!head || !body) return;
    head.classList.toggle("collapsed", !open);
    body.classList.toggle("collapsed", !open);
    head.setAttribute("aria-expanded", open ? "true" : "false");
    // El textarea del tablón no se puede medir mientras está oculto
    if (open && id === "tablon") autoResizeTablon(document.getElementById("tablonTextarea"));
  }
  function toggleSection(id) {
    const st = loadSectionsState();
    const open = st[id] === false;          // estaba plegada -> se despliega
    st[id] = open;
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(st)); } catch (e) { console.warn(e); }
    applySectionState(id, open);
  }
  function sectionKey(ev, id) {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleSection(id); }
  }
  function initSections() {
    const st = loadSectionsState();
    SECTION_IDS.forEach(id => applySectionState(id, st[id] !== false));
  }
  initSections();

  // Primer pintado con los datos locales; GitHub lo repinta al terminar de sincronizar
  window.addEventListener("load", () => setTimeout(() => { try { renderWeekCalendar(); } catch (e) { console.error(e); } }, 0));

  // --- Navegación entre Asistencia (Entrenamiento) y Partido ---
  function goToMatchScreen() {
    if (!currentTeam) return;

    if (!matchInitialized || matchTeamKey !== currentTeam) {
      matchTeamKey = currentTeam;
      resetMatchToTodayDate();
      initMatchData();
      matchInitialized = true;
    }

    const trainingTitle = document.getElementById("sessionTitle").innerText;
    document.getElementById("matchTitle").innerText = `Partido: ${trainingTitle}`;

    loadMatchScoreForDate();
    renderMatchScoreboard();
    renderMatchPlayers();
    showScreen("screenMatch");
    document.getElementById("btnBack").style.display = "flex";

    // Igual que al entrar en Asistencia: refresca avisos y consultas en segundo plano.
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      (async () => {
        if (offlineQueue.length > 0) await processOfflineQueue();
        await Promise.all([fetchWarningsFromGitHub(), fetchQueriesFromGitHub()]);
        if (document.getElementById("screenMatch").classList.contains("active")) {
          renderMatchPlayers();
        }
      })();
    }
  }

  function goToTrainingScreen() {
    renderPlayersMain();
    showScreen("screenAttendance");
    document.getElementById("btnBack").style.display = "flex";
  }

  // --- Colores y etiquetas de estado ---
  function getMatchStateColor(player) {
    if (player.attendance === 'no_convocada') return '#0284c7';                 // azul
    if (player.attendance === 'falta') {
      return (player.absenceType || 'injustificada') === 'justificada' ? '#f59e0b' : '#ef4444'; // amarillo / rojo
    }
    return '#22c55e';                                                           // verde: presente
  }

  function getMatchStateSoftColor(player) {
    if (player.attendance === 'no_convocada') return '#e0f2fe';                 // azul suave
    if (player.attendance === 'falta') {
      return (player.absenceType || 'injustificada') === 'justificada' ? '#fef3c7' : '#fee2e2';
    }
    return '#dcfce7';                                                           // verde suave
  }

  function getMatchStateLabel(player) {
    if (player.attendance === 'no_convocada') return 'No Convocada';
    if (player.attendance === 'falta') {
      return (player.absenceType || 'injustificada') === 'justificada' ? 'Falta Justificada' : 'Falta Injustificada';
    }
    return 'Presente';
  }

  // Ciclo del borde lateral: Presente (verde) -> Falta Justificada (amarillo)
  // -> Falta Injustificada (rojo) -> No Convocada (azul) -> Presente...
  function cycleMatchState(index) {
    const player = matchData[index];
    if (player.attendance === 'presente' || !player.attendance) {
      player.attendance = 'falta';
      player.absenceType = 'justificada';
    } else if (player.attendance === 'falta') {
      if ((player.absenceType || 'injustificada') === 'justificada') {
        player.absenceType = 'injustificada';
      } else {
        player.attendance = 'no_convocada';
        player.absenceType = '';
      }
    } else {
      player.attendance = 'presente';
      player.absenceType = '';
    }
    absenceReasonMenuOpen['match-' + index] = false;
    renderMatchPlayers();
  }

  function toggleMatchCommentBox(index) {
    matchCommentBoxOpen[index] = !matchCommentBoxOpen[index];
    renderMatchPlayers();
  }

  function startMatchDictation(index) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("El dictado por voz no está disponible en este navegador.");
      return;
    }
    matchCommentBoxOpen[index] = true;
    const micBtn = document.getElementById(`matchMicBtn-${index}`);
    if (micBtn) micBtn.classList.add("recording");

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const current = matchData[index].comments || "";
      matchData[index].comments = (current ? current + " " : "") + transcript;
      renderMatchPlayers();
    };
    recognition.onerror = () => { if (micBtn) micBtn.classList.remove("recording"); };
    recognition.onend = () => { if (micBtn) micBtn.classList.remove("recording"); };

    try {
      recognition.start();
    } catch (e) {
      if (micBtn) micBtn.classList.remove("recording");
    }
  }

  function setMatchQuality(i, r) { matchData[i].quality = r; renderMatchPlayers(); }
  function setMatchStrikes(i, c) { matchData[i].strikes = c; renderMatchPlayers(); }
  function updateMatchComment(i, text) { matchData[i].comments = text; }

  // Responder una consulta desde la pantalla de Partido (reutiliza answerQuery
  // y después repinta esta pantalla).
  function answerMatchQuery(queryId, playerName, option) {
    answerQuery(queryId, playerName, option);
    renderMatchPlayers();
  }

  function renderMatchPlayers() {
    const container = document.getElementById("matchPlayersContainer");
    container.innerHTML = "";
    updateAttendanceCounters('match', matchData);

    matchData.forEach((player, index) => {
      const card = document.createElement("div");
      card.className = "player-card";

      const wObj = warningsData[player.name];
      const hasWarning = !!wObj;
      const warningText = hasWarning ? (typeof wObj === 'string' ? wObj : wObj.reason) : "";
      const warningColor = hasWarning ? safeColor(wObj.color, "#ef4444") : "#ef4444";

      const nameHtml = hasWarning
        ? `<div class="warning-capsule" style="background:${warningColor};" title="${escapeHtml(player.name)} (${escapeHtml(warningText)})">${escapeHtml(player.name)} (${escapeHtml(warningText)})</div>`
        : `<div class="player-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</div>`;

      let queryHtml = "";
      const pendingQuery = queriesData.find(q => !q.hidden && q.teams && q.teams.includes(currentTeam) && (!q.responses || !q.responses[player.name]));
      if (pendingQuery) {
        const opts = (pendingQuery.options && pendingQuery.options.length > 0) ? pendingQuery.options : ['V', 'X'];
        const btnsHtml = opts.map(opt => {
          return `<button class="query-btn" onclick="answerMatchQuery(${Number(pendingQuery.id)}, ${jsArg(player.name)}, ${jsArg(opt)})">${escapeHtml(opt)}</button>`;
        }).join('');

        queryHtml = `
          <div class="query-capsule" style="background:${safeColor(pendingQuery.color, "#0284c7")};">
            <span>❓</span>
            ${btnsHtml}
          </div>
        `;
      }

      const stateColor = getMatchStateColor(player);
      card.style.backgroundColor = getMatchStateSoftColor(player);
      const stateLabel = getMatchStateLabel(player);

      const isPresent = isPlayerPresent(player);
      // Solo Presente permite plegar/desplegar el comentario; en el resto
      // de estados (falta / no convocada) se muestra siempre desplegado.
      const isCommentOpen = !isPresent || !!matchCommentBoxOpen[index];
      const reasonUI = buildAbsenceReasonControls('match', index, player);
      const safeComment = escapeHtml(player.comments);

      const ratingHtml = isPresent ? `
          <div class="strikes-xxx">
            ${[1, 2, 3].map(n => `
              <span class="xmark ${n <= player.strikes ? 'active' : ''}"
                    onclick="setMatchStrikes(${index}, ${player.strikes === n ? n - 1 : n})">${n <= player.strikes ? '❌' : '✖️'}</span>
            `).join('')}
          </div>

          <div class="stars">
            ${[1, 2, 3, 4, 5].map(star => `
              <span class="star ${star <= player.quality ? 'active' : ''}"
                    onclick="setMatchQuality(${index}, ${star})">★</span>
            `).join('')}
          </div>
      ` : '';

      card.innerHTML = `
        <div class="state-strip" onclick="cycleMatchState(${index})" title="Estado: ${stateLabel} (pulsa para cambiar)">
          <div class="state-strip-bar" style="background:${stateColor};"></div>
        </div>

        <div class="card-row-1">
          <div style="display:flex; align-items:center; gap:4px; flex:1; min-width:0; overflow:hidden;">
            ${nameHtml}
            ${queryHtml}
          </div>
        </div>

        <div class="card-row-2">
          <div class="comment-toggle-wrap">
            <button type="button" class="comment-bubble-btn ${player.comments ? 'has-comment' : ''}"
                    ${isPresent ? `onclick="toggleMatchCommentBox(${index})"` : 'style="cursor:default;"'} title="Comentarios">💬</button>
            <div class="comment-compact-row" style="display:${isCommentOpen ? 'flex' : 'none'};">
              <input type="text" class="comment-compact-input" value="${safeComment}"
                     placeholder="Comentario u observación..."
                     onchange="updateMatchComment(${index}, this.value)">
              <button type="button" id="matchMicBtn-${index}" class="mic-btn"
                      onclick="startMatchDictation(${index})" title="Dictar por voz">🎤</button>
              ${reasonUI.btn}
            </div>
          </div>

          ${ratingHtml}
        </div>

        ${reasonUI.menu}
      `;
      container.appendChild(card);
    });
  }

  // --- Guardado: un fichero por equipo y fecha en la carpeta "Partidos/" ---
  async function saveMatch() {
    const dateVal = document.getElementById("matchDatePicker").value;
    if (!dateVal) {
      alert("Por favor selecciona una fecha.");
      return;
    }

    const prevLog = allMatchLogs.find(l => l.equipo === currentTeam && l.fecha === dateVal);
    let marcador = (prevLog && prevLog.marcador) || null;
    if (!marcador && ghSettings.user && ghSettings.repo && navigator.onLine) {
      // Puede que el resultado se cargara desde otro dispositivo: se mira el registro en GitHub
      try {
        const headers = {};
        if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
        const r = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${MATCH_LOGS_FOLDER}/Partidos_${sanitizeFileName(currentTeam)}_${dateVal}.json`, { headers, cache: "no-store" });
        if (r.ok) { const remote = JSON.parse(b64_to_utf8((await r.json()).content)); if (remote && remote.marcador) marcador = remote.marcador; }
      } catch (e) { console.warn("No se pudo leer el registro del partido en GitHub:", e); }
    }
    if (!marcador && hasMatchScoreData()) marcador = buildMatchMarcador();

    const logEntry = {
      fecha: dateVal,
      equipo: currentTeam,
      entrenador: currentCoach ? currentCoach.name : "",
      jugadores: playersForSave(matchData),
      marcador: marcador
    };
    stampLogDates(logEntry, prevLog);

    const existingIndex = allMatchLogs.findIndex(l => l.equipo === currentTeam && l.fecha === dateVal);
    if (existingIndex >= 0) {
      allMatchLogs[existingIndex] = logEntry;
    } else {
      allMatchLogs.push(logEntry);
    }

    localStorage.setItem("NVA_MATCH_LOGS", JSON.stringify(allMatchLogs));

    const matchFileName = `${MATCH_LOGS_FOLDER}/Partidos_${sanitizeFileName(currentTeam)}_${dateVal}.json`;
    const success = await writeGitHubFile(matchFileName, logEntry, `Registro partido ${currentTeam} - ${dateVal}`);

    if (success) {
      alert("¡Partido guardado y sincronizado en GitHub!");
    } else {
      alert("Guardado localmente. Se sincronizará con GitHub cuando recupere la conexión.");
    }
  }

  // --- Lectura de los partidos guardados (lista la carpeta "Partidos/") ---
  async function fetchMatchLogsFromGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return;

    const files = await listGitHubFolder(MATCH_LOGS_FOLDER);
    if (!files) return; // fallo de red al listar la carpeta: no tocar la caché local
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;

    // Lectura en paralelo, igual que en entrenamientos y warnings.
    const relevantMatchFiles = files.filter(file => file.name && file.name.startsWith("Partidos_") && file.name.endsWith(".json"));
    const matchResults = await Promise.all(relevantMatchFiles.map(async file => {
      try {
        return await readListedGitHubJson(file, headers);
      } catch (e) {
        console.error(`Error al leer ${file.name}:`, e);
        return null;
      }
    }));

    matchResults.forEach(parsed => {
      if (!parsed) return;
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      entries.forEach(remoteLog => {
        if (!remoteLog || !remoteLog.equipo || !remoteLog.fecha) return;
        const idx = allMatchLogs.findIndex(l => l.equipo === remoteLog.equipo && l.fecha === remoteLog.fecha);
        if (idx >= 0) {
          allMatchLogs[idx] = remoteLog;
        } else {
          allMatchLogs.push(remoteLog);
        }
      });
    });
    localStorage.setItem("NVA_MATCH_LOGS", JSON.stringify(allMatchLogs));
  }

  // --- Historial de partidos ---
  async function openMatchHistoryModal() {
    matchHistoryLimit = HISTORY_PAGE;
    document.getElementById("matchHistoryTitle").innerText = `📜 Partidos ${historyTeamLabel()}`;
    document.getElementById("modalMatchHistory").classList.add("active");

    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      const container = document.getElementById("matchHistoryListContainer");
      container.innerHTML = `<p style="text-align:center; font-size:0.85rem; color:#64748b; padding:20px;">Actualizando historial...</p>`;
      if (offlineQueue.length > 0) await processOfflineQueue();
      await fetchMatchLogsFromGitHub();
    }

    renderMatchHistoryList();
  }

  function closeMatchHistoryModal() {
    document.getElementById("modalMatchHistory").classList.remove("active");
  }

  function renderMatchHistoryList() {
    const container = document.getElementById("matchHistoryListContainer");
    container.innerHTML = "";
    const teamLogs = allMatchLogs.filter(log => log.equipo === currentTeam);

    if (teamLogs.length === 0) {
      container.innerHTML = `<p style="text-align:center; font-size:0.85rem; color:#64748b; padding:20px;">No hay partidos guardados previamente para este equipo.</p>`;
      return;
    }

    teamLogs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    teamLogs.slice(0, matchHistoryLimit).forEach((log) => {
      const m = log.marcador;
      const resultHtml = m
        ? `<div style="font-size:0.72rem; color:#0f172a; font-weight:700; margin-top:2px;">${escapeHtmlMatch(m.local || 'Home')} ${m.setsLocal ?? 0} - ${m.setsVisitante ?? 0} ${escapeHtmlMatch(m.visitante || 'VISIT')}</div>`
        : "";

      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
        <div>
          <div class="hist-fecha-row"><div style="font-weight:700; font-size:0.85rem; color:var(--azul-dark);">📅 ${escapeHtml(log.fecha)}</div>${logDatesHtml(log, 'match')}</div>
          ${historyLogSummaryHtml(log, 'match')}
          ${resultHtml}
        </div>
        <div class="history-actions">
          <button class="btn-edit-history" onclick="loadMatchRecordForEditing(${jsArg(log.fecha)})">✏️ Cargar/Editar</button>
          <button class="btn-delete-history" onclick="openDeleteLogModal(currentTeam, ${jsArg(log.fecha)}, 'match')">🗑️ Borrar</button>
        </div>
      `;
      container.appendChild(card);
    });
    historyMoreButton(container, matchHistoryLimit, teamLogs.length, () => { matchHistoryLimit += HISTORY_PAGE; renderMatchHistoryList(); });
    fillLogDatesFromCommits(teamLogs.slice(0, matchHistoryLimit), 'match');
  }

  function loadMatchRecordForEditing(fecha) {
    const log = allMatchLogs.find(l => l.equipo === currentTeam && l.fecha === fecha);
    if (!log) return;
    document.getElementById("matchDatePicker").value = log.fecha;
    if (log.jugadores && log.jugadores.length) matchData = JSON.parse(JSON.stringify(log.jugadores));
    else initMatchData();
    matchCommentBoxOpen = {};
    loadMatchScoreFromLog(log);
    renderMatchScoreboard();
    renderMatchPlayers();
    closeMatchHistoryModal();
    alert(`Se ha cargado el partido del ${log.fecha} para modificar. Al terminar pulsa "Guardar Partido en GitHub".`);
  }

  // =====================================================================
  //  ENGANCHES (sin modificar el código existente)
  //  Se envuelven tres funciones existentes para que la pantalla de Partido
  //  se comporte igual que la de Asistencia.
  // =====================================================================

  // 1) Al elegir un equipo de nuevo, el partido en curso se reinicia
  //    (igual que se reinicia el entrenamiento).
  const _origSelectCoachAndTeam = selectCoachAndTeam;
  selectCoachAndTeam = function () {
    if (!isPdfMode) matchInitialized = false;
    return _origSelectCoachAndTeam.apply(this, arguments);
  };

  // 2) Cuando se sincroniza con GitHub, si la pantalla de Partido está
  //    abierta también se repinta con los avisos/consultas actualizados.
  const _origRefreshActiveScreenUI = refreshActiveScreenUI;
  refreshActiveScreenUI = function () {
    _origRefreshActiveScreenUI.apply(this, arguments);
    const screenMatchEl = document.getElementById("screenMatch");
    if (screenMatchEl && screenMatchEl.classList.contains("active")) {
      renderMatchPlayers();
    }
  };

  // 3) "Borrar datos locales" también vacía la caché de partidos en memoria.
  const _origClearAllLocalStorageData = clearAllLocalStorageData;
  clearAllLocalStorageData = function () {
    const prevQueueRef = offlineQueue;
    _origClearAllLocalStorageData.apply(this, arguments);
    if (offlineQueue !== prevQueueRef) { // solo si el usuario confirmó el borrado
      allMatchLogs = [];
      matchData = [];
      matchInitialized = false;
    }
  };
  // =====================================================================
  //  MÓDULO OTROS
  //  Pantalla con botones de información/instrucciones. Todos los botones
  //  (incluido "Protocolo Accidentes") viven en OTROS.json (GitHub, con copia
  //  local, igual que el Tablón). Se crean con "+ NUEVO" (nombre + texto
  //  enriquecido) y se pueden editar o eliminar desde su panel.
  // =====================================================================
  const OTROS_FILE = "OTROS.json";
  let otrosData = JSON.parse(localStorage.getItem("NVA_OTROS_DATA")) || [];
  let otrosOpenId = null;
  let otrosEditingId = null;

  function escapeHtmlOtros(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Estilos visuales permitidos en el texto enriquecido (colores, bordes y espaciado).
  const OTROS_STYLE_OK = new Set(["color", "background", "background-color", "border", "border-left",
    "border-left-color", "border-radius", "padding", "margin", "font-weight", "font-size", "text-align"]);
  function cleanOtrosStyle(css) {
    return String(css || "").split(";").map(d => d.trim()).filter(d => {
      const i = d.indexOf(":");
      if (i < 0) return false;
      const prop = d.slice(0, i).trim().toLowerCase();
      const val = d.slice(i + 1).trim();
      return OTROS_STYLE_OK.has(prop) && !/url\s*\(|expression|javascript|@import|[<>\\]/i.test(val);
    }).join("; ");
  }

  // El texto enriquecido se guarda como HTML y se comparte vía GitHub, así que
  // se filtra: solo etiquetas de formato básicas y enlaces http/mailto/tel.
  function sanitizeOtrosHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
    const root = doc.body.firstChild;
    const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "BR", "P", "DIV", "SPAN", "UL", "OL", "LI", "H3", "H4", "A"]);
    const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "SVG", "MATH", "TEMPLATE", "NOSCRIPT", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT"]);

    const walk = (node) => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1) { child.remove(); return; }
        const tag = child.tagName.toUpperCase();
        if (DROP.has(tag)) { child.remove(); return; }
        if (!ALLOWED.has(tag)) {
          walk(child);
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          child.remove();
          return;
        }
        const keepStyle = cleanOtrosStyle(child.getAttribute("style"));
        const keepClass = (tag === "DIV" && child.getAttribute("class") === "otros-block") ? "otros-block" : "";
        Array.from(child.attributes).forEach(a => {
          if (!(tag === "A" && a.name === "href")) child.removeAttribute(a.name);
        });
        if (keepStyle) child.setAttribute("style", keepStyle);
        if (keepClass) child.setAttribute("class", keepClass);
        if (tag === "A") {
          const href = (child.getAttribute("href") || "").trim();
          if (/^(https?:|mailto:|tel:)/i.test(href)) {
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          } else {
            child.removeAttribute("href");
          }
        }
        walk(child);
      });
    };
    walk(root);
    return root.innerHTML;
  }

  function persistOtrosLocal() {
    localStorage.setItem("NVA_OTROS_DATA", JSON.stringify(otrosData));
  }

  async function fetchOtrosFromGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${OTROS_FILE}`;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const parsed = JSON.parse(b64_to_utf8(json.content));
        const items = Array.isArray(parsed) ? parsed : (parsed && parsed.items);
        otrosData = Array.isArray(items) ? items.filter(it => it && it.id && it.title) : [];
        persistOtrosLocal();
      }
    } catch (e) { console.error(`Error al cargar ${OTROS_FILE}:`, e); }
  }

  // Aplica un cambio sobre la lista más reciente de GitHub (si hay conexión)
  // para no pisar botones creados desde otro dispositivo, y la guarda.
  async function mutateOtros(applyChange, commitMessage) {
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      if (offlineQueue.length > 0) await processOfflineQueue();
      await fetchOtrosFromGitHub();
    }
    applyChange();
    persistOtrosLocal();
    renderOtros();
    const ok = await writeGitHubFile(OTROS_FILE, { items: otrosData }, commitMessage);
    if (!ok) alert("Guardado localmente. Se sincronizará con GitHub cuando recupere la conexión.");
  }

  // --- Pantalla ---
  function openOtros() {
    otrosOpenId = null;
    renderOtros();
    showScreen("screenOtros");
    document.getElementById("btnBack").style.display = "flex";
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      (async () => {
        await fetchOtrosFromGitHub();
        await refreshFichasList();
        const el = document.getElementById("screenOtros");
        if (el && el.classList.contains("active")) renderOtros();
      })();
    }
  }

  function toggleOtros(id) {
    otrosOpenId = otrosOpenId === id ? null : id;
    renderOtros();
  }

  function renderOtros() {
    const box = document.getElementById("otrosList");
    if (!box) return;
    box.innerHTML = "";

    otrosData.forEach(entry => {
      const isOpen = otrosOpenId === entry.id;
      const btn = document.createElement("button");
      btn.className = "coach-btn" + (isOpen ? " selected" : "");
      btn.innerHTML = `<span>${escapeHtmlOtros(entry.icon || "📌")} ${escapeHtmlOtros(entry.title)}</span> <span>${isOpen ? "🔻" : "➤"}</span>`;
      btn.onclick = () => toggleOtros(entry.id);
      box.appendChild(btn);

      if (isOpen) {
        const panel = document.createElement("div");
        panel.className = "otros-panel";
        panel.innerHTML = sanitizeOtrosHtml(entry.html);
        const actions = document.createElement("div");
        actions.className = "otros-actions";
        actions.innerHTML = `
          <button style="background:linear-gradient(135deg,#0284c7,#0369a1);" onclick="openOtrosEditor(${jsArg(entry.id)})">✏️ Editar</button>
          <button style="background:linear-gradient(135deg,#ef4444,#b91c1c);" onclick="deleteOtros(${jsArg(entry.id)})">🗑️ Eliminar</button>`;
        panel.appendChild(actions);
        box.appendChild(panel);
      }
    });

    const nuevo = document.createElement("button");
    nuevo.className = "coach-btn otros-nuevo";
    nuevo.textContent = "+ NUEVO";
    nuevo.onclick = () => openOtrosEditor(null);
    box.appendChild(nuevo);

    renderFichasFederacion(box);
  }

  // --- Fichas de Federación: un botón por equipo que abre Fichas/Licencias_<equipo>.pdf ---
  const FICHAS_FOLDER = "Fichas";
  let fichaUploadTeam = null;

  function fichaFileName(team) {
    return `Licencias_${sanitizeFileName(getTeamKey(team))}.pdf`;
  }

  function fichaVersions() {
    try { return JSON.parse(localStorage.getItem("NVA_FICHAS_VER")) || {}; } catch (e) { return {}; }
  }

  // Lista (en caché) de los PDF de la carpeta "Fichas". Se refresca al abrir OTROS
  // y al pulsar una ficha que no se encuentra en la caché.
  let fichasFilesCache = (() => {
    try { return JSON.parse(localStorage.getItem("NVA_FICHAS_FILES")) || []; } catch (e) { return []; }
  })();

  async function refreshFichasList() {
    const files = await listGitHubFolder(FICHAS_FOLDER);
    if (!files) return false; // sin conexión / GitHub sin configurar: se conserva la caché
    fichasFilesCache = files.filter(f => f.name && /\.pdf$/i.test(f.name)).map(f => f.name);
    localStorage.setItem("NVA_FICHAS_FILES", JSON.stringify(fichasFilesCache));
    return true;
  }

  // Localiza el PDF del equipo sin distinguir mayúsculas, acentos, espacios ni signos:
  // "Licencias NVA A (Infantil).pdf", "licencias_nva_a_infantil.pdf"... valen igual.
  // Si no hay uno con categoría, se admite "Licencias <nombre>.pdf" o "Licencias <categoría>.pdf".
  function findFichaName(team) {
    const norm = s => sanitizeFileName(s).replace(/_/g, "").toLowerCase();
    const strip = n => n.replace(/\.pdf$/i, "");
    const wanted = [
      norm("Licencias " + getTeamKey(team)),
      norm("Licencias " + team.name),
      norm("Licencias " + team.category)
    ];
    for (const w of wanted) {
      const hit = fichasFilesCache.find(n => norm(strip(n)) === w);
      if (hit) return hit;
    }
    return null;
  }

  function fichaUrl(name) {
    const ver = fichaVersions()[name];
    // Ruta relativa: la carpeta "Fichas" está en el mismo repositorio que esta página.
    return `${FICHAS_FOLDER}/${encodeURIComponent(name)}${ver ? "?v=" + ver : ""}`;
  }

  // Descarga el PDF por la API de GitHub (mismo repositorio que usa el resto de la app).
  // Así no depende de dónde esté publicada esta página ni de la caché de GitHub Pages,
  // y siempre se ve la última versión subida.
  async function fetchFichaBlob(name) {
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${FICHAS_FOLDER}/${encodeURIComponent(name)}`;
    const headers = { "Accept": "application/vnd.github.raw+json" };
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const err = new Error("HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    return new Blob([await res.arrayBuffer()], { type: "application/pdf" });
  }

  async function openFicha(team) {
    const label = `${team.name} (${team.category})`;
    const canApi = !!(ghSettings.user && ghSettings.repo && navigator.onLine);

    // La pestaña se abre ya (gesto del usuario) para que el navegador no la bloquee.
    const w = window.open("", "_blank");
    if (!w) { alert("El navegador ha bloqueado la ventana emergente. Permítela e inténtalo de nuevo."); return; }
    w.opener = null;
    try { w.document.write("<p style='font-family:sans-serif;padding:20px'>Cargando ficha…</p>"); } catch (e) {}

    let name = findFichaName(team);
    if (!name && canApi) { await refreshFichasList(); name = findFichaName(team); }
    if (!name) name = fichaFileName(team); // nombre estándar: Licencias_<equipo>.pdf

    if (canApi) {
      try {
        const blob = await fetchFichaBlob(name);
        w.location.href = URL.createObjectURL(blob);
        return;
      } catch (e) {
        if (e.status) {
          w.close();
          const hint = e.status === 404
            ? "Comprueba que el PDF está en esa carpeta y repositorio (las mayúsculas cuentan)."
            : "Comprueba el token de GitHub o inténtalo más tarde.";
          alert(`No se pudo abrir la ficha de ${label}.\nGitHub responde ${e.status} para "${FICHAS_FOLDER}/${name}" en ${ghSettings.user}/${ghSettings.repo}.\n${hint}`);
          return;
        }
        // Fallo de red: se intenta la ruta relativa como último recurso.
      }
    }
    w.location.href = fichaUrl(name);
  }

  function pickFichaPdf(team) {
    fichaUploadTeam = team;
    const input = document.getElementById("fichaFileInput");
    input.value = "";
    input.click();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFichaPdf(team, file) {
    await refreshFichasList();
    const name = findFichaName(team) || fichaFileName(team);
    const path = `${FICHAS_FOLDER}/${encodeURIComponent(name)}`;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${path}`;
    const auth = { "Authorization": `token ${ghSettings.token}` };

    const content = await fileToBase64(file);
    let sha = "";
    const getRes = await fetch(url, { headers: auth, cache: "no-store" });
    if (getRes.ok) {
      sha = (await getRes.json()).sha || "";
    } else if (getRes.status !== 404) {
      throw new Error(`HTTP ${getRes.status} al consultar ${path}`);
    }
    const body = {
      message: `Actualizar ficha de federación: ${getTeamKey(team)}`,
      content,
      ...(sha && { sha })
    };
    const putRes = await fetch(url, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!putRes.ok) throw new Error(`HTTP ${putRes.status} al subir ${path}`);

    if (!fichasFilesCache.includes(name)) {
      fichasFilesCache.push(name);
      localStorage.setItem("NVA_FICHAS_FILES", JSON.stringify(fichasFilesCache));
    }
    const vers = fichaVersions();
    vers[name] = Date.now();
    localStorage.setItem("NVA_FICHAS_VER", JSON.stringify(vers));
  }

  document.getElementById("fichaFileInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    const team = fichaUploadTeam;
    fichaUploadTeam = null;
    if (!file || !team) return;

    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) { alert("El archivo debe ser un PDF."); return; }
    if (file.size > 25 * 1024 * 1024) { alert("El PDF es demasiado grande (máximo 25 MB)."); return; }
    if (!navigator.onLine || !ghSettings.user || !ghSettings.repo || !ghSettings.token) {
      alert("Para subir el PDF hace falta conexión y tener configurado GitHub (usuario, repositorio y token).");
      return;
    }
    if (!confirm(`¿Sustituir la ficha de ${team.name} (${team.category}) por "${file.name}"?`)) return;

    await withLoading(async () => {
      try {
        await uploadFichaPdf(team, file);
        alert("Ficha actualizada en GitHub. Puede tardar un minuto en verse publicada.");
      } catch (err) {
        console.error("Error al subir la ficha:", err);
        alert("No se pudo subir el PDF. Revisa la conexión y el token de GitHub.");
      }
    }, "Subiendo ficha a GitHub...");
  });

  function renderFichasFederacion(box) {
    const title = document.createElement("div");
    title.className = "section-title";
    title.style.marginTop = "20px";
    title.textContent = "Fichas de Federación";
    box.appendChild(title);

    (appData.teams || []).forEach(team => {
      const btn = document.createElement("div");
      btn.className = "coach-btn";
      btn.setAttribute("role", "button");
      btn.tabIndex = 0;
      btn.innerHTML = `<span>📄 ${escapeHtmlOtros(team.name)} (${escapeHtmlOtros(team.category)})</span>
                       <span class="ficha-edit" role="button" title="Subir un PDF nuevo">✏️</span>`;
      btn.onclick = () => openFicha(team);
      btn.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openFicha(team); } };
      btn.querySelector(".ficha-edit").onclick = (ev) => { ev.stopPropagation(); pickFichaPdf(team); };
      box.appendChild(btn);
    });
  }

  // --- Editor (nombre + cuadro de texto enriquecido) ---
  function openOtrosEditor(id) {
    otrosEditingId = id || null;
    const item = id ? otrosData.find(o => o.id === id) : null;
    document.getElementById("otrosEditorTitle").textContent = item ? "✏️ Editar botón" : "➕ Nuevo botón";
    document.getElementById("otrosEditorName").value = item ? item.title : "";
    document.getElementById("otrosEditorBody").innerHTML = item ? sanitizeOtrosHtml(item.html) : "";
    document.getElementById("modalOtrosEditor").classList.add("active");
  }

  function closeOtrosEditor() {
    document.getElementById("modalOtrosEditor").classList.remove("active");
    otrosEditingId = null;
  }

  function otrosFormat(cmd) {
    const editor = document.getElementById("otrosEditorBody");
    editor.focus();
    if (cmd === "title") {
      const cur = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
      document.execCommand("formatBlock", false, cur === "h3" ? "div" : "h3");
    } else {
      document.execCommand(cmd, false, null);
    }
  }

  async function saveOtrosEditor() {
    const name = document.getElementById("otrosEditorName").value.trim();
    const editor = document.getElementById("otrosEditorBody");
    const html = sanitizeOtrosHtml(editor.innerHTML);
    const hasText = editor.textContent.trim().length > 0;

    if (!name) { alert("Escribe el nombre del botón."); return; }
    if (!hasText) { alert("Escribe la información que mostrará el botón."); return; }

    const editingId = otrosEditingId;
    const newId = "o" + Date.now();
    closeOtrosEditor();

    await withLoading(() => mutateOtros(() => {
      const idx = editingId ? otrosData.findIndex(o => o.id === editingId) : -1;
      if (idx >= 0) {
        otrosData[idx] = { ...otrosData[idx], title: name, html };
        otrosOpenId = editingId;
      } else {
        otrosData.push({ id: newId, title: name, html });
        otrosOpenId = newId;
      }
    }, `Actualizar botón "${name}" en Otros`), "Guardando...");
  }

  async function deleteOtros(id) {
    const item = otrosData.find(o => o.id === id);
    if (!item) return;
    if (!confirm(`¿Eliminar el botón "${item.title}"?`)) return;
    await withLoading(() => mutateOtros(() => {
      otrosData = otrosData.filter(o => o.id !== id);
      if (otrosOpenId === id) otrosOpenId = null;
    }, `Eliminar botón "${item.title}" de Otros`), "Eliminando...");
  }

  // Al pegar en el editor se inserta solo texto plano (evita estilos ajenos).
  document.getElementById("otrosEditorBody").addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  // =====================================================================
  //  MÓDULO HORARIOS
  //  Pantalla para crear los horarios semanales de entrenamiento del club:
  //   1) Ajustes: temporada, colores de equipos, pabellones y pistas con su
  //      disponibilidad (días + hora de inicio/fin).
  //   2) Entrenamientos por equipo (día, pabellón/pista, hora inicio y fin).
  //   3) Horario semanal dibujado en un <canvas> A4 apaisado -> PNG / PDF.
  //  Todo se guarda en local (NVA_HORARIOS_DATA) y en GitHub: Horarios.json
  // =====================================================================
  const HZ_FILE = "Horarios.json";
  const HZ_LS_KEY = "NVA_HORARIOS_DATA";
  const HZ_DIRTY_KEY = "NVA_HORARIOS_DIRTY";
  const HZ_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const HZ_DAYS_SHORT = ["L", "M", "X", "J", "V"];
  const HZ_FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  // ---------- utilidades ----------
  function hzEl(id) { return document.getElementById(id); }
  function hzUid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function hzEsc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function hzT2M(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
    return m ? (+m[1]) * 60 + (+m[2]) : NaN;
  }
  function hzM2T(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function hzNorm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function hzValidTime(t) { const m = hzT2M(t); return !isNaN(m) && m >= 0 && m <= 1440; }

  // ---------- modelo de datos ----------
  function hzNormalize(raw) {
    const d = (raw && typeof raw === "object") ? raw : {};
    const out = { season: "2026/27", teamColors: {}, teamLabels: {}, venues: [], trainings: {}, updated: "" };
    if (typeof d.season === "string" && d.season.trim()) out.season = d.season.trim();
    if (typeof d.updated === "string") out.updated = d.updated;
    if (d.teamColors && typeof d.teamColors === "object") {
      Object.keys(d.teamColors).forEach(k => { if (/^#[0-9a-f]{6}$/i.test(d.teamColors[k])) out.teamColors[k] = d.teamColors[k]; });
    }
    if (d.teamLabels && typeof d.teamLabels === "object") {
      Object.keys(d.teamLabels).forEach(k => { if (typeof d.teamLabels[k] === "string") out.teamLabels[k] = d.teamLabels[k]; });
    }
    (Array.isArray(d.venues) ? d.venues : []).forEach(v => {
      if (!v || typeof v !== "object") return;
      const venue = { id: String(v.id || hzUid("v")), name: String(v.name || "Pabellón"), courts: [] };
      (Array.isArray(v.courts) ? v.courts : []).forEach((c, ci) => {
        if (!c || typeof c !== "object") return;
        const court = { id: String(c.id || hzUid("c")), name: String(c.name || ("Pista " + (ci + 1))), availability: [] };
        (Array.isArray(c.availability) ? c.availability : []).forEach(w => {
          if (!w || !hzValidTime(w.start) || !hzValidTime(w.end)) return;
          const days = (Array.isArray(w.days) ? w.days : []).map(Number).filter(n => n >= 1 && n <= 5);
          if (!days.length || hzT2M(w.end) <= hzT2M(w.start)) return;
          court.availability.push({
            days: Array.from(new Set(days)).sort(),
            start: hzM2T(hzT2M(w.start)), end: hzM2T(hzT2M(w.end))
          });
        });
        venue.courts.push(court);
      });
      out.venues.push(venue);
    });
    if (d.trainings && typeof d.trainings === "object") {
      Object.keys(d.trainings).forEach(k => {
        const arr = Array.isArray(d.trainings[k]) ? d.trainings[k] : [];
        out.trainings[k] = arr.filter(t => t && Number(t.day) >= 1 && Number(t.day) <= 5 && t.courtId &&
          hzValidTime(t.start) && hzValidTime(t.end) && hzT2M(t.end) > hzT2M(t.start))
          .map(t => ({ id: String(t.id || hzUid("t")), day: Number(t.day), courtId: String(t.courtId),
            start: hzM2T(hzT2M(t.start)), end: hzM2T(hzT2M(t.end)) }));
      });
    }
    return out;
  }

  function hzLoadLocal() {
    try { return hzNormalize(JSON.parse(localStorage.getItem(HZ_LS_KEY))); }
    catch (e) { return hzNormalize(null); }
  }

  let hz = hzLoadLocal();
  let hzDirty = localStorage.getItem(HZ_DIRTY_KEY) === "1";
  let hzDraft = {};   // fila "en curso" (aún incompleta) por equipo
  const hzUI = {
    open: { settings: false, trainings: false, schedule: false },
    sub: { season: false, teams: false, venues: false },
    venueOpen: {},
    teamOpen: null
  };

  function hzPersistLocal() {
    try { localStorage.setItem(HZ_LS_KEY, JSON.stringify(hz)); } catch (e) { console.error(e); }
  }
  function hzSetDirty(v) {
    hzDirty = v;
    try { localStorage.setItem(HZ_DIRTY_KEY, v ? "1" : "0"); } catch (e) {}
    hzUpdateStatus();
  }
  function hzResetLocal() { hz = hzNormalize(null); hzDirty = false; hzDraft = {}; }

  // "flags": s = repintar Ajustes, t = repintar Entrenamientos. El horario se repinta siempre si está abierto.
  function hzChanged(flags) {
    flags = flags || "";
    hz.updated = new Date().toISOString();
    hzPersistLocal();
    hzSetDirty(true);
    if (flags.indexOf("s") >= 0) hzRenderSettings();
    if (flags.indexOf("t") >= 0) hzRenderTrainings();
    if (hzUI.open.schedule) hzRenderSchedule();
  }

  function hzUpdateStatus() {
    const el = hzEl("hzStatus");
    if (!el) return;
    el.className = "hz-status" + (hzDirty ? " dirty" : "");
    el.textContent = hzDirty ? "● Cambios sin guardar en GitHub" : "✔ Sin cambios pendientes de guardar";
  }

  // ---------- colores por defecto ----------
  const HZ_PALETTES = [
    [["escol", "escue", "mixt"], ["#33cc33", "#7fe07f", "#b5f0b5"]],
    [["alev"], ["#00b0f0", "#66ccf5", "#a5e0fa"]],
    [["infan"], ["#ff9900", "#ffc800", "#ffcc66"]],
    [["cadet"], ["#e0129a", "#ff66ff", "#ff99cc"]],
    [["juven"], ["#a855d6", "#c08be3", "#dcc0f0"]],
    [["junio"], ["#2e75b6", "#5b9bd5", "#9dc3e6"]],
    [["senior"], ["#e03030", "#ee6666", "#f5a3a3"]]
  ];
  const HZ_FALLBACK = ["#f4b183", "#a9d18e", "#9dc3e6", "#ffd966", "#c9a0dc", "#f8a5c2"];

  function hzDefaultColor(team, idx) {
    const name = hzNorm(team.name), cat = hzNorm(team.category);
    const teams = appData.teams || [];
    for (const [keys, pal] of HZ_PALETTES) {
      const byName = keys.some(k => name.indexOf(k) === 0 || name.indexOf(" " + k) >= 0);
      const byCat = keys.some(k => cat.indexOf(k) === 0);
      if (byName || byCat) {
        let n = 0;
        for (let i = 0; i < idx; i++) {
          const o = teams[i];
          if (o && hzNorm(o.category) === cat) n++;
        }
        return pal[n % pal.length];
      }
    }
    return HZ_FALLBACK[idx % HZ_FALLBACK.length];
  }

  function hzEnsureColors() {
    let changed = false;
    (appData.teams || []).forEach((t, i) => {
      const k = getTeamKey(t);
      if (!hz.teamColors[k]) { hz.teamColors[k] = hzDefaultColor(t, i); changed = true; }
    });
    if (changed) hzPersistLocal();
  }

  function hzTeamsMap() {
    const m = {};
    (appData.teams || []).forEach(t => { m[getTeamKey(t)] = t; });
    return m;
  }
  function hzLabelParts(team, key) {
    const custom = (hz.teamLabels[key] || "").trim();
    if (custom) return { cat: custom, suf: "" };
    const suf = String(team.name || "").replace(/^\s*NVA\b[\s._-]*/i, "").trim();
    return { cat: String(team.category || "").trim(), suf };
  }

  // ---------- pistas / disponibilidad ----------
  function hzCourtInfo(courtId) {
    for (const v of hz.venues) for (const c of v.courts) if (c.id === courtId) return { venue: v, court: c };
    return null;
  }
  function hzAvail(court, day) {
    const iv = court.availability.filter(w => w.days.indexOf(day) >= 0)
      .map(w => [hzT2M(w.start), hzT2M(w.end)]).sort((a, b) => a[0] - b[0]);
    const out = [];
    iv.forEach(x => {
      const l = out[out.length - 1];
      if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]);
    });
    return out;
  }
  function hzTrainingsUsingCourt(courtId) {
    let n = 0;
    Object.keys(hz.trainings).forEach(k => { n += (hz.trainings[k] || []).filter(t => t.courtId === courtId).length; });
    return n;
  }
  function hzRemoveTrainingsOfCourt(courtId) {
    Object.keys(hz.trainings).forEach(k => { hz.trainings[k] = (hz.trainings[k] || []).filter(t => t.courtId !== courtId); });
    Object.keys(hzDraft).forEach(k => { if (hzDraft[k] && hzDraft[k].courtId === courtId) hzDraft[k].courtId = ""; });
  }

  // ---------- desplegables de hora ----------
  function hzTimeOpts(from, to, sel, blank) {
    const mins = [];
    for (let m = from; m <= to; m += 15) mins.push(m);
    const sm = hzT2M(sel);
    if (!isNaN(sm) && mins.indexOf(sm) < 0 && sm >= from && sm <= to) { mins.push(sm); mins.sort((a, b) => a - b); }
    let h = blank ? `<option value="">${blank}</option>` : "";
    mins.forEach(m => {
      const t = hzM2T(m);
      h += `<option value="${t}"${t === sel ? " selected" : ""}>${t}</option>`;
    });
    return h;
  }
  const HZ_MIN = 6 * 60, HZ_MAX = 24 * 60;

  // =====================================================================
  //  NAVEGACIÓN Y SECCIONES DESPLEGABLES
  // =====================================================================
  function openHorarios() {
    hzEnsureColors();
    hzRenderAll();
    showScreen("screenHorarios");
    hzEl("btnBack").style.display = "flex";
    window.scrollTo(0, 0);
    if (ghSettings.user && ghSettings.repo && navigator.onLine) {
      (async () => {
        await fetchHorariosFromGitHub();
        const el = hzEl("screenHorarios");
        if (el && el.classList.contains("active")) hzRenderAll();
      })();
    }
  }

  function hzToggleSection(k) {
    hzUI.open[k] = !hzUI.open[k];
    hzApplyOpen();
    if (k === "schedule" && hzUI.open[k]) hzRenderSchedule();
  }
  function hzApplyOpen() {
    ["settings", "trainings", "schedule"].forEach(k => {
      const open = !!hzUI.open[k];
      hzEl("hzSec_" + k).style.display = open ? "block" : "none";
      const btn = hzEl("hzBtn_" + k);
      btn.classList.toggle("selected", open);
      btn.querySelector(".hz-arrow").textContent = open ? "🔻" : "➤";
    });
  }
  function hzToggleSub(k) { hzUI.sub[k] = !hzUI.sub[k]; hzRenderSettings(); }
  function hzToggleVenue(id) { hzUI.venueOpen[id] = !hzUI.venueOpen[id]; hzRenderSettings(); }
  function hzToggleTeam(i) {
    const t = (appData.teams || [])[i];
    if (!t) return;
    const k = getTeamKey(t);
    hzUI.teamOpen = hzUI.teamOpen === k ? null : k;
    hzRenderTrainings();
  }

  function hzRenderAll() {
    hzUpdateStatus();
    hzRenderSettings();
    hzRenderTrainings();
    hzApplyOpen();
    if (hzUI.open.schedule) hzRenderSchedule();
  }

  // =====================================================================
  //  SECCIÓN 1: AJUSTES
  // =====================================================================
  function hzSub(key, title, body, extraBadge) {
    const open = !!hzUI.sub[key];
    return `<button class="hz-sub-btn ${open ? "open" : ""}" onclick="hzToggleSub('${key}')">
        <span>${title}${extraBadge || ""}</span><span>${open ? "🔻" : "➤"}</span></button>
      ${open ? `<div class="hz-sub-panel">${body}</div>` : ""}`;
  }

  function hzRenderSettings() {
    const box = hzEl("hzSec_settings");
    if (!box) return;
    const teams = appData.teams || [];

    // Temporada
    const seasonBody = `
      <span class="hz-label">Texto que aparece bajo el título (Temporada …)</span>
      <input type="text" class="app-input" value="${hzEsc(hz.season)}" maxlength="20" placeholder="2026/27"
             onchange="hzSetSeason(this.value)">`;

    // Equipos y colores
    let teamsBody = "";
    if (!teams.length) {
      teamsBody = `<div class="hz-hint">No hay equipos creados. Añádelos en ⚙️ Opciones → Equipos.</div>`;
    } else {
      teamsBody = `<div class="hz-hint">Elige el color de cada equipo. El texto del horario siempre va en negro. Opcionalmente puedes cambiar el texto que se muestra en el horario.</div>`;
      teams.forEach((t, i) => {
        const key = getTeamKey(t);
        const lp = hzLabelParts(Object.assign({}, t), "__none__");
        const auto = (lp.cat + " " + lp.suf).trim();
        teamsBody += `<div class="hz-team-set">
          <input type="color" value="${hzEsc(hz.teamColors[key] || "#dddddd")}" onchange="hzSetTeamColor(${i}, this.value)" title="Color del equipo">
          <div class="hz-team-name">${hzEsc(t.name)} <small class="badge">${hzEsc(t.category)}</small></div>
          <input type="text" class="app-input hz-team-label" value="${hzEsc(hz.teamLabels[key] || "")}"
                 placeholder="Texto en horario: ${hzEsc(auto)}" onchange="hzSetTeamLabel(${i}, this.value)">
        </div>`;
      });
    }

    // Pabellones y pistas
    let venuesBody = `<div class="hz-hint">Cada pabellón puede tener varias pistas. Para cada pista indica los días y las horas en que está disponible (puedes añadir varias franjas). Fuera de esas horas el horario se sombrea en gris.</div>`;
    hz.venues.forEach(v => {
      const open = !!hzUI.venueOpen[v.id];
      venuesBody += `<button class="hz-sub-btn ${open ? "open" : ""}" onclick="hzToggleVenue(${jsArg(v.id)})">
          <span>🏟️ ${hzEsc(v.name)} <small class="badge">${v.courts.length} pista${v.courts.length === 1 ? "" : "s"}</small></span>
          <span>${open ? "🔻" : "➤"}</span></button>`;
      if (open) {
        venuesBody += `<div class="hz-sub-panel">
          <span class="hz-label">Nombre del pabellón</span>
          <div class="hz-court-head">
            <input type="text" class="app-input" value="${hzEsc(v.name)}" onchange="hzSetVenueName(${jsArg(v.id)}, this.value)">
            <button class="btn-del" title="Eliminar pabellón" onclick="hzDelVenue(${jsArg(v.id)})">🗑</button>
          </div>`;
        v.courts.forEach(c => {
          venuesBody += `<div class="hz-court">
            <span class="hz-label" style="margin-top:0;">Pista</span>
            <div class="hz-court-head">
              <input type="text" class="app-input" value="${hzEsc(c.name)}" onchange="hzSetCourtName(${jsArg(v.id)},${jsArg(c.id)}, this.value)">
              <button class="btn-del" title="Eliminar pista" onclick="hzDelCourt(${jsArg(v.id)},${jsArg(c.id)})">🗑</button>
            </div>
            <span class="hz-label">Disponibilidad</span>`;
          c.availability.forEach((w, wi) => {
            const chips = HZ_DAYS_SHORT.map((lbl, di) => {
              const d = di + 1;
              return `<button class="hz-chip ${w.days.indexOf(d) >= 0 ? "on" : ""}" title="${HZ_DAYS[di]}"
                        onclick="hzToggleWinDay(${jsArg(v.id)},${jsArg(c.id)},${wi},${d})">${lbl}</button>`;
            }).join("");
            venuesBody += `<div class="hz-win">
                <div class="hz-days">${chips}</div>
                <div class="hz-times">
                  <select class="app-select" onchange="hzSetWinTime(${jsArg(v.id)},${jsArg(c.id)},${wi},'start',this.value)">${hzTimeOpts(HZ_MIN, HZ_MAX - 15, w.start)}</select>
                  <span>–</span>
                  <select class="app-select" onchange="hzSetWinTime(${jsArg(v.id)},${jsArg(c.id)},${wi},'end',this.value)">${hzTimeOpts(hzT2M(w.start) + 15, HZ_MAX, w.end)}</select>
                  <button class="btn-del" title="Eliminar franja" onclick="hzDelWin(${jsArg(v.id)},${jsArg(c.id)},${wi})">🗑</button>
                </div>
              </div>`;
          });
          if (!c.availability.length) venuesBody += `<div class="hz-warn">Sin disponibilidad: esta pista no aparecerá en el horario.</div>`;
          venuesBody += `<button class="hz-mini-btn" onclick="hzAddWin(${jsArg(v.id)},${jsArg(c.id)})">+ Añadir franja de disponibilidad</button>
            </div>`;
        });
        venuesBody += `<button class="hz-mini-btn" onclick="hzAddCourt(${jsArg(v.id)})">+ Añadir pista a ${hzEsc(v.name)}</button></div>`;
      }
    });
    venuesBody += `<div class="hz-add-venue">
        <input type="text" id="hzNewVenueName" class="app-input" placeholder="Nombre del nuevo pabellón">
        <button class="btn-add" onclick="hzAddVenue()">+</button>
      </div>`;

    box.innerHTML =
      hzSub("season", "📅 Temporada", seasonBody, ` <small class="badge">${hzEsc(hz.season)}</small>`) +
      hzSub("teams", "🎨 Equipos y colores", teamsBody, ` <small class="badge">${teams.length}</small>`) +
      hzSub("venues", "🏟️ Pabellones y pistas", venuesBody, ` <small class="badge">${hz.venues.length}</small>`);
  }

  function hzSetSeason(v) { hz.season = String(v).trim() || "2026/27"; hzChanged("s"); }
  function hzSetTeamColor(i, v) {
    const t = (appData.teams || [])[i]; if (!t) return;
    hz.teamColors[getTeamKey(t)] = v; hzChanged("t");
  }
  function hzSetTeamLabel(i, v) {
    const t = (appData.teams || [])[i]; if (!t) return;
    const k = getTeamKey(t);
    if (String(v).trim()) hz.teamLabels[k] = String(v).trim(); else delete hz.teamLabels[k];
    hzChanged("t");
  }

  function hzNewCourt(name) {
    return { id: hzUid("c"), name, availability: [{ days: [1, 2, 3, 4, 5], start: "16:30", end: "23:00" }] };
  }
  function hzFindVenue(id) { return hz.venues.find(v => v.id === id); }
  function hzFindCourt(vid, cid) { const v = hzFindVenue(vid); return v ? v.courts.find(c => c.id === cid) : null; }

  function hzAddVenue() {
    const inp = hzEl("hzNewVenueName");
    const name = (inp.value || "").trim();
    if (!name) { inp.focus(); return; }
    const v = { id: hzUid("v"), name, courts: [hzNewCourt("Pista 1")] };
    hz.venues.push(v);
    hzUI.venueOpen[v.id] = true;
    hzChanged("st");
  }
  function hzDelVenue(id) {
    const v = hzFindVenue(id); if (!v) return;
    let n = 0; v.courts.forEach(c => { n += hzTrainingsUsingCourt(c.id); });
    if (!confirm(`¿Eliminar el pabellón "${v.name}" y todas sus pistas?` + (n ? `\n\nSe eliminarán también ${n} entrenamiento(s) asignados a él.` : ""))) return;
    v.courts.forEach(c => hzRemoveTrainingsOfCourt(c.id));
    hz.venues = hz.venues.filter(x => x.id !== id);
    hzChanged("st");
  }
  function hzSetVenueName(id, val) {
    const v = hzFindVenue(id); if (!v) return;
    v.name = String(val).trim() || "Pabellón";
    hzChanged("t");
  }
  function hzAddCourt(vid) {
    const v = hzFindVenue(vid); if (!v) return;
    v.courts.push(hzNewCourt("Pista " + (v.courts.length + 1)));
    hzChanged("st");
  }
  function hzDelCourt(vid, cid) {
    const v = hzFindVenue(vid), c = hzFindCourt(vid, cid); if (!c) return;
    const n = hzTrainingsUsingCourt(cid);
    if (!confirm(`¿Eliminar la pista "${c.name}"?` + (n ? `\n\nSe eliminarán también ${n} entrenamiento(s) asignados a ella.` : ""))) return;
    hzRemoveTrainingsOfCourt(cid);
    v.courts = v.courts.filter(x => x.id !== cid);
    hzChanged("st");
  }
  function hzSetCourtName(vid, cid, val) {
    const c = hzFindCourt(vid, cid); if (!c) return;
    c.name = String(val).trim() || "Pista";
    hzChanged("t");
  }
  function hzAddWin(vid, cid) {
    const c = hzFindCourt(vid, cid); if (!c) return;
    c.availability.push({ days: [1, 2, 3, 4, 5], start: "16:30", end: "23:00" });
    hzChanged("s");
  }
  function hzDelWin(vid, cid, wi) {
    const c = hzFindCourt(vid, cid); if (!c) return;
    c.availability.splice(wi, 1);
    hzChanged("st");
  }
  function hzToggleWinDay(vid, cid, wi, d) {
    const c = hzFindCourt(vid, cid); if (!c || !c.availability[wi]) return;
    const w = c.availability[wi];
    const i = w.days.indexOf(d);
    if (i >= 0) w.days.splice(i, 1); else { w.days.push(d); w.days.sort(); }
    hzChanged("st");
  }
  function hzSetWinTime(vid, cid, wi, field, val) {
    const c = hzFindCourt(vid, cid); if (!c || !c.availability[wi]) return;
    const w = c.availability[wi];
    w[field] = val;
    if (hzT2M(w.end) <= hzT2M(w.start)) w.end = hzM2T(Math.min(hzT2M(w.start) + 60, HZ_MAX));
    hzChanged("st");
  }

  // =====================================================================
  //  SECCIÓN 2: ENTRENAMIENTOS POR EQUIPO
  // =====================================================================
  function hzRowIssues(key, tr, idx) {
    const out = [];
    const ci = hzCourtInfo(tr.courtId);
    if (!ci) return [{ t: "w", m: "La pista asignada ya no existe." }];
    const s = hzT2M(tr.start), e = hzT2M(tr.end);
    const av = hzAvail(ci.court, tr.day);
    if (!av.some(([a, b]) => s >= a && e <= b)) {
      out.push({ t: "w", m: av.length
        ? `Fuera de la disponibilidad de la pista (${av.map(x => hzM2T(x[0]) + "–" + hzM2T(x[1])).join(", ")}).`
        : "La pista no está disponible ese día." });
    }
    (hz.trainings[key] || []).forEach((o, oi) => {
      if (oi !== idx && o.day === tr.day && hzT2M(o.start) < e && hzT2M(o.end) > s) {
        out.push({ t: "w", m: `El equipo ya tiene otro entrenamiento en ese horario (${o.start}–${o.end}).` });
      }
    });
    const teamMap = hzTeamsMap();
    Object.keys(hz.trainings).forEach(k => {
      if (k === key || !teamMap[k]) return;
      (hz.trainings[k] || []).forEach(o => {
        if (o.day === tr.day && o.courtId === tr.courtId) {
          const os = hzT2M(o.start), oe = hzT2M(o.end);
          if (os < e && oe > s) {
            out.push({ t: "i", m: `Solapa en la misma pista con ${teamMap[k].name} (${teamMap[k].category}) de ${hzM2T(Math.max(s, os))} a ${hzM2T(Math.min(e, oe))}.` });
          }
        }
      });
    });
    return out;
  }

  function hzCourtOptions(sel) {
    let h = `<option value="">Pabellón y pista…</option>`;
    hz.venues.forEach(v => {
      if (!v.courts.length) return;
      h += `<optgroup label="${hzEsc(v.name)}">` +
        v.courts.map(c => `<option value="${c.id}"${c.id === sel ? " selected" : ""}>${hzEsc(v.name)} · ${hzEsc(c.name)}</option>`).join("") +
        `</optgroup>`;
    });
    return h;
  }

  function hzRowHtml(i, ti, tr, issues) {
    const draft = ti < 0;
    const dayOpts = `<option value="">Día…</option>` +
      HZ_DAYS.map((n, di) => `<option value="${di + 1}"${Number(tr.day) === di + 1 ? " selected" : ""}>${n}</option>`).join("");
    const startMin = hzT2M(tr.start);
    const endFrom = isNaN(startMin) ? HZ_MIN + 15 : startMin + 15;
    const hasAny = (tr.day !== "" && tr.day != null) || tr.courtId || tr.start || tr.end;
    const issuesHtml = (issues || []).map(is => `<div class="${is.t === "w" ? "hz-warn" : "hz-info"}">${is.t === "w" ? "⚠️" : "ℹ️"} ${hzEsc(is.m)}</div>`).join("");
    return `<div class="hz-train ${draft ? "draft" : ""}">
      ${draft ? `<div class="hz-draft-title">➕ Nuevo entrenamiento</div>` : ""}
      <div class="hz-train-r1">
        <select class="app-select" onchange="hzTrainSet(${i},${ti},'day',this.value)">${dayOpts}</select>
        <select class="app-select" onchange="hzTrainSet(${i},${ti},'courtId',this.value)">${hzCourtOptions(tr.courtId)}</select>
      </div>
      <div class="hz-train-r2">
        <select class="app-select" onchange="hzTrainSet(${i},${ti},'start',this.value)">${hzTimeOpts(HZ_MIN, HZ_MAX - 15, tr.start, "Inicio")}</select>
        <span>–</span>
        <select class="app-select" onchange="hzTrainSet(${i},${ti},'end',this.value)">${hzTimeOpts(endFrom, HZ_MAX, tr.end, "Fin")}</select>
        ${(!draft || hasAny) ? `<button class="btn-del" title="${draft ? "Vaciar fila" : "Eliminar entrenamiento"}" onclick="hzTrainDel(${i},${ti})">🗑</button>` : `<span></span>`}
      </div>
      ${issuesHtml}
    </div>`;
  }

  function hzRenderTrainings() {
    const box = hzEl("hzSec_trainings");
    if (!box) return;
    const teams = appData.teams || [];
    if (!teams.length) {
      box.innerHTML = `<div class="hz-hint">No hay equipos creados. Añádelos en ⚙️ Opciones → Equipos.</div>`;
      return;
    }
    const hasCourts = hz.venues.some(v => v.courts.length);
    let h = `<div class="hz-hint">Selecciona un equipo e introduce sus entrenamientos. Al completar día, pista, hora de inicio y hora de fin se abre una fila nueva.</div>`;
    if (!hasCourts) h += `<div class="hz-warn" style="margin-bottom:8px;">⚠️ Primero añade pabellones y pistas en «1. Ajustes».</div>`;

    teams.forEach((t, i) => {
      const key = getTeamKey(t);
      const open = hzUI.teamOpen === key;
      const list = hz.trainings[key] || [];
      h += `<button class="hz-team-btn ${open ? "open" : ""}" onclick="hzToggleTeam(${i})">
          <span><span class="hz-dot" style="background:${hzEsc(hz.teamColors[key] || "#ddd")}"></span>${hzEsc(t.name)} (${hzEsc(t.category)})
          <small class="badge">${list.length}</small></span><span>${open ? "🔻" : "➤"}</span></button>`;
      if (open) {
        h += `<div class="hz-sub-panel">`;
        list.forEach((tr, ti) => { h += hzRowHtml(i, ti, tr, hzRowIssues(key, tr, ti)); });
        const d = hzDraft[key] || { day: "", courtId: "", start: "", end: "" };
        h += hzRowHtml(i, -1, d, []);
        h += `</div>`;
      }
    });
    box.innerHTML = h;
  }

  function hzTrainSet(i, ti, field, val) {
    const t = (appData.teams || [])[i]; if (!t) return;
    const key = getTeamKey(t);
    let tr;
    if (ti < 0) {
      if (!hzDraft[key]) hzDraft[key] = { day: "", courtId: "", start: "", end: "" };
      tr = hzDraft[key];
    } else {
      tr = (hz.trainings[key] || [])[ti];
    }
    if (!tr) return;
    tr[field] = (field === "day") ? (val === "" ? "" : Number(val)) : val;
    if (field === "start" && val && tr.end && hzT2M(tr.end) <= hzT2M(val)) {
      tr.end = ti < 0 ? "" : hzM2T(Math.min(hzT2M(val) + 90, HZ_MAX));
    }
    if (ti < 0) {
      if (tr.day !== "" && tr.courtId && tr.start && tr.end) {
        if (!hz.trainings[key]) hz.trainings[key] = [];
        hz.trainings[key].push({ id: hzUid("t"), day: tr.day, courtId: tr.courtId, start: tr.start, end: tr.end });
        delete hzDraft[key];
        hzChanged("t");   // se repinta y aparece una fila nueva vacía
      } else {
        hzRenderTrainings();
      }
    } else {
      hzChanged("t");
    }
  }

  function hzTrainDel(i, ti) {
    const t = (appData.teams || [])[i]; if (!t) return;
    const key = getTeamKey(t);
    if (ti < 0) { delete hzDraft[key]; hzRenderTrainings(); return; }
    (hz.trainings[key] || []).splice(ti, 1);
    hzChanged("t");
  }

  // =====================================================================
  //  SECCIÓN 3: HORARIO SEMANAL (canvas A4 apaisado)
  // =====================================================================
  function hzBuildModel() {
    const teamMap = hzTeamsMap();
    const sessions = [];
    Object.keys(hz.trainings).forEach(key => {
      const team = teamMap[key];
      if (!team) return;
      (hz.trainings[key] || []).forEach(tr => {
        if (!hzCourtInfo(tr.courtId)) return;
        const s = hzT2M(tr.start), e = hzT2M(tr.end), day = Number(tr.day);
        if (!(e > s) || day < 1 || day > 5) return;
        sessions.push({ key, team, day, courtId: tr.courtId, s, e });
      });
    });
    const days = [];
    for (let d = 1; d <= 5; d++) {
      const cols = [];
      hz.venues.forEach(v => v.courts.forEach(c => {
        const avail = hzAvail(c, d);
        const own = sessions.filter(x => x.day === d && x.courtId === c.id);
        if (avail.length || own.length) cols.push({ venue: v, court: c, avail, sessions: own });
      }));
      days.push({ day: d, cols });
    }
    let minS = Infinity, maxE = -Infinity;
    sessions.forEach(x => { minS = Math.min(minS, x.s); maxE = Math.max(maxE, x.e); });
    if (!sessions.length) {
      days.forEach(d => d.cols.forEach(c => c.avail.forEach(([a, b]) => { minS = Math.min(minS, a); maxE = Math.max(maxE, b); })));
    }
    if (!isFinite(minS)) { minS = 16 * 60; maxE = 22 * 60; }
    const rangeStart = Math.floor(minS / 30) * 30;
    const rangeEnd = Math.max(Math.ceil(maxE / 30) * 30, rangeStart + 60);
    return { days, sessions, rangeStart, rangeEnd };
  }

  // Geometría de cada sesión de una columna: si hay solape con otra sesión de la
  // misma pista, el espacio solapado se divide con una diagonal entre ambos equipos.
  function hzSessionPolys(list) {
    const L = list.slice().sort((a, b) => a.s - b.s || a.e - b.e);
    return L.map((x, i) => {
      let trEnd = x.s, blStart = x.e;
      for (let j = 0; j < i; j++) {
        const o = L[j];
        if (o.e > x.s) trEnd = Math.max(trEnd, Math.min(o.e, x.e));
      }
      for (let k = i + 1; k < L.length; k++) {
        const o = L[k];
        if (o.s < x.e && o.e >= x.e) blStart = Math.min(blStart, o.s);
      }
      return { x, trEnd, blStart };
    });
  }

  function hzWrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    words.forEach(w => {
      const test = cur ? cur + " " + w : w;
      if (!cur || ctx.measureText(test).width <= maxW) cur = test; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function hzFitText(ctx, parts, boxW, boxH, maxFs, minFs) {
    const compute = fs => {
      const lines = []; let ok = true, total = 0;
      parts.forEach(p => {
        const size = fs * p.mult;
        ctx.font = `${p.weight} ${size}px ${HZ_FONT}`;
        hzWrap(ctx, p.text, boxW).forEach(l => {
          if (ctx.measureText(l).width > boxW + 0.5) ok = false;
          lines.push({ t: l, size, weight: p.weight });
          total += size * 1.2;
        });
      });
      return { lines, total, ok };
    };
    for (let fs = maxFs; fs > minFs; fs -= 1) {
      const r = compute(fs);
      if (r.ok && r.total <= boxH) return r;
    }
    return compute(minFs);
  }

  function hzDrawLines(ctx, fit, cx, top, h) {
    let y = top + (h - fit.total) / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000";
    fit.lines.forEach(l => {
      ctx.font = `${l.weight} ${l.size}px ${HZ_FONT}`;
      ctx.fillText(l.t, cx, y + l.size * 0.6);
      y += l.size * 1.2;
    });
  }

  function hzDrawSpaced(ctx, text, cx, y, spacing) {
    const chars = Array.from(text);
    const widths = chars.map(c => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let x = cx - total / 2;
    ctx.textAlign = "left";
    chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
  }

  function hzHatch(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = "#d9d9d9"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#9b9b9b"; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let k = -h; k < w + h; k += 24) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
    ctx.stroke();
    ctx.restore();
  }

  function hzDrawSchedule(canvas, opts) {
    opts = opts || {};
    const W = 2970, H = 2100, M = 70;   // A4 apaisado (297x210 mm) a 10 px/mm
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const model = hzBuildModel();

    // Fondo: gradiente de azules
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#061a5c"); bg.addColorStop(0.35, "#0d47b8");
    bg.addColorStop(0.7, "#2e8bf0"); bg.addColorStop(1, "#9fd6ff");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Geometría
    const timeW = 130, hDay = 76, hVen = 56, hCrt = 56, headH = hDay + hVen + hCrt;
    const colsPerDay = model.days.map(d => Math.max(1, d.cols.length));
    const totalCols = colsPerDay.reduce((a, b) => a + b, 0);
    const tableX = M, tableW = W - 2 * M;
    const colW = (tableW - timeW) / totalCols;
    const nRows = (model.rangeEnd - model.rangeStart) / 30;
    const titleBlock = 250;
    const rowH = Math.min(150, (H - 2 * M - titleBlock - headH) / nRows);
    const tableH = headH + rowH * nRows;
    const top0 = Math.max(M * 0.7, (H - (titleBlock + tableH)) / 2);
    const tableY = top0 + titleBlock, bodyY = tableY + headH;
    const yOf = m => bodyY + (m - model.rangeStart) / 30 * rowH;
    const xOfCol = k => tableX + timeW + k * colW;

    // Título
    ctx.save();
    ctx.textBaseline = "middle"; ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,20,80,0.7)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.font = `800 104px ${HZ_FONT}`;
    hzDrawSpaced(ctx, "Horarios Nou Volei Alzira", W / 2, top0 + 95, 8);
    ctx.font = `700 64px ${HZ_FONT}`;
    hzDrawSpaced(ctx, opts.subtitle || ("Temporada " + hz.season), W / 2, top0 + 190, 4);
    ctx.restore();

    // Interior blanco del horario
    ctx.fillStyle = "#ffffff"; ctx.fillRect(tableX, tableY, tableW, tableH);

    const cell = (x, y, w, h, fill) => {
      ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    };
    const cellText = (txt, x, y, w, h, maxFs, weight) => {
      const fit = hzFitText(ctx, [{ text: txt, mult: 1, weight: weight || 800 }], w - 16, h - 8, maxFs, 12);
      hzDrawLines(ctx, fit, x + w / 2, y + 4, h - 8);
    };

    // Cabeceras
    cell(tableX, tableY, timeW, headH, "#a6a6a6");
    cellText("Hora", tableX, tableY + headH - hCrt - 10, timeW, hCrt + 10, 34, 800);

    let ci = 0;
    model.days.forEach((d, di) => {
      const n = colsPerDay[di], x0 = xOfCol(ci), w = n * colW;
      cell(x0, tableY, w, hDay, "#a6a6a6");
      cellText(HZ_DAYS[di].toUpperCase() + (opts.dayLabels ? " " + opts.dayLabels[di] : ""), x0, tableY, w, hDay, 46, 800);
      if (opts.dayHits) opts.dayHits.push({ x: x0, y: tableY, w, h: hDay, day: di + 1 });
      if (opts.diaAnulado && opts.diaAnulado(di + 1)) wkStripes(ctx, [[x0, tableY], [x0 + w, tableY], [x0 + w, tableY + hDay], [x0, tableY + hDay]]);
      if (!d.cols.length) {
        cell(x0, tableY + hDay, w, hVen + hCrt, "#cfcfcf");
        cellText("SIN PISTA", x0, tableY + hDay, w, hVen + hCrt, 26, 700);
        hzHatch(ctx, x0, bodyY, w, tableH - headH);
      } else {
        let k = 0;
        while (k < d.cols.length) {
          let j = k;
          while (j + 1 < d.cols.length && d.cols[j + 1].venue.id === d.cols[k].venue.id) j++;
          const gx = x0 + k * colW, gw = (j - k + 1) * colW, venue = d.cols[k].venue;
          if (venue.courts.length === 1) {
            cell(gx, tableY + hDay, gw, hVen + hCrt, "#c6c6c6");
            cellText(venue.name.toUpperCase(), gx, tableY + hDay, gw, hVen + hCrt, 34, 800);
          } else {
            cell(gx, tableY + hDay, gw, hVen, "#c6c6c6");
            cellText(venue.name.toUpperCase(), gx, tableY + hDay, gw, hVen, 32, 800);
            for (let q = k; q <= j; q++) {
              cell(x0 + q * colW, tableY + hDay + hVen, colW, hCrt, "#dedede");
              cellText(d.cols[q].court.name.toUpperCase(), x0 + q * colW, tableY + hDay + hVen, colW, hCrt, 28, 700);
            }
          }
          k = j + 1;
        }
      }
      ci += n;
    });

    // Franjas sin disponibilidad de pista (sombreado gris rayado)
    ci = 0;
    model.days.forEach((d, di) => {
      d.cols.forEach((c, q) => {
        const x = xOfCol(ci + q);
        let cursor = model.rangeStart;
        const gray = (a, b) => {
          const from = Math.max(a, model.rangeStart), to = Math.min(b, model.rangeEnd);
          if (to > from) hzHatch(ctx, x, yOf(from), colW, yOf(to) - yOf(from));
        };
        c.avail.forEach(([a, b]) => { if (a > cursor) gray(cursor, a); cursor = Math.max(cursor, b); });
        if (cursor < model.rangeEnd) gray(cursor, model.rangeEnd);
      });
      ci += colsPerDay[di];
    });

    // Rejilla
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let r = 0; r <= nRows; r++) { const y = bodyY + r * rowH; ctx.moveTo(tableX, y); ctx.lineTo(tableX + tableW, y); }
    for (let k = 0; k <= totalCols; k++) { const x = xOfCol(k); ctx.moveTo(x, bodyY); ctx.lineTo(x, tableY + tableH); }
    ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath();
    ci = 0;
    ctx.moveTo(tableX + timeW, tableY); ctx.lineTo(tableX + timeW, tableY + tableH);
    colsPerDay.forEach(n => { ci += n; const x = xOfCol(ci); ctx.moveTo(x, tableY); ctx.lineTo(x, tableY + tableH); });
    ctx.stroke();

    // Sesiones (con diagonal en los solapes)
    ci = 0;
    model.days.forEach((d, di) => {
      d.cols.forEach((c, q) => {
        const x0 = xOfCol(ci + q), x1 = x0 + colW;
        hzSessionPolys(c.sessions).forEach(p => {
          const x = p.x;
          const yTL = yOf(x.s), yTR = yOf(p.trEnd), yBR = yOf(x.e), yBL = yOf(p.blStart);
          ctx.beginPath();
          ctx.moveTo(x0, yTL); ctx.lineTo(x1, yTR); ctx.lineTo(x1, yBR); ctx.lineTo(x0, yBL);
          ctx.closePath();
          ctx.fillStyle = hz.teamColors[x.key] || "#dddddd"; ctx.fill();
          ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();

          // Texto: zona libre (sin la diagonal); si es muy pequeña, centro del polígono
          let bTop = Math.max(yTL, yTR), bBot = Math.min(yBR, yBL), bW = colW - 16;
          if (bBot - bTop < rowH * 0.6) {
            const cy = (yTL + yTR + yBR + yBL) / 4;
            bTop = cy - rowH * 0.5; bBot = cy + rowH * 0.5; bW = colW * 0.7;
          }
          const lp = hzLabelParts(x.team, x.key);
          const parts = [];
          if (lp.cat) parts.push({ text: lp.cat, mult: 1, weight: 800 });
          if (lp.suf) parts.push({ text: lp.suf, mult: 1.45, weight: 800 });
          parts.push({ text: `(${hzM2T(x.s)}-${hzM2T(x.e)})`, mult: 0.72, weight: 700 });
          if (opts.hits) opts.hits.push({ pts: [[x0, yTL], [x1, yTR], [x1, yBR], [x0, yBL]], key: x.key, day: x.day });

          // Entrenamiento anulado (anulaciones.js): rayas diagonales y sin marca
          const anul = opts.anulado ? opts.anulado(x) : false;
          if (anul) wkStripes(ctx, [[x0, yTL], [x1, yTR], [x1, yBR], [x0, yBL]]);

          // Marca V / X (solo en el calendario semanal de la página principal)
          const markCh = opts.mark && !anul ? opts.mark(x) : null;
          const mr = markCh ? Math.max(12, Math.min(28, (yBR - yTL) * 0.22)) : 0;
          const reserve = markCh && (bBot - bTop) > 2 * mr + 70 ? 2 * mr + 6 : 0;
          const fit = hzFitText(ctx, parts, bW, bBot - bTop - 6 - reserve, 46, 11);
          hzDrawLines(ctx, fit, (x0 + x1) / 2, bTop + 3 + reserve, bBot - bTop - 6 - reserve);
          if (markCh) {
            const bx = reserve ? (x0 + x1) / 2 : x0 + mr + 6;
            const by = reserve ? bTop + 3 + mr : yTL + mr + 4;
            ctx.beginPath(); ctx.arc(bx, by, mr, 0, Math.PI * 2);
            ctx.fillStyle = markCh === "V" ? "#16a34a" : "#dc2626"; ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(mr * 1.3)}px ${HZ_FONT}`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(markCh, bx, by + mr * 0.06);
          }
        });
      });
      ci += colsPerDay[di];
    });

    // Etiquetas de hora (columna izquierda)
    ctx.fillStyle = "#000";
    for (let r = 0; r <= nRows; r++) {
      const y = bodyY + r * rowH, label = hzM2T(model.rangeStart + r * 30);
      ctx.font = `800 34px ${HZ_FONT}`; ctx.textAlign = "center";
      if (r === 0) { ctx.textBaseline = "top"; ctx.fillText(label, tableX + timeW / 2, y + 8); }
      else if (r === nRows) { ctx.textBaseline = "bottom"; ctx.fillText(label, tableX + timeW / 2, y - 8); }
      else {
        ctx.fillStyle = "#fff"; ctx.fillRect(tableX + 8, y - 22, timeW - 16, 44);
        ctx.fillStyle = "#000"; ctx.textBaseline = "middle"; ctx.fillText(label, tableX + timeW / 2, y + 2);
      }
    }

    // Borde exterior
    ctx.strokeStyle = "#000"; ctx.lineWidth = 5; ctx.strokeRect(tableX, tableY, tableW, tableH);
    return { sessions: model.sessions.length };
  }

  function hzRenderSchedule() {
    const canvas = hzEl("hzCanvas");
    if (!canvas) return;
    const info = hzDrawSchedule(canvas);
    const note = hzEl("hzSchedNote");
    if (note) {
      note.textContent = info.sessions
        ? `${info.sessions} entrenamiento(s) · Formato A4 apaisado, de lunes a viernes. Las franjas sin uso se eliminan y las horas sin disponibilidad de pista se sombrean en gris.`
        : "Todavía no hay entrenamientos. Añádelos en «2. Entrenamientos por equipo».";
    }
  }

  // ---------- exportación ----------
  function hzFileBase() {
    return "Horarios_Nou_Volei_Alzira_" + String(hz.season).replace(/[^a-zA-Z0-9]+/g, "-");
  }
  function hzRenderOffscreen() {
    const c = document.createElement("canvas");
    hzDrawSchedule(c);   // siempre se dibuja completo (lunes a viernes), independientemente de lo visible en pantalla
    return c;
  }
  function hzTick() { return new Promise(r => setTimeout(r, 60)); }

  async function hzDownloadPNG() {
    await hzTick();
    const c = hzRenderOffscreen();
    const blob = await new Promise(res => c.toBlob(res, "image/png"));
    if (!blob) { alert("No se pudo generar la imagen."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = hzFileBase() + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function hzDownloadPDF() {
    await hzTick();
    try { await ensureExportLibs(); } catch (e) { alert("La librería de PDF no está disponible (sin conexión). Inténtalo de nuevo con conexión."); return; }
    const c = hzRenderOffscreen();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, 297, 210, undefined, "FAST");
    pdf.save(hzFileBase() + ".pdf");
  }

  function hzOpenZoom() {
    const c = hzRenderOffscreen();
    hzEl("hzZoomImg").src = c.toDataURL("image/png");
    hzEl("modalHzZoom").classList.add("active");
  }
  function hzCloseZoom() {
    hzEl("modalHzZoom").classList.remove("active");
    hzEl("hzZoomImg").removeAttribute("src");
  }

  // =====================================================================
  //  GITHUB: Horarios.json
  // =====================================================================
  async function fetchHorariosFromGitHub() {
    if (!ghSettings.user || !ghSettings.repo || !navigator.onLine) return false;
    // No pisar cambios locales pendientes de guardar/enviar
    if (hzDirty || offlineQueue.some(op => op.fileName === HZ_FILE)) return false;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${HZ_FILE}`;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        hz = hzNormalize(JSON.parse(b64_to_utf8(json.content)));
        hzEnsureColors();
        hzPersistLocal();
        return true;
      }
    } catch (e) { console.error(`Error al cargar ${HZ_FILE}:`, e); }
    return false;
  }

  async function saveHorarios() {
    hzEnsureColors();
    hz.updated = new Date().toISOString();
    hzPersistLocal();
    const ok = await writeGitHubFile(HZ_FILE, hz, "Actualizar horarios de entrenamiento");
    // Si no hubo conexión, writeGitHubFile lo deja en la cola offline y se enviará al reconectar.
    hzSetDirty(false);
    alert(ok ? "¡Horarios guardados y sincronizados en GitHub (Horarios.json)!"
             : "Guardado localmente. Se sincronizará con GitHub cuando recupere la conexión.");
  }

  async function refreshHorarios() {
    if (!ghSettings.user || !ghSettings.repo) {
      alert("Configura primero la conexión con GitHub para poder refrescar los Horarios.");
      return;
    }
    if (!navigator.onLine) { alert("Sin conexión: no se pueden refrescar los Horarios ahora mismo."); return; }
    if (hzDirty && !confirm("Tienes cambios sin guardar. Si refrescas se perderán y se cargará la versión de GitHub. ¿Continuar?")) return;
    if (hzDirty) hzSetDirty(false);
    if (offlineQueue.length > 0) await processOfflineQueue();
    const ok = await fetchHorariosFromGitHub();
    hzRenderAll();
    if (!ok) alert("No se encontró Horarios.json en GitHub o no se pudo leer.");
  }
