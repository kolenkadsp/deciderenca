import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import pandas as pd
from pipeline.normalize import load_elections

DATA_DIR = "C:/Users/nvargasv/Downloads/Visor_Renca"

def test_load_elections_returns_four_elections():
    elections = load_elections(DATA_DIR)
    assert set(elections.keys()) == {"muni24", "parla25", "pres1v25", "pres2v25"}

def test_all_elections_have_required_columns():
    elections = load_elections(DATA_DIR)
    required = {"local", "candidato", "votos", "partido", "pacto"}
    for eid, df in elections.items():
        assert required.issubset(df.columns), f"{eid} missing columns"

def test_no_summary_rows_in_output():
    elections = load_elections(DATA_DIR)
    SUMMARY = {"Válidamente Emitidos", "Total Votación", "Total Votaci\xf3n"}
    for eid, df in elections.items():
        assert not df["candidato"].isin(SUMMARY).any(), f"{eid} has summary rows"

def test_blancos_nulos_normalized():
    elections = load_elections(DATA_DIR)
    for eid, df in elections.items():
        assert "__blancos__" in df["candidato"].values, f"{eid} missing blancos"
        assert "__nulos__" in df["candidato"].values, f"{eid} missing nulos"

def test_ind_partido_normalized():
    elections = load_elections(DATA_DIR)
    parla = elections["parla25"]
    # Ningún partido debe tener formato "IND - XXX" (con espacios)
    assert not parla["partido"].str.contains(r"IND\s+-\s+", na=False).any()

def test_votos_are_numeric_and_positive():
    elections = load_elections(DATA_DIR)
    for eid, df in elections.items():
        assert pd.api.types.is_numeric_dtype(df["votos"]), f"{eid} votos not numeric"
        assert (df["votos"] >= 0).all(), f"{eid} has negative votos"
