import json
import pandas as pd
import geopandas as gpd
from pathlib import Path

CANDIDATES_STATIC = {
    "elections": [
        {"id": "muni24",   "label": "Municipal 2024",              "type": "alcalde"},
        {"id": "parla25",  "label": "Parlamentarias 2025",         "type": "diputado"},
        {"id": "pres1v25", "label": "Presidencial 1ª Vuelta 2025", "type": "presidente"},
        {"id": "pres2v25", "label": "Presidencial 2ª Vuelta 2025", "type": "presidente"},
    ],
    "candidates": [
        {"id": "matthei",  "name": "Evelyn Matthei",        "party": "UDI",       "color": "#003B8E", "elections": ["pres1v25"]},
        {"id": "jara",     "name": "Jeannette Jara",         "party": "PC",        "color": "#CC0000", "elections": ["pres1v25","pres2v25"]},
        {"id": "kast",     "name": "José Antonio Kast",      "party": "PRep",      "color": "#8B0000", "elections": ["pres1v25","pres2v25"]},
        {"id": "parisi",   "name": "Franco Parisi",          "party": "PDG",       "color": "#6B2FA0", "elections": ["pres1v25"]},
        {"id": "kaiser",   "name": "Johannes Kaiser",        "party": "Libertario","color": "#1A1A1A", "elections": ["pres1v25"]},
        {"id": "enriquez", "name": "Marco Enríquez-Ominami", "party": "otros",     "color": "#888888", "elections": ["pres1v25"]},
        {"id": "artes",    "name": "Eduardo Artes",          "party": "otros",     "color": "#888888", "elections": ["pres1v25"]},
        {"id": "mayne",    "name": "Harold Mayne-Nicholls",  "party": "otros",     "color": "#888888", "elections": ["pres1v25"]},
        {"id": "__blancos__", "name": "Votos en Blanco", "party": "anomia", "color": "#AAAAAA",
         "elections": ["muni24","parla25","pres1v25","pres2v25"]},
        {"id": "__nulos__",   "name": "Votos Nulos",     "party": "anomia", "color": "#666666",
         "elections": ["muni24","parla25","pres1v25","pres2v25"]},
    ],
    "partyColors": {
        "PC": "#CC0000", "PS": "#E84040", "FA": "#7B1C3E", "PDG": "#6B2FA0",
        "RN": "#0057B8", "UDI": "#003B8E", "PRep": "#8B0000",
        "Libertario": "#1A1A1A", "PSC": "#1A1A1A",
        "anomia": "#AAAAAA", "otros": "#888888",
        "B - VERDES, REGIONALISTAS Y HUMANISTAS": "#7B1C3E",
        "C - UNIDAD POR CHILE": "#CC0000",
        "D - IZQUIERDA ECOLOGISTA POPULAR ANIMALISTA Y HUMANISTA": "#5A1030",
        "G - PARTIDO ALIANZA VERDE POPULAR": "#2E7D32",
        "I - PARTIDO DE LA GENTE": "#6B2FA0",
        "J - CHILE GRANDE Y UNIDO": "#003B8E",
        "K - CAMBIO POR CHILE": "#0057B8",
        "No aplica": "#888888",
    }
}

def _results_to_nested(results_df: pd.DataFrame, id_col: str) -> dict:
    nested = {}
    for _, row in results_df.iterrows():
        zone_id = str(row[id_col])
        eid = row["election"]
        cand = row["candidato"]
        if zone_id not in nested:
            nested[zone_id] = {}
        if eid not in nested[zone_id]:
            nested[zone_id][eid] = {}
        nested[zone_id][eid][cand] = {
            "votos": round(float(row["votos_est"]), 2),
            "pct": round(float(row["pct"]), 4),
            "partido": str(row.get("partido", "otros")),
            "pacto": str(row.get("pacto", "otros")),
        }
    return nested

def export_geojson(gdf: gpd.GeoDataFrame, results_nested: dict,
                   id_col: str, output_path: str):
    features = []
    for _, row in gdf.iterrows():
        zone_id = str(row[id_col])
        props = {id_col: zone_id, "elections": results_nested.get(zone_id, {})}
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": row["geometry"].__geo_interface__,
        })
    geojson = {"type": "FeatureCollection", "features": features}
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    print(f"[export] Wrote {len(features)} features → {output_path}")

def export_candidates(out_dir: str, elections: dict):
    dynamic = []
    for eid in ["muni24", "parla25"]:
        df = elections.get(eid, pd.DataFrame())
        if df.empty:
            continue
        for _, row in df[["candidato","partido","pacto"]].drop_duplicates().iterrows():
            cand_id = row["candidato"].lower().replace(" ", "_")[:30]
            party = row["partido"]
            color = CANDIDATES_STATIC["partyColors"].get(
                row["pacto"],
                CANDIDATES_STATIC["partyColors"].get(party, "#888888")
            )
            dynamic.append({
                "id": cand_id, "name": row["candidato"],
                "party": party, "pacto": row["pacto"],
                "color": color, "elections": [eid]
            })

    data = dict(CANDIDATES_STATIC)
    data["candidates"] = CANDIDATES_STATIC["candidates"] + dynamic

    path = f"{out_dir}/candidates.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[export] Wrote candidates.json → {path}")
