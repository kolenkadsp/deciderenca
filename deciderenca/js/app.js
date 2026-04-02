// Mapeo de apellidos → partido para presidenciales
const PRES_PARTY = {
  "PARISI": "PDG", "JARA": "PC", "ENRIQUEZ": "otros",
  "KAISER": "Libertario", "KAST": "PRep", "MATTHEI": "UDI",
  "ARTES": "otros", "MAYNE": "otros", "SICHEL": "RN",
};

function presPartyFromName(cid) {
  for (const [kw, party] of Object.entries(PRES_PARTY)) {
    if (cid.toUpperCase().includes(kw)) return party;
  }
  return null;
}

// Estado global
const App = {
  candidates: null,   // candidates.json
  layers: {},         // { manzanas, uvs, macrozonas, locales }
  state: {
    election: "parla25",
    layer: "uvs",
    zoneId: null,           // null = Renca completo
    selectedPactos: [],     // [] = todos; array de pactos activos
    selectedCandidate: null,// candidato pinchado → choropleth por ese candidato
    validOnly: false,       // false = % sobre votos totales; true = % sobre válidos (excl. blancos/nulos)
  },
};

async function fetchJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`No se pudo cargar ${path}: ${r.status}`);
  return r.json();
}

async function init() {
  App.candidates = await fetchJSON("data/candidates.json");

  const [manzanas, uvs, macrozonas, locales] = await Promise.all([
    fetchJSON("data/manzanas.geojson"),
    fetchJSON("data/uvs.geojson"),
    fetchJSON("data/macrozonas.geojson"),
    fetchJSON("data/locales.geojson"),
  ]);
  App.layers = { manzanas, uvs, macrozonas, locales };
  App.state.election = App.candidates.elections[0].id;

  buildElectionTabs();
  buildLayerButtons();
  initMap();
  renderPanel();
}

// ── Datos ────────────────────────────────────────────────

const ID_COL = { manzanas: "mz_id", uvs: "uv_id", macrozonas: "mz_macro_id", locales: "local" };

/** Datos de una zona específica o aggregate de todo Renca (zoneId === null). */
function getElectionData(electionId, layerName, zoneId) {
  if (zoneId === null) {
    return App.candidates.renca_totals?.[electionId] || {};
  }
  const col = ID_COL[layerName];
  const feat = App.layers[layerName].features
    .find(f => String(f.properties[col]) === String(zoneId));
  const elData = feat?.properties.elections?.[electionId] || {};
  // Para locales: datos reales (no necesitan escalar)
  if (layerName === "locales") return elData;
  // Para zonas: escalar votos_est a votos reales
  return scaleVotesToReal(elData, electionId);
}

/**
 * Los votos_est en el GeoJSON se inflan al sumar manzanas, pero pct es correcto.
 * Estimamos votos reales de la zona usando la proporción de votos_est de la zona
 * respecto al total de votos_est de todas las zonas (que se inflan igual).
 *   zone_real ≈ (Σvotos_est_zona / Σvotos_est_todas_zonas) × real_total_Renca
 */
function scaleVotesToReal(elData, electionId) {
  const realTotal = Object.values(App.candidates.renca_totals?.[electionId] || {})
    .reduce((s, v) => s + v.votos, 0);

  // Σvotos_est de todas las UVs (denominador inflado)
  const inflatedTotal = App.layers.uvs.features.reduce((sum, f) => {
    const el = f.properties.elections?.[electionId] || {};
    return sum + Object.values(el).reduce((s, v) => s + v.votos, 0);
  }, 0);

  // Σvotos_est de esta zona
  const zoneInflated = Object.values(elData).reduce((s, v) => s + v.votos, 0);

  // Factor: qué proporción de Renca representa esta zona
  const zoneFactor = inflatedTotal > 0 ? zoneInflated / inflatedTotal : 0;
  const zoneReal = Math.round(zoneFactor * realTotal);

  const result = {};
  Object.entries(elData).forEach(([cid, v]) => {
    result[cid] = { ...v, votos: Math.round(v.pct * zoneReal) };
  });
  return result;
}

