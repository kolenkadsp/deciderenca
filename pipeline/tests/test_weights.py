import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from pipeline.weights import compute_manzana_weights

DATA_DIR = "C:/Users/nvargasv/Downloads/Visor_Renca"

def test_weights_sum_to_one_per_manzana():
    weights = compute_manzana_weights(DATA_DIR)
    sums = weights.groupby("mz_id")["peso"].sum()
    assert (sums.round(6) == 1.0).all(), f"Pesos no suman 1: {sums[sums.round(6) != 1.0]}"

def test_weights_columns():
    weights = compute_manzana_weights(DATA_DIR)
    assert {"mz_id", "local", "peso"}.issubset(weights.columns)

def test_weights_non_negative():
    weights = compute_manzana_weights(DATA_DIR)
    assert (weights["peso"] >= 0).all()

def test_weights_has_reasonable_manzana_count():
    weights = compute_manzana_weights(DATA_DIR)
    n_manzanas = weights["mz_id"].nunique()
    assert 1000 < n_manzanas <= 1453
