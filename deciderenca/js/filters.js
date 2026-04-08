function initFilters() {
  const selElection  = document.getElementById("sel-election");
  const selCandidate = document.getElementById("sel-candidate");
  const toggleAnomia = document.getElementById("toggle-anomia");

  App.candidates.elections.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.label;
    selElection.appendChild(opt);
  });
  selElection.value = App.state.election;

  function refreshCandidates() {
    selCandidate.innerHTML = "";
    getCandidatesForElection(App.state.election).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      const party = c.party && c.party !== "anomia" && c.party !== "presidencial" ? ` (${c.party})` : "";
      opt.textContent = (c.name || c.id) + party;
      if (c.party === "anomia") opt.style.color = "#888";
      selCandidate.appendChild(opt);
    });
    selCandidate.value = App.state.candidate || selCandidate.options[0]?.value;
    App.state.candidate = selCandidate.value;
  }
  refreshCandidates();

  selElection.addEventListener("change", () => {
    App.state.election = selElection.value;
    App.state.candidate = getDefaultCandidate(App.state.election);
    refreshCandidates();
    updateMap();
  });

  selCandidate.addEventListener("change", () => {
    App.state.candidate = selCandidate.value;
    updateMap();
  });

  document.querySelectorAll('input[name="layer"]').forEach(radio => {
    radio.addEventListener("change", () => {
      App.state.layer = radio.value;
      updateMap();
      hideDetailPanel();
    });
  });

  toggleAnomia.addEventListener("change", () => {
    App.state.includeAnomia = toggleAnomia.checked;
    updateMap();
  });
}
