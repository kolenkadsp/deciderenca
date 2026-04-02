let _map = null;
let _geojsonLayer = null;

function initMap() {
  _map = L.map("map").setView([-33.405, -70.726], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(_map);

  updateMap();
}

function updateMap() {
  if (!_map) return;
  if (_geojsonLayer) {
    _map.removeLayer(_geojsonLayer);
    _geojsonLayer = null;
  }

  const geojson = App.layers[App.state.layer];
  if (!geojson) return;

  const { election, candidate, includeAnomia } = App.state;
  const baseColor = getColor(candidate, election);

  _geojsonLayer = L.geoJSON(geojson, {
    style: (feature) => {
      const elData = feature.properties.elections?.[election] || {};
      const entry  = elData[candidate];
      const pct    = entry?.pct ?? 0;

      let displayPct = pct;
      if (!includeAnomia) {
        const total = Object.entries(elData)
          .filter(([k]) => k !== "__blancos__" && k !== "__nulos__")
          .reduce((s, [, v]) => s + (v.pct || 0), 0);
        displayPct = total > 0 ? pct / total : 0;
      }

      return {
        fillColor: baseColor,
        fillOpacity: 0.1 + displayPct * 0.8,
        color: "#fff",
        weight: 1,
        opacity: 0.6,
      };
    },
    onEachFeature: (feature, layer) => {
      const elData = feature.properties.elections?.[election] || {};
      const entry  = elData[candidate];
      const pct    = entry ? (entry.pct * 100).toFixed(1) : "n/d";
      const idCol  = App.state.layer === "manzanas" ? "mz_id"
                   : App.state.layer === "uvs"      ? "uv_id"
                   : "mz_macro_id";
      const zoneId = feature.properties[idCol] || "?";

      layer.bindTooltip(`Zona ${zoneId} · ${pct}%`, { sticky: true });
      layer.on("click", () => showDetailPanel(feature, election));
    },
  }).addTo(_map);
}

function hideDetailPanel() {
  document.getElementById("detail-panel").classList.add("hidden");
}
