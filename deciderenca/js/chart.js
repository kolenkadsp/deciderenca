function showDetailPanel(feature, electionId) {
  const panel = document.getElementById("detail-panel");
  const title = document.getElementById("detail-title");
  const chart = document.getElementById("detail-chart");

  const idCol = App.state.layer === "manzanas" ? "mz_id"
              : App.state.layer === "uvs"      ? "uv_id"
              : "mz_macro_id";
  const zoneId     = feature.properties[idCol] || "?";
  const layerLabel = { manzanas: "Manzana", uvs: "UV", macrozonas: "Macrozona" }[App.state.layer];
  title.textContent = `${layerLabel} ${zoneId}`;

  const elData = feature.properties.elections?.[electionId] || {};

  const rows = Object.entries(elData)
    .map(([cid, v]) => ({ cid, pct: v.pct || 0, partido: v.partido, pacto: v.pacto }))
    .sort((a, b) => {
      const aAnomia = a.cid === "__blancos__" || a.cid === "__nulos__";
      const bAnomia = b.cid === "__blancos__" || b.cid === "__nulos__";
      if (aAnomia !== bAnomia) return aAnomia ? 1 : -1;
      return b.pct - a.pct;
    });

  chart.innerHTML = rows.map(({ cid, pct, partido, pacto }) => {
    const color    = getColor(cid, electionId);
    const label    = getCandidateLabel(cid, electionId);
    const pctStr   = (pct * 100).toFixed(1) + "%";
    const isAnomia = cid === "__blancos__" || cid === "__nulos__";
    return `
      <div class="bar-row${isAnomia ? " anomia" : ""}">
        <div class="bar-label" title="${label}">${label}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct*100}%;background:${color}"></div>
        </div>
        <div class="bar-pct">${pctStr}</div>
      </div>`;
  }).join("");

  panel.classList.remove("hidden");
}

function getCandidateLabel(cid, electionId) {
  if (cid === "__blancos__") return "Votos en Blanco";
  if (cid === "__nulos__")   return "Votos Nulos";
  const c = App.candidates.candidates.find(c => c.id === cid);
  if (c) return c.name;
  return cid.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
