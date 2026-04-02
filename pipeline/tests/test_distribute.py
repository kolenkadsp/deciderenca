import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import pandas as pd
from pipeline.distribute import distribute_votes_to_manzanas

DATA_DIR = "C:/Users/nvargasv/Downloads/Visor_Renca"

def _get_manzana_results():
    from pipeline.normalize import load_elections
    from pipeline.weights import compute_manzana_weights
    elections = load_elections(DATA_DIR)
    weights = compute_manzana_weights(DATA_DIR)
    return distribute_votes_to_manzanas(elections, weights)

def test_output_columns():
    result = _get_manzana_results()
    assert {"mz_id", "election", "candidato", "votos_est", "pct"}.issubset(result.columns)

def test_pct_sums_to_one_per_manzana_election():
    result = _get_manzana_results()
    sums = result.groupby(["mz_id", "election"])["pct"].sum()
    assert (sums.round(4) == 1.0).all(), f"pct no suma 1: {sums[sums.round(4) != 1.0].head()}"

def test_blancos_nulos_present_in_all_elections():
    result = _get_manzana_results()
    for eid in ["muni24", "parla25", "pres1v25", "pres2v25"]:
        sub = result[result["election"] == eid]
        assert "__blancos__" in sub["candidato"].values, f"{eid} sin blancos"
        assert "__nulos__" in sub["candidato"].values, f"{eid} sin nulos"
