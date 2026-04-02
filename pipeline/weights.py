import pandas as pd
import geopandas as gpd
import pyarrow.parquet as pq
from shapely import wkb
from pipeline.haversine import assign_voters_to_locals

def load_manzanas(data_dir: str) -> gpd.GeoDataFrame:
    """Carga manzanas censales de Renca desde parquet (CUT=13128).

    Usa MANZENT como mz_id: código nacional único de manzana
    (CUT + distrito + zona + número de manzana, 14 dígitos).
    COD_MANZANA solo es único dentro de un distrito, no sirve como ID global.
    """
    table = pq.read_table(
        f"{data_dir}/Cartografia_censo2024_Pais_Manzanas.parquet",
        filters=[("CUT", "=", 13128)],
        columns=["CUT", "MANZENT", "SHAPE"]
    )
    df = table.to_pandas()
    df["geometry"] = df["SHAPE"].apply(lambda x: wkb.loads(bytes(x)))
    gdf = gpd.GeoDataFrame(df.drop(columns="SHAPE"), geometry="geometry", crs="EPSG:4326")
    gdf = gdf.rename(columns={"MANZENT": "mz_id"})
    return gdf[["mz_id", "geometry"]]

def compute_manzana_weights(data_dir: str) -> pd.DataFrame:
    """Calcula peso(manzana_X, local_A) = fracción de votantes de X asignados a A.
    Retorna DataFrame con columnas: mz_id, local, peso.
    """
    voters = assign_voters_to_locals(data_dir)
    manzanas = load_manzanas(data_dir)

    voters_gdf = gpd.GeoDataFrame(
        voters,
        geometry=gpd.points_from_xy(voters["lon"], voters["lat"]),
        crs="EPSG:4326"
    )

    joined = gpd.sjoin(voters_gdf, manzanas[["mz_id", "geometry"]],
                       how="left", predicate="within")
    joined = joined.dropna(subset=["mz_id"])
    joined["mz_id"] = joined["mz_id"].astype(int)

    counts = joined.groupby(["mz_id", "local"]).size().reset_index(name="count")
    totals = counts.groupby("mz_id")["count"].sum().reset_index(name="total")
    counts = counts.merge(totals, on="mz_id")
    counts["peso"] = counts["count"] / counts["total"]

    return counts[["mz_id", "local", "peso"]]
