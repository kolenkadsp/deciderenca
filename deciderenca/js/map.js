let _map = null;
let _geojsonLayer = null;
let _initialFit = false;

const N_BINS = 5;
// t por bin: del más grisáceo al color pleno
const BIN_T = [0.08, 0.28, 0.50, 0.72, 1.0];

/** Interpola entre gris neutro y el color del partido según t ∈ [0,1] */
function interpolateColor(hexColor, t) {
  const gr = 0xc8, gg = 0xca, gb = 0xcc;
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const cr = parseInt(hex.slice(0,2), 16);
  const cg = parseInt(hex.slice(2,4), 16);
  const cb = parseInt(hex.slice(4,6), 16);
  const r = Math.round(gr + t * (cr - gr));
  const g = Math.round(gg + t * (cg - gg));
  const b = Math.round(gb + t * (cb - gb));
  return `rgb(${r},${g},${b})`;
}

/**
 * Calcula quintile thresholds a partir de un array de valores.
 * Devuelve N_BINS-1 umbrales de corte.
 */
function computeQuantileThresholds(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds = [];
  for (let i = 1; i < N_BINS; i++) {
    const idx = (i / N_BINS) * sorted.length;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    thresholds.push(sorted[lo] + (idx - lo) * ((sorted[hi] ?? sorted[lo]) - sorted[lo]));
  }
  return thresholds;
}

/** Devuelve bin 0..N_BINS-1 para un valor dado los umbrales */
function getBin(value, thresholds) {
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return i;
  }
  return N_BINS - 1;
}

function initMap() {
  _map = L.map("map", {
    zoomControl: true,
    maxBounds: [[-33.47, -70.84], [-33.35, -70.62]],
    maxBoundsViscosity: 0.8,
  }).setView([-33.405, -70.726], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 18,
    opacity: 0.4,
  }).addTo(_map);

  updateMap();
}

