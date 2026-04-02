import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
from shapely import wkb

def load_uvs(data_dir: str) -> gpd.GeoDataFrame:
    """Carga las 42 UVs reales del shapefile (filtra Name 1-42, disuelve)."""
    gdf = gpd.read_file(
        f"{data_dir}/251117 Unidades Vecinales 2025.shp"
    )
    valid_names = {str(i) for i in range(1, 43)}
    gdf = gdf[gdf["Name"].isin(valid_names)].copy()
    gdf = gdf.dissolve(by="Name").reset_index()
    gdf = gdf.rename(columns={"Name": "uv_id"})
    gdf = gdf[["uv_id", "geometry"]]
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    return gdf

def load_macrozonas(data_dir: str) -> gpd.GeoDataFrame:
    """Carga las 7 macrozonas y les asigna IDs 1-7."""
    gdf = gpd.read_file(
        f"{data_dir}/layer_macrozonas_20220715073415.shp"
    )
    gdf = gdf.reset_index()
    gdf["mz_macro_id"] = gdf.index + 1
    gdf = gdf[["mz_macro_id", "geometry"]]
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    return gdf

def load_manzanas_geo(data_dir: str) -> gpd.GeoDataFrame:
    """Carga y simplifica geometrías de manzanas. Retorna GeoDataFrame con mz_id y geometry."""
    from pipeline.weights import load_manzanas
    gdf = load_manzanas(data_dir)
    gdf["geometry"] = gdf["geometry"].simplify(tolerance=0.0001, preserve_topology=True)
    return gdf

def build_spatial_joins(manzanas: gpd.GeoDataFrame,
                        uvs: gpd.GeoDataFrame,
                        macrozonas: gpd.GeoDataFrame) -> tuple:
    """Genera tablas manzana→UV y UV→macrozona usando centroides.

    Returns:
        (mz_to_uv, uv_to_macro): DataFrames con cols (mz_id, uv_id) y (uv_id, mz_macro_id)
    """
    mz_centroids = manzanas.copy()
    mz_centroids["geometry"] = manzanas.centroid
    mz_to_uv = gpd.sjoin(mz_centroids[["mz_id", "geometry"]],
                          uvs[["uv_id", "geometry"]],
                          how="left", predicate="within")
    mz_to_uv = mz_to_uv[["mz_id", "uv_id"]].dropna()
    mz_to_uv["uv_id"] = mz_to_uv["uv_id"].astype(str)

    uv_centroids = uvs.copy()
    uv_centroids["geometry"] = uvs.centroid
    uv_to_macro = gpd.sjoin(uv_centroids[["uv_id", "geometry"]],
                             macrozonas[["mz_macro_id", "geometry"]],
                             how="left", predicate="within")
    uv_to_macro = uv_to_macro[["uv_id", "mz_macro_id"]].dropna()
    uv_to_macro["mz_macro_id"] = uv_to_macro["mz_macro_id"].astype(int)

    return mz_to_uv, uv_to_macro
