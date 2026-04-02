import numpy as np
import pandas as pd
from pipeline.normalize import load_locales

BBOX = {"lat_min": -33.44, "lat_max": -33.37,
        "lon_min": -70.80, "lon_max": -70.66}

def haversine_matrix(voter_lats: pd.Series, voter_lons: pd.Series,
                     local_lats: list, local_lons: list) -> np.ndarray:
    """Calcula matriz de distancias Haversine (km) entre N votantes y M locales.
    Retorna array shape (N, M).
    """
    R = 6371.0
    vla = np.radians(voter_lats.values[:, None])   # (N,1)
    vlo = np.radians(voter_lons.values[:, None])
    lla = np.radians(np.array(local_lats)[None, :]) # (1,M)
    llo = np.radians(np.array(local_lons)[None, :])

    dlat = lla - vla
    dlon = llo - vlo
    a = np.sin(dlat / 2)**2 + np.cos(vla) * np.cos(lla) * np.sin(dlon / 2)**2
    return R * 2 * np.arcsin(np.sqrt(a))

def assign_voters_to_locals(data_dir: str) -> pd.DataFrame:
    """Asigna cada votante válido del padrón a su local más cercano (Haversine).
    Descarta votantes con coordenadas nulas o fuera del bbox de Renca.
    Retorna DataFrame con columnas: voter_id, lat, lon, local.
    """
    padron = pd.read_csv(f"{data_dir}/padron.csv")
    padron = padron.rename(columns={"Latitude_norm": "lat", "Longitude_norm": "lon"})

    n_total = len(padron)
    padron = padron.dropna(subset=["lat", "lon"])
    padron = padron[
        padron["lat"].between(BBOX["lat_min"], BBOX["lat_max"]) &
        padron["lon"].between(BBOX["lon_min"], BBOX["lon_max"])
    ]
    n_invalid = n_total - len(padron)
    print(f"[haversine] Descartados {n_invalid} votantes inválidos de {n_total} totales.")

    locales = load_locales(data_dir)
    dist = haversine_matrix(padron["lat"], padron["lon"],
                            locales["lat"].tolist(), locales["lon"].tolist())
    nearest_idx = np.argmin(dist, axis=1)
    padron = padron.copy()
    padron["local"] = locales["local"].iloc[nearest_idx].values

    # Columna ID confirmada: "id" (verificado en padron.csv header)
    return padron[["id", "lat", "lon", "local"]].rename(columns={"id": "voter_id"})
