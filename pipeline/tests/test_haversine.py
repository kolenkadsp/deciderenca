import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import pandas as pd
from pipeline.haversine import assign_voters_to_locals, haversine_matrix
from pipeline.normalize import load_locales

DATA_DIR = "C:/Users/nvargasv/Downloads/Visor_Renca"

def test_haversine_known_distance():
    import numpy as np
    d = haversine_matrix(
        pd.Series([-33.40]), pd.Series([-70.70]),
        [-33.40], [-70.70]
    )
    assert abs(d[0, 0]) < 0.001  # < 1 metro

def test_assign_filters_invalid_voters():
    result = assign_voters_to_locals(DATA_DIR)
    assert len(result) < 114484
    assert len(result) > 110000

def test_assign_result_columns():
    result = assign_voters_to_locals(DATA_DIR)
    assert "voter_id" in result.columns
    assert "local" in result.columns
    assert "lat" in result.columns
    assert "lon" in result.columns

def test_all_assigned_locals_exist_in_locales():
    result = assign_voters_to_locals(DATA_DIR)
    locales = load_locales(DATA_DIR)
    assert result["local"].isin(locales["local"]).all()
