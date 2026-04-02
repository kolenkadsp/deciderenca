// Estado global de la aplicación
const App = {
  candidates: null,   // candidates.json cargado
  layers: {},         // { "manzanas": GeoJSON, "uvs": GeoJSON, "macrozonas": GeoJSON }
  state: {
    election: null,   // election id activo
    candidate: null,  // candidate id activo
    layer: "uvs",     // capa activa
    includeAnomia: true,
  },
};

async function fetchJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

async function init() {
  App.candidates = await fetchJSON("data/candidates.json");

  const [manzanas, uvs, macrozonas] = await Promise.all([
    fetchJSON("data/manzanas.geojson"),
    fetchJSON("data/uvs.geojson"),
    fetchJSON("data/macrozonas.geojson"),
  ]);
  App.layers = { manzanas, uvs, macrozonas };

  App.state.election  = App.candidates.elections[0].id;
  App.state.candidate = getDefaultCandidate(App.state.election);

  initFilters();
  initMap();
}

function getDefaultCandidate(electionId) {
  const cands = getCandidatesForElection(electionId);
  return (cands.find(c => c.party !== "anomia") || cands[0])?.id || null;
}

function getCandidatesForElection(electionId) {
  const staticCands = App.candidates.candidates.filter(
    c => c.elections.includes(electionId)
  );
  if (staticCands.length > 0) return staticCands;

  // Dinámicos (muni24, parla25): extraer del GeoJSON de UVs
  const feats = App.layers.uvs.features;
  const candMap = {};
  feats.forEach(f => {
    const elData = f.properties.elections?.[electionId];
    if (!elData) return;
    Object.entries(elData).forEach(([cid, v]) => {
      if (!candMap[cid]) candMap[cid] = { id: cid, name: cid, party: v.partido, pacto: v.pacto };
    });
  });
  return Object.values(candMap);
}

function getColor(candidateId, electionId) {
  const c = App.candidates.candidates.find(c => c.id === candidateId);
  if (c) return c.color;
  const feat = App.layers.uvs.features[0];
  const entry = feat?.properties.elections?.[electionId]?.[candidateId];
  if (entry) {
    return App.candidates.partyColors[entry.pacto]
        || App.candidates.partyColors[entry.partido]
        || "#888888";
  }
  return "#888888";
}

document.addEventListener("DOMContentLoaded", init);
