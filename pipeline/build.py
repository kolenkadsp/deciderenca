"""
DecideRenca — Pipeline de datos
Uso: python pipeline/build.py

Genera en deciderenca/data/:
  manzanas.geojson, uvs.geojson, macrozonas.geojson, candidates.json, locales.geojson
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA_DIR = "C:/Users/nvargasv/Downloads/Visor_Renca"
OUT_DIR  = "C:/Users/nvargasv/Downloads/Visor_Renca/deciderenca/data"

from pipeline.normalize import load_elections, load_locales
from pipeline.weights import compute_manzana_weights
from pipeline.distribute import distribute_votes_to_manzanas, aggregate_to_layer
from pipeline.geometries import load_manzanas_geo, load_uvs, load_macrozonas, build_spatial_joins
from pipeline.export import (export_geojson, export_candidates,
                              export_locales_geojson, _results_to_nested)

def main():
    print("=== DecideRenca Build Pipeline ===")

    print("\n[1/8] Cargando y normalizando elecciones...")
    elections = load_elections(DATA_DIR)
    locales   = load_locales(DATA_DIR)
    for eid, df in elections.items():
        print(f"  {eid}: {len(df)} filas, {df['local'].nunique()} locales")

    print("\n[2/8] Calculando pesos por manzana (puede tardar ~2min)...")
    weights = compute_manzana_weights(DATA_DIR)
    print(f"  {weights['mz_id'].nunique()} manzanas con pesos")

    print("\n[3/8] Distribuyendo votos a manzanas...")
    mz_results = distribute_votes_to_manzanas(elections, weights)
    print(f"  {len(mz_results)} filas de resultados por manzana")

    print("\n[4/8] Cargando geometrías...")
    manzanas_geo   = load_manzanas_geo(DATA_DIR)
    uvs_geo        = load_uvs(DATA_DIR)
    macrozonas_geo = load_macrozonas(DATA_DIR)
    print(f"  Manzanas: {len(manzanas_geo)}, UVs: {len(uvs_geo)}, Macrozonas: {len(macrozonas_geo)}")

    print("\n[5/8] Generando joins espaciales (manzana→UV→macrozona)...")
    mz_to_uv, uv_to_macro = build_spatial_joins(manzanas_geo, uvs_geo, macrozonas_geo)
    print(f"  mz_to_uv: {len(mz_to_uv)} filas, uv_to_macro: {len(uv_to_macro)} filas")

    print("\n[6/8] Agregando a UVs y macrozonas...")
    uv_results = aggregate_to_layer(mz_results, mz_to_uv, "uv_id")
    print(f"  UV results: {len(uv_results)} filas")

    macro_results = aggregate_to_layer(
        uv_results.rename(columns={"uv_id": "mz_id"}),
        uv_to_macro.rename(columns={"uv_id": "mz_id"}),
        "mz_macro_id"
    )
    print(f"  Macro results: {len(macro_results)} filas")

    print("\n[7/8] Exportando GeoJSONs...")
    # export_candidates devuelve elected_by_election para enriquecer GeoJSONs
    elected_by_election = export_candidates(OUT_DIR, elections)

    export_geojson(manzanas_geo,
                   _results_to_nested(mz_results, "mz_id", elected_by_election),
                   "mz_id",       f"{OUT_DIR}/manzanas.geojson")
    export_geojson(uvs_geo,
                   _results_to_nested(uv_results, "uv_id", elected_by_election),
                   "uv_id",       f"{OUT_DIR}/uvs.geojson")
    export_geojson(macrozonas_geo,
                   _results_to_nested(macro_results, "mz_macro_id", elected_by_election),
                   "mz_macro_id", f"{OUT_DIR}/macrozonas.geojson")

    print("\n[8/8] Exportando locales.geojson...")
    export_locales_geojson(locales, elections, f"{OUT_DIR}/locales.geojson",
                           elected_by_election)

    print("\n✓ Build completo. Archivos en:", OUT_DIR)

if __name__ == "__main__":
    main()
