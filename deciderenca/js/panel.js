// ── Panel de resultados ───────────────────────────────────

function renderPanel() {
  const { election, layer, zoneId, validOnly } = App.state;
  const elData = getElectionData(election, layer, zoneId);

  // Meta: total votos
  const realTotal = Object.values(App.candidates.renca_totals?.[election] || {})
    .reduce((s, v) => s + v.votos, 0);
  const isAggregate = (zoneId === null);
  const isLocales   = (layer === "locales");
  const metaVotos   = document.getElementById("meta-votos");
  const zoneTotal   = Object.values(elData).reduce((s, v) => s + v.votos, 0);

  if (isAggregate) {
    metaVotos.textContent = `${realTotal.toLocaleString("es-CL")} votos · Renca`;
    metaVotos.title = "";
  } else if (isLocales) {
    metaVotos.textContent = `${Math.round(zoneTotal).toLocaleString("es-CL")} votos · datos reales`;
    metaVotos.title = "Datos oficiales del local de votación";
  } else {
    metaVotos.textContent = `~${Math.round(zoneTotal).toLocaleString("es-CL")} votos estimados`;
    metaVotos.title = "Estimación proporcional basada en distribución por local de votación";
  }

  // Toggle válidos/totales
  renderValidToggle();
  buildPactoDropdown(elData);
  renderCandidateList(elData, isAggregate || isLocales);
}

// ── Toggle Votos Totales / Válidos ────────────────────────

function renderValidToggle() {
  let toggle = document.getElementById("valid-toggle");
  if (!toggle) return;
  toggle.querySelector("[data-v='total']").classList.toggle("active", !App.state.validOnly);
  toggle.querySelector("[data-v='valid']").classList.toggle("active",  App.state.validOnly);
}

// ── Dropdown de pactos ────────────────────────────────────

function buildPactoDropdown(elData) {
  const bar = document.getElementById("pacto-bar");

  // Recopilar pactos únicos (excluye anomia y presidencial)
  const pactos = [...new Set(
    Object.values(elData)
      .filter(v => v.pacto && v.pacto !== "otros" && v.pacto !== "presidencial" && v.pacto !== "anomia")
      .map(v => v.pacto)
  )];

  // Sin pactos relevantes (ej. presidencial): ocultar
  if (pactos.length === 0) { bar.innerHTML = ""; return; }

  bar.innerHTML = `
    <div class="pacto-dropdown">
      <button class="pacto-trigger" id="pacto-trigger">
        ${getPactoLabel()} <span class="arrow">▾</span>
      </button>
      <div class="pacto-menu hidden" id="pacto-menu">
        <label class="pacto-option">
          <input type="checkbox" data-pacto="" ${App.state.selectedPactos.length === 0 ? "checked" : ""}> Todos
        </label>
        ${pactos.map(p => {
          const color   = App.candidates.partyColors[p] || "#888";
          const checked = App.state.selectedPactos.includes(p) ? "checked" : "";
          const short   = formatPactoShort(p);
          return `<label class="pacto-option">
            <input type="checkbox" data-pacto="${p}" ${checked}>
            <span class="pacto-dot" style="background:${color}"></span> ${short}
          </label>`;
        }).join("")}
      </div>
    </div>`;

  // Toggle menú
  document.getElementById("pacto-trigger").addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("pacto-menu").classList.toggle("hidden");
  });

  // Checkboxes
  bar.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      const pacto = cb.dataset.pacto;
      if (pacto === "") {
        // "Todos" → limpia selección
        App.state.selectedPactos = [];
        bar.querySelectorAll("input[data-pacto!='']").forEach(x => x.checked = false);
        cb.checked = true;
      } else {
        if (cb.checked) {
          App.state.selectedPactos = [...App.state.selectedPactos.filter(p => p !== pacto), pacto];
        } else {
          App.state.selectedPactos = App.state.selectedPactos.filter(p => p !== pacto);
        }
        // Desmarcar "Todos" si hay selección
        bar.querySelector("input[data-pacto='']").checked = App.state.selectedPactos.length === 0;
      }
      document.getElementById("pacto-trigger").innerHTML =
        getPactoLabel() + ' <span class="arrow">▾</span>';
      renderCandidateList(getElectionData(App.state.election, App.state.layer, App.state.zoneId),
                          App.state.zoneId === null || App.state.layer === "locales");
    });
  });

  // Cerrar al click fuera
  document.addEventListener("click", function closePacto(e) {
    const menu = document.getElementById("pacto-menu");
    if (menu && !menu.contains(e.target) && e.target.id !== "pacto-trigger") {
      menu.classList.add("hidden");
      document.removeEventListener("click", closePacto);
    }
  });
}

