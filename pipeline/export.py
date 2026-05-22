import json
import pandas as pd
import geopandas as gpd
from pathlib import Path

CANDIDATES_STATIC = {
    "elections": [
        {"id": "conc24",   "label": "Concejales 2024",              "type": "concejal"},
        {"id": "muni24",   "label": "Municipal 2024",               "type": "alcalde"},
        {"id": "parla25",  "label": "Parlamentarias 2025",          "type": "diputado"},
        {"id": "pres1v25", "label": "Presidencial 1ª Vuelta 2025",  "type": "presidente"},
        {"id": "pres2v25", "label": "Presidencial 2ª Vuelta 2025",  "type": "presidente"},
    ],
    "candidates": [
        {"id": "matthei",  "name": "Evelyn Matthei",        "party": "UDI",       "color": "#003B8E", "elections": ["pres1v25"]},
        {"id": "jara",     "name": "Jeannette Jara",         "party": "PC",        "color": "#CC0000", "elections": ["pres1v25","pres2v25"]},
        {"id": "kast",     "name": "José Antonio Kast",      "party": "PRep",      "color": "#003087", "elections": ["pres1v25","pres2v25"]},
        {"id": "parisi",   "name": "Franco Parisi",          "party": "PDG",       "color": "#6B2FA0", "elections": ["pres1v25"]},
        {"id": "kaiser",   "name": "Johannes Kaiser",        "party": "Libertario","color": "#1A1A1A", "elections": ["pres1v25"]},
        {"id": "enriquez", "name": "Marco Enríquez-Ominami", "party": "otros",     "color": "#888888", "elections": ["pres1v25"]},
        {"id": "artes",    "name": "Eduardo Artes",          "party": "otros",     "color": "#888888", "elections": ["pres1v25"]},
        {"id": "mayne",    "name": "Harold Mayne-Nicholls",  "party": "otros",     "color": "#888888", "elections": ["pres1v25"]},
        {"id": "__blancos__", "name": "Votos en Blanco", "party": "anomia", "color": "#AAAAAA",
         "elections": ["conc24","muni24","parla25","pres1v25","pres2v25"]},
        {"id": "__nulos__",   "name": "Votos Nulos",     "party": "anomia", "color": "#666666",
         "elections": ["conc24","muni24","parla25","pres1v25","pres2v25"]},
    ],
    "partyColors": {
        # Abreviaciones (parla25, pres)
        "PC": "#CC0000", "PS": "#E84040", "FA": "#7B1C3E", "PDG": "#6B2FA0",
        "RN": "#0057B8", "UDI": "#003B8E", "PRep": "#003087",
        "Libertario": "#1A1A1A", "PSC": "#1A1A1A",
        "anomia": "#AAAAAA", "otros": "#888888",
        # Nombres completos de partido (conc24)
        "UNION DEMOCRATA INDEPENDIENTE":  "#003B8E",
        "PARTIDO REPUBLICANO DE CHILE":   "#003087",
        "PARTIDO SOCIALISTA DE CHILE":    "#E84040",
        "PARTIDO COMUNISTA DE CHILE":     "#CC0000",
        "RENOVACION NACIONAL":            "#0057B8",
        "FRENTE AMPLIO":                  "#7B1C3E",
        "PARTIDO DEMOCRATAS CHILE":       "#E67E22",
        "PARTIDO DEMOCRATA CRISTIANO":    "#E8820C",
        "PARTIDO SOCIAL CRISTIANO":       "#1A1A1A",
        "FEDERACION REGIONALISTA VERDE SOCIAL": "#2E7D32",
        "INDEPENDIENTES":                 "#2C7BB6",
        # muni24 pactos
        "PARTIDO DE LA GENTE":            "#6B2FA0",
        # parla25 pactos
        "B - VERDES, REGIONALISTAS Y HUMANISTAS": "#7B1C3E",
        "C - UNIDAD POR CHILE":           "#CC0000",
        "D - IZQUIERDA ECOLOGISTA POPULAR ANIMALISTA Y HUMANISTA": "#5A1030",
        "G - PARTIDO ALIANZA VERDE POPULAR": "#2E7D32",
        "I - PARTIDO DE LA GENTE":        "#6B2FA0",
        "J - CHILE GRANDE Y UNIDO":       "#003B8E",
        "K - CAMBIO POR CHILE":           "#0057B8",
        "No aplica":                      "#888888",
        # conc24 pactos
        "POR CHILE, SEGUIMOS":            "#CC0000",
        "CHILE VAMOS UDI-EVOPOLI E INDEPENDIENTES": "#003B8E",
        "CHILE VAMOS RENOVACIÓN NACIONAL - INDEPENDIENTES": "#0057B8",
        "REPUBLICANOS E INDEPENDIENTES":  "#003087",
        "VERDES LIBERALES POR UNA COMUNA SEGURA": "#2E7D32",
        "CENTRO DEMOCRATICO":             "#E8820C",
        "PARTIDO SOCIAL CRISTIANO E INDEPENDIENTES": "#1A1A1A",
        "TU COMUNA RADICAL":              "#FF6600",
        "CHILE MUCHO MEJOR":              "#888888",
    }
}