function updateMap() {
  if (!_map) return;
  if (_geojsonLayer) { _map.removeLayer(_geojsonLayer); _geojsonLayer = null; }

  const geojson = App.layers[App.state.layer];
  if (!geojson) return;

  const { election, layer, zoneId, selectedCandidate, selectedPactos, selectedPartidos } = App.state;
  const col = ID_COL[layer];
  const isLocales = layer === "locales";
  const hasFilter = (selectedPactos.length > 0 || selectedPartidos.length > 0) && !selectedCandidate;

  // Pre-calcular quintile thresholds para el candidato seleccionado
  let candThresholds = null;
  let maxCandPct = 0.001;
  if (selectedCandidate) {
    const allPcts = [];
    geojson.features.forEach(f => {
      const fd = f.properties.elections?.[election] || {};
      const e = fd[selectedCandidate];
      if (e) {
        const p = adjustedPct(e.pct, selectedCandidate, fd);
        allPcts.push(p);
        if (p > maxCandPct) maxCandPct = p;
      }
    });
    if (allPcts.length >= N_BINS) candThresholds = computeQuantileThresholds(allPcts);
  }

  // Pre-calcular quintile thresholds para el filtro activo (suma de pct del pacto/partido por zona)
  let filterThresholds = null;
  let filterColor = "#888888";
  if (hasFilter) {
    const allPcts = [];
    geojson.features.forEach(f => {
      const fd = f.properties.elections?.[election] || {};
      let total = 0;
      Object.entries(fd).forEach(([cid, v]) => {
        if (cid === "__blancos__" || cid === "__nulos__") return;
        if (selectedPactos.length > 0 && !selectedPactos.includes(v.pacto)) return;
        if (selectedPartidos.length > 0 && !selectedPartidos.includes(normalizePartido(v.partido))) return;
        total += adjustedPct(v.pct, cid, fd);
      });
      allPcts.push(total);
    });
    if (allPcts.length >= N_BINS) filterThresholds = computeQuantileThresholds(allPcts);
    // Color base: ganador del filtro a nivel Renca
    filterColor = winnerColor(App.candidates.renca_totals?.[election] || {}, selectedPactos, selectedPartidos);
  }

  /** Suma el pct del filtro activo para un elData dado */
  function filterPct(elData) {
    let total = 0;
    Object.entries(elData).forEach(([cid, v]) => {
      if (cid === "__blancos__" || cid === "__nulos__") return;
      if (selectedPactos.length > 0 && !selectedPactos.includes(v.pacto)) return;
      if (selectedPartidos.length > 0 && !selectedPartidos.includes(normalizePartido(v.partido))) return;
      total += adjustedPct(v.pct, cid, elData);
    });
    return total;
  }

  _geojsonLayer = L.geoJSON(geojson, {
    // Para colegios: usar círculos
    pointToLayer: isLocales ? (feature, latlng) => {
      const elData = feature.properties.elections?.[election] || {};
      const isSelected = feature.properties[col] === zoneId;
      let color, fillOpacity;

      if (selectedCandidate) {
        const entry = elData[selectedCandidate];
        const pct   = entry ? adjustedPct(entry.pct, selectedCandidate, elData) : 0;
        const baseColor = partyColor(entry?.pacto, entry?.partido, selectedCandidate);
        const bin = candThresholds ? getBin(pct, candThresholds) : N_BINS - 1;
        color       = interpolateColor(baseColor, BIN_T[bin]);
        fillOpacity = 0.92;
      } else if (hasFilter) {
        const pct = filterPct(elData);
        const bin = filterThresholds ? getBin(pct, filterThresholds) : N_BINS - 1;
        color       = interpolateColor(filterColor, BIN_T[bin]);
        fillOpacity = 0.92;
      } else {
        color       = winnerColor(elData, selectedPactos, selectedPartidos);
        fillOpacity = 0.85;
      }

      return L.circleMarker(latlng, {
        radius: isSelected ? 14 : 10,
        fillColor: color,
        fillOpacity: fillOpacity,
        color: "#fff",
        weight: isSelected ? 3 : 1.5,
      });
    } : undefined,

    style: isLocales ? undefined : function(feature) {
      const elData = feature.properties.elections?.[election] || {};
      const isSelected = String(feature.properties[col]) === String(zoneId);
      let color, opacity;

      if (selectedCandidate) {
        // Bins (quintiles): gris claro → color pleno del partido
        const entry = elData[selectedCandidate];
        const pct   = entry ? adjustedPct(entry.pct, selectedCandidate, elData) : 0;
        const baseColor = partyColor(entry?.pacto, entry?.partido, selectedCandidate);
        const bin = candThresholds ? getBin(pct, candThresholds) : N_BINS - 1;
        color   = interpolateColor(baseColor, BIN_T[bin]);
        opacity = 0.92;
      } else if (hasFilter) {
        // Coroplético del filtro: suma de pct del pacto/partido seleccionado por zona
        const pct = filterPct(elData);
        const bin = filterThresholds ? getBin(pct, filterThresholds) : N_BINS - 1;
        color   = interpolateColor(filterColor, BIN_T[bin]);
        opacity = 0.92;
      } else {
        // Modo ganador
        color = winnerColor(elData);
        const bestPct = winnerBestPct(elData);
        opacity = 0.3 + bestPct * 1.5;
      }

      return {
        fillColor: color,
        fillOpacity: Math.min(opacity, 0.92),
        color: isSelected ? "#fff" : "rgba(255,255,255,0.6)",
        weight: isSelected ? 2.5 : 0.8,
        opacity: 1,
      };
    },

    onEachFeature(feature, lyr) {
      const fzoneId = feature.properties[col];

      // Tooltip hover
      const ttContent = buildTooltip(feature, election, layer, col, selectedCandidate);
      lyr.bindTooltip(ttContent, {
        sticky: true,
        opacity: 0.97,
        className: "renca-tooltip",
      });

      lyr.on("click", () => {
        const newId = String(fzoneId);
        App.state.zoneId = (App.state.zoneId === newId) ? null : newId;
        updateBreadcrumb();
        renderPanel();
        updateMap();
      });

      if (!isLocales) {
        lyr.on("mouseover", () => {
          if (String(fzoneId) !== String(zoneId)) lyr.setStyle({ weight: 2, color: "#fff" });
        });
        lyr.on("mouseout", () => _geojsonLayer.resetStyle(lyr));
      }
    },
  }).addTo(_map);

  if (!_initialFit) {
    _map.fitBounds(_geojsonLayer.getBounds(), { padding: [20, 20] });
    _initialFit = true;
  }
}