/** Color de partido/pacto. Para presidenciales, resuelve por PRES_PARTY. */
function partyColor(pacto, partido, candidateId) {
  // Candidatos presidenciales: buscar por ID en candidateId
  if (candidateId) {
    const presParty = presPartyFromName(candidateId);
    if (presParty) return App.candidates.partyColors[presParty] || "#888888";
  }
  return App.candidates.partyColors[pacto]
      || App.candidates.partyColors[partido]
      || "#888888";
}

/** Ajusta pct según modo validOnly (excluye blancos/nulos del denominador). */
function adjustedPct(pct, cid, elData) {
  if (!App.state.validOnly) return pct;
  if (cid === "__blancos__" || cid === "__nulos__") return pct; // anomia siempre % del total
  const anomia = (elData["__blancos__"]?.pct || 0) + (elData["__nulos__"]?.pct || 0);
  const denom = 1 - anomia;
  return denom > 0 ? pct / denom : pct;
}

/** Color del candidato ganador en elData (excluye anomia). */
function winnerColor(elData) {
  let bestCid = null, bestPct = -1;
  Object.entries(elData).forEach(([cid, v]) => {
    if (cid === "__blancos__" || cid === "__nulos__") return;
    const p = adjustedPct(v.pct, cid, elData);
    if (p > bestPct) { bestPct = p; bestCid = cid; }
  });
  if (!bestCid) return "#cccccc";
  const v = elData[bestCid];
  return partyColor(v.pacto, v.partido, bestCid);
}

// ── Tabs de elección ─────────────────────────────────────

function buildElectionTabs() {
  const container = document.getElementById("election-tabs");
  container.innerHTML = "";
  App.candidates.elections.forEach(e => {
    const btn = document.createElement("button");
    btn.className = "election-tab" + (e.id === App.state.election ? " active" : "");
    btn.textContent = e.label;
    btn.addEventListener("click", () => {
      App.state.election = e.id;
      App.state.selectedPactos = [];
      App.state.selectedCandidate = null;
      App.state.zoneId = null;
      document.querySelectorAll(".election-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateBreadcrumb();
      renderPanel();
      updateMap();
    });
    container.appendChild(btn);
  });
}

// ── Layer buttons ─────────────────────────────────────────

function buildLayerButtons() {
  document.querySelectorAll(".layer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      App.state.layer = btn.dataset.layer;
      App.state.zoneId = null;
      App.state.selectedCandidate = null;
      document.querySelectorAll(".layer-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateBreadcrumb();
      renderPanel();
      updateMap();
    });
  });
}

// ── Breadcrumb ────────────────────────────────────────────

function updateBreadcrumb() {
  const sep  = document.getElementById("bc-sep");
  const zone = document.getElementById("bc-zone");
  if (App.state.zoneId === null) {
    sep.classList.add("hidden");
    zone.classList.add("hidden");
  } else {
    const layerLabel = { uvs: "UV", macrozonas: "Macrozona", manzanas: "Manzana", locales: "" }[App.state.layer];
    sep.classList.remove("hidden");
    zone.classList.remove("hidden");
    zone.textContent = layerLabel ? `${layerLabel} ${App.state.zoneId}` : App.state.zoneId;
  }
}

// Clic en "Renca" vuelve al aggregate
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("bc-renca").addEventListener("click", () => {
    App.state.zoneId = null;
    App.state.selectedCandidate = null;
    updateBreadcrumb();
    renderPanel();
    updateMap();
  });

  // Toggle Votos Totales / Válidos
  document.querySelectorAll(".vtoggle").forEach(btn => {
    btn.addEventListener("click", () => {
      App.state.validOnly = btn.dataset.v === "valid";
      document.querySelectorAll(".vtoggle").forEach(b => b.classList.toggle("active", b === btn));
      renderPanel();
      updateMap();
    });
  });

  init();
});
