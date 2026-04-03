let _map = null;
let _geojsonLayer = null;
let _initialFit = false;

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

  const { election, layer, zoneId, selectedCandidate } = App.state;
  const col = ID_COL[layer];
  const isLocales = layer === "locales";

  // Pre-calcular pct máximo del candidato seleccionado para normalizar gradiente
  let maxCandPct = 0.001;
  if (selectedCandidate) {
    geojson.features.forEach(f => {
      const fd = f.properties.elections?.[election] || {};
      const e = fd[selectedCandidate];
      if (e) {
        const p = adjustedPct(e.pct, selectedCandidate, fd);
        if (p > maxCandPct) maxCandPct = p;
      }
    });
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
        color       = partyColor(entry?.pacto, entry?.partido, selectedCandidate);
        fillOpacity = 0.1 + (pct / maxCandPct) * 0.82;
      } else {
        color       = winnerColor(elData);
        fillOpacity = 0.85;
      }

      return L.circleMarker(latlng, {
        radius: isSelected ? 14 : 10,
        fillColor: color,
        fillOpacity: Math.min(fillOpacity, 0.95),
        color: "#fff",
        weight: isSelected ? 3 : 1.5,
      });
    } : undefined,

    style: isLocales ? undefined : function(feature) {
      const elData = feature.properties.elections?.[election] || {};
      const isSelected = String(feature.properties[col]) === String(zoneId);
      let color, opacity;

      if (selectedCandidate) {
        // Gradiente normalizado: la zona top del candidato = color pleno
        const entry = elData[selectedCandidate];
        const pct   = entry ? adjustedPct(entry.pct, selectedCandidate, elData) : 0;
        color   = partyColor(entry?.pacto, entry?.partido, selectedCandidate);
        opacity = 0.1 + (pct / maxCandPct) * 0.82;
      } else {
        // Modo ganador
        color = winnerColor(elData);
        let bestPct = 0;
        Object.entries(elData).forEach(([cid, v]) => {
          if (cid !== "__blancos__" && cid !== "__nulos__") {
            const p = adjustedPct(v.pct, cid, elData);
            if (p > bestPct) bestPct = p;
          }
        });
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