function getPactoLabel() {
  const n = App.state.selectedPactos.length;
  if (n === 0) return "Todos los pactos";
  if (n === 1) return formatPactoShort(App.state.selectedPactos[0]);
  return `${n} pactos seleccionados`;
}

function formatPactoShort(p) {
  if (!p || p.length <= 4) return p;
  const parts = p.split(/\s*-\s*/, 2);
  if (parts.length === 2) {
    const title = parts[1].charAt(0) + parts[1].slice(1).toLowerCase();
    return `${parts[0]} · ${title}`;
  }
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

// ── Lista de candidatos ───────────────────────────────────

function renderCandidateList(elData, showExactVotos) {
  const { selectedPactos, selectedCandidate, validOnly } = App.state;
  const list = document.getElementById("candidate-list");

  let rows = Object.entries(elData).map(([cid, v]) => ({ cid, ...v }));

  // Filtrar por pactos si hay selección
  if (selectedPactos.length > 0) {
    rows = rows.filter(r =>
      selectedPactos.includes(r.pacto) ||
      r.cid === "__blancos__" || r.cid === "__nulos__"
    );
  }

  // Calcular pct ajustado según validOnly
  rows = rows.map(r => ({
    ...r,
    pctDisplay: adjustedPct(r.pct, r.cid, elData),
  }));

  // Ordenar: candidatos por pctDisplay desc, anomia al final
  rows.sort((a, b) => {
    const aA = a.cid === "__blancos__" || a.cid === "__nulos__";
    const bA = b.cid === "__blancos__" || b.cid === "__nulos__";
    if (aA !== bA) return aA ? 1 : -1;
    return b.pctDisplay - a.pctDisplay;
  });

  const maxPct = rows.filter(r => r.cid !== "__blancos__" && r.cid !== "__nulos__")
    .reduce((m, r) => Math.max(m, r.pctDisplay), 0) || 1;

  list.innerHTML = rows.map(row => {
    const isAnomia   = row.cid === "__blancos__" || row.cid === "__nulos__";
    const isSelected = row.cid === selectedCandidate;
    const name       = candidateName(row.cid);
    const color      = isAnomia ? "#aaa" : partyColor(row.pacto, row.partido, row.cid);
    const pctStr     = (row.pctDisplay * 100).toFixed(1) + "%";
    const barW       = Math.round((row.pctDisplay / maxPct) * 100);
    const party      = isAnomia ? "" : formatPartyLabel(row.pacto, row.partido, row.cid);
    const votos      = Math.round(row.votos).toLocaleString("es-CL");
    const prefix     = showExactVotos ? "" : "~";

    return `
      <div class="cand-row${isAnomia ? " anomia" : ""}${isSelected ? " selected" : ""}"
           data-cid="${row.cid.replace(/"/g, "&quot;")}">
        <div class="cand-color" style="background:${color}"></div>
        <div class="cand-info">
          <div class="cand-name" title="${name}">${name}</div>
          ${party ? `<div class="cand-party">${party}</div>` : ""}
        </div>
        <div class="cand-bar-wrap">
          <div class="cand-bar-track">
            <div class="cand-bar-fill" style="width:${barW}%;background:${color}"></div>
          </div>
          <div class="cand-pct">${pctStr}</div>
          <div class="cand-votos">${prefix}${votos}</div>
        </div>
      </div>`;
  }).join("");

  // Click en candidato → toggle choropleth
  list.querySelectorAll(".cand-row:not(.anomia)").forEach(row => {
    row.addEventListener("click", () => {
      const cid = row.dataset.cid;
      App.state.selectedCandidate = (App.state.selectedCandidate === cid) ? null : cid;
      // Si se selecciona candidato, vuelve a vista Renca para ver sus "mejores zonas"
      if (App.state.selectedCandidate) App.state.zoneId = null;
      updateBreadcrumb();
      renderPanel();
      updateMap();
    });
  });
}

function candidateName(cid) {
  if (cid === "__blancos__") return "Votos en Blanco";
  if (cid === "__nulos__")   return "Votos Nulos";
  const found = App.candidates.candidates.find(c => c.id === cid);
  if (found) return found.name;
  return cid.replace(/_/g, " ");
}

function formatPartyLabel(pacto, partido, cid) {
  // Presidenciales: resolver desde PRES_PARTY
  const presParty = presPartyFromName(cid || "");
  if (presParty) {
    return presParty;
  }
  if (!pacto || pacto === "otros" || pacto === "presidencial" || pacto === "anomia") {
    return partido || "";
  }
  return formatPactoShort(pacto);
}
