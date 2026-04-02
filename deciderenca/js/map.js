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

  _geojsonLayer = L.geoJSON(geojson, {
    // Para colegios: usar círculos
    pointToLayer: isLocales ? (feature, latlng) => {
      const elData = feature.properties.elections?.[election] || {};
      const color  = winnerColor(elData);
      const isSelected = feature.properties[col] === zoneId;
      return L.circleMarker(latlng, {
        radius: isSelected ? 14 : 10,
        fillColor: color,
        fillOpacity: 0.85,
        color: "#fff",
        weight: isSelected ? 3 : 1.5,
      });
    } : undefined,

    style: isLocales ? undefined : function(feature) {
      const elData = feature.properties.elections?.[election] || {};
      const isSelected = String(feature.properties[col]) === String(zoneId);
      let color, opacity;

      if (selectedCandidate) {
        // Modo candidato: intensidad = pct de ese candidato en esta zona
        const entry = elData[selectedCandidate];
        const pct   = entry ? adjustedPct(entry.pct, selectedCandidate, elData) : 0;
        color   = partyColor(entry?.pacto, entry?.partido, selectedCandidate);
        opacity = 0.1 + pct * 1.8;
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
      lyr.on("click", () => {
        // Click en zona activa → deselecciona; click en nueva → selecciona
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
