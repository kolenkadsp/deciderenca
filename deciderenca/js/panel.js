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

  renderValidToggle();
  buildPactoDropdown(elData);
  buildPartidoDropdown(elData);
  renderCandidateList(elData, isAggregate || isLocales);
}

// ── Toggle Votos Totales / Válidos ────────────────────────

function renderValidToggle() {
  let toggle = document.getElementById("valid-toggle");
  if (!toggle) return;
  toggle.querySelector("[data-v='total']").classList.toggle("active", !App.state.validOnly);
  toggle.querySelector("[data-v='valid']").classList.toggle("active",  App.state.validOnly);
}

// ── Dropdown genérico ─────────────────────────────────────

function buildDropdown({ containerId, items, selected, labelFn, colorFn, allLabel, onChangeAll, onChangeItem, getLabel }) {
  const bar = document.getElementById(containerId);
  if (!items || items.length === 0) { bar.innerHTML = ""; return; }

  bar.innerHTML = `
    <div class="pacto-dropdown">
      <button class="pacto-trigger" id="${containerId}-trigger">
        ${getLabel()} <span class="arrow">▾</span>
      </button>
      <div class="pacto-menu hidden" id="${containerId}-menu">
        <label class="pacto-option">
          <input type="checkbox" data-val="" ${selected.length === 0 ? "checked" : ""}> ${allLabel}
        </label>
        ${items.map(item => {
          const color   = colorFn(item);
          const checked = selected.includes(item) ? "checked" : "";
          return `<label class="pacto-option">
            <input type="checkbox" data-val="${item.replace(/"/g, "&quot;")}" ${checked}>
            <span class="pacto-dot" style="background:${color}"></span> ${labelFn(item)}
          </label>`;
        }).join("")}
      </div>
    </div>`;

  document.getElementById(`${containerId}-trigger`).addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById(`${containerId}-menu`).classList.toggle("hidden");
  });

  bar.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      const val = cb.dataset.val;
      if (val === "") {
        onChangeAll();
        bar.querySelectorAll("input[data-val!='']").forEach(x => x.checked = false);
        cb.checked = true;
      } else {
        onChangeItem(val, cb.checked);
        bar.querySelector("input[data-val='']").checked = selected.length === 0;
      }
      document.getElementById(`${containerId}-trigger`).innerHTML =
        getLabel() + ' <span class="arrow">▾</span>';
      renderCandidateList(
        getElectionData(App.state.election, App.state.layer, App.state.zoneId),
        App.state.zoneId === null || App.state.layer === "locales"
      );
    });
  });

  document.addEventListener("click", function closeFn(e) {
    const menu = document.getElementById(`${containerId}-menu`);
    if (menu && !menu.contains(e.target) && e.target.id !== `${containerId}-trigger`) {
      menu.classList.add("hidden");
      document.removeEventListener("click", closeFn);
    }
  });
}

// ── Dropdown de pactos ────────────────────────────────────

function buildPactoDropdown(elData) {
  const pactos = [...new Set(
    Object.values(elData)
      .filter(v => v.pacto && v.pacto !== "otros" && v.pacto !== "presidencial" && v.pacto !== "anomia")
      .map(v => v.pacto)
  )];

  if (pactos.length === 0) { document.getElementById("pacto-bar").innerHTML = ""; return; }

  buildDropdown({
    containerId: "pacto-bar",
    items: pactos,
    selected: App.state.selectedPactos,
    allLabel: "Todos los pactos",
    labelFn: p => formatPactoShort(p),
    colorFn: p => App.candidates.partyColors[p] || "#888",
    getLabel: getPactoLabel,
    onChangeAll: () => { App.state.selectedPactos = []; },
    onChangeItem: (val, checked) => {
      if (checked) {
        App.state.selectedPactos = [...App.state.selectedPactos.filter(x => x !== val), val];
      } else {
        App.state.selectedPactos = App.state.selectedPactos.filter(x => x !== val);
      }
    },
  });
}

// ── Dropdown de partidos ──────────────────────────────────

const PARTIDO_LABELS = {
  "PCCH": "PC", "REPUBLICAN": "PRep", "DEMOCRATAS": "Demócratas",
  "FREVS": "FREVS", "EVOPOLI": "Evópoli", "PDG": "PDG",
  "PNL": "PNL", "PAVP": "PAVP", "AH": "AH", "PH": "PH",
};