/** Construye el HTML del tooltip para una feature */
function buildTooltip(feature, election, layer, col, selectedCandidate) {
  const fzoneId = feature.properties[col];
  const elData  = feature.properties.elections?.[election] || {};
  const isLocales = layer === "locales";

  // Encabezado de zona
  const zoneLabels = { uvs: "Unidad Vecinal", macrozonas: "Macrozona", locales: "Colegio", manzanas: "Manzana" };
  const header = isLocales
    ? `<span class="tt-zone">${fzoneId}</span>`
    : `<span class="tt-zone">${zoneLabels[layer] || ""} ${fzoneId}</span>`;

  // Votos totales de la zona (para contexto)
  let zoneTotalStr = "";
  if (isLocales) {
    const tot = Object.values(elData).reduce((s, v) => s + v.votos, 0);
    if (tot > 0) zoneTotalStr = `${Math.round(tot).toLocaleString("es-CL")} votos`;
  } else {
    const scaled = scaleVotesToReal(elData, election);
    const tot = Object.values(scaled).reduce((s, v) => s + v.votos, 0);
    if (tot > 0) zoneTotalStr = `~${Math.round(tot).toLocaleString("es-CL")} votos est.`;
  }

  if (selectedCandidate) {
    // Mostrar info del candidato seleccionado en esta zona
    const entry  = elData[selectedCandidate];
    const pct    = entry ? adjustedPct(entry.pct, selectedCandidate, elData) : 0;
    const name   = candidateName(selectedCandidate);

    let votosTxt = "";
    if (isLocales) {
      if (entry) votosTxt = `${Math.round(entry.votos).toLocaleString("es-CL")} votos`;
    } else {
      const scaled = scaleVotesToReal(elData, election);
      const v = scaled[selectedCandidate];
      if (v && v.votos > 0) votosTxt = `~${Math.round(v.votos).toLocaleString("es-CL")} votos est.`;
    }

    return `${header}
      <div class="tt-cand">${name}</div>
      <div class="tt-stats">
        <span class="tt-pct">${(pct * 100).toFixed(1)}%</span>
        ${votosTxt ? `<span class="tt-votos">${votosTxt}</span>` : ""}
      </div>
      ${zoneTotalStr ? `<div class="tt-total">${zoneTotalStr} en la zona</div>` : ""}`;
  } else {
    // Modo ganador: mostrar candidato con más votos
    let bestCid = null, bestPct = -1;
    Object.entries(elData).forEach(([cid, v]) => {
      if (cid !== "__blancos__" && cid !== "__nulos__") {
        const p = adjustedPct(v.pct, cid, elData);
        if (p > bestPct) { bestPct = p; bestCid = cid; }
      }
    });

    if (!bestCid) return header;

    const name = candidateName(bestCid);
    let votosTxt = "";
    if (isLocales) {
      const v = elData[bestCid];
      if (v) votosTxt = `${Math.round(v.votos).toLocaleString("es-CL")} votos`;
    } else {
      const scaled = scaleVotesToReal(elData, election);
      const v = scaled[bestCid];
      if (v && v.votos > 0) votosTxt = `~${Math.round(v.votos).toLocaleString("es-CL")} votos est.`;
    }

    return `${header}
      <div class="tt-label">Más votado</div>
      <div class="tt-cand">${name}</div>
      <div class="tt-stats">
        <span class="tt-pct">${(bestPct * 100).toFixed(1)}%</span>
        ${votosTxt ? `<span class="tt-votos">${votosTxt}</span>` : ""}
      </div>
      ${zoneTotalStr ? `<div class="tt-total">${zoneTotalStr} en la zona</div>` : ""}`;
  }
}