def _results_to_nested(results_df: pd.DataFrame, id_col: str,
                        elected_by_election: dict = None) -> dict:
    """Convierte DataFrame de resultados a dict anidado por zona → elección → candidato."""
    nested = {}
    for _, row in results_df.iterrows():
        zone_id = str(row[id_col])
        eid     = row["election"]
        cand    = row["candidato"]
        if zone_id not in nested:
            nested[zone_id] = {}
        if eid not in nested[zone_id]:
            nested[zone_id][eid] = {}
        entry = {
            "votos":   round(float(row["votos_est"]), 2),
            "pct":     round(float(row["pct"]), 4),
            "partido": str(row.get("partido", "otros")),
            "pacto":   str(row.get("pacto",   "otros")),
        }
        if pd.notna(row.get("subpacto")):
            entry["subpacto"] = str(row["subpacto"])
        # Añadir elected si corresponde (lookup desde renca_totals)
        if elected_by_election and eid in elected_by_election:
            if cand in elected_by_election[eid]:
                entry["elected"] = True
        nested[zone_id][eid][cand] = entry
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


def _compute_renca_totals(elections: dict) -> dict:
    """Totales reales de Renca por candidato/elección, sumando todos los locales.
    Para conc24 incluye elected: true/false por candidato.
    """
    result = {}
    for eid, df in elections.items():
        has_elected  = "elected"  in df.columns
        has_subpacto = "subpacto" in df.columns
        group_cols   = ["candidato", "partido", "pacto"]
        if has_elected:
            group_cols.append("elected")

        agg   = df.groupby(group_cols, as_index=False)["votos"].sum()
        total = agg["votos"].sum()

        # Mapa subpacto por candidato (fuera del groupby para preservar None)
        if has_subpacto:
            sub_map = (df.dropna(subset=["subpacto"])
                         .groupby("candidato")["subpacto"].first())

        result[eid] = {}
        for _, row in agg.iterrows():
            cid = row["candidato"]
            entry = {
                "votos":   int(row["votos"]),
                "pct":     round(float(row["votos"]) / total, 4) if total > 0 else 0,
                "partido": str(row["partido"]),
                "pacto":   str(row["pacto"]),
            }
            if has_elected:
                entry["elected"] = bool(row["elected"])
            if has_subpacto and cid in sub_map:
                entry["subpacto"] = str(sub_map[cid])
            result[eid][cid] = entry
    return result


def export_locales_geojson(locales_df, elections: dict, output_path: str,
                            elected_by_election: dict = None):
    """GeoJSON de puntos con resultados reales por local de votación.
    elected_by_election: {eid: set_of_elected_candidatos}
    """
    features = []
    for _, loc in locales_df.iterrows():
        local_name = loc["local"]
        el_data = {}
        for eid, df in elections.items():
            local_rows = df[df["local"] == local_name]
            if local_rows.empty:
                continue
            total = local_rows["votos"].sum()
            el_data[eid] = {}
            for _, row in local_rows.iterrows():
                entry = {
                    "votos":   int(row["votos"]),
                    "pct":     round(float(row["votos"]) / total, 4) if total > 0 else 0,
                    "partido": str(row["partido"]),
                    "pacto":   str(row["pacto"]),
                }
                if pd.notna(row.get("subpacto")):
                    entry["subpacto"] = str(row["subpacto"])
                if elected_by_election and eid in elected_by_election:
                    if row["candidato"] in elected_by_election[eid]:
                        entry["elected"] = True
                el_data[eid][row["candidato"]] = entry
        features.append({
            "type": "Feature",
            "properties": {"local": local_name, "elections": el_data},
            "geometry": {"type": "Point", "coordinates": [float(loc["lon"]), float(loc["lat"])]},
        })
    geojson = {"type": "FeatureCollection", "features": features}
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    print(f"[export] Wrote {len(features)} locales → {output_path}")


def export_candidates(out_dir: str, elections: dict):
    dynamic = []
    for eid in ["conc24", "muni24", "parla25"]:
        df = elections.get(eid, pd.DataFrame())
        if df.empty:
            continue
        for _, row in df[["candidato", "partido", "pacto"]].drop_duplicates().iterrows():
            color = CANDIDATES_STATIC["partyColors"].get(
                row["pacto"],
                CANDIDATES_STATIC["partyColors"].get(row["partido"], "#888888")
            )
            dynamic.append({
                "id":      row["candidato"].lower().replace(" ", "_")[:30],
                "name":    row["candidato"],
                "party":   row["partido"],
                "pacto":   row["pacto"],
                "color":   color,
                "elections": [eid],
            })

    renca_totals = _compute_renca_totals(elections)

    # Construir elected_by_election para pasar a los GeoJSONs de zonas
    elected_by_election = {
        eid: {c for c, v in cands.items() if v.get("elected")}
        for eid, cands in renca_totals.items()
    }

    data = dict(CANDIDATES_STATIC)
    data["candidates"]    = CANDIDATES_STATIC["candidates"] + dynamic
    data["renca_totals"]  = renca_totals
    data["elected_by_election"] = {eid: list(s) for eid, s in elected_by_election.items()}

    path = f"{out_dir}/candidates.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[export] Wrote candidates.json → {path}")

    return elected_by_election