function labelPartido(p) {
  return PARTIDO_LABELS[p] || p;
}

function colorPartido(p) {
  const colorMap = {
    "PS": "#E84040", "PPD": "#FF6600", "PCCH": "#CC0000", "FA": "#7B1C3E",
    "FREVS": "#2E7D32", "PH": "#9C27B0",
    "RN": "#0057B8", "UDI": "#003B8E", "REPUBLICAN": "#003087", "EVOPOLI": "#1565C0",
    "PDG": "#6B2FA0", "DEMOCRATAS": "#E67E22",
    "AH": "#4CAF50", "PNL": "#00BCD4", "PAVP": "#FF9800",
    "otros": "#888",
  };
  return colorMap[p] || App.candidates.partyColors[p] || "#888";
}

function buildPartidoDropdown(elData) {
  // Recopilar partidos únicos normalizados (excluye anomia, presidencial)
  const partidosSet = new Set();
  Object.values(elData).forEach(v => {
    if (!v.partido || v.partido === "otros" || v.pacto === "presidencial" || v.pacto === "anomia") return;
    partidosSet.add(normalizePartido(v.partido));
  });

  const partidos = [...partidosSet].sort((a, b) => a.localeCompare(b));
  if (partidos.length === 0) { document.getElementById("partido-bar").innerHTML = ""; return; }

  buildDropdown({
    containerId: "partido-bar",
    items: partidos,
    selected: App.state.selectedPartidos,
    allLabel: "Todos los partidos",
    labelFn: p => labelPartido(p),
    colorFn: p => colorPartido(p),
    getLabel: getPartidoLabel,
    onChangeAll: () => { App.state.selectedPartidos = []; },
    onChangeItem: (val, checked) => {
      if (checked) {
        App.state.selectedPartidos = [...App.state.selectedPartidos.filter(x => x !== val), val];
      } else {
        App.state.selectedPartidos = App.state.selectedPartidos.filter(x => x !== val);
      }
    },
  });
}

function getPartidoLabel() {
  const n = App.state.selectedPartidos.length;
  if (n === 0) return "Todos los partidos";
  if (n === 1) return labelPartido(App.state.selectedPartidos[0]);
  return `${n} partidos`;
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
  const { selectedPactos, selectedPartidos, selectedCandidate, validOnly } = App.state;
  const list = document.getElementById("candidate-list");

  let rows = Object.entries(elData).map(([cid, v]) => ({ cid, ...v }));

  // Filtro por pacto
  if (selectedPactos.length > 0) {
    rows = rows.filter(r =>
      selectedPactos.includes(r.pacto) ||
      r.cid === "__blancos__" || r.cid === "__nulos__"
    );
  }

  // Filtro por partido (normalizado: IND-PPD → PPD)
  if (selectedPartidos.length > 0) {
    rows = rows.filter(r =>
      selectedPartidos.includes(normalizePartido(r.partido)) ||
      r.cid === "__blancos__" || r.cid === "__nulos__"
    );
  }

  // Calcular pct ajustado
  rows = rows.map(r => ({
    ...r,
    pctDisplay: adjustedPct(r.pct, r.cid, elData),
  }));

  // Ordenar: candidatos desc, anomia al final
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

    // Etiqueta de partido normalizado si es IND-X
    const isInd = row.partido && row.partido.startsWith("IND-");
    const indTag = isInd ? `<span class="cand-ind-tag">IND</span>` : "";

    return `
      <div class="cand-row${isAnomia ? " anomia" : ""}${isSelected ? " selected" : ""}"
           data-cid="${row.cid.replace(/"/g, "&quot;")}">
        <div class="cand-color" style="background:${color}"></div>
        <div class="cand-info">
          <div class="cand-name" title="${name}">${name}</div>
          ${party ? `<div class="cand-party">${party}${indTag}</div>` : ""}
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
  const presParty = presPartyFromName(cid || "");
  if (presParty) return presParty;
  if (!pacto || pacto === "otros" || pacto === "presidencial" || pacto === "anomia") {
    return partido || "";
  }
  return formatPactoShort(pacto);
}
